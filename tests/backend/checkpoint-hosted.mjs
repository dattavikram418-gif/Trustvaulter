// Safe opt-in head-only observations. No accounts, raw log export, signing or fault injection.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { observeHead } from '../../tools/audit-checkpoints/snapshot-adapter.mjs';
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,publishable=process.env.SUPABASE_PUBLISHABLE_KEY;
if(!url||!key||!publishable){console.log('UNRUN: trusted managed head-observation bindings unavailable');process.exit(2);}
const make=k=>createClient(url,k,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>{
 const headers=new Headers(init?.headers);if(k.startsWith('sb_'))headers.delete('Authorization');return fetch(input,{...init,headers});
}}});
const service=make(key);const first=await observeHead(service),second=await observeHead(service);
assert.equal(first.chain_id,second.chain_id);assert.equal(first.system_id,second.system_id);
assert.equal(BigInt(second.counter),BigInt(first.counter)+1n);assert.ok(BigInt(second.head_sequence)>BigInt(first.head_sequence));
const denied=await make(publishable).rpc('tv_audit_checkpoint_snapshot');assert.ok(denied.error);
const raw=await service.from('audit_checkpoint_state').select('counter');assert.equal(raw.error?.code,'42501');
console.log('RESULT hosted checkpoint 6 assertions passed; two committed head-only observations; anonymous/raw state denied; no export/signing/fault injection');
console.log('Observation request IDs only:',first.request_id,second.request_id);
