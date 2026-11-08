// Explicit local test API only; no configured external send or production activation flag.
import { observeHead } from './snapshot-adapter.mjs';
import { signSnapshot } from './signer.mjs';
import { verifyAnchoredLog } from './verifier.mjs';
import { withTestSinkLock, retainTestCheckpoint } from './file-test-sink.mjs';
export async function exportFileTest({mode, directory, serviceClient, privateKey, keyId, previous, trust, prefix}) {
 if(mode !== 'mutable-file-test-only') throw new Error('Production checkpoint export is disabled');
 if(!previous || !trust) throw new Error('Independently retained trusted predecessor required; genesis is a separate pin ceremony');
 return withTestSinkLock(directory,async root=>{
  const snapshot=await observeHead(serviceClient);
  const envelope=signSnapshot(snapshot,{privateKey,keyId,previous,trust,prefix});
  // Validate signed candidate against the same operator-supplied prefix BEFORE any sink write.
  verifyAnchoredLog(prefix,envelope,trust,previous);
  const filename=await retainTestCheckpoint(root,envelope);
  return {filename,envelope}; // never promote sink contents to trusted latest state automatically
 });
}
