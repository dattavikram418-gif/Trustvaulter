import assert from 'node:assert/strict';
export async function testScannerEvidence(sql,ids,sessions,metadata){
 let n=0;const check=(label,a,b)=>{assert.deepEqual(a,b);n++;console.log('PASS scan-evidence '+label);};
 const doc=(await metadata(0,'create',{name:'Synthetic scan evidence'})).data;
 const service=(query,args=[])=>sql.begin(async tx=>{await tx.unsafe('SET LOCAL ROLE service_role');return tx.unsafe(query,args);});
 const finish=(ticket,verdict,evidence=null,actor=ids[0],sid=sessions[0])=>service('SELECT public.tv_upload_finish_evidenced($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb) r',[ticket,actor,sid,verdict,evidence===null?null:sql.json(evidence)]).then(rows=>rows[0].r);
 const reserve=async()=>{const [d]=await sql`SELECT * FROM public.documents WHERE id=${doc.id}`;const [r]=await sql`INSERT INTO public.upload_reservations(document_id,actor_id,session_id,expected_revision,state,digest,byte_size,mime,filename) VALUES(${doc.id},${ids[0]},${sessions[0]},${d.acl_revision},'staged',repeat('a',64),4,'text/plain','synthetic.txt') RETURNING *`;return r;};
 const signed=(verdict='clean',extra={})=>({body:JSON.stringify({digest:'a'.repeat(64),size:4,nonce:'30000000-0000-4000-8000-000000000001',verdict,engine:'MOCK-NOT-CLAMAV',signature_version:'MOCK',...extra}),signature:'b'.repeat(64)});
 const ticket=await reserve();
 check('cross-user generic audited denial',(await finish(ticket.id,'clean',signed(),ids[1],sessions[1])).status,404);
 check('swap leaves staged state',(await sql`SELECT state FROM public.upload_reservations WHERE id=${ticket.id}`)[0].state,'staged');
 for(const [verdict,evidence] of [['clean',null],['clean',signed('clean',{digest:'c'.repeat(64)})],['clean',signed('clean',{extra:'no'})],['clean',signed('clean',{engine:null})],['clean',{body:'x'.repeat(4097),signature:'a'.repeat(64)}]]){await assert.rejects(finish(ticket.id,verdict,evidence));n++;}
 const result=await finish(ticket.id,'clean',signed());check('signed mock finalises quarantine',result.status,200);
 const [record]=await sql`SELECT * FROM public.quarantine_scan_checks WHERE version_id=${result.data.version_id}`;
 check('private parent and request binding',[record.document_id,record.reservation_id,record.upload_request_id,record.engine],[doc.id,ticket.id,result.request_id,'MOCK-NOT-CLAMAV']);
 const [event]=await sql`SELECT * FROM public.audit_events WHERE request_id=${record.evidence_request_id}`;
 check('evidence hash audit-bound',event.changes.evidence_hash,record.evidence_hash);
 check('clean verdict never delivery state',(await sql`SELECT quarantine_state FROM public.quarantined_versions WHERE id=${result.data.version_id}`)[0].quarantine_state,'quarantined');
 await assert.rejects(sql`UPDATE public.quarantine_scan_checks SET engine='changed' WHERE id=${record.id}`,/Append-only/);n++;
 for(const role of ['anon','authenticated','service_role'])check('raw evidence denied '+role,(await sql`SELECT has_table_privilege(${role},'public.quarantine_scan_checks','SELECT') ok`)[0].ok,false);
 const absent=await reserve();check('missing records actual attempt',(await finish(absent.id,'missing')).status,200);
 check('missing has no invented signature',(await sql`SELECT signed_body FROM public.quarantine_scan_checks WHERE reservation_id=${absent.id}`)[0].signed_body,null);
 const outage=await reserve();await sql.unsafe("CREATE FUNCTION public.scan_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='upload_scan_check' THEN RAISE EXCEPTION 'scan audit outage'; END IF; RETURN NEW; END $$; CREATE TRIGGER scan_fault BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.scan_fault();");
 await assert.rejects(finish(outage.id,'error'),/scan audit outage/);n++;
 check('evidence audit failure rolls back version',(await sql`SELECT state,version_id FROM public.upload_reservations WHERE id=${outage.id}`)[0],{state:'staged',version_id:null});
 await sql.unsafe('DROP TRIGGER scan_fault ON public.audit_events');
 const [current]=await sql`SELECT acl_revision FROM public.documents WHERE id=${doc.id}`;
 await metadata(0,'delete',{id:doc.id,revision:current.acl_revision});
 check('tombstoned successful versions remain excluded',(await service('SELECT public.tv_quarantine_cleanup_candidates(100) r'))[0].r.some(c=>[ticket.object_key,absent.object_key].includes(c.object_key)),false);
 console.log(`RESULT scan-evidence ${n} real PostgreSQL assertions passed; signed responses synthetic, HMAC trusted bridge tested separately, no real engine claim`);
}
