import { createPublicKey, verify } from 'node:crypto';
import { verifyAudit } from '../../tests/backend/audit-verifier.mjs';
import { checkpointHash, decimal, DOMAIN, parseEnvelope, ZERO } from './format.mjs';

export function authenticateRetained(envelope, trust) {
  const payload = parseEnvelope(envelope);
  if (payload.chain_id !== trust.chain_id || payload.system_id !== trust.system_id) throw new Error('Wrong pinned chain/system');
  const pin = trust.keys?.[payload.key_id];
  if (!pin || decimal(payload.counter) < decimal(pin.notBeforeCounter) || decimal(payload.counter) > decimal(pin.notAfterCounter)) throw new Error('Unpinned or inactive key');
  const key = createPublicKey(pin.publicKey);
  if (key.asymmetricKeyType !== 'ed25519' || !verify(null,Buffer.from(DOMAIN+envelope.payload),key,Buffer.from(envelope.signature,'base64'))) throw new Error('Invalid checkpoint signature');
  return payload;
}
// previous MUST come from independently retained trusted state, never solely this sink/DB.
export function verifyCheckpoint(envelope, trust, previous = null) {
  const payload = authenticateRetained(envelope,trust);
  if (!previous) {
    if (payload.previous_checkpoint_hash !== ZERO) throw new Error('Missing retained predecessor');
    if (trust.genesisHash !== checkpointHash(envelope)) throw new Error('Genesis must be independently pinned');
  } else {
    const prior = authenticateRetained(previous,trust);
    if (payload.previous_checkpoint_hash !== checkpointHash(previous) || decimal(payload.counter) <= decimal(prior.counter) || decimal(payload.head_sequence) < decimal(prior.head_sequence) || payload.observed_at < prior.observed_at) throw new Error('Replay, rollback or checkpoint fork');
    if (payload.head_sequence === prior.head_sequence && payload.head_hash !== prior.head_hash) throw new Error('Same-head fork');
  }
  return payload;
}

// Verify an operator-supplied, UNTRUSTED full prefix rooted at ZERO and return each event's index.
// Ancestry is carried by the hash chain (previous_hash inside each event hash). Sequence labels are
// NOT inside the canonical hashed bytes; they are checked only for strict order. PG gaps are legitimate.
export function verifyPrefix(events) {
  if (!Array.isArray(events) || events.length > 100000) throw new Error('Bounded full-prefix input required');
  let last = -1n;
  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Invalid log record');
    const sequence = decimal(event.sequence);
    if (sequence === 0n || sequence <= last || typeof event.canonical !== 'string' || Buffer.byteLength(event.canonical) > 65536) throw new Error('Invalid log order or bound');
    last = sequence;
  }
  try { verifyAudit(events); } catch { throw new Error('Prefix hash chain invalid'); }
  return events;
}
// Index of the event matching an anchored head inside the SAME verified prefix; -1 for the explicit zero head.
export function locateHead(events, sequence, headHash) {
  if (decimal(sequence) === 0n) { if (headHash !== ZERO) throw new Error('Zero head must use zero hash'); return -1; }
  const index = events.findIndex(event => event.sequence === sequence);
  if (index < 0 || events[index].event_hash !== headHash) throw new Error('Anchored head absent from verified prefix (divergent ledger)');
  return index;
}

// anchors: additional independently retained, authenticated checkpoints; all must lie on this same prefix.
export function verifyAnchoredLog(events, envelope, trust, previous = null, anchors = []) {
  const payload = verifyCheckpoint(envelope,trust,previous);
  verifyPrefix(events);
  if (!Array.isArray(anchors) || anchors.length > 1000) throw new Error('Bounded anchors required');
  const head = locateHead(events,payload.head_sequence,payload.head_hash);
  for (const retained of [previous, ...anchors].filter(Boolean)) {
    const prior = authenticateRetained(retained,trust);
    if (decimal(prior.head_sequence) > decimal(payload.head_sequence)) throw new Error('Retained anchor beyond current head');
    if (locateHead(events,prior.head_sequence,prior.head_hash) > head) throw new Error('Retained anchor not an ancestor');
  }
  return {anchoredThrough:payload.head_sequence,unanchoredRecords:events.length-head-1};
}
