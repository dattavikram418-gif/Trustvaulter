// Inject a trusted service client in operator tooling; never import this into the web graph.
import { exactKeys, canonicalPayload, ZERO, uuid } from './format.mjs';
export async function observeHead(serviceClient) {
  const {data,error} = await serviceClient.rpc('tv_audit_checkpoint_snapshot');
  if (error) throw new Error('Checkpoint observation unavailable');
  exactKeys(data,['version','chain_id','system_id','head_sequence','head_hash','counter','observed_at','request_id']);
  uuid(data.request_id);
  canonicalPayload({version:data.version,chain_id:data.chain_id,system_id:data.system_id,head_sequence:data.head_sequence,head_hash:data.head_hash,counter:data.counter,observed_at:data.observed_at,key_id:'validation',previous_checkpoint_hash:ZERO});
  return data;
}
