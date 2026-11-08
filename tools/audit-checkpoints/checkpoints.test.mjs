import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, chmod, writeFile, rm, readFile, stat, symlink, rename, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signSnapshot } from './signer.mjs';
import { verifyCheckpoint, verifyAnchoredLog } from './verifier.mjs';
import { checkpointHash, DOMAIN, ZERO } from './format.mjs';
import { withTestSinkLock, retainTestCheckpoint } from './file-test-sink.mjs';
import { observeHead } from './snapshot-adapter.mjs';
import { exportFileTest } from './export-test.mjs';

const pair=generateKeyPairSync('ed25519');
const privateKey=pair.privateKey.export({type:'pkcs8',format:'pem'});
const publicKey=pair.publicKey.export({type:'spki',format:'pem'});
const chain='11111111-1111-4111-8111-111111111111', system='22222222-2222-4222-8222-222222222222';
const request='33333333-3333-4333-8333-333333333333';
const stamp='2026-11-01T12:36:00.000Z';
function event(sequence, previous, action='list', legacy=false) {
 const e={sequence,at:stamp,actor_id:null,document_id:null,action,outcome:'allowed',reason:'fixture',previous_hash:previous,canonical_version:legacy?1:2,session_id:null,request_id:legacy?null:request,changes:{}};
 e.canonical=JSON.stringify(legacy?[stamp,null,null,action,'allowed','fixture']:{version:2,at:stamp,actor_id:null,document_id:null,action,outcome:'allowed',reason:'fixture',session_id:null,request_id:request,changes:{}});
 e.event_hash=createHash('sha256').update(previous+e.canonical).digest('hex');return e;
}
const first=event('1',ZERO,'session',true), second=event('4',first.event_hash), third=event('9007199254740993',second.event_hash);
const log=[first,second,third];
function snapshot(head=third,counter='1') {return {version:1,chain_id:chain,system_id:system,head_sequence:head.sequence,head_hash:head.event_hash,counter,observed_at:stamp,request_id:request};}
// Independent fixture writer: explicit order/domain and standard crypto, not signer implementation.
function fixture(head=third,counter='1',previous=ZERO,key=privateKey,keyId='root') {
 const payload=JSON.stringify({version:1,chain_id:chain,system_id:system,head_sequence:head.sequence,head_hash:head.event_hash,counter,previous_checkpoint_hash:previous,observed_at:stamp,key_id:keyId});
 return {payload,signature:sign(null,Buffer.from('TrustVault audit checkpoint v1\n'+payload),key).toString('base64')};
}
const genesis=fixture();
const trust={chain_id:chain,system_id:system,genesisHash:checkpointHash(genesis),keys:{root:{publicKey,notBeforeCounter:'1',notAfterCounter:'9223372036854775807'}}};
test('independent fixture verifies exact bigint head, legacy/v2 and legitimate sequence gaps',()=>{
 assert.deepEqual(verifyAnchoredLog(log,genesis,trust),{anchoredThrough:'9007199254740993',unanchoredRecords:0});
 assert.equal(signSnapshot(snapshot(),{keyId:'root',privateKey,genesis:'explicit-pinned-genesis-ceremony',prefix:log}).payload,genesis.payload);
});
test('altered projected field and canonical bytes rejected',()=>{
 assert.throws(()=>verifyAnchoredLog(log.map((e,i)=>i===1?{...e,action:'delete'}:e),genesis,trust));
 assert.throws(()=>verifyAnchoredLog(log.map((e,i)=>i===1?{...e,canonical:e.canonical+' '}:e),genesis,trust));
});
test('inserted, reordered, and deleted records rejected',()=>{
 assert.throws(()=>verifyAnchoredLog([first,event('2',first.event_hash,'edit'),second,third],genesis,trust));
 assert.throws(()=>verifyAnchoredLog([second,first,third],genesis,trust));
 assert.throws(()=>verifyAnchoredLog([first,third],genesis,trust));
});
test('anchored suffix truncation rejected even when remaining chain internally valid',()=>{
 assert.throws(()=>verifyAnchoredLog([first,second],genesis,trust));
});
test('alternate internally valid same-sequence chain fails external checkpoint',()=>{
 const alternate=event('4',first.event_hash,'delete'); const alternateHead=event(third.sequence,alternate.event_hash);
 assert.throws(()=>verifyAnchoredLog([first,alternate,alternateHead],genesis,trust));
});
test('unanchored suffix can disappear without proof of deletion',()=>{
 const early=fixture(second); const pinned={...trust,genesisHash:checkpointHash(early)};
 assert.equal(verifyAnchoredLog(log,early,pinned).unanchoredRecords,1);
 assert.equal(verifyAnchoredLog([first,second],early,pinned).unanchoredRecords,0);
});
test('retained checkpoint rejects replay, rollback, wrong predecessor and same-head fork',()=>{
 const next=fixture(third,'2',checkpointHash(genesis));
 assert.equal(verifyCheckpoint(next,trust,genesis).counter,'2');
 assert.throws(()=>verifyCheckpoint(genesis,trust,genesis));
 assert.throws(()=>verifyCheckpoint(fixture(second,'2',checkpointHash(genesis)),trust,genesis));
 assert.throws(()=>verifyCheckpoint(fixture(third,'2'),trust,genesis));
 assert.throws(()=>verifyCheckpoint(fixture({...third,event_hash:'a'.repeat(64)},'2',checkpointHash(genesis)),trust,genesis));
});
test('wrong key, key ID, chain identity and signature fail; no sink TOFU',()=>{
 const wrong=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});
 assert.throws(()=>verifyCheckpoint(fixture(third,'1',ZERO,wrong),trust));
 assert.throws(()=>verifyCheckpoint(fixture(third,'1',ZERO,privateKey,'other'),trust));
 assert.throws(()=>verifyCheckpoint(genesis,{...trust,chain_id:system}));
 assert.throws(()=>verifyCheckpoint({...genesis,signature:'A'.repeat(86)+'=='},trust));
 assert.throws(()=>verifyCheckpoint(genesis,{...trust,genesisHash:undefined}));
});
test('rotation requires separately pinned key window and retained predecessor',()=>{
 const rotated=generateKeyPairSync('ed25519');const key=rotated.privateKey.export({type:'pkcs8',format:'pem'});
 const next=fixture(third,'2',checkpointHash(genesis),key,'rotated');
 assert.throws(()=>verifyCheckpoint(next,trust,genesis));
 const updated={...trust,keys:{root:{...trust.keys.root,notAfterCounter:'1'},rotated:{publicKey:rotated.publicKey.export({type:'spki',format:'pem'}),notBeforeCounter:'2',notAfterCounter:'10'}}};
 assert.equal(verifyCheckpoint(next,updated,genesis).key_id,'rotated');
 assert.throws(()=>verifyCheckpoint(fixture(third,'2',checkpointHash(genesis)),updated,genesis));
});
test('noncanonical, oversize, numeric/leading-zero counters rejected',()=>{
 for(const patch of [{counter:1},{counter:'01'},{head_sequence:'9007199254740992.5'},{version:2},{key_id:'../escape'},{extra:true}])assert.throws(()=>signSnapshot({...snapshot(),...patch},{keyId:'root',privateKey,genesis:'explicit-pinned-genesis-ceremony',prefix:log}));
 assert.throws(()=>verifyCheckpoint({...genesis,payload:JSON.stringify(JSON.parse(genesis.payload),null,2)},trust));
 assert.throws(()=>verifyCheckpoint({...genesis,payload:' '.repeat(2049)},trust));
});
test('exclusive mutable sink locks, no overwrite/traversal, private ephemeral key, fsync write',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'tv-checkpoint-test-'));await chmod(directory,0o700);
 try {
  const keyPath=join(directory,'test-only-private.pem');await writeFile(keyPath,privateKey,{mode:0o600});assert.equal((await stat(keyPath)).mode&0o777,0o600);
  await withTestSinkLock(directory,async root=>{
   await assert.rejects(withTestSinkLock(directory,async()=>{}),/EEXIST/);
   const name=await retainTestCheckpoint(root,genesis);assert.equal((await stat(join(directory,name))).mode&0o777,0o600);
   assert.deepEqual(JSON.parse(await readFile(join(directory,name),'utf8')),genesis);
   await assert.rejects(retainTestCheckpoint(root,genesis),/EEXIST/);
   await assert.rejects(retainTestCheckpoint(root,{...genesis,payload:'../escape'}));
  });
  await symlink(directory,join(directory,'link'));await assert.rejects(withTestSinkLock(join(directory,'link'),async()=>{}));
  await chmod(directory,0o755);await assert.rejects(withTestSinkLock(directory,async()=>{}));
 } finally {await rm(directory,{recursive:true,force:true});}
});
test('fixed snapshot adapter accepts exact fields only and fails closed',async()=>{
 let called;const data=await observeHead({rpc:async name=>{called=name;return {data:snapshot(),error:null};}});assert.equal(called,'tv_audit_checkpoint_snapshot');assert.equal(data.head_sequence,third.sequence);
 await assert.rejects(observeHead({rpc:async()=>({error:{message:'private error'}})}),/unavailable/);
 await assert.rejects(observeHead({rpc:async()=>({data:{...snapshot(),events:log},error:null})}));
});
test('held directory resists concurrent pathname replacement; no raw sink capability',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'tv-checkpoint-path-')),moved=directory+'-moved';await chmod(directory,0o700);
 try{await withTestSinkLock(directory,async root=>{
  await rename(directory,moved);await mkdir(directory,{mode:0o700});
  const name=await retainTestCheckpoint(root,genesis);assert.ok(await stat(join(moved,name)));await assert.rejects(stat(join(directory,name)),/ENOENT/);
 });await assert.rejects(retainTestCheckpoint(directory,genesis),/guard/);}
 finally{await rm(directory,{recursive:true,force:true});await rm(moved,{recursive:true,force:true});}
});
test('signer rejects forged predecessor; rotation keeps historical verification pins',()=>{
 const bad={...genesis,signature:'A'.repeat(86)+'=='};
 assert.throws(()=>signSnapshot(snapshot(third,'2'),{keyId:'root',privateKey,previous:bad,trust}));
 assert.throws(()=>signSnapshot(snapshot(third,'2'),{keyId:'root',privateKey,previous:genesis}));
 const next=fixture(third,'2',checkpointHash(genesis));assert.throws(()=>verifyCheckpoint(next,{...trust,keys:{}},genesis));
});
test('zero head and malformed unanchored suffix have explicit semantics',()=>{
 const empty=fixture({sequence:'0',event_hash:ZERO});const pinned={...trust,genesisHash:checkpointHash(empty)};
 assert.equal(verifyAnchoredLog([],empty,pinned).anchoredThrough,'0');assert.equal(verifyAnchoredLog(log,empty,pinned).unanchoredRecords,3);
 const early=fixture(second),pin={...trust,genesisHash:checkpointHash(early)};
 assert.throws(()=>verifyAnchoredLog([...log.slice(0,2),{...third,action:'forged'}],early,pin));
 assert.throws(()=>verifyAnchoredLog([...log.slice(0,2),{...third,sequence:'04'}],early,pin));
});
test('integrated explicit file-test export and disabled production mode',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'tv-checkpoint-export-'));await chmod(directory,0o700);
 try {
  const options={mode:'mutable-file-test-only',directory,serviceClient:{rpc:async()=>({data:snapshot(third,'2'),error:null})},privateKey,keyId:'root',previous:genesis,trust,prefix:log};
  await assert.rejects(exportFileTest({...options,mode:'production'}),/disabled/);
  await assert.rejects(exportFileTest({...options,previous:null}),/retained/);
  const result=await exportFileTest(options);assert.equal(verifyCheckpoint(result.envelope,trust,genesis).counter,'2');
  assert.deepEqual(JSON.parse(await readFile(join(directory,result.filename),'utf8')),result.envelope);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('removed signature verification mutation is killed by independently signed wrong-key attack',async()=>{
 const wrong=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});
 const bad=fixture(third,'2',checkpointHash(genesis),wrong);
 assert.throws(()=>verifyCheckpoint(bad,trust,genesis));
 const source=await readFile(new URL('./verifier.mjs',import.meta.url),'utf8');
 const original="!verify(null,Buffer.from(DOMAIN+envelope.payload),key,Buffer.from(envelope.signature,'base64'))";
 assert.ok(source.includes(original),'mutation must match real verification boundary');
 const mutated=source.replace(original,'false').replace("'../../tests/backend/audit-verifier.mjs'",JSON.stringify(new URL('../../tests/backend/audit-verifier.mjs',import.meta.url).href)).replace("'./format.mjs'",JSON.stringify(new URL('./format.mjs',import.meta.url).href));
 const directory=await mkdtemp(join(tmpdir(),'tv-checkpoint-mutant-'));
 try {
  const path=join(directory,'verifier-mutant.mjs');await writeFile(path,mutated,{mode:0o600});
  const mutant=await import(new URL(`file://${path}`).href);
  let killed=false;try{assert.throws(()=>mutant.verifyCheckpoint(bad,trust,genesis));}catch{killed=true;}
  assert.equal(killed,true,'wrong-key negative regression must fail on real removed-signature mutation');
 }finally{await rm(directory,{recursive:true,force:true});}
});
