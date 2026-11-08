import { createClient } from '@supabase/supabase-js';
import type { Database,Json } from '@/integrations/supabase/types';
import { fileBody,validateFile } from './file-validation';
import { scanFileCheck } from './scanner.server';
import { createHash } from 'node:crypto';
import { boundedBody } from './bounded-body';
import { runFencedUpload } from './upload-pipeline';

type Envelope={status:number;error?:string;data?:unknown;request_id?:string};
export async function quarantineHandler(request:Request):Promise<Response>{
 const reply=(result:Envelope)=>Response.json(result,{status:result.status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(result.request_id?{'X-Request-ID':result.request_id}:{})}});
 try{
  const url=process.env['SUPABASE_URL'];const key=process.env['SUPABASE_PUBLISHABLE_KEY'];if(!url||!key)return reply({status:503,error:'Service unavailable'});
  const authorization=request.headers.get('Authorization')??'';const token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
  const client=createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization},fetch:(input,init)=>{const h=new Headers(init?.headers);h.set('apikey',key);if(h.get('Authorization')===`Bearer ${key}`)h.delete('Authorization');return fetch(input,{...init,headers:h});}}});
  const {data,error}=token?await client.auth.getClaims(token):{data:null,error:true};
  // getUser verifies Auth identity; DB separately checks live session/account on every step.
  const verified=token?await client.auth.getUser(token):null;
  const actor=verified?.data.user?.id;const sid=data?.claims?.['session_id'];
  if(error||!actor||typeof sid!=='string'){
   const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const failure=await supabaseAdmin.rpc('tv_session_failure_correlated');if(failure.error)throw new Error('audit');return reply({status:401,error:'Authentication required',request_id:failure.data});
  }
  const query=new URL(request.url).searchParams;
  if(request.method==='POST'){
    let parsed:unknown;let oversized=false;
    try{const text=await boundedBody(request,2048);oversized=text===null;if(text!==null)parsed=JSON.parse(text);}catch{/* committed invalid denial below */}
    const input=parsed!==null&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as Record<string,unknown>:{};
    const valid=parsed!==null&&typeof parsed==='object'&&!Array.isArray(parsed)&&Object.keys(input).every(k=>k==='action'||k==='payload');
    const rpc=await client.rpc('tv_upload_request',{action:oversized?'request_too_large':valid&&typeof input['action']==='string'?input['action']:'invalid',payload:(Object.hasOwn(input,'payload')?input['payload']:{}) as Json});
    if(rpc.error)throw new Error('boundary');const result=rpc.data as Envelope;
    // Live authentication still takes precedence over transport size; only committed parameter denial maps to 413.
    return reply(oversized&&result.status===400?{...result,status:413,error:'Request too large'}:result);
  }
  if(request.method==='GET'){
   const rpc=await client.rpc('tv_upload_request',{action:'read_attempt',payload:{id:query.get('id')??''}});if(rpc.error)throw new Error('boundary');return reply(rpc.data as Envelope);
  }
  const ticket=query.get('reservation');
  if(!ticket||!/^[a-f0-9-]{36}$/.test(ticket)||query.size!==1){const denied=await client.rpc('tv_upload_request',{action:'invalid'});if(denied.error)throw new Error('audit');return reply(denied.data as Envelope);}
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  // Fenced pipeline: no request byte is read before the process slot AND exclusive DB claim are held.
  const call=async(fn:string,args:Record<string,unknown>)=>{const rpc=await (supabaseAdmin.rpc as unknown as (f:string,a:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>)(fn,args);if(rpc.error)throw new Error('audit');return rpc.data as Envelope;};
  const bucket=supabaseAdmin.storage.from('trustvault-quarantine');
  const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
  return reply(await runFencedUpload({
   busy:()=>call('tv_upload_admission_busy',{caller:actor,caller_session:sid}),
   claim:()=>call('tv_upload_claim',{ticket_id:ticket,caller:actor,caller_session:sid}),
   readBody:()=>fileBody(request),
   // Best effort, never awaited: an untrusted cancel promise cannot block release.
   cancelBody:()=>{try{void request.body?.cancel().catch(()=>undefined);}catch{/* locked or consumed */}},
   validate:(b)=>validateFile(b,request.headers.get('X-Filename')??'',request.headers.get('Content-Type')??''),
   digest:sha,
   stage:(c,f,d,i)=>call('tv_upload_stage_fenced',{cid:c,fence:f,caller:actor,caller_session:sid,hash:d,size:i.size,media:i.mime,safe_name:i.filename}),
   fail:(c,f)=>call('tv_upload_fail_fenced',{cid:c,fence:f,caller:actor,caller_session:sid}),
   store:async(k,b,m)=>!(await bucket.upload(k,b,{contentType:m,upsert:false})).error,
   readback:async(k)=>{const r=await bucket.download(k);return r.error||!r.data?null:new Uint8Array(await r.data.arrayBuffer());},
   scan:(b,d)=>scanFileCheck(b,d),
   finish:(c,f,v,signed)=>call('tv_upload_finish_fenced',{cid:c,fence:f,caller:actor,caller_session:sid,scan_verdict:v,...(signed?{scan_result:signed}:{})}),
   release:(c,f,o)=>call('tv_upload_release_fenced',{cid:c,fence:f,outcome:o}),
  }));
 }catch{return reply({status:503,error:'Upload service unavailable'});}
}
