import assert from 'node:assert/strict';
export async function testQuarantineCorrections(sql,ids,sessions,metadata){
 let n=0;const check=(label,a,b)=>{assert.deepEqual(a,b);n++;console.log('PASS correction '+label);};
 const doc=(await metadata(0,'create',{name:'Synthetic cleanup corrections'})).data;
 const service=async(query,args=[])=>sql.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE service_role');return tx.unsafe(query,args);});
 const transition=async(ticket,actor,sid)=> (await service("SELECT public.tv_upload_transition($1::uuid,$2::uuid,$3::uuid,'inspect') r",[ticket,actor,sid]))[0].r;
 const [ticket]=await sql`INSERT INTO public.upload_reservations(document_id,actor_id,session_id,expected_revision) VALUES(${doc.id},${ids[0]},${sessions[0]},1) RETURNING *`;
 const extra='20000000-0000-4000-8000-000000000001';await sql`INSERT INTO auth.sessions(id,user_id) VALUES(${extra},${ids[0]})`;
 const before=await sql`SELECT * FROM public.upload_reservations WHERE id=${ticket.id}`;
 for(const [label,target,actor,sid,status] of [['swap',ticket.id,ids[1],sessions[1],404],['other session',ticket.id,ids[0],extra,404],['unknown','99999999-0000-4000-8000-000000000009',ids[1],sessions[1],404],['missing caller',ticket.id,null,null,401]]){
  const r=await transition(target,actor,sid);check(label+' status',r.status,status);
  const [e]=await sql`SELECT * FROM public.audit_events WHERE request_id=${r.request_id}`;
  check(label+' committed identity',[e.actor_id,e.session_id,e.document_id,e.changes],[status===401?null:actor,status===401?null:sid,null,{}]);
  check(label+' response allowlist',Object.keys(r).sort(),['error','request_id','status']);
 }
 await sql`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=${extra}`;
 const revoked=await transition(ticket.id,ids[0],extra);check('revoked identity',revoked.status,401);const [e]=await sql`SELECT * FROM public.audit_events WHERE request_id=${revoked.request_id}`;check('revoked audit null',[e.actor_id,e.session_id],[null,null]);
 check('all swapped denials preserve ticket',await sql`SELECT * FROM public.upload_reservations WHERE id=${ticket.id}`,before);
 const [def]=await sql`SELECT pg_get_functiondef('public.tv_upload_transition(uuid,uuid,uuid,text,text,integer,text,text,text)'::regprocedure) d`;
 const mutant=def.d.replace('t.actor_id IS DISTINCT FROM caller OR t.session_id IS DISTINCT FROM caller_session','false');assert.notEqual(mutant,def.d);await sql.unsafe(mutant);
 let killed=false;try{assert.equal((await transition(ticket.id,ids[0],sessions[1])).status,404);}catch{killed=true;}await sql.unsafe(def.d);check('ticket binding mutation killed',killed,true);
 // Synthetic DB-only keys: destructive storage simulation never touches hosted user content.
 await sql`UPDATE public.upload_reservations SET state='failed' WHERE state IN ('reserved','staged')`;
 await sql`INSERT INTO public.upload_reservations(document_id,actor_id,session_id,expected_revision,state,digest,byte_size,mime,filename,expires_at)
 SELECT ${doc.id},${ids[0]},${sessions[0]},1,'failed',repeat('a',64),4,'text/plain','synthetic.txt',clock_timestamp()-interval '1 hour' FROM generate_series(1,205)`;
 const candidates=async()=> (await service('SELECT public.tv_quarantine_cleanup_candidates(100) r'))[0].r;
 const claim=async()=> (await service('SELECT public.tv_quarantine_cleanup_claim(100) r'))[0].r;
 const receipt=async(id,outcome)=> (await service('SELECT public.tv_quarantine_cleanup_receipt($1::uuid,$2) r',[id,outcome]))[0].r;
 check('dry-run bounded',(await candidates()).length,100);check('dry-run no intents',Number((await sql`SELECT count(*) n FROM public.quarantine_cleanup_intents`)[0].n),0);
 const batches=await Promise.all([claim(),claim()]);check('concurrent batch bounds',batches.map(b=>b.length),[100,100]);check('claims disjoint',new Set(batches.flat().map(c=>c.claim_id)).size,200);
 await sql`UPDATE public.quarantine_cleanup_intents SET claim_until=clock_timestamp()-interval '1 second' WHERE completed_at IS NULL`;
 const freshProgress=await claim();check('uncertain prefix does not starve untouched keys',freshProgress.slice(0,5).every(c=>!batches.flat().some(old=>old.object_key===c.object_key)),true);
 // Restore current claims for receipt tests; prior attempts remain real unfinished evidence.
 for(const c of batches.flat())await sql`UPDATE public.quarantine_cleanup_intents SET claim_id=${c.claim_id},claim_until=clock_timestamp()+interval '5 minutes' WHERE reservation_id=(SELECT reservation_id FROM public.quarantine_cleanup_attempts WHERE id=${c.claim_id})`;
 for(const c of freshProgress.filter(c=>!batches.flat().some(old=>old.object_key===c.object_key)))await receipt(c.claim_id,'storage_success');
 const first=batches[0][0];const [intentEvent]=await sql`SELECT * FROM public.audit_events WHERE request_id=${first.request_id}`;check('intent durable before simulated side effect',intentEvent.action,'cleanup_intent');
 const retry=batches[0][1],crash=batches[0][2],uncertain=batches[0][3],combined=batches[0][4];
 const stored=new Set(batches.flat().map(c=>c.object_key));
 for(const c of batches.flat().filter(c=>![retry,crash,uncertain,combined].includes(c))){stored.delete(c.object_key);await receipt(c.claim_id,'storage_success');}
 check('recent receipts deferred while pending claims preserved',(await candidates()).length,0);
 const result=await receipt(first.claim_id,'storage_success');check('idempotent same receipt',(await receipt(first.claim_id,'storage_success')).request_id,result.request_id);
 const [prior]=await sql`SELECT completed_at,attempts FROM public.quarantine_cleanup_intents WHERE reservation_id=(SELECT reservation_id FROM public.quarantine_cleanup_attempts WHERE id=${first.claim_id})`;
 await assert.rejects(receipt(first.claim_id,'storage_error'),/Conflicting receipt/);n++;
 check('historical receipt replay cannot mutate completion',(await sql`SELECT completed_at,attempts FROM public.quarantine_cleanup_intents WHERE reservation_id=(SELECT reservation_id FROM public.quarantine_cleanup_attempts WHERE id=${first.claim_id})`)[0],prior);
 await receipt(retry.claim_id,'storage_error');
 check('failure retains object',stored.has(retry.object_key),true);
 await sql`INSERT INTO public.upload_reservations(document_id,actor_id,session_id,expected_revision,state,digest,byte_size,mime,filename,expires_at) VALUES(${doc.id},${ids[0]},${sessions[0]},1,'failed',repeat('b',64),4,'text/plain','synthetic.txt',clock_timestamp()-interval '1 hour')`;
 await sql.unsafe("CREATE FUNCTION public.cleanup_outage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'cleanup audit outage'; END $$; CREATE TRIGGER cleanup_audit_outage BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.cleanup_outage();");
 stored.delete(uncertain.object_key); // actual simulated API success, but required receipt fails.
 await assert.rejects(receipt(uncertain.claim_id,'storage_success'),/cleanup audit outage/);n++;
 await assert.rejects(receipt(combined.claim_id,'storage_error'),/cleanup audit outage/);n++;
 await assert.rejects(claim(),/cleanup audit outage/);n++;
 check('outage leaves uncertain attempts unfinished',Number((await sql`SELECT count(*) n FROM public.quarantine_cleanup_attempts WHERE id IN (${uncertain.claim_id},${combined.claim_id}) AND finished_at IS NULL`)[0].n),2);
 await sql.unsafe('DROP TRIGGER cleanup_audit_outage ON public.audit_events');
 await sql`UPDATE public.quarantine_cleanup_intents SET claim_until=clock_timestamp()-interval '1 second',next_attempt_at=clock_timestamp()-interval '1 second' WHERE completed_at IS NULL`;
 await assert.rejects(receipt(crash.claim_id,'storage_success'),/Expired claim/);n++;
 const retryBatch=await claim();check('expired crash and uncertain claims reissued',retryBatch.some(c=>c.object_key===crash.object_key)&&retryBatch.some(c=>c.object_key===uncertain.object_key)&&retryBatch.some(c=>c.object_key===combined.object_key)&&retryBatch.some(c=>c.object_key===retry.object_key),true);
 for(const c of retryBatch){stored.delete(c.object_key);await receipt(c.claim_id,'storage_success');}
 check('recent successful receipts deferred, not terminal',(await candidates()).length,0);
 check('uncertain absent object retried honestly',stored.size,0);
 check('history not deleted',Number((await sql`SELECT count(*) n FROM public.quarantine_cleanup_attempts WHERE finished_at IS NULL`)[0].n)>=3,true);
 for(const role of ['anon','authenticated','service_role'])for(const table of ['quarantine_cleanup_intents','quarantine_cleanup_attempts'])check('raw cleanup '+role+'/'+table,(await sql`SELECT has_table_privilege(${role},${'public.'+table},'SELECT') ok`)[0].ok,false);
 check('successful versions never eligible',(await sql`SELECT r.id FROM public.upload_reservations r JOIN public.quarantine_cleanup_intents i ON i.reservation_id=r.id WHERE r.version_id IS NOT NULL`).length,0);
 await metadata(0,'delete',{id:doc.id,revision:1});
 console.log(`RESULT correction ${n} real PostgreSQL assertions passed; ticket-binding mutation killed; cleanup storage side effects simulated, database/audit real`);
}
