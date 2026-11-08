// Opt-in hosted synthetic admin projection test. Stages: provision | run | cleanup.
// Credentials stay in /tmp (mode 0600) and are never printed. Trusted role assignment happens out-of-band between provision and run.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const stage=process.argv[2];const file='/tmp/browser/admin/fixtures.json';
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,pub=process.env.SUPABASE_PUBLISHABLE_KEY;
if(!url||!key||!pub){console.log('UNRUN: managed bindings unavailable');process.exit(2);}
const shim=k=>(i,init)=>{const h=new Headers(init?.headers);h.set('apikey',k);if(h.get('Authorization')===`Bearer ${k}`)h.delete('Authorization');return fetch(i,{...init,headers:h});};
const service=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:shim(key)}});
const NAMES=['owner','recipient','administrator','viewer'];
if(stage==='provision'){
 const f={};const suffix=randomBytes(6).toString('hex');
 for(const n of NAMES){const email=`tv-admin-${n}-${suffix}@example.com`,password=randomBytes(32).toString('base64url');
  const {data,error}=await service.auth.admin.createUser({email,password,email_confirm:true});if(error)throw new Error('provision failed');f[n]={id:data.user.id,email,password};console.log(`${n}: ${data.user.id}`);}
 mkdirSync('/tmp/browser/admin',{recursive:true});writeFileSync(file,JSON.stringify(f),{mode:0o600});process.exit(0);
}
const f=JSON.parse(readFileSync(file,'utf8'));const c={};
for(const n of NAMES){const cl=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:shim(pub)}});const l=await cl.auth.signInWithPassword({email:f[n].email,password:f[n].password});if(l.error)throw new Error(`login failed ${n}`);c[n]=cl;}
const rpc=async(n,action,payload={})=>{const r=await c[n].rpc('tv_operation',{action,payload});if(r.error)throw new Error(`transport ${r.error.code}`);assert.match(r.data.request_id,/^[0-9a-f-]{36}$/);const {request_id,...rest}=r.data;return rest;};
let checks=0;const check=(l,fn)=>{fn();checks++;console.log(`PASS hosted admin ${l}`);};
if(stage==='run'){
 const d=await rpc('owner','create',{name:'Hosted admin investigation draft',category:'Test'});assert.equal(d.status,200);let rev=d.data.acl_revision;f.doc=d.data.id;writeFileSync(file,JSON.stringify(f),{mode:0o600});
 for(const p of ['read','edit']){const g=await rpc('owner','grant',{id:f.doc,revision:rev,user_id:f.recipient.id,permission:p});assert.equal(g.status,200);rev=g.data.revision;}
 const r=await rpc('owner','revoke',{id:f.doc,revision:rev,user_id:f.recipient.id});assert.equal(r.status,200);
 const page=await rpc('administrator','admin_events',{group:'permission_changes',document_id:f.doc,recipient_id:f.recipient.id});
 check('recipient before/after reconstructed',()=>assert.deepEqual(page.data.events.map(e=>[e.action,e.old_permission,e.new_permission,String(BigInt(e.new_acl_revision)-BigInt(e.prior_acl_revision)),typeof e.sequence]),[['revoke','edit',null,'1','string'],['grant','read','edit','1','string'],['grant',null,'read','1','string']]));
 check('projection allowlisted, no titles/sessions',()=>assert.ok(page.data.events.every(e=>Object.keys(e).sort().join(',')==='action,actor_id,at,document_id,new_acl_revision,new_permission,old_permission,outcome,permission_detail,prior_acl_revision,recipient_id,request_id,sequence')));
 const paged=await rpc('administrator','admin_events',{group:'permission_changes',document_id:f.doc,limit:1});
 check('cursor present when more matches',()=>assert.ok(/^[1-9][0-9]*$/.test(paged.data.next_before)&&paged.data.events.length===1));
 for(const a of ['detail','grants','activity']){const x=await rpc('administrator',a,{id:f.doc});check(`admin denied ordinary ${a}`,()=>assert.deepEqual(x,{status:404,error:'Not found'}));}
 for(const n of ['owner','viewer','recipient']){const x=await rpc(n,'admin_events',{});check(`non-admin ${n} denied`,()=>assert.deepEqual(x,{status:404,error:'Not found'}));}
 const inv=await rpc('administrator','admin_events',{limit:500});check('invalid limit rejected',()=>assert.equal(inv.status,400));
 const bad=[];for(const b of ['0','01','1e3',1,'9223372036854775808'])bad.push((await rpc('administrator','admin_events',{before:b})).status);
 check('bad cursors all 400',()=>assert.deepEqual(bad,[400,400,400,400,400]));
 const big=await rpc('administrator','admin_events',{group:'x'.repeat(17000)});check('oversized payload 413',()=>assert.equal(big.status,413));
 const unk=await rpc('administrator','admin_events',{fields:'changes'});check('unknown field 400',()=>assert.equal(unk.status,400));
 const vbig=await rpc('viewer','admin_events',{group:'x'.repeat(17000)});check('nonadmin oversized 404',()=>assert.equal(vbig.status,404));
 const direct=await c.administrator.rpc('tv_admin_events',{payload:{}});check('direct inner RPC denied',()=>assert.ok(direct.error));
 const raw=await c.administrator.from('audit_events').select('*').limit(1);check('raw audit table denied',()=>assert.ok(raw.error));
 console.log(`RESULT hosted admin ${checks} checks`);
}
if(stage==='cleanup'){
 if(f.doc){const det=await rpc('owner','list',{});const doc=det.data.find(x=>x.id===f.doc);if(doc){const del=await rpc('owner','delete',{id:f.doc,revision:doc.acl_revision});console.log('tombstone',del.status);}}
 for(const n of NAMES){const {error}=await service.auth.admin.updateUserById(f[n].id,{ban_duration:'876000h'});console.log(`banned ${n}`,!error);}
}
