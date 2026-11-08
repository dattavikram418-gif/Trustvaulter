import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
// Administrator investigation on the FULL current schema (0017 + 0018 corrections A01/A02/A03).
// Real PostgreSQL transactions; auth schema is the local contract stub used by run.mjs. Synthetic data only.
const KEYS='action,actor_id,at,document_id,new_acl_revision,new_permission,old_permission,outcome,permission_detail,prior_acl_revision,recipient_id,request_id,sequence';
const MAX='9223372036854775807';
export async function testAdminEvents(sql,ids,sessions,rpc){
 let checks=0;const check=async(label,fn)=>{await fn();checks++;console.log(`PASS admin ${label}`);};
 const ADMIN=5;const mutants=[];
 const auditOf=async id=>(await sql`SELECT * FROM public.audit_events WHERE request_id=${id}`)[0];
 const raw=async(claims,payload={})=>sql.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claims',${JSON.stringify(claims)},true)`;return (await tx`SELECT public.tv_operation('admin_events',${tx.json(payload)}) r`)[0].r;});
 const exp=()=>Math.floor(Date.now()/1000)+3600;
 const doc=(await rpc(0,'create',{name:'Admin investigation draft',category:'Finance'})).data;let revision=doc.acl_revision;
 for(const permission of ['read','edit']){const r=await rpc(0,'grant',{id:doc.id,revision,user_id:ids[3],permission});assert.equal(r.status,200);revision=r.data.revision;}
 const deniedGrant=await rpc(4,'grant',{id:doc.id,revision,user_id:ids[1],permission:'read'});assert.equal(deniedGrant.status,404);
 const rv=await rpc(0,'revoke',{id:doc.id,revision,user_id:ids[3]});assert.equal(rv.status,200);revision=rv.data.revision;
 for(let i=0;i<120;i++)await rpc(0,'list',{limit:1});
 const unfiltered=await rpc(ADMIN,'admin_events',{limit:100});
 await check('unfiltered first page excludes older grant events',()=>{assert.equal(unfiltered.status,200);assert.ok(!unfiltered.data.events.some(e=>e.document_id===doc.id&&['grant','revoke'].includes(e.action)));assert.match(unfiltered.data.next_before,/^[1-9][0-9]*$/);});
 await check('exact allowlisted projection keys',()=>assert.ok(unfiltered.data.events.every(e=>Object.keys(e).sort().join(',')===KEYS)));
 await check('sequence serialized as decimal string',()=>assert.ok(unfiltered.data.events.every(e=>typeof e.sequence==='string'&&/^[1-9][0-9]*$/.test(e.sequence))));
 const seen=[];let before;
 for(;;){const page=await rpc(ADMIN,'admin_events',{group:'permission_changes',recipient_id:ids[3],document_id:doc.id,limit:1,...(before?{before}:{})});assert.equal(page.status,200);seen.push(...page.data.events);if(!page.data.next_before)break;before=page.data.next_before;}
 await check('grant read->edit->revoke reconstructed beyond first page',()=>assert.deepEqual(seen.map(e=>[e.action,e.old_permission,e.new_permission]),[['revoke','edit',null],['grant','read','edit'],['grant',null,'read']]));
 await check('revisions exact consecutive decimal strings',()=>assert.ok(seen.every(e=>e.permission_detail==='recorded'&&typeof e.prior_acl_revision==='string'&&BigInt(e.new_acl_revision)===BigInt(e.prior_acl_revision)+1n&&e.recipient_id===ids[3]&&e.actor_id===ids[0])));
 const denied=await rpc(ADMIN,'admin_events',{group:'permission_changes',document_id:doc.id,outcome:'denied'});
 await check('denied grant explicit unavailable',()=>{assert.equal(denied.data.events.length,1);const e=denied.data.events[0];assert.deepEqual([e.actor_id,e.permission_detail,e.recipient_id,e.old_permission,e.new_permission,e.prior_acl_revision,e.new_acl_revision],[ids[4],'unavailable',null,null,null,null,null]);});
 const nonPerm=await rpc(ADMIN,'admin_events',{action:'list',limit:3});
 await check('non-permission events not_applicable',()=>assert.ok(nonPerm.data.events.every(e=>e.permission_detail==='not_applicable'&&e.recipient_id===null)));

 // A01: malformed-history fixtures appended through the real chained audit writer (local disposable DB only).
 const fake=randomUUID();const T=ids[3];
 const base=(o={})=>JSON.stringify({target_user_id:T,old_permission:null,new_permission:'read',prior_acl_revision:1,new_acl_revision:2,...o});
 const fixtures=[
  ['fractional','grant',base().replace('"prior_acl_revision":1,"new_acl_revision":2','"prior_acl_revision":1.2,"new_acl_revision":2.2'),null],
  ['negative','grant',base({prior_acl_revision:-1,new_acl_revision:0}),null],
  ['zero domain','grant',base({prior_acl_revision:0,new_acl_revision:1}),['0','1']],
  ['max bigint pair','grant',base().replace('"prior_acl_revision":1,"new_acl_revision":2',`"prior_acl_revision":9223372036854775806,"new_acl_revision":${MAX}`),['9223372036854775806',MAX]],
  ['max+1','grant',base().replace('"prior_acl_revision":1,"new_acl_revision":2',`"prior_acl_revision":${MAX},"new_acl_revision":9223372036854775808`),null],
  ['huge exponent','grant',base().replace('"prior_acl_revision":1,"new_acl_revision":2','"prior_acl_revision":1e400,"new_acl_revision":1e400'),null],
  ['huge integer','grant',base().replace('"prior_acl_revision":1,"new_acl_revision":2',`"prior_acl_revision":${'9'.repeat(40)},"new_acl_revision":1${'0'.repeat(40)}`),null],
  ['string numbers','grant',base({prior_acl_revision:'1',new_acl_revision:'2'}),null],
  ['bad old permission','grant',base({old_permission:'admin'}),null],
  ['old permission wrong type','grant',base({old_permission:5}),null],
  ['grant null new','grant',base({new_permission:null}),null],
  ['revoke with new','revoke',base({old_permission:'read',new_permission:'read'}),null],
  ['target wrong type','grant',base({target_user_id:7}),null],
  ['missing key','grant',JSON.stringify({target_user_id:T,old_permission:null,new_permission:'read',prior_acl_revision:1}),null],
  ['extra key','grant',base({note:'x'}),null],
  ['nested revision object','grant',base({prior_acl_revision:{v:1}}),null],
  ['valid revoke','revoke',base({old_permission:'edit',new_permission:null,prior_acl_revision:41,new_acl_revision:42}),['41','42']],
 ];
 for(const [,action,changes] of fixtures)await sql`SELECT public.tv_append_audit_v2(${ids[0]}::uuid,${fake}::uuid,${action},'allowed','synthetic_fixture',NULL,${randomUUID()}::uuid,${changes}::text::jsonb)`;
 const mal=await rpc(ADMIN,'admin_events',{document_id:fake,limit:100});
 await check('malformed history query still returns 200',()=>assert.equal(mal.status,200));
 const got=[...mal.data.events].reverse();
 for(let i=0;i<fixtures.length;i++){const [label,,,expect]=fixtures[i];const e=got[i];
  await check(`A01 ${label}`,()=>expect?assert.deepEqual([e.permission_detail,e.prior_acl_revision,e.new_acl_revision],['recorded',...expect]):assert.deepEqual([e.permission_detail,e.recipient_id,e.old_permission,e.new_permission,e.prior_acl_revision,e.new_acl_revision],['unavailable',null,null,null,null,null]));}
 const [obs]=await sql`SELECT * FROM public.audit_events WHERE action='admin_events' ORDER BY sequence DESC LIMIT 1`;
 await check('observation persisted after malformed rows',()=>{assert.equal(obs.outcome,'allowed');assert.deepEqual(Object.keys(obs.changes).sort(),['filtered','group','returned']);assert.equal(obs.session_id,sessions[ADMIN]);});
 for(const [label,c] of [['scalar','5'],['array','[1,2]'],['json null','null'],['string','"x"']]){
  const [{v}]=await sql`SELECT public.tv_admin_change(ROW(1,now(),NULL,NULL,'grant','allowed','x','x','x','{}',2,NULL,NULL,${c}::text::jsonb)::public.audit_events) v`;
  await check(`A01 ${label} changes unavailable`,()=>assert.equal(v,null));}
 const [{v1}]=await sql`SELECT public.tv_admin_change(ROW(1,now(),NULL,NULL,'grant','allowed','x','x','x','[]',1,NULL,NULL,${base()}::text::jsonb)::public.audit_events) v1`;
 await check('legacy v1 never recorded',()=>assert.equal(v1,null));

 // A02: sequences beyond 2^53 with real gaps; cursor replay has no skip/duplicate.
 const [{s:seqName}]=await sql`SELECT pg_get_serial_sequence('public.audit_events','sequence') s`;
 const big=(await rpc(0,'create',{name:'Big sequence draft',category:''})).data;let br=big.acl_revision;
 for(const [jump,perm] of [['9007199254740993','read'],['9007199254741993','edit'],['9223372036854000000','read']]){
  await sql`SELECT setval(${seqName},${jump}::bigint)`;
  const g=await rpc(0,'grant',{id:big.id,revision:br,user_id:ids[3],permission:perm});assert.equal(g.status,200);br=g.data.revision;}
 const truth=(await sql`SELECT sequence::text s FROM public.audit_events WHERE document_id=${big.id} AND action IN ('grant','revoke') ORDER BY sequence DESC`).map(r=>r.s);
 await check('fixture sequences exceed 2^53 with gaps',()=>{assert.ok(truth.every(s=>BigInt(s)>2n**53n));assert.ok(BigInt(truth[0])-BigInt(truth[1])>1n);});
 const walk=[];let cur;
 for(;;){const p=await rpc(ADMIN,'admin_events',{group:'permission_changes',document_id:big.id,limit:1,...(cur?{before:cur}:{})});walk.push(...p.data.events.map(e=>e.sequence));if(!p.data.next_before)break;assert.equal(typeof p.data.next_before,'string');cur=p.data.next_before;}
 await check('cursor walk equals exact DB order (no skip/duplicate)',()=>assert.deepEqual(walk,truth));
 const replay=await rpc(ADMIN,'admin_events',{group:'permission_changes',document_id:big.id,limit:1,before:truth[0]});
 await check('adjacent page replay exact',()=>assert.deepEqual(replay.data.events.map(e=>e.sequence),[truth[1]]));
 for(const b of ['0','-1','01','1e3',' 1','1.0',1,'9223372036854775808','99999999999999999999',{},true,null,['1']]){
  const r=await rpc(ADMIN,'admin_events',{before:b});
  await check(`A02 bad cursor ${JSON.stringify(b)} audited 400`,async()=>{assert.equal(r.status,400);});}
 await check('max cursor accepted',async()=>assert.equal((await rpc(ADMIN,'admin_events',{before:MAX,limit:1})).status,200));

 // A03: payload bounds (rpc helper asserts a committed correlated audit row for each).
 await check('oversized payload 413',async()=>assert.deepEqual(await rpc(ADMIN,'admin_events',{group:'x'.repeat(17000)}),{status:413,error:'Request too large'}));
 for(const payload of [null,[],5,'x',{group:'x'.repeat(41)},{limit:'50'},{limit:50.5},{limit:101},{limit:0},{fields:['changes']},{changes:true},{recipient_id:'nope'},{actor_id:{}},{outcome:'x'},{action:'DROP TABLE'},{from:'2026-13-45'},{from:'yesterday'},{from:'2026-12-01',to:'2026-01-01'},{group:{nested:'x'.repeat(100)}}])
  await check(`A03 invalid ${JSON.stringify(payload).slice(0,40)} audited 400`,async()=>assert.equal((await rpc(ADMIN,'admin_events',payload)).status,400));
 await check('nonadmin oversized still 404',async()=>assert.deepEqual(await rpc(4,'admin_events',{group:'x'.repeat(17000)}),{status:404,error:'Not found'}));

 // Identity consistency: unverified => NULL actor/session; verified nonadmin => real actor/session.
 const extraSession=randomUUID();await sql`INSERT INTO auth.sessions(id,user_id) VALUES(${extraSession},${ids[ADMIN]})`;await sql`DELETE FROM auth.sessions WHERE id=${extraSession}`;
 const idCases=[['no claims',{}],['invalid sub',{sub:'nope',session_id:sessions[ADMIN],exp:exp()}],['string exp',{sub:ids[ADMIN],session_id:sessions[ADMIN],exp:'abc'}],['fractional exp',{sub:ids[ADMIN],session_id:sessions[ADMIN],exp:exp()+0.5}],['expired',{sub:ids[ADMIN],session_id:sessions[ADMIN],exp:1000}],['wrong session',{sub:ids[ADMIN],session_id:sessions[0],exp:exp()}],['revoked session',{sub:ids[ADMIN],session_id:extraSession,exp:exp()}],['session wrong type',{sub:ids[ADMIN],session_id:5,exp:exp()}]];
 for(const [label,claims] of idCases){const r=await raw(claims);const e=await auditOf(r.request_id);await check(`identity ${label} 401 NULL attribution`,()=>{assert.equal(r.status,401);assert.deepEqual([e.actor_id,e.session_id,e.outcome],[null,null,'denied']);});}
 await sql`UPDATE public.profiles SET active=false WHERE user_id=${ids[ADMIN]}`;
 {const r=await raw({sub:ids[ADMIN],session_id:sessions[ADMIN],exp:exp()});const e=await auditOf(r.request_id);await check('disabled admin 401 NULL attribution',()=>{assert.equal(r.status,401);assert.deepEqual([e.actor_id,e.session_id],[null,null]);});}
 await sql`UPDATE public.profiles SET active=true WHERE user_id=${ids[ADMIN]}`;
 {const r=await raw({sub:ids[4],session_id:sessions[4],exp:exp()});const e=await auditOf(r.request_id);await check('verified nonadmin 404 attributed',()=>{assert.equal(r.status,404);assert.deepEqual([e.actor_id,e.session_id],[ids[4],sessions[4]]);});}
 for(const user of [0,4])await check(`non-admin ${user} denied`,async()=>assert.deepEqual(await rpc(user,'admin_events',{}),{status:404,error:'Not found'}));
 for(const action of ['detail','grants','activity'])await check(`admin still denied ordinary ${action}`,async()=>assert.deepEqual(await rpc(ADMIN,action,{id:doc.id}),{status:404,error:'Not found'}));
 await check('admin still denied edit',async()=>assert.equal((await rpc(ADMIN,'edit',{id:doc.id,revision,name:'x'})).status,404));
 for(const fn of ['tv_admin_events(jsonb)','tv_admin_change(public.audit_events)'])for(const role of ['anon','authenticated','service_role']){const [r]=await sql`SELECT has_function_privilege(${role},${'public.'+fn},'EXECUTE') ok`;await check(`${role} cannot call ${fn} directly`,()=>assert.equal(r.ok,false));}
 await sql.unsafe(`CREATE FUNCTION public.test_fail_admin_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='admin_events' THEN RAISE EXCEPTION 'forced admin audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_admin_audit_failure BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.test_fail_admin_audit();`);
 await assert.rejects(rpc(ADMIN,'admin_events',{}),/forced admin audit failure/);
 await sql.unsafe('DROP TRIGGER test_admin_audit_failure ON public.audit_events; DROP FUNCTION public.test_fail_admin_audit();');checks++;console.log('PASS admin audit outage fails closed');

 // Source mutants (each must be killed; original restored).
 const [{d:def}]=await sql`SELECT pg_get_functiondef('public.tv_admin_events(jsonb)'::regprocedure) d`;
 const [{d:cdef}]=await sql`SELECT pg_get_functiondef('public.tv_admin_change(public.audit_events)'::regprocedure) d`;
 async function mutant(label,original,from,to,probe){const m=original.replace(from,to);assert.notEqual(m,original,`mutant ${label} did not apply`);await sql.unsafe(m);let killed=false;try{await probe();}catch{killed=true;}await sql.unsafe(original);mutants.push(label);await check(`mutant killed: ${label}`,()=>assert.equal(killed,true));}
 await mutant('removed admin gate',def,"IF actor_role IS DISTINCT FROM 'administrator' THEN",'IF false THEN',async()=>assert.equal((await rpc(4,'admin_events',{})).status,404));
 await mutant('removed integer-text check',cdef,"IF p !~ '^(0|[1-9][0-9]{0,18})$' OR nw !~ '^(0|[1-9][0-9]{0,18})$' THEN RETURN NULL; END IF;",'',async()=>{const r=await rpc(ADMIN,'admin_events',{document_id:fake,limit:100});assert.equal(r.status,200);assert.equal([...r.data.events].reverse()[0].permission_detail,'unavailable');});
 await mutant('removed legacy version check',cdef,'e.canonical_version IS DISTINCT FROM 2 OR ','',async()=>{const [{v}]=await sql`SELECT public.tv_admin_change(ROW(1,now(),NULL,NULL,'grant','allowed','x','x','x','[]',1,NULL,NULL,${base()}::text::jsonb)::public.audit_events) v`;assert.equal(v,null);});
 await mutant('numeric sequence output',def,"'sequence',sequence::text",`'sequence',sequence`,async()=>{const r=await rpc(ADMIN,'admin_events',{limit:1});assert.equal(typeof r.data.events[0].sequence,'string');});
 await mutant('removed decimal-string cursor check',def,"OR (payload->>'before') !~ '^[1-9][0-9]{0,18}$' THEN",' THEN',async()=>assert.equal((await rpc(ADMIN,'admin_events',{before:'01'})).status,400));
 await mutant('removed verified-identity attribution',def,"PERFORM public.tv_append_audit_v2(NULL,NULL,'admin_events','denied','invalid_session',NULL,req,","PERFORM public.tv_append_audit_v2((claims->>'sub')::uuid,NULL,'admin_events','denied','invalid_session',NULL,req,",async()=>{const r=await raw({sub:ids[ADMIN],session_id:sessions[0],exp:exp()});assert.equal((await auditOf(r.request_id)).actor_id,null);});
 return {checks,mutantsKilled:mutants.length};
}
