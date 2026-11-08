import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Verify preserved bytes, continuity AND their correspondence to projected columns.
// This is a local consistency check, never an independent retention anchor.
export function verifyAudit(events) {
 let previous='0'.repeat(64);
 for (const event of events) {
   assert.equal(event.previous_hash,previous);
   assert.equal(event.event_hash,createHash('sha256').update(previous+event.canonical).digest('hex'));
   const encoded=JSON.parse(event.canonical);
   if(event.canonical_version===1) {
     assert.ok(Array.isArray(encoded));
     assert.equal(new Date(encoded[0]).getTime(),new Date(event.at).getTime());
     assert.deepEqual(encoded.slice(1),[event.actor_id,event.document_id,event.action,event.outcome,event.reason]);
     assert.equal(event.session_id,null); assert.equal(event.request_id,null); assert.deepEqual(event.changes,{});
   } else {
     assert.equal(event.canonical_version,2);
     assert.equal(encoded.version,2);
     assert.equal(new Date(encoded.at).getTime(),new Date(event.at).getTime());
     for(const field of ['actor_id','document_id','action','outcome','reason','session_id','request_id','changes']) assert.deepEqual(encoded[field],event[field]);
     assert.match(event.request_id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
   }
   previous=event.event_hash;
 }
 return previous;
}
