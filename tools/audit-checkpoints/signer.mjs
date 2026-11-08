// Operator-local only. No web imports, database credential handling or retention authority.
import { createPrivateKey, sign } from 'node:crypto';
import { canonicalPayload, checkpointHash, decimal, exactKeys, ZERO, DOMAIN } from './format.mjs';
import { authenticateRetained, verifyPrefix, locateHead } from './verifier.mjs';

// prefix: operator-retrieved, UNTRUSTED full ledger prefix (ZERO-rooted) ending exactly at the snapshot head.
// It is verified cryptographically here; the database's own claim of consistency is never accepted.
export function signSnapshot(snapshot, {keyId, privateKey, previous = null, trust, prefix, genesis = false}) {
  exactKeys(snapshot,['version','chain_id','system_id','head_sequence','head_hash','counter','observed_at','request_id']);
  const key = createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Ed25519 required');
  let predecessor = ZERO, prior = null;
  if (previous) {
    if (!trust) throw new Error('Pinned predecessor trust required');
    prior = authenticateRetained(previous,trust);
    if (prior.chain_id !== snapshot.chain_id || prior.system_id !== snapshot.system_id || decimal(snapshot.counter) <= decimal(prior.counter) || decimal(snapshot.head_sequence) < decimal(prior.head_sequence) || snapshot.observed_at < prior.observed_at) throw new Error('Snapshot rollback or identity mismatch');
    if (snapshot.head_sequence === prior.head_sequence && snapshot.head_hash !== prior.head_hash) throw new Error('Same-head fork');
    predecessor = checkpointHash(previous);
  } else if (genesis !== 'explicit-pinned-genesis-ceremony') {
    throw new Error('Retained predecessor required; genesis needs explicit pin ceremony');
  }
  // Same head (prior.head == snapshot head): limited semantics, hash equality only; no new ancestry is claimed.
  const sameHead = prior && prior.head_sequence === snapshot.head_sequence;
  if (!sameHead) {
    if (prefix === undefined || prefix === null) throw new Error('Verified ledger prefix proof required before signing');
    verifyPrefix(prefix);
    const at = locateHead(prefix,snapshot.head_sequence,snapshot.head_hash);
    if (at !== prefix.length - 1) throw new Error('Prefix proof must end at the snapshot head');
    if (prior && locateHead(prefix,prior.head_sequence,prior.head_hash) > at) throw new Error('Prior head not an ancestor');
  }
  const payload = canonicalPayload({version:snapshot.version,chain_id:snapshot.chain_id,system_id:snapshot.system_id,head_sequence:snapshot.head_sequence,head_hash:snapshot.head_hash,counter:snapshot.counter,previous_checkpoint_hash:predecessor,observed_at:snapshot.observed_at,key_id:keyId});
  return {payload,signature:sign(null,Buffer.from(DOMAIN+payload),key).toString('base64')};
}
