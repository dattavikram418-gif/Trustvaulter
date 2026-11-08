import { readFileSync,writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
const file='/tmp/browser/phase1/fixtures.json';const f=JSON.parse(readFileSync(file,'utf8'));
const shim=k=>(input,init)=>{const h=new Headers(init?.headers);h.set('apikey',k);if(h.get('Authorization')===`Bearer ${k}`)h.delete('Authorization');return fetch(input,{...init,headers:h});};
const clients={};for(const name of ['ownerA','ownerB','read','edit','ungranted','administrator','disabled','revoked'])clients[name]=createClient(f.dataApiUrl,f.publishableKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:shim(f.publishableKey),headers:{Authorization:`Bearer ${f[name].token}`}}});
let n=0;const check=(label,actual,expected)=>{assert.deepEqual(actual,expected);n++;console.log(`PASS ${label}`);};
async function rpc(name,action,payload={}){const r=await clients[name].rpc('tv_operation',{action,payload});if(r.error)throw new Error(`RPC transport failed: ${r.error.code}`);assert.match(r.data.request_id,/^[0-9a-f-]{36}$/);const {request_id,...result}=r.data;return result;}
const a=await rpc('ownerA','create',{name:'Phase-one integration draft A',category:'Test'});check('hosted creator with live session',a.status,200);const id=a.data.id;let rev=a.data.acl_revision;
const b=await rpc('ownerB','create',{name:'Phase-one integration draft B',category:'Test'});check('hosted owner B create',b.status,200);f.documentId=id;f.documentB=b.data.id;
for(const [name,permission] of [['read','read'],['edit','edit'],['revoked','read']]){const grant=await rpc('ownerA','grant',{id,revision:rev,user_id:f[name].id,permission});check(`hosted grant ${name}`,grant.status,200);rev=grant.data.revision;}
for(const name of ['ownerB','ungranted','administrator'])for(const action of ['detail','edit','delete','grants','activity']){const r=await rpc(name,action,{id,...(['edit','delete'].includes(action)?{revision:rev}:{}),...(action==='edit'?{name:'IDOR'}:{})});check(`hosted IDOR ${name}/${action}`,r,{status:404,error:'Not found'});}
check('hosted Read cannot edit',(await rpc('read','edit',{id,revision:rev,name:'denied'})).status,404);
for(const action of ['delete','grant','revoke','grants','activity']){const r=await rpc('edit',action,{id,...(['delete','grant','revoke'].includes(action)?{revision:rev}:{}),...(['grant','revoke'].includes(action)?{user_id:f.ungranted.id}:{}),...(action==='grant'?{permission:'read'}:{})});check(`hosted Edit cannot ${action}`,r.status,404);}
const edited=await rpc('edit','edit',{id,revision:rev,name:'Hosted edited draft'});check('hosted Edit metadata',edited.status,200);rev=edited.data.acl_revision;
check('hosted mass assignment',(await rpc('ownerA','edit',{id,revision:rev,owner_id:f.ownerB.id})).status,400);
check('hosted disabled profile',(await rpc('disabled','list')).status,401);
for(const name of ['ownerA','ownerB','read','edit','ungranted','administrator']){const list=await rpc(name,'list');check(`hosted scoped list ${name}`,list.data.map(d=>d.id).sort(),(name==='ownerB'?[b.data.id]:['ownerA','read','edit'].includes(name)?[id]:[]).sort());const direct=await clients[name].from('documents').select('*');check(`hosted raw table ${name}`,direct.error?.code,'42501');}
const activity=await rpc('ownerA','activity',{id});check('hosted durable denials',activity.data.some(e=>e.outcome==='denied'),true);
check('hosted viewer activity denied',(await rpc('read','activity',{id})).status,404);
const revoke=await rpc('ownerA','revoke',{id,revision:rev,user_id:f.edit.id});rev=revoke.data.revision;check('hosted grant revoke replay',(await rpc('edit','detail',{id})).status,404);
// Restore Edit for UI/HTTP tests, then revoke an actual Auth session through admin Auth API.
const restore=await rpc('ownerA','grant',{id,revision:rev,user_id:f.edit.id,permission:'edit'});rev=restore.data.revision;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;const admin=createClient(f.dataApiUrl,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:shim(key)}});
const signout=await admin.auth.admin.signOut(f.revoked.token,'global');if(signout.error)throw new Error('Hosted session revoke failed');
const after=await rpc('revoked','detail',{id});check('hosted unexpired token after real Auth signout',after.status,401);
const events=await rpc('administrator','admin_activity');check('hosted admin minimal event projection',events.data.every(e=>Object.keys(e).sort().join(',')==='action,actor_id,at,document_id,outcome,request_id,sequence'),true);
f.revision=rev;writeFileSync(file,JSON.stringify(f),{mode:0o600});
process.env.TV_TEST_HTTP_URL='http://localhost:8080';process.env.TV_TEST_HTTP_FIXTURES=JSON.stringify(f);
await import('./http.mjs');
console.log(`RESULT ${n} hosted assertions passed, plus HTTP harness`);
