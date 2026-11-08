import {readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
const f=JSON.parse(readFileSync('/tmp/browser/phase1/fixtures.json','utf8'));
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error('Trusted test binding required');
const shim=k=>(input,init)=>{const h=new Headers(init?.headers);h.set('apikey',k);if(h.get('Authorization')===`Bearer ${k}`)h.delete('Authorization');return fetch(input,{...init,headers:h});};
const admin=createClient(f.dataApiUrl,key,{auth:{persistSession:false},global:{fetch:shim(key)}});
const client=name=>createClient(f.dataApiUrl,f.publishableKey,{auth:{persistSession:false},global:{fetch:shim(f.publishableKey),headers:{Authorization:`Bearer ${f[name].token}`}}});
const verifiedClaims={};
for(const name of ['ownerA','ownerB','revoked']){const r=await client(name).auth.getClaims(f[name].token);assert.equal(r.error,null);assert.equal(r.data.claims.sub,f[name].id);verifiedClaims[name]=r.data.claims;}
const claims=name=>verifiedClaims[name];
let n=0;const check=(label,a,b)=>{assert.deepEqual(a,b);n++;console.log('PASS hosted correction '+label);};
const rpc=async(name,action,payload)=>{const r=await client(name).rpc('tv_upload_request',{action,payload});assert.equal(r.error,null);return r.data;};
const event=async(id)=>{const r=await admin.from('audit_events').select('actor_id,session_id,document_id,changes,action,outcome,request_id').eq('request_id',id).single();assert.equal(r.error,null);return r.data;};
const http=async(token,method,path,body)=>{const r=await fetch('http://localhost:8080/api/public/quarantine'+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':method==='PUT'?'text/plain':'application/json','X-Filename':'synthetic.txt'},body});const b=await r.json();check('trusted correlation',r.headers.get('X-Request-ID'),b.request_id);return {status:r.status,b};};
for(const [body,status] of [['null',400],['1',400],['"scalar"',400],['[]',400],['{',400],['{"action":"reserve","payload":null}',400],['{"action":"versions","payload":[]}',400],['{"action":"versions","extra":true}',400],['x'.repeat(2049),413]]){
 const r=await http(f.ownerA.token,'POST','',body);check('malformed '+body.slice(0,25),r.status,status);const e=await event(r.b.request_id);check('committed malformed identity',[e.actor_id,e.session_id,e.document_id,e.changes,e.outcome],[f.ownerA.id,claims('ownerA').session_id,null,{},'denied']);
}
const detail=await client('ownerA').rpc('tv_operation',{action:'detail',payload:{id:f.documentId}});assert.equal(detail.error,null);
const revision=detail.data.data.acl_revision;
const reserved=await rpc('ownerA','reserve',{id:f.documentId,revision});const ticket=reserved.data.reservation_id;
const fresh=createClient(f.dataApiUrl,f.publishableKey,{auth:{persistSession:false},global:{fetch:shim(f.publishableKey)}});
const second=await fresh.auth.signInWithPassword({email:f.ownerA.email,password:f.ownerA.password});if(second.error||!second.data.session)throw Error('Second synthetic session failed');
const secondToken=second.data.session.access_token;const secondClaims=await fresh.auth.getClaims(secondToken);assert.equal(secondClaims.error,null);const secondSid=secondClaims.data.claims.session_id;
check('actual distinct owner session',secondSid!==claims('ownerA').session_id,true);
for(const [label,token,sid,actor,target] of [['cross-user',f.ownerB.token,claims('ownerB').session_id,f.ownerB.id,ticket],['other-session',secondToken,secondSid,f.ownerA.id,ticket],['unknown',f.ownerB.token,claims('ownerB').session_id,f.ownerB.id,crypto.randomUUID()]]){
 const r=await http(token,'PUT','?reservation='+target,'synthetic');check(label+' generic response',[r.status,r.b.error,Object.keys(r.b).sort()],[404,'Not found',['error','request_id','status']]);const e=await event(r.b.request_id);check(label+' committed requester',[e.actor_id,e.session_id,e.document_id,e.changes],[actor,sid,null,{}]);
}
for(const [caller,caller_session] of [[null,null],[f.revoked.id,claims('revoked').session_id]]){
 const r=await admin.rpc('tv_upload_transition',{ticket_id:ticket,caller,caller_session,step:'inspect'});assert.equal(r.error,null);check('unverified bridge denied',r.data.status,401);const e=await event(r.data.request_id);check('unverified bridge evidence',[e.actor_id,e.session_id,e.document_id,e.changes],[null,null,null,{}]);
}
const still=await admin.rpc('tv_upload_transition',{ticket_id:ticket,caller:f.ownerA.id,caller_session:claims('ownerA').session_id,step:'inspect'});check('denials did not mutate ticket',still.data.status,200);
const missing=await http('','PUT','?reservation='+ticket,'synthetic');check('missing HTTP auth',missing.status,401);const missingEvent=await event(missing.b.request_id);check('missing HTTP null identity',[missingEvent.actor_id,missingEvent.session_id],[null,null]);
const expired=await http(f.revoked.token,'PUT','?reservation='+ticket,'synthetic');check('revoked HTTP denied',expired.status,401);const expiredEvent=await event(expired.b.request_id);check('revoked HTTP null session',expiredEvent.session_id,null);
// Fixed claim-before-removal test uses ONLY this freshly reserved synthetic parent's opaque key.
const hash='a'.repeat(64);const stage=await admin.rpc('tv_upload_transition',{ticket_id:ticket,caller:f.ownerA.id,caller_session:claims('ownerA').session_id,step:'stage',hash,size:4,media:'text/plain',safe_name:'synthetic.txt'});check('synthetic stage',stage.data.status,200);
const objectKey=stage.data.data.object_key;const upload=await admin.storage.from('trustvault-quarantine').upload(objectKey,new TextEncoder().encode('test'));assert.equal(upload.error,null);
const fail=await admin.rpc('tv_upload_transition',{ticket_id:ticket,caller:f.ownerA.id,caller_session:claims('ownerA').session_id,step:'fail'});check('synthetic fail',fail.data.status,400);
const claimed=await admin.rpc('tv_quarantine_cleanup_claim',{maximum:100});assert.equal(claimed.error,null);
const ourClaim=claimed.data.find(c=>c.object_key===objectKey);assert.ok(ourClaim);
const intentEvent=await event(ourClaim.request_id);check('hosted intent committed before storage',[intentEvent.action,intentEvent.changes.reservation_id],['cleanup_intent',ticket]);
const removed=await admin.storage.from('trustvault-quarantine').remove([objectKey]);assert.equal(removed.error,null);
const receipt=await admin.rpc('tv_quarantine_cleanup_receipt',{claim:ourClaim.claim_id,outcome:'storage_success'});assert.equal(receipt.error,null);
const receiptEvent=await event(receipt.data.request_id);check('actual API outcome receipt',[receiptEvent.action,receiptEvent.changes.storage_outcome],['cleanup_receipt','storage_success']);
const candidates=await admin.rpc('tv_quarantine_cleanup_candidates',{maximum:100});check('recent receipt deferred, not terminal',candidates.data.some(c=>c.object_key===objectKey),false);
check('synthetic removal readback unavailable',!!(await admin.storage.from('trustvault-quarantine').download(objectKey)).error,true);
for(const name of ['ownerA','ownerB'])check('maintenance direct user denied',(await client(name).rpc('tv_quarantine_cleanup_claim',{maximum:1})).error?.code,'42501');
await fresh.auth.signOut({scope:'local'});
writeFileSync('/tmp/browser/phase1/fixtures.json',JSON.stringify(f),{mode:0o600});
console.log(`RESULT ${n} hosted correction HTTP/RPC/storage assertions passed; actual committed identities/intents/receipts read; no scanner or delivery`);
