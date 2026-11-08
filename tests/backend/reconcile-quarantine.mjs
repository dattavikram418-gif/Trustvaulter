import {createClient} from '@supabase/supabase-js';
// Trusted maintenance only; no public cleanup or arbitrary object endpoint.
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw Error('Trusted runtime bindings required');
const client=createClient(url,key,{auth:{persistSession:false},global:{fetch:(input,init)=>{const h=new Headers(init?.headers);h.set('apikey',key);if(h.get('Authorization')===`Bearer ${key}`)h.delete('Authorization');return fetch(input,{...init,headers:h});}}});
const apply=process.argv.includes('--apply');
if(process.argv.slice(2).some(arg=>arg!=='--apply'))throw Error('Only --apply is supported');
if(apply&&process.env.TV_CLEANUP_APPROVED!=='yes')throw Error('Apply requires approved trusted runtime');
const candidates=await client.rpc(apply?'tv_quarantine_cleanup_claim':'tv_quarantine_cleanup_candidates',{maximum:100});if(candidates.error)throw Error('Reconciliation query unavailable');
if(!apply){console.log(`Dry-run: ${candidates.data.length} eligible unfinalised candidates; no storage side effects.`);}
else{
 let succeeded=0,failed=0,uncertain=0;
 for(const ticket of candidates.data){
  let outcome='storage_error';try{const result=await client.storage.from('trustvault-quarantine').remove([ticket.object_key]);if(!result.error)outcome='storage_success';}catch{/* committed intent remains */}
  const receipt=await client.rpc('tv_quarantine_cleanup_receipt',{claim:ticket.claim_id,outcome});
  if(receipt.error)uncertain++;else if(outcome==='storage_success')succeeded++;else failed++;
 }
 console.log(`Reconciliation: ${succeeded} API-success receipts (not existence proof); ${failed} error receipts; ${uncertain} uncertain, retryable after claim expiry. Evidence retained; no delivery.`);
 if(failed||uncertain)process.exitCode=1;
}
