// Regressions for the HIGH checkpoint consistency defect (divergent higher-head ledger accepted).
// Fixtures are signed by an independent writer using node:crypto directly, not signer.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, chmod, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signSnapshot } from './signer.mjs';
import { verifyAnchoredLog } from './verifier.mjs';
import { checkpointHash, ZERO } from './format.mjs';
import { exportFileTest } from './export-test.mjs';

const pair=generateKeyPairSync('ed25519');
const privateKey=pair.privateKey.export({type:'pkcs8',format:'pem'});
const publicKey=pair.publicKey.export({type:'spki',format:'pem'});
const chain='11111111-1111-4111-8111-111111111111', system='22222222-2222-4222-8222-222222222222';
const request='33333333-3333-4333-8333-333333333333';
const t1='2026-11-01T12:00:00.000Z', t2='2026-11-01T13:00:00.000Z', t3='2026-11-01T14:00:00.000Z';
function ev(sequence, previous, action='list') {
 const e={sequence,at:t1,actor_id:null,document_id:null,action,outcome:'allowed',reason:'fixture',previous_hash:previous,canonical_version:2,session_id:null,request_id:request,changes:{}};
 e.canonical=JSON.stringify({version:2,at:t1,actor_id:null,document_id:null,action,outcome:'allowed',reason:'fixture',session_id:null,request_id:request,changes:{}});
 e.event_hash=createHash('sha256').update(previous+e.canonical).digest('hex');return e;
}
function fixture(seq,headHash,counter,previous,at,key=privateKey,keyId='root') {
 const payload=JSON.stringify({version:1,chain_id:chain,system_id:system,head_sequence:seq,head_hash:headHash,counter,previous_checkpoint_hash:previous,observed_at:at,key_id:keyId});
 return {payload,signature:sign(null,Buffer.from('TrustVault audit checkpoint v1\n'+payload),key).toString('base64')};
}
const snap=(seq,headHash,counter,at)=>({version:1,chain_id:chain,system_id:system,head_sequence:seq,head_hash:headHash,counter,observed_at:at,request_id:request});

// Ledger A: original event 1. Checkpoint A pinned.
const a1=ev('1',ZERO,'original');
const cpA=fixture('1',a1.event_hash,'1',ZERO,t1);
const trust={chain_id:chain,system_id:system,genesisHash:checkpointHash(cpA),keys:{root:{publicKey,notBeforeCounter:'1',notAfterCounter:'9223372036854775807'}}};
// Ledger B: entire log replaced by a DIFFERENT valid chain with a higher head (parent repro).
const b2=ev('2',ZERO,'different'), b3=ev('3',b2.event_hash,'new');
const divergent=[b2,b3];
const cpB=fixture('3',b3.event_hash,'2',checkpointHash(cpA),t2); // correct key/pointer/counter/time
// Legitimate extension with PG gaps and > 2^53 head.
const a5=ev('5',a1.event_hash), aBig=ev('9007199254740993',a5.event_hash);
const extended=[a1,a5,aBig];

test('parent repro: verifier rejects signed higher-head divergent ledger excluding retained head',()=>{
 assert.throws(()=>verifyAnchoredLog(divergent,cpB,trust,cpA),/divergent|absent/);
 // Even if the old head is appended in a different position, it must be an ancestor in the SAME prefix.
 assert.throws(()=>verifyAnchoredLog([b2,b3,a1],cpB,trust,cpA));
});
test('signer refuses head growth with missing, divergent, truncated, malformed or wrong-head proof',()=>{
 const s=snap('3',b3.event_hash,'2',t2), o={keyId:'root',privateKey,previous:cpA,trust};
 assert.throws(()=>signSnapshot(s,o),/prefix proof required/);
 assert.throws(()=>signSnapshot(s,{...o,prefix:divergent}),/divergent|absent/);
 const g=snap(aBig.sequence,aBig.event_hash,'2',t2);
 assert.throws(()=>signSnapshot(g,{...o,prefix:[a1,a5]}),/absent|end/);               // truncated
 assert.throws(()=>signSnapshot(g,{...o,prefix:[a5,aBig]}),/chain/);                 // not ZERO-rooted
 assert.throws(()=>signSnapshot(g,{...o,prefix:[a1,a5,aBig,ev('9007199254740995',aBig.event_hash)]}),/end at/); // proof ends at wrong head
 assert.throws(()=>signSnapshot(g,{...o,prefix:[a1,{...a5,canonical:a5.canonical+' '},aBig]}),/chain/);
 assert.throws(()=>signSnapshot(g,{...o,prefix:[a1,null,aBig]}),/Invalid/);
 assert.throws(()=>signSnapshot(g,{...o,prefix:'not-a-list'}),/Bounded/);
 assert.throws(()=>signSnapshot(g,{...o,prefix:new Array(100001).fill(a1)}),/Bounded/);
 assert.throws(()=>signSnapshot(g,{...o,prefix:[a1,{...a5,sequence:'05'},aBig]}),/decimal/);
});
test('legitimate extension with PG gaps and >2^53 head signs and verifies',()=>{
 const s=snap(aBig.sequence,aBig.event_hash,'2',t2);
 const env=signSnapshot(s,{keyId:'root',privateKey,previous:cpA,trust,prefix:extended});
 assert.deepEqual(verifyAnchoredLog(extended,env,trust,cpA),{anchoredThrough:'9007199254740993',unanchoredRecords:0});
 // Multiple independently retained anchors must all lie on the same prefix.
 const mid=fixture('5',a5.event_hash,'2',checkpointHash(cpA),t2);
 const top=fixture(aBig.sequence,aBig.event_hash,'3',checkpointHash(mid),t3);
 assert.equal(verifyAnchoredLog(extended,top,trust,mid,[cpA]).anchoredThrough,aBig.sequence);
 const foreign=fixture('3',b3.event_hash,'2',checkpointHash(cpA),t2);
 assert.throws(()=>verifyAnchoredLog(extended,top,trust,mid,[foreign]));
 assert.throws(()=>verifyAnchoredLog([a1,a5],mid,trust,cpA,[top]),/beyond/);
});
test('zero head genesis and explicit ceremony; same head has hash-equality-only semantics',()=>{
 const zero=fixture('0',ZERO,'1',ZERO,t1), zt={...trust,genesisHash:checkpointHash(zero)};
 assert.throws(()=>signSnapshot(snap('0',ZERO,'1',t1),{keyId:'root',privateKey,prefix:[]}),/ceremony/);
 assert.equal(signSnapshot(snap('0',ZERO,'1',t1),{keyId:'root',privateKey,prefix:[],genesis:'explicit-pinned-genesis-ceremony'}).payload,zero.payload);
 assert.throws(()=>signSnapshot(snap('0',ZERO,'1',t1),{keyId:'root',privateKey,prefix:[a1],genesis:'explicit-pinned-genesis-ceremony'}));
 const grow=signSnapshot(snap('1',a1.event_hash,'2',t2),{keyId:'root',privateKey,previous:zero,trust:zt,prefix:[a1]});
 assert.equal(verifyAnchoredLog([a1],grow,zt,zero).anchoredThrough,'1');
 const same=signSnapshot(snap('1',a1.event_hash,'2',t2),{keyId:'root',privateKey,previous:cpA,trust});
 assert.equal(verifyAnchoredLog([a1,a5],same,trust,cpA).unanchoredRecords,1);
 assert.throws(()=>verifyAnchoredLog([ev('1',ZERO,'other')],same,trust,cpA));
});
test('rotation: rotated key still requires ancestry',()=>{
 const r=generateKeyPairSync('ed25519'), rk=r.privateKey.export({type:'pkcs8',format:'pem'});
 const rt={...trust,keys:{root:{...trust.keys.root,notAfterCounter:'1'},rotated:{publicKey:r.publicKey.export({type:'spki',format:'pem'}),notBeforeCounter:'2',notAfterCounter:'10'}}};
 const bad=fixture('3',b3.event_hash,'2',checkpointHash(cpA),t2,rk,'rotated');
 assert.throws(()=>verifyAnchoredLog(divergent,bad,rt,cpA));
 const ok=signSnapshot(snap('5',a5.event_hash,'2',t2),{keyId:'rotated',privateKey:rk,previous:cpA,trust:rt,prefix:[a1,a5]});
 assert.equal(verifyAnchoredLog([a1,a5],ok,rt,cpA).anchoredThrough,'5');
});
test('export refuses missing/divergent proof and leaves test sink unwritten',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'tv-ancestry-export-'));await chmod(directory,0o700);
 try {
  const options={mode:'mutable-file-test-only',directory,serviceClient:{rpc:async()=>({data:snap('3',b3.event_hash,'2',t2),error:null})},privateKey,keyId:'root',previous:cpA,trust};
  await assert.rejects(exportFileTest(options),/prefix proof required/);
  await assert.rejects(exportFileTest({...options,prefix:divergent}),/divergent|absent/);
  assert.deepEqual(await readdir(directory),[]);
  const good={...options,serviceClient:{rpc:async()=>({data:snap(aBig.sequence,aBig.event_hash,'2',t2),error:null})},prefix:extended};
  await assert.rejects(exportFileTest({...good,prefix:[a1,a5]}));
  assert.deepEqual(await readdir(directory),[]);
  const result=await exportFileTest(good);assert.deepEqual(await readdir(directory),[result.filename]);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('removed-ancestry mutation in verifier is killed by divergent regression',async()=>{
 const source=await readFile(new URL('./verifier.mjs',import.meta.url),'utf8');
 const original="if (locateHead(events,prior.head_sequence,prior.head_hash) > head) throw new Error('Retained anchor not an ancestor');";
 assert.ok(source.includes(original),'mutation must match real ancestry boundary');
 const mutated=source.replace(original,'').replace("'../../tests/backend/audit-verifier.mjs'",JSON.stringify(new URL('../../tests/backend/audit-verifier.mjs',import.meta.url).href)).replace("'./format.mjs'",JSON.stringify(new URL('./format.mjs',import.meta.url).href));
 const directory=await mkdtemp(join(tmpdir(),'tv-ancestry-mutant-'));
 try {
  const path=join(directory,'verifier-mutant.mjs');await writeFile(path,mutated,{mode:0o600});
  const mutant=await import(new URL(`file://${path}`).href);
  assert.throws(()=>verifyAnchoredLog(divergent,cpB,trust,cpA));
  assert.equal(mutant.verifyAnchoredLog(divergent,cpB,trust,cpA).anchoredThrough,'3','mutant reproduces the defect, so the regression is meaningful');
 }finally{await rm(directory,{recursive:true,force:true});}
});
