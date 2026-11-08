import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
// Runs after fresh provision/role assignment and the existing hosted suite.
// Disable/reenable uses trusted maintenance via the runner, never a new app endpoint.
if(process.env.TV_HOSTED_CORRECTION!=='1') throw Error('Explicit hosted correction test opt-in required');
const f=JSON.parse(readFileSync('/tmp/browser/phase1/fixtures.json','utf8'));
const shim=(input,init)=>{const h=new Headers(init?.headers);h.set('apikey',f.publishableKey);return fetch(input,{...init,headers:h});};
const clients={};for(const name of ['ownerA','edit','ungranted']) clients[name]=createClient(f.dataApiUrl,f.publishableKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:shim,headers:{Authorization:`Bearer ${f[name].token}`}}});
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key) throw Error('Hosted trusted test maintenance binding unavailable');
const admin=createClient(f.dataApiUrl,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>{const h=new Headers(init?.headers);h.set('apikey',key);if(h.get('Authorization')===`Bearer ${key}`)h.delete('Authorization');return fetch(input,{...init,headers:h});}}});
async function active(value){const {error}=await admin.from('profiles').update({active:value}).eq('user_id',f.edit.id);assert.equal(error,null);}
let n=0;const check=(label,a,b)=>{assert.deepEqual(a,b);n++;console.log(`PASS ${label}`);};
async function rpc(name,action,payload){const {data,error}=await clients[name].rpc('tv_operation',{action,payload});assert.equal(error,null);return data;}
let revision=(await rpc('ownerA','detail',{id:f.documentId})).data.acl_revision;
const requests=[];
try {
 for(const permission of ['read','edit']) {
   const r=await rpc('ownerA','grant',{id:f.documentId,revision,user_id:f.edit.id,permission});check(`hosted correction grant ${permission}`,r.status,200);requests.push(r.request_id);revision=r.data.revision;
 }
 await active(false);
 const r=await rpc('ownerA','revoke',{id:f.documentId,revision,user_id:f.edit.id});check('hosted owner revokes disabled recipient',r.status,200);requests.push(r.request_id);revision=r.data.revision;
 await active(true);
 check('hosted reenabled same session detail denied',(await rpc('edit','detail',{id:f.documentId})).status,404);
 check('hosted reenabled same session edit denied',(await rpc('edit','edit',{id:f.documentId,revision,name:'resurrection'})).status,404);
 const {data:events,error}=await admin.from('audit_events').select('*').in('request_id',requests).order('sequence');assert.equal(error,null);assert.ok(events);
 check('hosted structured permission reconstruction',events.map(e=>[e.changes.old_permission,e.changes.new_permission]),[['edit','read'],['read','edit'],['edit',null]]);
 check('hosted verified session present',events.every(e=>e.session_id&&e.actor_id===f.ownerA.id&&e.canonical_version===2),true);
 check('hosted canonical contains correlation/session/changes',events.every(e=>{const c=JSON.parse(e.canonical);return c.session_id===e.session_id&&c.request_id===e.request_id&&JSON.stringify(c.changes)===JSON.stringify(e.changes);}),true);
 const deny=await rpc('ungranted','detail',{id:f.documentId});
 const denied=await admin.from('audit_events').select('outcome').eq('request_id',deny.request_id).single();assert.equal(denied.error,null);check('hosted durable denial correlation',denied.data.outcome,'denied');
 console.log(`RESULT ${n} hosted correction assertions passed; same preexisting session replay denied`);
} finally {await active(true);}
