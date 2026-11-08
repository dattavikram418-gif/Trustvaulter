import { describe, expect, it, vi } from 'vitest';
import { PROCESS_PIPELINE_CAP, activePipelines, runFencedUpload, type PipelineDeps } from './upload-pipeline';

// Unit spies only: authoritative claim/cap/fence semantics are exercised against real PostgreSQL
// in tests/backend/upload-claims-db.mjs.
const ok = (data: unknown = {}) => ({ status: 200, data, request_id: 'r' });
function deps(over: Partial<PipelineDeps> = {}): PipelineDeps & { calls: string[] } {
  const calls: string[] = [];
  const spy = <T>(name: string, v: T) => async () => { calls.push(name); return v; };
  return {
    calls,
    busy: spy('busy', { status: 503, error: 'Upload capacity busy', request_id: 'b' }),
    claim: spy('claim', ok({ claim_id: 'c', fence: 'secret-fence' })),
    readBody: spy('read', new Uint8Array([1, 2, 3])),
    cancelBody: () => { calls.push('cancel'); },
    validate: (b) => { calls.push('validate'); return { size: b.length, mime: 'text/plain', filename: 'a.txt' }; },
    digest: () => 'd',
    stage: spy('stage', ok({ object_key: 'k' })),
    fail: spy('fail', { status: 400, error: 'Upload rejected', request_id: 'f' }),
    store: spy('store', true),
    readback: spy('readback', new Uint8Array([1, 2, 3])),
    scan: spy('scan', { verdict: 'missing' }),
    finish: spy('finish', ok({ version_id: 'v' })),
    release: async (_c, _f, o) => { calls.push('release:' + o); return ok(); },
    ...over,
  } as PipelineDeps & { calls: string[] };
}

describe('fenced upload pipeline', () => {
  it('claim loser performs zero body reads and never fails the winner', async () => {
    const d = deps({ claim: async () => { d.calls.push('claim'); return { status: 400, error: 'Upload rejected', request_id: 'x' }; } });
    const r = await runFencedUpload(d);
    expect(r).toEqual({ status: 400, error: 'Upload rejected', request_id: 'x' });
    expect(d.calls).toEqual(['claim', 'cancel']);
  });
  it('success holds occupancy through scan/finish and releases once afterwards without leaking fence/key', async () => {
    const d = deps({ finish: async () => { d.calls.push('finish@' + activePipelines()); return ok({ version_id: 'v', object_key: 'k' }); } });
    const r = await runFencedUpload(d);
    expect(d.calls).toEqual(['claim', 'read', 'validate', 'stage', 'store', 'readback', 'scan', 'finish@1', 'release:finished']);
    expect(JSON.stringify(r)).not.toMatch(/secret-fence|"k"/);
    expect(activePipelines()).toBe(0);
  });
  it.each([
    ['malformed', { readBody: async () => { throw new Error('Body size exceeded'); } }],
    ['stored_failure', { store: async () => false }],
    ['stored_failure', { readback: async () => new Uint8Array([9]) }],
    ['scan_failure', { scan: async () => { throw new Error('boom'); } }],
    ['denied', { stage: async () => ({ status: 409, error: 'Refresh and retry' }) }],
    ['aborted', { finish: async () => { throw new Error('audit'); } }],
  ] as const)('releases with %s on failure paths', async (outcome, over) => {
    const d = deps(over as Partial<PipelineDeps>);
    await runFencedUpload(d).catch(() => undefined);
    expect(d.calls.filter((c) => c.startsWith('release:'))).toEqual(['release:' + outcome]);
    expect(activePipelines()).toBe(0);
  });
  it('process cap rejects before claim with zero reads', async () => {
    let unblock!: () => void;
    const gate = new Promise<void>((r) => { unblock = r; });
    const held = Array.from({ length: PROCESS_PIPELINE_CAP }, () => deps({ readBody: async () => { await gate; return new Uint8Array([1]); } }));
    const running = held.map((h) => runFencedUpload(h));
    await new Promise((r) => setTimeout(r, 0));
    const loser = deps();
    expect((await runFencedUpload(loser)).status).toBe(503);
    expect(loser.calls).toEqual(['cancel', 'busy']);
    unblock(); await Promise.all(running);
    expect(activePipelines()).toBe(0);
  });
  it('a hanging untrusted cancel cannot block the denied response', async () => {
    const d = deps({ claim: async () => ({ status: 404, error: 'Not found' }), cancelBody: () => { void new Promise(() => undefined); } });
    await expect(runFencedUpload(d)).resolves.toEqual({ status: 404, error: 'Not found' });
  });
  it('release outage leaves no in-process leak and still answers', async () => {
    const d = deps({ release: async () => { throw new Error('audit'); } });
    expect((await runFencedUpload(d)).status).toBe(200);
    expect(activePipelines()).toBe(0);
  });
});
