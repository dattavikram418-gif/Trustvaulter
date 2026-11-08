export const UPLOAD_READ_LIMITS = { maximumChunks: 65536, deadlineMs: 30000 } as const;
export const JSON_READ_LIMITS = { maximumChunks: 4096, deadlineMs: 10000 } as const;

// One bounded application buffer, not a retained array per transport chunk.
// These are per-request bounds, not provider admission or concurrent-request limits.
export async function readBoundedBytes(
  body: ReadableStream<Uint8Array> | null,
  maximum: number,
  limits: { maximumChunks: number; deadlineMs: number },
): Promise<Uint8Array> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let bytes: Uint8Array | undefined;
  let length = 0;
  let chunks = 0;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Body deadline exceeded')), limits.deadlineMs);
  });
  const consume = async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (++chunks > limits.maximumChunks) throw new Error('Body fragment limit exceeded');
      if (value.byteLength > maximum - length) throw new Error('Body size exceeded');
      if (value.byteLength === 0) continue;
      bytes ??= new Uint8Array(maximum);
      bytes.set(value, length);
      length += value.byteLength;
    }
    return bytes ? bytes.subarray(0, length) : new Uint8Array(0);
  };
  try {
    // Race once: racing each read against one pending deadline retains a
    // deadline reaction per chunk and defeats the bounded-memory contract.
    return await Promise.race([consume(), deadline]);
  } catch (error) {
    // Cancellation is best effort: an untrusted source's cancel promise can hang.
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
