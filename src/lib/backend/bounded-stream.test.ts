import { describe, expect, it, vi } from 'vitest';
import { JSON_READ_LIMITS, readBoundedBytes, UPLOAD_READ_LIMITS } from './bounded-stream';

describe('bounded request admission (synthetic streams)', () => {
  it('pins upload and JSON work/deadline limits', () => {
    expect(UPLOAD_READ_LIMITS).toEqual({ maximumChunks: 65536, deadlineMs: 30000 });
    expect(JSON_READ_LIMITS).toEqual({ maximumChunks: 4096, deadlineMs: 10000 });
  });
  it('copies consumed chunks and bounds empty fragment work', async () => {
    const buffer = new Uint8Array([1]); let count = 0;
    const body = new ReadableStream<Uint8Array>({ pull(c) { if (count === 4) { c.close(); return; } buffer[0] = ++count; c.enqueue(buffer); } }, { highWaterMark: 0 });
    expect([...await readBoundedBytes(body, 4, { maximumChunks: 4, deadlineMs: 1000 })]).toEqual([1,2,3,4]);
    const fragments = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(0)); } });
    await expect(readBoundedBytes(fragments, 4, { maximumChunks: 8, deadlineMs: 1000 })).rejects.toThrow('fragment');
  });
  it('accepts exact size, rejects fragmented overflow without waiting for cancel', async () => {
    const exact = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([1,2])); c.enqueue(new Uint8Array([3,4])); c.close(); } });
    expect([...await readBoundedBytes(exact, 4, { maximumChunks: 8, deadlineMs: 1000 })]).toEqual([1,2,3,4]);
    let cancelled = false;
    const overflow = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(5)); }, cancel() { cancelled = true; return new Promise(() => {}); } });
    await expect(readBoundedBytes(overflow, 4, { maximumChunks: 8, deadlineMs: 1000 })).rejects.toThrow('size');
    expect(cancelled).toBe(true);
  });
  it('aborts stalled reads at total deadline and clears its timer', async () => {
    vi.useFakeTimers();
    try {
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
      const result = expect(readBoundedBytes(stream, 4, { maximumChunks: 8, deadlineMs: 10000 })).rejects.toThrow('deadline');
      await vi.advanceTimersByTimeAsync(10000); await result;
      expect(cancelled).toBe(true); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
