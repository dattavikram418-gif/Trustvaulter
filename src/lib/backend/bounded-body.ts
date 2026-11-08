import { readBoundedBytes, JSON_READ_LIMITS } from './bounded-stream';
export async function boundedBody(request: Request, maximum = 16384): Promise<string | null> {
 try {
  const all = await readBoundedBytes(request.body, maximum, JSON_READ_LIMITS);
  return new TextDecoder('utf-8', { fatal: true }).decode(all);
 } catch { return null; }
}
