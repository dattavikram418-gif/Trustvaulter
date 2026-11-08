import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/backend/bounded-stream.ts', import.meta.url), 'utf8');
async function load(text) {
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
async function copyDecision(module) {
  const reused = new Uint8Array(1); let count = 0;
  const stream = new ReadableStream({ pull(c) { if (count === 4) { c.close(); return; } reused[0] = ++count; c.enqueue(reused); } }, { highWaterMark: 0 });
  assert.deepEqual([...await module.readBoundedBytes(stream, 4, { maximumChunks: 8, deadlineMs: 1000 })], [1,2,3,4]);
}
test('actual admission source copies chunks rather than retaining transport allocations', async () => copyDecision(await load(source)));
test('real source restored chunk-retention mutation is killed', async () => {
  const mutant = source.replace('let chunks = 0;', 'let chunks = 0; const retained: Uint8Array[] = [];')
    .replace('bytes.set(value, length);', 'retained.push(value);')
    .replace('return bytes ? bytes.subarray(0, length) : new Uint8Array(0);', 'let at=0; for(const chunk of retained){ bytes?.set(chunk,at); at+=chunk.length; } return bytes ? bytes.subarray(0, length) : new Uint8Array(0);');
  assert.notEqual(mutant, source);
  await assert.rejects(copyDecision(await load(mutant)), assert.AssertionError);
});
test('real source removed fragment guard is killed by empty-chunk negative', async () => {
  const guard = "if (++chunks > limits.maximumChunks) throw new Error('Body fragment limit exceeded');";
  assert.ok(source.includes(guard));
  async function negative(module) {
    const stream = new ReadableStream({ start(c) { for(let i=0;i<9;i++) c.enqueue(new Uint8Array(0)); c.close(); } });
    await assert.rejects(module.readBoundedBytes(stream, 4, { maximumChunks: 8, deadlineMs: 1000 }), /fragment/);
  }
  await negative(await load(source));
  await assert.rejects(negative(await load(source.replace(guard, '++chunks;'))), assert.AssertionError);
});
test('consumed chunk allocations are collectible mid-read; retained-source mutant fails', async () => {
  assert.equal(typeof globalThis.gc, 'function', 'Run Node with --expose-gc; memory check cannot be skipped');
  async function memoryDecision(module) {
    let first; let sent = 0; let paused;
    const reached = new Promise(resolve => { paused = resolve; });
    let resume;
    const gate = new Promise(resolve => { resume = resolve; });
    const stream = new ReadableStream({ async pull(c) {
      if (sent === 1000) { paused(); await gate; c.close(); return; }
      const chunk = new Uint8Array(16); if (sent === 0) first = new WeakRef(chunk);
      sent++; c.enqueue(chunk);
    } }, { highWaterMark: 0 });
    const reading = module.readBoundedBytes(stream, 16000, { maximumChunks: 1001, deadlineMs: 10000 });
    await reached;
    for(let i=0;i<4;i++) { await new Promise(resolve => setImmediate(resolve)); globalThis.gc(); }
    const collected = first?.deref() === undefined;
    resume(); await reading;
    assert.equal(collected, true, 'consumed first chunk retained while upload still reading');
  }
  await memoryDecision(await load(source));
  const mutant = source.replace('let chunks = 0;', 'let chunks = 0; const retained: Uint8Array[] = [];')
    .replace('bytes.set(value, length);', 'retained.push(value); bytes.set(value, length);')
    .replace('return bytes ? bytes.subarray(0, length) : new Uint8Array(0);', 'void retained.length; return bytes ? bytes.subarray(0, length) : new Uint8Array(0);');
  await assert.rejects(memoryDecision(await load(mutant)), assert.AssertionError);
  const repeatedRace = source.replace('const { done, value } = await reader.read();', 'const { done, value } = await Promise.race([reader.read(), deadline]);');
  assert.notEqual(repeatedRace, source);
  await assert.rejects(memoryDecision(await load(repeatedRace)), assert.AssertionError);
});
