// MUTABLE UNTRUSTED FILE TEST SINK. Not WORM, immutable retention, or external evidence.
import { constants } from 'node:fs';
import { open, lstat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { checkpointHash, parseEnvelope } from './format.mjs';

const capabilities = new WeakSet();
// Hold this guard across snapshot acquisition, signing and write; no automatic stale takeover.
export async function withTestSinkLock(directory, work) {
  if (process.platform !== 'linux') throw new Error('File test sink requires Linux held-directory descriptors');
  const dir = await open(directory,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  let lock;
  const root={path:`/proc/self/fd/${dir.fd}`,directory:dir};
  try {
    const info=await dir.stat();
    if (!info.isDirectory() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid()) throw new Error('Private owned test directory required');
    lock=await open(join(root.path,'.checkpoint.lock'),constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
    capabilities.add(root);await lock.sync();return await work(root);
  } finally {
    capabilities.delete(root);
    if(lock){
      try {const original=await lock.stat(), current=await lstat(join(root.path,'.checkpoint.lock'));if(original.ino!==current.ino || original.dev!==current.dev)throw new Error('Test lock replaced; manual recovery required');await unlink(join(root.path,'.checkpoint.lock'));await dir.sync();}
      finally {await lock.close();await dir.close();}
    }else{await dir.close();}
  }
}
export async function retainTestCheckpoint(root, envelope) {
  if (!capabilities.has(root)) throw new Error('Active held-directory guard required');
  const payload = parseEnvelope(envelope);
  const name = `${payload.counter}-${checkpointHash(envelope)}.json`;
  const file = await open(join(root.path,name),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try { await file.writeFile(JSON.stringify(envelope)+'\n'); await file.sync(); } finally { await file.close(); }
  await root.directory.sync();
  return name; // caller retains trusted state separately; no latest-pointer TOFU
}
