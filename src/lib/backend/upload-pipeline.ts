// Fenced upload pipeline. Ordering contract:
//   process slot -> authoritative DB receiving claim -> body read -> fenced stage -> store -> readback
//   -> scan -> fenced finish -> fenced release (finally).
// No body byte is read before both the process slot and the DB claim are held. The claim fence is a
// server-only secret and is never returned to the client.
export type Envelope = { status: number; error?: string; data?: unknown; request_id?: string };
export type ReleaseOutcome = 'finished' | 'denied' | 'malformed' | 'stored_failure' | 'scan_failure' | 'aborted';
export type FileInfo = { size: number; mime: string; filename: string };
export interface PipelineDeps {
  claim(): Promise<Envelope>;
  busy(): Promise<Envelope>;
  readBody(): Promise<Uint8Array>;
  cancelBody(): void;
  validate(bytes: Uint8Array): FileInfo;
  digest(bytes: Uint8Array): string;
  stage(claimId: string, fence: string, digest: string, info: FileInfo): Promise<Envelope>;
  fail(claimId: string, fence: string): Promise<Envelope>;
  store(objectKey: string, bytes: Uint8Array, mime: string): Promise<boolean>;
  readback(objectKey: string): Promise<Uint8Array | null>;
  scan(bytes: Uint8Array, digest: string): Promise<{ verdict: string; signed?: unknown }>;
  finish(claimId: string, fence: string, verdict: string, signed?: unknown): Promise<Envelope>;
  release(claimId: string, fence: string, outcome: ReleaseOutcome): Promise<Envelope>;
}

// Per-isolate guard: bounds buffered bodies in THIS process. The DB claim cap bounds the shared
// pipeline across processes; neither is a hard cross-process memory cap on its own.
export const PROCESS_PIPELINE_CAP = 2;
let active = 0;
export const activePipelines = () => active;

const strip = (e: Envelope): Envelope => ({ status: e.status, ...(e.error ? { error: e.error } : {}), ...(e.request_id ? { request_id: e.request_id } : {}) });

export async function runFencedUpload(deps: PipelineDeps): Promise<Envelope> {
  if (active >= PROCESS_PIPELINE_CAP) {
    deps.cancelBody();
    return strip(await deps.busy());
  }
  active++;
  try {
    const claimed = await deps.claim();
    const data = claimed.data as { claim_id?: unknown; fence?: unknown } | undefined;
    if (claimed.status !== 200 || typeof data?.claim_id !== 'string' || typeof data?.fence !== 'string') {
      deps.cancelBody();
      return strip(claimed);
    }
    const claimId = data.claim_id, fence = data.fence;
    let outcome: ReleaseOutcome = 'aborted';
    try {
      let bytes: Uint8Array, info: FileInfo;
      try { bytes = await deps.readBody(); info = deps.validate(bytes); }
      catch { deps.cancelBody(); outcome = 'malformed'; return strip(await deps.fail(claimId, fence)); }
      const digest = deps.digest(bytes);
      const staged = await deps.stage(claimId, fence, digest, info);
      if (staged.status !== 200) { outcome = 'denied'; return strip(staged); }
      const objectKey = (staged.data as { object_key: string }).object_key;
      if (!(await deps.store(objectKey, bytes, info.mime))) { outcome = 'stored_failure'; return strip(await deps.fail(claimId, fence)); }
      const stored = await deps.readback(objectKey);
      if (!stored || stored.length !== bytes.length || deps.digest(stored) !== digest) { outcome = 'stored_failure'; return strip(await deps.fail(claimId, fence)); }
      let check: { verdict: string; signed?: unknown };
      try { check = await deps.scan(stored, digest); } catch { outcome = 'scan_failure'; return strip(await deps.fail(claimId, fence)); }
      const finished = await deps.finish(claimId, fence, check.verdict, check.signed);
      outcome = finished.status === 200 ? 'finished' : 'denied';
      if (finished.status !== 200) return strip(finished);
      // Never return object keys, fences, storage URLs or bytes.
      return { ...strip(finished), data: { version_id: (finished.data as { version_id: string }).version_id, quarantine_state: 'quarantined', scan_evidence: check.verdict } };
    } finally {
      // Release failure (e.g. audit outage) leaves the claim occupied: fail closed, operator recovery.
      try { await deps.release(claimId, fence, outcome); } catch { /* slot stays occupied */ }
    }
  } finally {
    active--;
  }
}
