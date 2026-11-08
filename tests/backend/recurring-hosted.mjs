import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
const f=JSON.parse(readFileSync('/tmp/browser/phase1/fixtures.json','utf8'));
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error('Trusted synthetic-test bindings required');
const shim=k=>(input,init)=>{const h=new Headers(init?.headers);h.set('apikey',k);if(h.get('Authorization')===`Bearer ${k}`)h.delete('Authorization');return fetch(input,{...init,headers:h});};
const admin=createClient(f.dataApiUrl,key,{auth:{persistSession:false},global:{fetch:shim(key)}});
const user=createClient(f.dataApiUrl,f.publishableKey,{auth:{persistSession:false},global:{fetch:shim(f.publishableKey),headers:{Authorization:`Bearer ${f.ownerA.token}`}}});
let n=0;const check=(label,a,b)=>{assert.deepEqual(a,b);n++;console.log('PASS hosted recurring '+label);};
const rpc=async(client,name,args)=>{const r=await client.rpc(name,args);assert.equal(r.error,null);return r.data;};
const identity=await user.auth.getClaims(f.ownerA.token);assert.equal(identity.error,null);
const d=await rpc(user,'tv_operation',{action:'detail',payload:{id:f.documentId}});
const reservation=await rpc(user,'tv_upload_request',{action:'reserve',payload:{id:f.documentId,revision:d.data.acl_revision}});
const ticket=reservation.data.reservation_id;
const args={ticket_id:ticket,caller:f.ownerA.id,caller_session:identity.data.claims.session_id};
const stage=await rpc(admin,'tv_upload_transition',{...args,step:'stage',hash:'a'.repeat(64),size:4,media:'text/plain',safe_name:'synthetic.txt'});
const objectKey=stage.data.object_key;
await rpc(admin,'tv_upload_transition',{...args,step:'fail'});
const first=(await rpc(admin,'tv_quarantine_cleanup_claim',{maximum:100})).find(c=>c.object_key===objectKey);assert.ok(first);
check('first absent remove',(await admin.storage.from('trustvault-quarantine').remove([objectKey])).error,null);
const old=await rpc(admin,'tv_quarantine_cleanup_receipt',{claim:first.claim_id,outcome:'storage_success'});
// Synthetic delayed writer resumes after success; no confidential data.
check('late synthetic upload',(await admin.storage.from('trustvault-quarantine').upload(objectKey,new TextEncoder().encode('test'),{upsert:false})).error,null);
const deadline=Date.now()+90000;let next;
while(Date.now()<deadline&&!next){const candidates=await rpc(admin,'tv_quarantine_cleanup_candidates',{maximum:100});if(candidates.some(c=>c.object_key===objectKey)){next=(await rpc(admin,'tv_quarantine_cleanup_claim',{maximum:100})).find(c=>c.object_key===objectKey);}if(!next)await new Promise(resolve=>setTimeout(resolve,1500));}
assert.ok(next,'late key must recur after scheduling defer');n++;
check('late redelete',(await admin.storage.from('trustvault-quarantine').remove([objectKey])).error,null);
const fresh=await rpc(admin,'tv_quarantine_cleanup_receipt',{claim:next.claim_id,outcome:'storage_success'});check('new durable receipt UUID',fresh.request_id!==old.request_id,true);
check('historical replay immutable',(await rpc(admin,'tv_quarantine_cleanup_receipt',{claim:first.claim_id,outcome:'storage_success'})).request_id,old.request_id);
check('actual readback absent now',Boolean((await admin.storage.from('trustvault-quarantine').download(objectKey)).error),true);
const events=await admin.from('audit_events').select('changes,request_id').eq('action','upload_scan_check');assert.equal(events.error,null);
const evidence=events.data.find(e=>e.changes.version_id===f.quarantineVersion);assert.ok(evidence);n++;
check('hosted evidence hash recorded',/^[a-f0-9]{64}$/.test(evidence.changes.evidence_hash),true);
// Actual private record linkage requires separate trusted database read; never widen raw grants.
check('raw evidence service denied',(await admin.from('quarantine_scan_checks').select('*')).error?.code,'42501');
console.log(`RESULT ${n} hosted synthetic recurring/evidence checks passed; late upload recreated and removed, historical receipt immutable; no permanent absence or real scanner claim`);
