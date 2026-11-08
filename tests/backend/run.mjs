import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { verifyAudit } from './audit-verifier.mjs';

// Deliberately never uses PG* / production connection defaults.
const url = process.env.TV_TEST_DATABASE_URL;
if (!url || !/^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):55432\/tv_test/.test(url)) throw new Error('Use disposable localhost:55432/tv_test database only');
const sql = postgres(url,{max:8,onnotice:()=>{}});
await sql.unsafe(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean NOT NULL DEFAULT false,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claims',true)::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
CREATE SCHEMA storage; CREATE TABLE storage.objects(id uuid,bucket_id text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.jwt(),auth.uid() TO authenticated;`);
let legacy;
// Legacy suites exercise the pre-0016 unfenced service bridge; 0016+ is applied before the claim suite.
const files=readdirSync('drizzle/migrations').filter(f=>f.endsWith('.sql')).sort();
const FENCED='0016_';
for(const file of files.filter(f=>f<FENCED)) {
 if(file.startsWith('0005_')) {
   await sql`SELECT public.tv_append_audit(NULL,NULL,'session','denied','unverified_identity')`;
   [legacy]=await sql`SELECT canonical,event_hash FROM public.audit_events ORDER BY sequence DESC LIMIT 1`;
 }
 await sql.unsafe(readFileSync(`drizzle/migrations/${file}`,'utf8'));
}
const ids=Array.from({length:7},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const sessions=ids.map((_,i)=>`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
for(let i=0;i<ids.length;i++){await sql`INSERT INTO auth.users(id) VALUES(${ids[i]})`;await sql`INSERT INTO auth.sessions(id,user_id) VALUES(${sessions[i]},${ids[i]})`;}
await sql`UPDATE public.user_roles SET role='document_creator' WHERE user_id IN (${ids[0]},${ids[1]})`;
await sql`UPDATE public.user_roles SET role='administrator' WHERE user_id=${ids[5]}`;
let checks=0;
async function check(label,fn){await fn();checks++;console.log(`PASS ${label}`);}
async function rpc(user,action,payload={}) {
 const result=await sql.begin(async tx=>{
   await tx.unsafe('SET LOCAL ROLE authenticated');
   await tx`SELECT set_config('request.jwt.claims',${JSON.stringify({sub:ids[user],session_id:sessions[user],exp:Math.floor(Date.now()/1000)+3600})},true)`;
   const [row]=await tx`SELECT public.tv_operation(${action},${tx.json(payload)}) AS result`;
   return row.result;
 });
 assert.match(result.request_id,/^[0-9a-f-]{36}$/);
 const [event]=await sql`SELECT * FROM public.audit_events WHERE request_id=${result.request_id}`;
 assert.ok(event,'request correlation survives transaction');
 assert.equal(event.actor_id,ids[user]); assert.equal(event.action,action);
 assert.equal(event.outcome,result.status===200?'allowed':'denied');
 // Existing response-equivalence assertions compare only public status/error, never UUID equality.
 const {request_id,...body}=result;
 return body;
}
const a=(await rpc(0,'create',{name:'Owner A draft',category:'Legal'})).data;
await (await import('./quarantine-db.mjs')).testQuarantine(sql,ids,sessions,rpc);
await (await import('./quarantine-corrections-db.mjs')).testQuarantineCorrections(sql,ids,sessions,rpc);
await (await import('./recurring-cleanup-db.mjs')).testRecurringCleanup(sql,ids,sessions,rpc);
await (await import('./scanner-evidence-db.mjs')).testScannerEvidence(sql,ids,sessions,rpc);
// Everything below runs on the FULL current schema (all migrations incl. 0016+).
for(const file of files.filter(f=>f>=FENCED))await sql.unsafe(readFileSync(`drizzle/migrations/${file}`,'utf8'));
const [{n:fenced}]=await sql`SELECT count(*)::int n FROM pg_proc WHERE proname='tv_upload_claim'`;assert.equal(fenced,1);console.log('SCHEMA current: all migrations applied');
await (await import('./checkpoint-db.mjs')).testCheckpoints(sql);
const b=(await rpc(1,'create',{name:'Owner B draft',category:'Legal'})).data;
await check('server-derived immutable owner',()=>assert.equal(a.owner_id,ids[0]));
for(const user of [1,4,5])for(const action of ['detail','edit','delete','grants','activity']){
 const result=await rpc(user,action,{id:a.id,...(['edit','delete'].includes(action)?{revision:1}:{}),...(action==='edit'?{name:'attack'}:{})});
 await check(`IDOR ${user}/${action}`,()=>assert.deepEqual(result,{status:404,error:'Not found'}));
}
const missing=await rpc(4,'detail',{id:'99999999-0000-4000-8000-000000000001'});
await check('missing same response as denied',()=>assert.deepEqual(missing,awaitResult404()));
function awaitResult404(){return {status:404,error:'Not found'};}
let revision=1;
for(const [user,permission] of [[2,'read'],[3,'edit']]){const r=await rpc(0,'grant',{id:a.id,revision,user_id:ids[user],permission});revision=r.data.revision;}
for(const user of [2,3]){const r=await rpc(user,'detail',{id:a.id});await check(`actual granted detail ${user}`,async ()=>assert.equal(r.status,200));}
const deniedRead=await rpc(2,'edit',{id:a.id,revision,name:'read attack'});await check('Read cannot edit concrete denial',async ()=>assert.equal(deniedRead.status,404));
for(const action of ['grant','revoke','delete','grants','activity']){const r=await rpc(3,action,{id:a.id,...(['grant','revoke','delete'].includes(action)?{revision}:{}),...(['grant','revoke'].includes(action)?{user_id:ids[4]}:{}),...(action==='grant'?{permission:'read'}:{})});await check(`Edit cannot ${action}`,async ()=>assert.equal(r.status,404));}
const edited=await rpc(3,'edit',{id:a.id,revision,name:'Edited draft'});await check('Edit can edit',async ()=>assert.equal(edited.status,200));revision=edited.data.acl_revision;
for(const extra of [{owner_id:ids[1]},{actor_id:ids[1]},{role:'administrator'},{deleted_at:new Date().toISOString()}]){const r=await rpc(0,'edit',{id:a.id,revision,...extra});await check(`mass assignment ${Object.keys(extra)[0]}`,async ()=>assert.equal(r.status,400));}
for(const payload of [null,[],{q:null},{q:{value:'x'}},{limit:0},{limit:101},{offset:-1},{from:'not-date'},{from:'2026-12-01',to:'2026-01-01'}]){const r=await rpc(0,'list',payload);await check(`invalid filter ${JSON.stringify(payload)}`,async ()=>assert.equal(r.status,400));}
for(const user of [0,1,2,3,4,5]){const r=await rpc(user,'list');const expected=user===0||user===2||user===3?[a.id]:user===1?[b.id]:[];await check(`scoped list ${user}`,async ()=>assert.deepEqual(r.data.map(d=>d.id).sort(),expected.sort()));}
const filtered=await rpc(0,'list',{q:'Edited',category:'Legal',owner:ids[0],from:'2000-01-01',to:'2100-01-01',limit:1,offset:0});await check('combined filters',async ()=>assert.equal(filtered.data.length,1));
const admin=await rpc(5,'admin_activity');await check('admin minimal allowlisted events no titles/reasons/sessions/changes',async ()=>assert.ok(admin.data.every(e=>Object.keys(e).sort().join(',')==='action,actor_id,at,document_id,outcome,request_id,sequence')));
const revoke=await rpc(0,'revoke',{id:a.id,revision,user_id:ids[3]});revision=revoke.data.revision;
const replay=await rpc(3,'edit',{id:a.id,revision:revision-1,name:'replay'});await check('revoke replay same old session',async ()=>assert.equal(replay.status,404));
// Independent monitor regression: disabled recipient can never resurrect a removed grant.
const granted=await rpc(0,'grant',{id:a.id,revision,user_id:ids[3],permission:'read'});revision=granted.data.revision;
const upgraded=await rpc(0,'grant',{id:a.id,revision,user_id:ids[3],permission:'edit'});revision=upgraded.data.revision;
await sql`UPDATE public.profiles SET active=false WHERE user_id=${ids[3]}`;
const disabledRevoke=await rpc(0,'revoke',{id:a.id,revision,user_id:ids[3]});
await check('owner revokes disabled recipient',()=>assert.equal(disabledRevoke.status,200));revision=disabledRevoke.data.revision;
await sql`UPDATE public.profiles SET active=true WHERE user_id=${ids[3]}`;
await check('reenabled recipient same session detail denied',async ()=>assert.equal((await rpc(3,'detail',{id:a.id})).status,404));
await check('reenabled recipient same session edit denied',async ()=>assert.equal((await rpc(3,'edit',{id:a.id,revision,name:'resurrect'})).status,404));
for(const target of [ids[3],'99999999-0000-4000-8000-000000000002']) {
 const removed=await rpc(0,'revoke',{id:a.id,revision,user_id:target});await check('owner idempotent revoke absent target',async ()=>assert.equal(removed.status,200));revision=removed.data.revision;
 await check('nonowner revoke cannot enumerate recipient',async ()=>assert.deepEqual(await rpc(4,'revoke',{id:a.id,revision,user_id:target}),awaitResult404()));
}
await check('owner target revoke invalid',async ()=>assert.equal((await rpc(0,'revoke',{id:a.id,revision,user_id:ids[0]})).status,400));
await sql`UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 hour' WHERE id=${ids[6]}`;
await check('grant banned recipient invalid',async ()=>assert.equal((await rpc(0,'grant',{id:a.id,revision,user_id:ids[6],permission:'read'})).status,400));
const bannedRevoke=await rpc(0,'revoke',{id:a.id,revision,user_id:ids[6]});await check('revoke banned absent recipient succeeds',async ()=>assert.equal(bannedRevoke.status,200));revision=bannedRevoke.data.revision;
await sql`UPDATE auth.users SET deleted_at=clock_timestamp() WHERE id=${ids[6]}`;
const deletedRevoke=await rpc(0,'revoke',{id:a.id,revision,user_id:ids[6]});await check('revoke deleted recipient succeeds',()=>assert.equal(deletedRevoke.status,200));revision=deletedRevoke.data.revision;
await sql`UPDATE auth.users SET deleted_at=NULL WHERE id=${ids[6]}`;
for(const extra of [{session_id:sessions[1]},{request_id:'11111111-1111-4111-8111-111111111111'},{outcome:'allowed'}]) await check('client audit fields rejected',async ()=>assert.equal((await rpc(0,'grant',{id:a.id,revision,user_id:ids[3],permission:'read',...extra})).status,400));
const permissionEvents=await sql`SELECT * FROM public.audit_events WHERE document_id=${a.id} AND changes->>'target_user_id'=${ids[3]} ORDER BY sequence`;
await check('grant read-edit-revoke reconstruction',()=>assert.deepEqual(permissionEvents.map(e=>[e.changes.old_permission,e.changes.new_permission]),[[null,'edit'],['edit',null],[null,'read'],['read','edit'],['edit',null],[null,null]]));
await check('permission audit verified owner session and revisions',()=>assert.ok(permissionEvents.every(e=>e.session_id===sessions[0]&&e.changes.new_acl_revision===e.changes.prior_acl_revision+1)));
const ownerEvents=await rpc(0,'activity',{id:a.id,limit:100});await check('owner can inspect permission change evidence',async ()=>assert.ok(ownerEvents.data.some(e=>e.changes?.target_user_id===ids[3]&&e.session_id===sessions[0])));
const race=await Promise.all([rpc(0,'edit',{id:a.id,revision,name:'race one'}),rpc(0,'edit',{id:a.id,revision,name:'race two'})]);await check('concurrent revision conflict',()=>assert.deepEqual(race.map(r=>r.status).sort(),[200,409]));revision++;
await sql`UPDATE auth.users SET banned_until=NULL WHERE id=${ids[6]}`;await sql`UPDATE public.profiles SET active=false WHERE user_id=${ids[6]}`;const disabled=await rpc(6,'list');await check('disabled account live denial',async ()=>assert.equal(disabled.status,401));
await sql`DELETE FROM auth.sessions WHERE id=${sessions[2]}`;const revoked=await rpc(2,'detail',{id:a.id});await check('deleted live session denial with unexpired token claims',async ()=>assert.equal(revoked.status,401));
const denyCount=await sql`SELECT count(*)::integer n FROM public.audit_events WHERE outcome='denied'`;await check('denials persisted across transactions',()=>assert.ok(denyCount[0].n>=35));
const [revokedEvent]=await sql`SELECT * FROM public.audit_events WHERE actor_id=${ids[2]} ORDER BY sequence DESC LIMIT 1`;await check('revoked session never recorded as verified',()=>assert.equal(revokedEvent.session_id,null));
const [disabledEvent]=await sql`SELECT * FROM public.audit_events WHERE actor_id=${ids[6]} ORDER BY sequence DESC LIMIT 1`;await check('disabled profile valid live session is attributable',()=>assert.equal(disabledEvent.session_id,sessions[6]));
const [failure]=await sql`SELECT public.tv_session_failure_correlated() request_id`;
const [failureEvent]=await sql`SELECT * FROM public.audit_events WHERE request_id=${failure.request_id}`;await check('auth transport failure correlated without claimed identity',()=>assert.deepEqual([failureEvent.actor_id,failureEvent.session_id,failureEvent.changes],[null,null,{}]));
for(const role of ['anon','authenticated'])for(const table of ['profiles','user_roles','documents','document_grants','document_versions','audit_events'])for(const verb of ['SELECT','INSERT','UPDATE','DELETE']){const [r]=await sql`SELECT has_table_privilege(${role},${'public.'+table},${verb}) ok`;await check(`raw ${role} ${table} ${verb} denied`,()=>assert.equal(r.ok,false));}
await assert.rejects(sql.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx.unsafe('SELECT * FROM public.documents');}),/permission denied/);checks++;console.log('PASS direct authenticated SELECT rejected');
const before=await sql`SELECT name FROM public.documents WHERE id=${a.id}`;
await sql.unsafe(`CREATE FUNCTION public.test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced audit failure'; END $$; CREATE TRIGGER test_audit_failure BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.test_fail_audit();`);
await assert.rejects(rpc(0,'edit',{id:a.id,revision,name:'must rollback'}),/forced audit failure/);
const grantsBefore=await sql`SELECT * FROM public.document_grants WHERE document_id=${a.id} ORDER BY user_id`;
await assert.rejects(rpc(0,'revoke',{id:a.id,revision,user_id:ids[2]}),/forced audit failure/);
await check('audit failure prevents revoke and revision change',async ()=>{assert.deepEqual(await sql`SELECT * FROM public.document_grants WHERE document_id=${a.id} ORDER BY user_id`,grantsBefore);assert.equal(Number((await sql`SELECT acl_revision FROM public.documents WHERE id=${a.id}`)[0].acl_revision),revision);});
await sql.unsafe('DROP TRIGGER test_audit_failure ON public.audit_events');
const after=await sql`SELECT name FROM public.documents WHERE id=${a.id}`;await check('audit failure rolls mutation back',()=>assert.equal(after[0].name,before[0].name));
const chain=await sql`SELECT bool_and(event_hash=encode(sha256(convert_to(previous_hash||canonical,'UTF8')),'hex') AND previous_hash=coalesce(prev,repeat('0',64))) ok FROM (SELECT *,lag(event_hash) OVER (ORDER BY sequence) prev FROM public.audit_events) t`;await check('serialized canonical hash chain',()=>assert.equal(chain[0].ok,true));
const allEvents=await sql`SELECT * FROM public.audit_events ORDER BY sequence`;
await check('legacy event bytes and hash preserved',()=>assert.deepEqual([allEvents[0].canonical,allEvents[0].event_hash],[legacy.canonical,legacy.event_hash]));
await check('mixed version canonical fields and chain verify',()=>assert.equal(verifyAudit(allEvents),allEvents.at(-1).event_hash));
await check('verifier rejects altered session/change evidence',()=>assert.throws(()=>verifyAudit(allEvents.map((e,i)=>i===1?{...e,session_id:sessions[1]}:e))));
await check('trusted request UUID unique per event',()=>assert.equal(new Set(allEvents.filter(e=>e.canonical_version===2).map(e=>e.request_id)).size,allEvents.length-1));
await assert.rejects(sql`UPDATE public.audit_events SET reason='forged' WHERE sequence=1`,/Append-only/);checks++;console.log('PASS append-only update rejected');
const [definition]=await sql`SELECT pg_get_functiondef('public.tv_operation(text,jsonb)'::regprocedure) definition`;
const mutant=definition.definition.replace("(doc.owner_id<>actor AND perm IS NULL)",'false');assert.notEqual(mutant,definition.definition);
await sql.unsafe(mutant);
let killed=false;try{assert.equal((await rpc(4,'detail',{id:a.id})).status,404);}catch{ killed=true; }
await sql.unsafe(definition.definition);await check('authorization mutation killed at DB boundary',()=>assert.equal(killed,true));
const removed=await rpc(0,'delete',{id:a.id,revision});await check('owner tombstone allowed',async ()=>assert.equal(removed.status,200));const hidden=await rpc(0,'detail',{id:a.id});await check('tombstone detail generic denial',async ()=>assert.equal(hidden.status,404));
console.log(`RESULT metadata(current-schema) ${checks} assertions passed; mutation killed; real PostgreSQL transactions; auth schema is local contract stub, not hosted JWT HTTP verification`);
const claimChecks=await (await import('./upload-claims-db.mjs')).testUploadClaims(sql,ids,sessions,rpc);
const adminResult=await (await import('./admin-events-db.mjs')).testAdminEvents(sql,ids,sessions,rpc);
console.log(`RESULT admin(current-schema) ${adminResult.checks} real PostgreSQL assertions passed; ${adminResult.mutantsKilled} mutants killed`);
const selfService=await (await import('./signup-share-alerts-db.mjs')).testSignupShareAlerts(sql,ids,sessions,rpc);
console.log(`RESULT signup/share/alerts(current-schema) ${selfService.checks} real PostgreSQL assertions passed; ${selfService.mutantsKilled} mutants killed`);
const finalChain=await sql`SELECT * FROM public.audit_events ORDER BY sequence`;assert.equal(verifyAudit(finalChain),finalChain.at(-1).event_hash);
console.log(`RESULT claims ${claimChecks} real PostgreSQL assertions passed + chain verified after claims; 7 mutants killed (5 DB function: exclusivity, actor cap, fence, ticket binding, global cap; 2 handler source: read-before-claim, claim-bypass); storage/scanner are in-memory spies`);
await sql.end();
