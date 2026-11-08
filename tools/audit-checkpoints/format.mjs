import { createHash } from 'node:crypto';

export const ZERO = '0'.repeat(64);
export const DOMAIN = 'TrustVault audit checkpoint v1\n';
export const FIELDS = ['version','chain_id','system_id','head_sequence','head_hash','counter','previous_checkpoint_hash','observed_at','key_id'];
export function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) throw new Error('Unexpected fields');
}
export function decimal(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(value) || BigInt(value) > 9223372036854775807n) throw new Error('Invalid exact decimal');
  return BigInt(value);
}
export function hash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid hash');
}
export function uuid(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)) throw new Error('Invalid identity');
}
export function canonicalPayload(value) {
  exactKeys(value, FIELDS);
  if (value.version !== 1) throw new Error('Unsupported checkpoint version');
  uuid(value.chain_id); uuid(value.system_id);
  decimal(value.head_sequence); if (decimal(value.counter) === 0n) throw new Error('Invalid counter');
  hash(value.head_hash); hash(value.previous_checkpoint_hash);
  if (typeof value.observed_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.observed_at) || new Date(value.observed_at).toISOString() !== value.observed_at) throw new Error('Invalid observation time');
  if (typeof value.key_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.key_id)) throw new Error('Invalid key ID');
  return JSON.stringify(Object.fromEntries(FIELDS.map(key => [key,value[key]])));
}
export function parseEnvelope(envelope) {
  exactKeys(envelope,['payload','signature']);
  if (typeof envelope.payload !== 'string' || Buffer.byteLength(envelope.payload) > 2048 || typeof envelope.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)) throw new Error('Invalid bounded envelope');
  if (Buffer.from(envelope.signature,'base64').toString('base64') !== envelope.signature) throw new Error('Noncanonical signature');
  const payload = JSON.parse(envelope.payload);
  if (canonicalPayload(payload) !== envelope.payload) throw new Error('Noncanonical checkpoint');
  return payload;
}
export function checkpointHash(envelope) {
  parseEnvelope(envelope);
  return createHash('sha256').update(DOMAIN).update(JSON.stringify({payload:envelope.payload,signature:envelope.signature})).digest('hex');
}
