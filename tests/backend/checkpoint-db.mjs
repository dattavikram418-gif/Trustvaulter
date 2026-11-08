import assert from 'node:assert/strict';
export async function testCheckpoints(sql) {
 let count=0;async function check(label,work){await work();count++;console.log(`PASS checkpoint ${label}`);}
 async function observe(){return sql.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE service_role');const [r]=await tx`SELECT public.tv_audit_checkpoint_snapshot() AS result`;return r.result;});}
 const before=await sql`SELECT sequence::text,canonical,event_hash FROM public.audit_events ORDER BY sequence`;
 const first=await observe();
 await check('exact decimal head/counter and UUID request',()=>{assert.match(first.head_sequence,/^[1-9][0-9]*$/);assert.equal(first.counter,'1');assert.match(first.request_id,/^[a-f0-9-]{36}$/);});
 const [head]=await sql`SELECT * FROM public.audit_events WHERE sequence=${first.head_sequence}`;
 await check('snapshot includes committed service observation evidence',()=>{assert.equal(head.event_hash,first.head_hash);assert.equal(head.action,'checkpoint_snapshot');assert.equal(head.request_id,first.request_id);assert.equal(head.actor_id,null);assert.equal(head.session_id,null);assert.equal(head.changes.chain_id,first.chain_id);});
 await check('prior canonical bytes preserved',async()=>{assert.deepEqual(Array.from(await sql`SELECT sequence::text,canonical,event_hash FROM public.audit_events WHERE sequence<${first.head_sequence} ORDER BY sequence`),Array.from(before));});
 const [gap]=await sql`SELECT nextval('public.audit_events_sequence_seq')::text n`;
 const next=await observe();
 await check('legitimate allocated sequence gap accepted',()=>assert.ok(BigInt(next.head_sequence)>BigInt(gap.n)));
 await check('stable identity and monotonic counter',()=>{assert.equal(next.chain_id,first.chain_id);assert.equal(next.system_id,first.system_id);assert.equal(next.counter,'2');});
 const parallel=await Promise.all([observe(),observe()]);
 await check('concurrent snapshots serialize distinct counters/linked heads',async()=>{assert.deepEqual(parallel.map(r=>r.counter).sort(),['3','4']);const ordered=parallel.sort((a,b)=>Number(BigInt(a.counter)-BigInt(b.counter)));const [row]=await sql`SELECT previous_hash FROM public.audit_events WHERE sequence=${ordered[1].head_sequence}`;assert.equal(row.previous_hash,ordered[0].head_hash);});
 for(const role of ['anon','authenticated'])await check(`${role} snapshot denied`,async()=>{await assert.rejects(sql.begin(async tx=>{await tx.unsafe(`SET LOCAL ROLE ${role}`);await tx`SELECT public.tv_audit_checkpoint_snapshot()`;}),/permission denied/);});
 for(const role of ['anon','authenticated','service_role'])await check(`${role} raw state denied`,async()=>{const [r]=await sql`SELECT has_table_privilege(${role},'public.audit_checkpoint_state','SELECT') ok`;assert.equal(r.ok,false);});
 await sql.unsafe(`CREATE FUNCTION public.test_checkpoint_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='checkpoint_snapshot' THEN RAISE EXCEPTION 'checkpoint audit outage'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_checkpoint_failure BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.test_checkpoint_audit_failure();`);
 const [stateBefore]=await sql`SELECT counter::text FROM public.audit_checkpoint_state`;
 await check('required audit outage rolls back counter',async()=>{await assert.rejects(observe(),/checkpoint audit outage/);const [stateAfter]=await sql`SELECT counter::text FROM public.audit_checkpoint_state`;assert.equal(stateAfter.counter,stateBefore.counter);});
 await sql.unsafe('DROP TRIGGER test_checkpoint_failure ON public.audit_events');
 await check('post-outage snapshot commits consistent head despite allocation gap',async()=>{const r=await observe();const [e]=await sql`SELECT event_hash FROM public.audit_events WHERE sequence=${r.head_sequence}`;assert.equal(e.event_hash,r.head_hash);assert.equal(BigInt(r.counter),BigInt(stateBefore.counter)+1n);});
 console.log(`RESULT checkpoint ${count} real PostgreSQL assertions passed; head-only service access, no signing or immutable sink claim`);
}
