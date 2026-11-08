// Hosted synthetic-only checks for fenced receiving claims (0016) through the CURRENT handler on the
// local dev server plus the hosted database/storage. Never prints tokens, passwords or fences.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
const f=JSON.parse(readFileSync('/tmp/browser/phase1/fixtures.json','utf8'));
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error('Trusted test binding required');
const shim=k=>(input,init)=>{const h=new Headers(init?.headers);h.set('apikey',k);if(h.get('Authorization')===`Bearer ${k}`)h.delete('Authorization');return fetch(input,{...init,headers:h});};
const admin=createClient(f.dataApiUrl,key,{auth:{persistSession:false},global:{fetch:shim(key)}});
const client=name=>createClient(f.dataApiUrl,f.publishableKey,{auth:{persistSession:false},global:{fetch:shim(f.publishableKey),headers:{Authorization:`Bearer ${f[name].token}`}}});
const sid={};for(const name of ['ownerA','edit','ungranted','administrator','disabled','revoked']){const r=await client(name).auth.getClaims(f[name].token);assert.equal(r.error,null);sid[name]=r.data.claims.session_id;}
let n=0;const check=(label,a,b)=>{assert.deepEqual(a,b);n++;console.log('PASS hosted claims '+label);};
const op=async(name,action,payload={})=>{const r=await client(name).rpc('tv_operation',{action,payload});assert.equal(r.error,null);return r.data;};
const svc=async(fn,args)=>{const r=await admin.rpc(fn,args);if(r.error)throw Object.assign(new Error('rpc'),{pg:r.error});return r.data;};
const event=async id=>{const r=await admin.rpc('tv_operation',{action:'identity'});void r;return null;};void event;
const http=async(name,method,path,body)=>{const r=await fetch('http://localhost:8080/api/public/quarantine'+path,{method,headers:{Authorization:`Bearer ${f[name].token}`,'Content-Type':method==='PUT'?'text/plain':'application/json','X-Filename':'synthetic.txt'},body});return {status:r.status,b:await r.json()};};
const doc=(await op('ownerA','create',{name:'Synthetic hosted claim parent'})).data;
let rev=doc.acl_revision;
for(const u of ['edit','disabled','revoked'])rev=(await op('ownerA','grant',{id:doc.id,revision:rev,user_id:f[u].id,permission:'edit'})).data.revision;
const reserve=async name=>{const cur=(await op('ownerA','detail',{id:doc.id})).data.acl_revision;const r=await http(name,'POST','',JSON.stringify({action:'reserve',payload:{id:doc.id,revision:cur}}));assert.equal(r.status,200);return r.b.data.reservation_id;};
const claim=(t,name)=>svc('tv_upload_claim',{ticket_id:t,caller:f[name].id,caller_session:sid[name]});
const stage=(c,name)=>svc('tv_upload_stage_fenced',{cid:c.claim_id,fence:c.fence,caller:f[name].id,caller_session:sid[name],hash:'a'.repeat(64),size:4,media:'text/plain',safe_name:'synthetic.txt'});
const finish=(c,name)=>svc('tv_upload_finish_fenced',{cid:c.claim_id,fence:c.fence,caller:f[name].id,caller_session:sid[name],scan_verdict:'missing'});
const release=(c,o)=>svc('tv_upload_release_fenced',{cid:c.claim_id,fence:c.fence,outcome:o});

// Direct-access denials.
for(const table of ['upload_receiving_claims','quarantined_versions','upload_reservations']){const r=await client('ownerA').from(table).select('*').limit(1);check('authenticated raw '+table+' denied',r.error!==null,true);}
check('service raw claim table denied',(await admin.from('upload_receiving_claims').select('*').limit(1)).error!==null,true);
check('authenticated cannot call claim',(await client('ownerA').rpc('tv_upload_claim',{ticket_id:crypto.randomUUID(),caller:f.ownerA.id,caller_session:sid.ownerA})).error!==null,true);
const t0=await reserve('edit');
for(const [fn,args] of [['tv_upload_transition',{ticket_id:t0,caller:f.edit.id,caller_session:sid.edit,step:'stage',hash:'a'.repeat(64),size:4,media:'text/plain',safe_name:'x.txt'}],['tv_upload_finish_evidenced',{ticket_id:t0,caller:f.edit.id,caller_session:sid.edit,scan_verdict:'missing'}]]){
 const r=await admin.rpc(fn,args);check('old unfenced service '+fn+' denied',/permission denied/.test(r.error?.message??''),true);}
const storage=await client('ownerA').storage.from('trustvault-quarantine').list();check('storage list returns nothing to user',(storage.data??[]).length,0);

// Duplicate winner protected: winner claim held (service-side), then current HTTP handler PUT on same ticket.
const win=await claim(t0,'edit');check('winner claim',win.status,200);
const dup=[];for(const _ of [1,2,3])dup.push(await http('edit','PUT','?reservation='+t0,'hi\n\n'));console.log('dup statuses',JSON.stringify(dup.map(d=>[d.status,d.b.error])));
check('duplicate PUTs rejected generically',dup.map(d=>[d.status,d.b.error]),[[400,'Upload rejected'],[400,'Upload rejected'],[400,'Upload rejected']]);
check('no fence/key leaked',dup.some(d=>/fence|object_key|claim_id/.test(JSON.stringify(d.b))),false);
check('winner unaffected: stage ok',(await stage(win.data,'edit')).status,200);
check('winner finish ok',(await finish(win.data,'edit')).status,200);
check('winner release',(await release(win.data,'finished')).data.state,'released');

// Full current-handler PUT and concurrent burst on one fresh ticket.
const t1=await reserve('edit');
const burst=await Promise.all(Array.from({length:5},()=>http('edit','PUT','?reservation='+t1,'hi\n\n')));
check('burst exactly one success',burst.filter(b=>b.status===200).length,1);
check('burst others rejected/busy',burst.filter(b=>b.status!==200).every(b=>[400,503].includes(b.status)),true);
check('success quarantined only',burst.find(b=>b.status===200).b.data.quarantine_state,'quarantined');
const read=await http('ownerA','GET','?id='+doc.id);check('raw read still gated',read.status,423);

// Mid-claim revocations.
const mid=async(name,label,apply,expect,afterStage=false)=>{
 const t=await reserve(name);const c=await claim(t,name);assert.equal(c.status,200);
 if(afterStage)assert.equal((await stage(c.data,name)).status,200);
 await apply();
 const r=afterStage?await finish(c.data,name):await stage(c.data,name);
 check(label+' denied',r.status,expect);
 check(label+' fenced release',(await release(c.data,'denied')).data.state,'released');
};
await mid('edit','grant revoke before stage',async()=>{const cur=(await op('ownerA','detail',{id:doc.id})).data.acl_revision;assert.equal((await op('ownerA','revoke',{id:doc.id,revision:cur,user_id:f.edit.id})).status,200);},404);
{const cur=(await op('ownerA','detail',{id:doc.id})).data.acl_revision;await op('ownerA','grant',{id:doc.id,revision:cur,user_id:f.edit.id,permission:'edit'});}
await mid('edit','grant revoke after stage before finish',async()=>{const cur=(await op('ownerA','detail',{id:doc.id})).data.acl_revision;assert.equal((await op('ownerA','revoke',{id:doc.id,revision:cur,user_id:f.edit.id})).status,200);},404,true);
await mid('disabled','account ban before stage',async()=>{const r=await admin.auth.admin.updateUserById(f.disabled.id,{ban_duration:'876000h'});assert.equal(r.error,null);},401);
await mid('revoked','session revoke after stage before finish',async()=>{const r=await admin.auth.admin.signOut(f.revoked.token,'global');assert.equal(r.error,null);},401,true);
console.log(`RESULT hosted claims ${n} checks; synthetic accounts only; current dev-server handler + hosted DB/storage; no fences/tokens printed`);
console.log('DOC '+doc.id);
