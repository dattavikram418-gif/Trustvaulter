import { describe,expect,it } from 'vitest';
import { boundedBody } from './bounded-body';
describe('metadata transport request limit',()=>{
 it('accepts exactly 16384 bytes',async()=>expect(await boundedBody(new Request('http://localhost',{method:'POST',body:'a'.repeat(16384)}))).toHaveLength(16384));
 it('rejects 16385 bytes',async()=>expect(await boundedBody(new Request('http://localhost',{method:'POST',body:'a'.repeat(16385)}))).toBeNull());
 it('counts UTF-8 bytes rather than characters',async()=>expect(await boundedBody(new Request('http://localhost',{method:'POST',body:'é'.repeat(8193)}))).toBeNull());
 it('rejects malformed UTF-8 rather than replacing bytes',async()=>expect(await boundedBody(new Request('http://localhost',{method:'POST',body:new Uint8Array([255])}))).toBeNull());
});
