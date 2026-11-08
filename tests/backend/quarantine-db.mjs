import assert from 'node:assert/strict';
export async function testQuarantine(sql,ids,sessions,metadata){
 let n=0;const check=(label,a,b)=>{assert.deepEqual(a,b);n++;console.log('PASS quarantine '+label);};
 const doc=(await metadata(0,'create',{name:'Quarantine regression'})).data;let rev=1;
 for(const [u,p] of [[2,'read'],[3,'edit']])rev=(await metadata(0,'grant',{id:doc.id,revision:rev,user_id:ids[u],permission:p})).data.revision;
 async function request(u,action,payload){return sql.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT set_config('request.jwt.claims',${JSON.stringify({sub:ids[u],session_id:sessions[u],exp:Math.floor(Date.now()/1000)+3600})},true)`;return (await tx`SELECT public.tv_upload_request(${action},${tx.json(payload)}) r`)[0].r;});}
 async function transition(ticket,u,step,hash='a'.repeat(64),size=4,mime='text/plain',name='test.txt',verdict='missing'){return sql.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE service_role');return (await tx`SELECT public.tv_upload_transition(${ticket}::uuid,${ids[u]}::uuid,${sessions[u]}::uuid,${step},${hash},${size},${mime},${name},${verdict}) r`)[0].r;});}
 const reserve=async(u=0)=>(await request(u,'reserve',{id:doc.id,revision:rev})).data.reservation_id;
 for(const u of [1,2,4,5])check('reserve IDOR/Read/admin '+u,(await request(u,'reserve',{id:doc.id,revision:rev})).status,404);
 check('caller parent injection',(await request(0,'reserve',{id:doc.id,revision:rev,owner_id:ids[1]})).status,400);
 let ticket=await reserve(3);check('preflight Edit live authorization',(await transition(ticket,3,'inspect')).status,200);check('Edit can stage',(await transition(ticket,3,'stage')).status,200);
 check('wrong actor cannot swap',(await transition(ticket,0,'finish')).status,404);
 rev=(await metadata(0,'revoke',{id:doc.id,revision:rev,user_id:ids[3]})).data.revision;
 check('direct RPC revoke between stage and finish',(await transition(ticket,3,'finish')).status,404);
 check('no version after revoke',Number((await sql`SELECT count(*) n FROM public.quarantined_versions WHERE document_id=${doc.id}`)[0].n),0);
 for(const verdict of ['missing','error','malicious','clean']){ticket=await reserve();check('stage '+verdict,(await transition(ticket,0,'stage')).status,200);const r=await transition(ticket,0,'finish',undefined,undefined,undefined,undefined,verdict);check('final '+verdict,r.status,200);rev++;check('even '+verdict+' read denied',(await request(0,'read_attempt',{id:doc.id})).status,423);check('replay denied',(await transition(ticket,0,'finish')).status,409);}
 ticket=await reserve();await transition(ticket,0,'stage');check('digest swap rejected',(await transition(ticket,0,'finish','b'.repeat(64))).status,400);
 ticket=await reserve();check('oversize rejected',(await transition(ticket,0,'stage',undefined,10485761)).status,400);
 ticket=await reserve();await sql`UPDATE public.profiles SET active=false WHERE user_id=${ids[0]}`;check('disabled finish denied',(await transition(ticket,0,'stage')).status,401);await sql`UPDATE public.profiles SET active=true WHERE user_id=${ids[0]}`;
 ticket=await reserve();await sql`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=${sessions[0]}`;check('live revoked session stage denied',(await transition(ticket,0,'stage')).status,401);check('malformed revoked request remains unverified',(await request(0,'invalid',{})).status,401);await sql`UPDATE auth.sessions SET not_after=NULL WHERE id=${sessions[0]}`;
 for(const role of ['anon','authenticated','service_role'])for(const table of ['upload_reservations','quarantined_versions'])check('raw '+role+'/'+table,(await sql`SELECT has_table_privilege(${role},${'public.'+table},'SELECT') ok`)[0].ok,false);
 await assert.rejects(sql.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');await tx`SELECT public.tv_upload_transition(${ticket}::uuid,${ids[0]}::uuid,${sessions[0]}::uuid,'finish')`;}),/permission denied/);n++;
 ticket=await reserve();await transition(ticket,0,'stage');
 await sql.unsafe(`CREATE FUNCTION public.quarantine_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'quarantine audit outage'; END $$; CREATE TRIGGER quarantine_failure BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.quarantine_fail_audit();`);
 await assert.rejects(request(0,'read_attempt',{id:doc.id}),/quarantine audit outage/);n++;
 const before=Number((await sql`SELECT count(*) n FROM public.quarantined_versions WHERE document_id=${doc.id}`)[0].n);
 await assert.rejects(transition(ticket,0,'finish'),/quarantine audit outage/);n++;
 await sql.unsafe('DROP TRIGGER quarantine_failure ON public.audit_events');check('audit rollback version count',Number((await sql`SELECT count(*) n FROM public.quarantined_versions WHERE document_id=${doc.id}`)[0].n),before);
 const [definition]=await sql`SELECT pg_get_functiondef('public.tv_upload_access(uuid,uuid,uuid,bigint,boolean)'::regprocedure) d`;
 const mutant=definition.d.replace("(doc.owner_id<>a AND (perm IS NULL OR (write_access AND perm<>'edit')))",'false');assert.notEqual(mutant,definition.d);await sql.unsafe(mutant);let killed=false;try{assert.equal((await request(4,'reserve',{id:doc.id,revision:rev})).status,404);}catch{killed=true;}await sql.unsafe(definition.d);check('removed authorization mutation killed',killed,true);
 const cap=await Promise.all(Array.from({length:8},()=>request(0,'reserve',{id:doc.id,revision:rev})));check('concurrent reservations capped',Number((await sql`SELECT count(*) n FROM public.upload_reservations WHERE actor_id=${ids[0]} AND state IN ('reserved','staged') AND expires_at>clock_timestamp()`)[0].n)<=5,true);
 check('denial durable',Number((await sql`SELECT count(*) n FROM public.audit_events WHERE document_id=${doc.id} AND action LIKE 'upload_%' AND outcome='denied'`)[0].n)>10,true);
 await metadata(0,'delete',{id:doc.id,revision:rev});
 console.log(`RESULT quarantine ${n} real PostgreSQL assertions passed; mutation killed; scanner verdicts injected only through trusted local test context, no clean delivery`);
}
