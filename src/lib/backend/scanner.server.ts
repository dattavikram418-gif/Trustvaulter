import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'node:crypto';
export type ScanEvidence='missing'|'error'|'malicious'|'clean';
export type ScanCheck={verdict:ScanEvidence;signed?:{body:string;signature:string}};
const verdictSchema=z.object({digest:z.string().regex(/^[a-f0-9]{64}$/),size:z.number().int().positive(),nonce:z.string().uuid(),verdict:z.enum(['clean','malicious']),engine:z.string().min(1).max(100),signature_version:z.string().min(1).max(100)}).strict();
export async function scanFile(bytes:Uint8Array,digest:string):Promise<ScanEvidence>{
 return (await scanFileCheck(bytes,digest)).verdict;
}
export async function scanFileCheck(bytes:Uint8Array,digest:string):Promise<ScanCheck>{
 const endpoint=process.env['TV_SCANNER_URL'];const secret=process.env['TV_SCANNER_SECRET'];
 // An explicit approval marker prevents accidental submission to an arbitrary service.
  if(!endpoint||!secret||process.env['TV_SCANNER_APPROVED']!=='yes')return {verdict:'missing'};
 try{
   const url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password)return {verdict:'error'};
  const nonce=crypto.randomUUID();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(url,{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/octet-stream','Authorization':`Bearer ${secret}`,'X-Content-SHA256':digest,'X-Content-Size':String(bytes.length),'X-Scan-Nonce':nonce},body:new Blob([bytes.slice().buffer])});
    if(!response.ok)return {verdict:'error'};
    const reader=response.body?.getReader();if(!reader)return {verdict:'error'};let text='';let count=0;const decoder=new TextDecoder('utf-8',{fatal:true});
    while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>4096){await reader.cancel();return {verdict:'error'};}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
    const signature=response.headers.get('X-Scan-Signature')??'';if(!/^[a-f0-9]{64}$/.test(signature))return {verdict:'error'};
    const expected=createHmac('sha256',secret).update(text).digest();if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))return {verdict:'error'};
    const result=verdictSchema.parse(JSON.parse(text));if(result.digest!==digest||result.size!==bytes.length||result.nonce!==nonce)return {verdict:'error'};
    return {verdict:result.verdict,signed:{body:text,signature}};
  }finally{clearTimeout(timer);}
  }catch{return {verdict:'error'};}
}
