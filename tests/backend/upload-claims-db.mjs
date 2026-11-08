import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { runFencedUpload } from '../../src/lib/backend/upload-pipeline.ts';
// Real disposable PostgreSQL, real concurrent pool connections. Storage/scanner are in-memory
// spies, clearly not the hosted object store or a real engine.
export async function testUploadClaims(sql,ids,sessions,metadata){
 let n=0;const check=(label,a,b)=>{assert.deepEqual(a,b);n++;console.log('PASS claims '+label);};
 const service=async(q,args=[])=>(await sql.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE service_role');return tx.unsafe(q,args);}))[0].r;
 const claim=(t,u,s=sessions[u])=>service('SELECT public.tv_upload_claim($1::uuid,$2::uuid,$3::uuid) r',[t,ids[u],s]);
 const stage=(c,f,u)=>service("SELECT public.tv_upload_stage_fenced($1::uuid,$2::uuid,$3::uuid,$4::uuid,repeat('a',64),4,'text/plain','synthetic.txt') r",[c,f,ids[u],sessions[u]]);
 const finish=(c,f,u)=>service("SELECT public.tv_upload_finish_fenced($1::uuid,$2::uuid,$3::uuid,$4::uuid,'missing') r",[c,f,ids[u],sessions[u]]);
 const fail=(c,f,u)=>service('SELECT public.tv_upload_fail_fenced($1::uuid,$2::uuid,$3::uuid,$4::uuid) r',[c,f,ids[u],sessions[u]]);
 const release=(c,f,o='finished')=>service('SELECT public.tv_upload_release_fenced($1::uuid,$2::uuid,$3) r',[c,f,o]);
 const recover=(c,a='worker_terminated_verified')=>service('SELECT public.tv_upload_claim_recover($1::uuid,$2) r',[c,a]);
 const audit=async r=>(await sql`SELECT actor_id,session_id,action,outcome,reason,changes FROM public.audit_events WHERE request_id=${r.request_id}`)[0];
 const reservation=async t=>(await sql`SELECT * FROM public.upload_reservations WHERE id=${t}`)[0];
 await sql`UPDATE public.profiles SET active=true`;await sql`UPDATE auth.sessions SET not_after=NULL`;await sql`UPDATE auth.users SET banned_until=NULL,deleted_at=NULL`;  for(let i=0;i<ids.length;i++)await sql`INSERT INTO auth.sessions(id,user_id) VALUES(${sessions[i]},${ids[i]}) ON CONFLICT DO NOTHING`; // synthetic fixture reset
 const doc=(await metadata(0,'create',{name:'Synthetic claim parent'})).data;let rev=doc.acl_revision;
 for(const u of [2,3,4]){rev=(await metadata(0,'grant',{id:doc.id,revision:rev,user_id:ids[u],permission:'edit'})).data.revision;}
 const reserve=async(u,extra={})=>(await sql`INSERT INTO public.upload_reservations(document_id,actor_id,session_id,expected_revision,expires_at) VALUES(${extra.doc??doc.id},${ids[u]},${sessions[u]},${extra.rev??rev},${extra.expires??sql`clock_timestamp()+interval '15 minutes'`}) RETURNING id`)[0].id;
 const active=async()=>Number((await sql`SELECT count(*) n FROM public.upload_receiving_claims WHERE state='active'`)[0].n);

 // 1 exclusive concurrent claim; losers never touch winner.
 const t1=await reserve(0);const before=await reservation(t1);
 const results=await Promise.all(Array.from({length:8},()=>claim(t1,0)));
 const winners=results.filter(r=>r.status===200);check('exactly one concurrent winner',winners.length,1);
 check('losers generic',results.filter(r=>r.status!==200).map(r=>[r.status,r.error,Object.keys(r).sort()]),Array(7).fill([400,'Upload rejected',['error','request_id','status']]));
 check('loser audits committed with verified identity',(await Promise.all(results.filter(r=>r.status!==200).map(audit))).map(e=>[e.actor_id,e.session_id,e.outcome,e.reason]),Array(7).fill([ids[0],sessions[0],'denied','receiving_claimed']));
 check('winner reservation untouched by losers',await reservation(t1),before);
 const w=winners[0].data;check('fence never audited',JSON.stringify(await audit(winners[0])).includes(w.fence),false);
 check('fence stored only as hash',(await sql`SELECT count(*) n FROM public.upload_receiving_claims WHERE fence_hash=${w.fence}::text`)[0].n,'0');

 // 2 identity/ACL/lifecycle denials.
 const extra='20000000-0000-4000-8000-000000000016';await sql`INSERT INTO auth.sessions(id,user_id) VALUES(${extra},${ids[2]})`;
 const t2=await reserve(2);const t2before=await reservation(t2);
 check('other user ticket 404',(await claim(t2,3)).status,404);
 check('other session 404',(await claim(t2,2,extra)).status,404);
 check('unknown ticket 404',(await claim('99999999-0000-4000-8000-000000000016',2)).status,404);
 await sql`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=${sessions[2]}`;
 const revoked=await claim(t2,2);check('revoked session 401 null identity',[revoked.status,(await audit(revoked)).actor_id],[401,null]);
 await sql`UPDATE auth.sessions SET not_after=NULL WHERE id=${sessions[2]}`;
 await sql`UPDATE public.profiles SET active=false WHERE user_id=${ids[2]}`;check('disabled account 401',(await claim(t2,2)).status,401);await sql`UPDATE public.profiles SET active=true WHERE user_id=${ids[2]}`;
 const t3=await reserve(3,{expires:sql`clock_timestamp()-interval '1 second'`});check('expired reservation (JWT-bounded) rejected',(await claim(t3,3)).status,400);
 const t4=await reserve(4,{rev:rev-1});check('stale revision 409',(await claim(t4,4)).status,409);
 check('denials did not mutate',await reservation(t2),t2before);
 check('authenticated cannot claim',await sql.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE authenticated');return tx.unsafe('SELECT public.tv_upload_claim($1::uuid,$2::uuid,$3::uuid)',[t2,ids[2],sessions[2]]);}).then(()=>false,e=>/permission denied/.test(e.message)),true);
 for(const fn of ["tv_upload_transition($1::uuid,$2::uuid,$3::uuid,'stage',repeat('a',64),4,'text/plain','x.txt')","tv_upload_finish_evidenced($1::uuid,$2::uuid,$3::uuid,'missing')"])
  check('unfenced service bypass denied '+fn.slice(0,24),await service(`SELECT public.${fn} r`,[t1,ids[0],sessions[0]]).then(()=>false,e=>/permission denied/.test(e.message)),true);
 check('no direct claim table access',await sql.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE service_role');return tx.unsafe('SELECT * FROM public.upload_receiving_claims');}).then(()=>false,e=>/permission denied/.test(e.message)),true);

 // 3 caps: per actor and global, counted over whole pipeline.
 const t5=await reserve(0);check('per-actor cap',(await claim(t5,0)).status,429);
 const c2=(await claim(t2,2)).data,c3=(await claim(await reserve(3),3)).data,c4=(await claim(await reserve(4,{}),4)).data;check('four active',await active(),4);
 const docB=(await metadata(1,'create',{name:'Synthetic B parent'})).data;const tb=await reserve(1,{doc:docB.id,rev:docB.acl_revision});
 check('global cap',(await claim(tb,1)).status,429);

 // 4 fencing.
 const wrong='30000000-0000-4000-8000-000000000016';
 check('wrong fence stage denied',(await stage(w.claim_id,wrong,0)).status,404);check('wrong fence no mutation',(await reservation(t1)).state,'reserved');
 check('wrong actor with fence denied',(await stage(w.claim_id,w.fence,2)).status,404);
 check('wrong fence fail cannot consume winner',[(await fail(w.claim_id,wrong,0)).status,(await reservation(t1)).state],[404,'reserved']);
 check('fenced stage',(await stage(w.claim_id,w.fence,0)).status,200);
 check('slot held after stage (body done)',await active(),4);
 check('fenced finish',(await finish(w.claim_id,w.fence,0)).status,200);
 check('release',(await release(w.claim_id,w.fence)).data.state,'released');check('release idempotent',(await release(w.claim_id,w.fence)).data.state,'released');
 check('released fence cannot finish again',(await finish(w.claim_id,w.fence,0)).status,404);
 check('reservation single-claim forever',[(await claim(t1,0)).status!==200,Number((await sql`SELECT count(*) n FROM public.upload_receiving_claims WHERE reservation_id=${t1}`)[0].n)],[true,1]);
 rev=Number((await sql`SELECT acl_revision r FROM public.documents WHERE id=${doc.id}`)[0].r);
 check('finalise revision bump invalidates other fenced stages',(await stage(c3.claim_id,c3.fence,3)).status,409);
 for(const c of [c2,c3,c4])await release(c.claim_id,c.fence,'aborted');
 check('global slot freed',(await claim(tb,1)).status,200);

 // 5 lease expiry / paused worker / operator recovery.
 const t2r=await reserve(2);const c2r=(await claim(t2r,2)).data;
 await sql`UPDATE public.upload_receiving_claims SET lease_until=clock_timestamp()+interval '1 second' WHERE id=${c2r.claim_id}`;
 check('stage before expiry',(await stage(c2r.claim_id,c2r.fence,2)).status,200);
 await assert.rejects(recover(c2r.claim_id),/Claim not recoverable/);n++;
 await sql`UPDATE public.upload_receiving_claims SET lease_until=clock_timestamp()-interval '1 second' WHERE id=${c2r.claim_id}`;
 check('paused worker finish after lease denied',(await finish(c2r.claim_id,c2r.fence,2)).status,404);
 check('expired lease still occupies (no automatic reuse)',await active(),2);
 await assert.rejects(recover(c2r.claim_id,'guess'),/attestation/);n++;
 check('recover',(await recover(c2r.claim_id)).status,200);check('recovered reservation failed',(await reservation(t2r)).state,'failed');
 check('old fenced worker cannot finish after recovery',(await finish(c2r.claim_id,c2r.fence,2)).status,404);
 check('old worker release idempotent no-op',(await release(c2r.claim_id,c2r.fence,'aborted')).data.state,'recovered');
 await sql`UPDATE public.upload_reservations SET expires_at='2000-01-01' WHERE id=${t2r}`; // sort first among synthetic candidates
 check('recovered staged key eligible after expiry window',(await service('SELECT public.tv_quarantine_cleanup_candidates(100) r')).some(c=>c.id===t2r),true);

 // 6 audit faults roll back claim/release.
 const tf=await reserve(3);
 await sql.unsafe("CREATE FUNCTION public.claim_outage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'claim audit outage'; END $$; CREATE TRIGGER claim_audit_outage BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.claim_outage();");
 await assert.rejects(claim(tf,3),/claim audit outage/);n++;
 const tbClaim=(await sql`SELECT id FROM public.upload_receiving_claims WHERE reservation_id=${tb}`)[0];
 await sql.unsafe('DROP TRIGGER claim_audit_outage ON public.audit_events');
 check('claim rolled back with audit',Number((await sql`SELECT count(*) n FROM public.upload_receiving_claims WHERE reservation_id=${tf}`)[0].n),0);
 check('claim after outage succeeds',(await claim(tf,3)).status,200);
 void tbClaim;

 // 7 pipeline + real DB: concurrent workers on one ticket, deterministic gate (no sleeps).
 const pipelineRun=async(run,workers=6)=>{
  await sql`UPDATE public.upload_receiving_claims SET state='released' WHERE state='active'`; // synthetic reset of test-only claims
  rev=Number((await sql`SELECT acl_revision r FROM public.documents WHERE id=${doc.id}`)[0].r);
  const tp=await reserve(4);let reads=0,done=0,open;const gate=new Promise(r=>{open=r;});
  const tick=()=>{if(done>=workers-1||reads>1)open();};
  const worker=()=>run({
   busy:()=>service('SELECT public.tv_upload_admission_busy($1::uuid,$2::uuid) r',[ids[4],sessions[4]]),
   claim:()=>claim(tp,4),readBody:async()=>{reads++;tick();await gate;return new Uint8Array([104,105,10,10]);},cancelBody:()=>{},
   validate:b=>({size:b.length,mime:'text/plain',filename:'synthetic.txt'}),digest:()=> 'a'.repeat(64),
   stage:(c,f)=>stage(c,f,4),fail:(c,f)=>fail(c,f,4),store:async()=>true,readback:async()=>new Uint8Array([104,105,10,10]),
   scan:async()=>({verdict:'missing'}),finish:(c,f)=>finish(c,f,4),release:(c,f,o)=>release(c,f,o)}).finally(()=>{done++;tick();});
  const outs=await Promise.all(Array.from({length:workers},worker));return {outs,reads};
 };
 const {outs,reads}=await pipelineRun(runFencedUpload);
 check('one pipeline winner, others busy/rejected',outs.filter(o=>o.status===200).length,1);
 check('losers read zero bytes (winner read gated until all losers returned)',reads,1);check('pipeline released',await active(),0);
 check('no fence or key in responses',outs.some(o=>/fence|object_key/.test(JSON.stringify(o))),false);
 // Real handler-source mutants (the actual upload-pipeline.ts text, rewritten and imported).
 const src=readFileSync(new URL('../../src/lib/backend/upload-pipeline.ts',import.meta.url),'utf8');
 const loadMutant=async(from,to,tag)=>{const m=src.replace(from,to);assert.notEqual(m,src);const path=`/tmp/tv-pipeline-mutant-${tag}-${process.pid}.ts`;writeFileSync(path,m);return (await import(path)).runFencedUpload;};
 const killedPipeline=async run=>{try{const r=await pipelineRun(run);assert.equal(r.reads,1);return false;}catch{return true;}};
 check('handler read-before-claim mutant killed',await killedPipeline(await loadMutant('const claimed = await deps.claim();','await deps.readBody(); const claimed = await deps.claim();','readfirst')),true);
 check('handler claim-bypass mutant killed',await killedPipeline(await loadMutant('const claimed = await deps.claim();',"const claimed = { status: 200, data: { claim_id: crypto.randomUUID(), fence: crypto.randomUUID() } } as Envelope;",'noclaim')),true);
 await sql`UPDATE public.upload_receiving_claims SET state='released' WHERE state='active'`;

 rev=Number((await sql`SELECT acl_revision r FROM public.documents WHERE id=${doc.id}`)[0].r);
 // 8 source mutants on the authoritative boundary must be killed.
 const def=async sig=>(await sql`SELECT pg_get_functiondef(${sig}::regprocedure) d`)[0].d;
 const mutate=async(sig,from,to,probe)=>{const d=await def(sig);const m=d.replace(from,to);assert.notEqual(m,d);await sql.unsafe(m);let killed=false;try{await probe();}catch{killed=true;}await sql.unsafe(d);return killed;};
 const exclusive=async()=>{const t=await reserve(2);const a=(await claim(t,2)).data;await release(a.claim_id,a.fence,'aborted');const r=await claim(t,2);assert.equal(r.status,400);assert.equal((await audit(r)).reason,'receiving_claimed');};
 await exclusive();check('exclusivity mutant killed',await mutate('public.tv_upload_claim(uuid,uuid,uuid)','EXISTS(SELECT 1 FROM public.upload_receiving_claims c WHERE c.reservation_id=t.id)','false',exclusive),true);
 const capProbe=async()=>{const a=(await claim(await reserve(2),2)).data;const r=await claim(await reserve(2),2);await release(a.claim_id,a.fence);if(r.status===200)await release(r.data.claim_id,r.data.fence);assert.equal(r.status,429);};
 await capProbe();check('actor cap mutant killed',await mutate('public.tv_upload_claim(uuid,uuid,uuid)','c.actor_id=caller)>=1','c.actor_id=caller)>=1000',capProbe),true);
 const fenceProbe=async()=>{const a=(await claim(await reserve(3),3)).data;const r=await stage(a.claim_id,wrong,3);await release(a.claim_id,a.fence,'aborted');assert.equal(r.status,404);};
 await fenceProbe();check('fence mutant killed',await mutate('public.tv_upload_claim_valid(uuid,uuid,uuid,uuid,boolean)',"OR c.fence_hash<>encode(sha256(convert_to(fence::text,'UTF8')),'hex')",'',fenceProbe),true);
 const authProbe=async()=>{const t=await reserve(3);const r=await claim(t,2);assert.equal(r.status,404);};
 await authProbe();check('ticket-binding mutant killed',await mutate('public.tv_upload_claim(uuid,uuid,uuid)','t.actor_id IS DISTINCT FROM caller OR t.session_id IS DISTINCT FROM caller_session','false',async()=>{await authProbe();await sql`UPDATE public.upload_receiving_claims SET state='released' WHERE state='active'`;}),true);

 // 9 current-schema gate-verification regressions requested by independent review.
 const reset=async()=>{await sql`UPDATE public.upload_receiving_claims SET state='released' WHERE state='active'`;rev=Number((await sql`SELECT acl_revision r FROM public.documents WHERE id=${doc.id}`)[0].r);};
 // 9a revocation AFTER successful claim, before stage and after stage before finish.
 for(const phase of ['before_stage','before_finish'])for(const kind of ['grant_revoke','account_disable','session_revoke']){
  await reset();const t=await reserve(2);const c=(await claim(t,2)).data;assert.ok(c?.fence);
  if(phase==='before_finish')check(`${phase}/${kind} stage ok`,(await stage(c.claim_id,c.fence,2)).status,200);
  const stateBefore=(await reservation(t)).state;
  if(kind==='grant_revoke'){const r=await metadata(0,'revoke',{id:doc.id,revision:rev,user_id:ids[2]});assert.equal(r.status,200);}
  if(kind==='account_disable')await sql`UPDATE public.profiles SET active=false WHERE user_id=${ids[2]}`;
  if(kind==='session_revoke')await sql`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=${sessions[2]}`;
  const r=phase==='before_stage'?await stage(c.claim_id,c.fence,2):await finish(c.claim_id,c.fence,2);
  const trusted=kind==='grant_revoke';
  check(`${phase}/${kind} denied`,[r.status,Object.keys(r).sort()],[trusted?404:401,['error','request_id','status']]);
  const e=await audit(r);check(`${phase}/${kind} denial identity consistent with trust`,[e.actor_id,e.session_id,e.outcome],[trusted?ids[2]:null,trusted?sessions[2]:null,'denied']);
  check(`${phase}/${kind} no version created`,Number((await sql`SELECT count(*) n FROM public.quarantined_versions WHERE reservation_id=${t}`)[0].n),0);
  check(`${phase}/${kind} reservation state not corrupted`,(await reservation(t)).state,stateBefore);
  check(`${phase}/${kind} capacity still occupied`,(await sql`SELECT state FROM public.upload_receiving_claims WHERE id=${c.claim_id}`)[0].state,'active');
  check(`${phase}/${kind} fenced release frees`,[(await release(c.claim_id,c.fence,'denied')).data.state,await active()],['released',0]);
  await sql`UPDATE public.profiles SET active=true WHERE user_id=${ids[2]}`;await sql`UPDATE auth.sessions SET not_after=NULL WHERE id=${sessions[2]}`;
  if(kind==='grant_revoke'){const cur=Number((await sql`SELECT acl_revision r FROM public.documents WHERE id=${doc.id}`)[0].r);assert.equal((await metadata(0,'grant',{id:doc.id,revision:cur,user_id:ids[2],permission:'edit'})).status,200);}
 }
 // 9b release audit fault: required release audit error rolls back and leaves claim active.
 await reset();const rf=(await claim(await reserve(3),3)).data;
 await sql.unsafe("CREATE OR REPLACE FUNCTION public.release_outage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='upload_release' THEN RAISE EXCEPTION 'release audit outage'; END IF; RETURN NEW; END $$; CREATE TRIGGER release_audit_outage BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.release_outage();");
 await assert.rejects(release(rf.claim_id,rf.fence,'finished'),/release audit outage/);n++;console.log('PASS claims release audit fault raised');
 check('release audit fault leaves claim active',(await sql`SELECT state,released_at FROM public.upload_receiving_claims WHERE id=${rf.claim_id}`)[0],{state:'active',released_at:null});
 await sql.unsafe('DROP TRIGGER release_audit_outage ON public.audit_events; DROP FUNCTION public.release_outage();');
 check('release succeeds after outage',(await release(rf.claim_id,rf.fence,'finished')).data.state,'released');
 // 9c global cap under CONCURRENT different actors/tickets, deterministic advisory-lock barrier.
 await reset();rev=(await metadata(0,'grant',{id:doc.id,revision:rev,user_id:ids[6],permission:'edit'})).data.revision;
 const docB2=(await metadata(1,'create',{name:'Synthetic B cap parent'})).data;
 const barrier=async fns=>{const lock=await sql.reserve();try{await lock`BEGIN`;await lock`SELECT pg_advisory_xact_lock(81437291)`;const ps=fns.map(f=>f());let q=0;
  for(let i=0;i<1000&&q<fns.length;i++){q=(await sql`SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type='Lock' AND wait_event='advisory'`)[0].n;if(q<fns.length)await new Promise(r=>setImmediate(r));}
  assert.equal(q,fns.length,'all claimants queued at barrier');await lock`COMMIT`;return await Promise.all(ps);}finally{lock.release();}};
 const capRound=async()=>{await reset();const tickets=[];for(const u of [0,2,3,4,6])tickets.push([u,await reserve(u)]);tickets.push([1,await reserve(1,{doc:docB2.id,rev:docB2.acl_revision})]);
  const out=await barrier(tickets.map(([u,t])=>()=>claim(t,u)));return out.map((r,i)=>({...r,u:tickets[i][0]}));};
 const round=await capRound();
 check('concurrent global cap exactly 4 winners',round.filter(r=>r.status===200).length,4);
 check('concurrent losers are global-cap 429',round.filter(r=>r.status!==200).map(r=>r.status),[429,429]);
 check('concurrent loser audits global cap',(await Promise.all(round.filter(r=>r.status!==200).map(audit))).map(e=>e.reason),['global_pipeline_cap','global_pipeline_cap']);
 // 9d no automatic expiry recycling; operator recovery frees exactly one slot; recovered fence dead.
 const winners4=round.filter(r=>r.status===200).map(r=>r.data);const lu=round.find(r=>r.status!==200).u;
 const reserveFor=u=>u===1?reserve(1,{doc:docB2.id,rev:docB2.acl_revision}):reserve(u);
 await sql`UPDATE public.upload_receiving_claims SET lease_until=clock_timestamp()-interval '1 second' WHERE state='active'`;
 const loserTicket=await reserveFor(lu);
 check('expired leases still hold global cap',(await claim(loserTicket,lu)).status,429);
 check('recover one',(await recover(winners4[0].claim_id)).status,200);
 const after=await claim(loserTicket,lu);check('recovery frees exactly one slot',after.status,200);
 const other=round.filter(r=>r.status!==200).map(r=>r.u).find(u=>u!==lu);check('cap full again',(await claim(await reserveFor(other),other)).status,429);
 const recRow=(await sql`SELECT actor_id,session_id FROM public.upload_receiving_claims WHERE id=${winners4[0].claim_id}`)[0];
 const ru=ids.indexOf(recRow.actor_id);check('recovered fence cannot stage',(await stage(winners4[0].claim_id,winners4[0].fence,ru)).status,404);
 // 9e global-cap source mutant killed by the concurrent test (not by a constraint).
 const capKilled=await mutate('public.tv_upload_claim(uuid,uuid,uuid)',"c.state='active')>=4","c.state='active')>=1000",async()=>{const r=await capRound();assert.equal(r.filter(x=>x.status===200).length,4);});
 check('global cap mutant killed by concurrent round',capKilled,true);
 await reset();
 console.log(`claims assertions ${n}`);return n;
}
