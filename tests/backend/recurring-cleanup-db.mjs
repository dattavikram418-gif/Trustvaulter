import assert from 'node:assert/strict';
export async function testRecurringCleanup(sql,ids,sessions,metadata){
 let n=0;const check=(label,value,expected)=>{assert.deepEqual(value,expected);n++;console.log('PASS recurring '+label);};
 const doc=(await metadata(0,'create',{name:'Synthetic late writer'})).data;
 // Real database; external writes/removes below are a deterministic local Set simulation only.
 const storage=new Set();
 const service=(query,args=[])=>sql.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE service_role');return tx.unsafe(query,args);});
 const claim=async()=> (await service('SELECT public.tv_quarantine_cleanup_claim(100) r'))[0].r;
 const receipt=async(c,outcome='storage_success')=>(await service('SELECT public.tv_quarantine_cleanup_receipt($1::uuid,$2) r',[c.claim_id,outcome]))[0].r;
 const due=()=>sql`UPDATE public.quarantine_cleanup_intents SET next_attempt_at=clock_timestamp()-interval '1 second'`;
 const [r]=await sql`INSERT INTO public.upload_reservations(document_id,actor_id,session_id,expected_revision,state,digest,byte_size,mime,filename,expires_at) VALUES(${doc.id},${ids[0]},${sessions[0]},1,'staged',repeat('d',64),4,'text/plain','synthetic.txt',clock_timestamp()-interval '1 hour') RETURNING *`;
 // Writer is paused after staging, before object appears. Remove absent key, record historical success.
 const first=(await claim()).find(c=>c.object_key===r.object_key);assert.ok(first);
 storage.delete(first.object_key);const old=await receipt(first);
 const [oldAttempt]=await sql`SELECT * FROM public.quarantine_cleanup_attempts WHERE id=${first.claim_id}`;
 check('claim fences finalisation',(await sql`SELECT state FROM public.upload_reservations WHERE id=${r.id}`)[0].state,'failed');
 // External writer completes arbitrarily later, including after multiple successful sweeps.
 for(let sweep=0;sweep<3;sweep++){
  storage.add(r.object_key);await due();
  const seen=new Set();let late;
  for(let batch=0;batch<10&&!late;batch++)for(const c of await claim()){seen.add(c.object_key);storage.delete(c.object_key);const result=await receipt(c);if(c.object_key===r.object_key){late=c;check('new receipt '+sweep,result.request_id!==old.request_id,true);}}
  check('late object rediscovered '+sweep,Boolean(late),true);check('late object removed '+sweep,storage.has(r.object_key),false);
 }
 check('historical successful receipt unchanged',(await sql`SELECT * FROM public.quarantine_cleanup_attempts WHERE id=${first.claim_id}`)[0],oldAttempt);
 await due();
 // >100 completed keys from prior corrections plus new and expired uncertain work compete fairly.
 await sql`INSERT INTO public.upload_reservations(document_id,actor_id,session_id,expected_revision,state,digest,byte_size,mime,filename,expires_at) SELECT ${doc.id},${ids[0]},${sessions[0]},1,'failed',repeat('e',64),4,'text/plain','synthetic.txt',clock_timestamp()-interval '1 hour' FROM generate_series(1,110)`;
 const simultaneous=await Promise.all([claim(),claim()]);check('two bounded cleaners',simultaneous.map(b=>b.length),[100,100]);check('no simultaneous duplicate keys',new Set(simultaneous.flat().map(c=>c.object_key)).size,200);
 const uncertain=simultaneous[0][0];await receipt(simultaneous[0][1],'storage_error');
 await sql.unsafe("CREATE FUNCTION public.recurring_outage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'recurring audit outage'; END $$; CREATE TRIGGER recurring_fault BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.recurring_outage();");
 await assert.rejects(receipt(uncertain),/recurring audit outage/);n++;
 await assert.rejects(claim(),/recurring audit outage/);n++;
 check('receipt outage leaves durable uncertainty',(await sql`SELECT finished_at FROM public.quarantine_cleanup_attempts WHERE id=${uncertain.claim_id}`)[0].finished_at,null);
 await sql.unsafe('DROP TRIGGER recurring_fault ON public.audit_events');
 await sql`UPDATE public.quarantine_cleanup_intents SET claim_until=clock_timestamp()-interval '1 second',next_attempt_at=clock_timestamp()-interval '1 second'`;
 await assert.rejects(receipt(uncertain),/Expired claim/);n++;
 const all=new Set();for(let i=0;i<10;i++){const batch=await claim();if(!batch.length)break;for(const c of batch){all.add(c.object_key);await receipt(c);}}
 check('completed late key eventually revisited among new uncertain work',all.has(r.object_key),true);
 check('uncertain retry eventually visited',all.has(uncertain.object_key),true);
 check('successful versions excluded despite tombstones',(await sql`SELECT count(*) n FROM public.quarantined_versions v JOIN public.quarantine_cleanup_intents i ON i.reservation_id=v.reservation_id`)[0].n,'0');
 const [def]=await sql`SELECT pg_get_functiondef('public.tv_quarantine_cleanup_candidates(integer)'::regprocedure) d`;
 const mutant=def.d.replace('AND (i.claim_until IS NULL','AND i.completed_at IS NULL AND (i.claim_until IS NULL');assert.notEqual(mutant,def.d);await sql.unsafe(mutant);await due();
 let killed=false;try{const b=await claim();assert.ok(b.some(c=>c.object_key===r.object_key));}catch{killed=true;}finally{await sql.unsafe(def.d);}
 check('terminal completion exclusion mutation killed',killed,true);
 await metadata(0,'delete',{id:doc.id,revision:1});
 console.log(`RESULT recurring ${n} real PostgreSQL assertions passed; terminal-exclusion mutation killed; external storage simulated, no permanent absence claim`);
}
