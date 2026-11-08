import {readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
const f=JSON.parse(readFileSync('/tmp/browser/phase1/fixtures.json','utf8'));
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error('Trusted test binding unavailable');
const shim=k=>(input,init)=>{const h=new Headers(init?.headers);h.set('apikey',k);if(h.get('Authorization')===`Bearer ${k}`)h.delete('Authorization');return fetch(input,{...init,headers:h});};
const admin=createClient(f.dataApiUrl,key,{auth:{persistSession:false},global:{fetch:shim(key)}});
const clients={};for(const name of ['ownerA','ownerB','read','edit','ungranted','administrator','disabled','revoked'])clients[name]=createClient(f.dataApiUrl,f.publishableKey,{auth:{persistSession:false},global:{fetch:shim(f.publishableKey),headers:{Authorization:`Bearer ${f[name].token}`}}});
let n=0;const check=(label,a,b)=>{assert.deepEqual(a,b);n++;console.log('PASS hosted quarantine '+label);};
const metadata=async(name,action,payload)=>{const r=await clients[name].rpc('tv_operation',{action,payload});assert.equal(r.error,null);return r.data;};
const request=async(name,action,payload)=>{const r=await clients[name].rpc('tv_upload_request',{action,payload});assert.equal(r.error,null);return r.data;};
const http=async(name,method,path,body,headers={})=>{const r=await fetch('http://localhost:8080/api/public/quarantine'+path,{method,headers:{Authorization:`Bearer ${f[name].token}`,...headers},body});const result=await r.json();check('correlation '+method,r.headers.get('X-Request-ID'),result.request_id);return {status:r.status,result};};
let rev=(await metadata('ownerA','detail',{id:f.documentId})).data.acl_revision;
for(const name of ['ownerB','read','ungranted','administrator','disabled','revoked'])check('reserve matrix '+name,(await request(name,'reserve',{id:f.documentId,revision:rev})).status,['disabled','revoked'].includes(name)?401:404);
let ticket=(await request('ownerA','reserve',{id:f.documentId,revision:rev})).data.reservation_id;
check('wrong actor ticket',(await http('ownerB','PUT','?reservation='+ticket,'synthetic',{'Content-Type':'text/plain','X-Filename':'test.txt'})).status,404);
const upload=await http('ownerA','PUT','?reservation='+ticket,'synthetic quarantine bytes',{'Content-Type':'text/plain','X-Filename':'test.txt'});check('owner private upload',upload.status,200);check('scanner missing',upload.result.data.scan_evidence,'missing');check('no keys exposed',Object.keys(upload.result.data).sort(),['quarantine_state','scan_evidence','version_id']);rev++;
f.quarantineVersion=upload.result.data.version_id;writeFileSync('/tmp/browser/phase1/fixtures.json',JSON.stringify(f),{mode:0o600});
for(const name of ['ownerA','read','edit','ownerB','administrator','ungranted','disabled','revoked'])check('read gate '+name,(await http(name,'GET','?id='+f.documentId)).status,['disabled','revoked'].includes(name)?401:['ownerA','read','edit'].includes(name)?423:404);
const versions=await request('ownerA','versions',{id:f.documentId});check('bound uploaded version',versions.data.some(v=>v.id===f.quarantineVersion),true);check('quarantine state',versions.data[0].quarantine_state,'quarantined');
check('wrong parent version list',(await request('ownerB','versions',{id:f.documentId})).status,404);
const realObjects=await admin.storage.from('trustvault-quarantine').list();assert.equal(realObjects.error,null);assert.ok(realObjects.data.length);
const realKey=realObjects.data[0].name;
check('private object actually exists',!!(await admin.storage.from('trustvault-quarantine').download(realKey)).data,true);
for(const name of ['ownerA','ownerB','read','edit','administrator','ungranted','disabled','revoked']){
 check('existing object read '+name,!!(await clients[name].storage.from('trustvault-quarantine').download(realKey)).error,true);
}
const anon=createClient(f.dataApiUrl,f.publishableKey,{auth:{persistSession:false},global:{fetch:shim(f.publishableKey)}});
check('anonymous existing object denied',!!(await anon.storage.from('trustvault-quarantine').download(realKey)).error,true);
check('public object URL denied',(await fetch(f.dataApiUrl+'/storage/v1/object/public/trustvault-quarantine/'+realKey)).ok,false);
for(const name of ['ownerA','ownerB','read','edit','administrator','ungranted']){
 for(const table of ['quarantined_versions','upload_reservations'])check('raw table '+name+'/'+table,(await clients[name].from(table).select('*')).error?.code,'42501');
 const list=await clients[name].storage.from('trustvault-quarantine').list();check('raw storage list '+name,!list.data?.length,true);
 // Object key is obtained only via trusted stage for this separate disposable reservation.
}
ticket=(await request('edit','reserve',{id:f.documentId,revision:rev})).data.reservation_id;
const claims=JSON.parse(Buffer.from(f.edit.token.split('.')[1],'base64url').toString());
const stage=await admin.rpc('tv_upload_transition',{ticket_id:ticket,caller:f.edit.id,caller_session:claims.session_id,step:'stage',hash:'a'.repeat(64),size:4,media:'text/plain',safe_name:'test.txt'});assert.equal(stage.error,null);check('Edit stage',stage.data.status,200);
for(const name of ['ownerA','ownerB','read','edit','administrator','ungranted']){
 check('raw object read '+name,!!(await clients[name].storage.from('trustvault-quarantine').download(stage.data.data.object_key)).error,true);
 check('raw object upload '+name,!!(await clients[name].storage.from('trustvault-quarantine').upload(stage.data.data.object_key,new Uint8Array([1]),{upsert:false})).error,true);
}
rev=(await metadata('ownerA','revoke',{id:f.documentId,revision:rev,user_id:f.edit.id})).data.revision;
const finish=await admin.rpc('tv_upload_transition',{ticket_id:ticket,caller:f.edit.id,caller_session:claims.session_id,step:'finish',hash:'a'.repeat(64),size:4,media:'text/plain',safe_name:'test.txt',verdict:'missing'});check('direct revoke before finalise',finish.data.status,404);
rev=(await metadata('ownerA','grant',{id:f.documentId,revision:rev,user_id:f.edit.id,permission:'edit'})).data.revision;
for(const [name,body,mime] of [['bad.html','<html>bad','text/html'],['bad.svg','<svg>bad','image/svg+xml'],['bad.txt','MZexecutable','text/plain'],['bad.txt','PK\u0003\u0004archive','text/plain'],['bad.pdf','wrong signature','application/pdf'],['bad.txt',new Uint8Array(10485761),'text/plain']]){
 const t=(await request('ownerA','reserve',{id:f.documentId,revision:rev})).data.reservation_id;check('bad sample '+name,(await http('ownerA','PUT','?reservation='+t,body,{'Content-Type':mime,'X-Filename':name})).status,400);
}
const events=await metadata('ownerA','activity',{id:f.documentId,limit:100});check('durable denied and digest/version audit',events.data.some(e=>e.action==='upload_finish'&&e.changes.version_id===f.quarantineVersion)&&events.data.some(e=>e.action==='upload_fail'&&e.outcome==='denied'),true);
f.revision=rev;writeFileSync('/tmp/browser/phase1/fixtures.json',JSON.stringify(f),{mode:0o600});
console.log(`RESULT ${n} hosted quarantine HTTP/RPC/storage assertions passed; actual scanner missing; all bytes quarantined; no delivery`);
