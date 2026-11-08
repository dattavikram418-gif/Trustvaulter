import { readBoundedBytes, UPLOAD_READ_LIMITS } from './bounded-stream';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export async function fileBody(request: Request): Promise<Uint8Array> {
 if (!request.body) throw new Error('Empty file');
 return readBoundedBytes(request.body, MAX_FILE_BYTES, UPLOAD_READ_LIMITS);
}
export function validateFile(bytes:Uint8Array,name:string,declared:string){
 if(bytes.length<1||bytes.length>MAX_FILE_BYTES)throw new Error('Invalid file size');
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(name))throw new Error('Use a safe filename');
 const ext=name.split('.').at(-1)?.toLowerCase();const head=Array.from(bytes.slice(0,8));
 const ascii=new TextDecoder('latin1').decode(bytes);
 // Conservative rejection, not a general polyglot proof or malware scanner.
 if(/<\s*(?:!doctype\s+html|html|script|svg|iframe)\b/i.test(ascii)||ascii.includes('PK\u0003\u0004')||ascii.includes('\u007fELF')||ascii.startsWith('MZ'))throw new Error('Unsafe embedded format');
 let mime='';
 if(ext==='pdf'&&ascii.startsWith('%PDF-1.')&&/%%EOF\s*$/.test(ascii)&&!/(\/JavaScript|\/JS\b|\/Launch|\/EmbeddedFile|\/OpenAction)/i.test(ascii))mime='application/pdf';
 if(ext==='png'&&head.join(',')==='137,80,78,71,13,10,26,10'&&bytes.length>=33&&ascii.slice(12,16)==='IHDR'&&ascii.slice(-8,-4)==='IEND')mime='image/png';
 if((ext==='jpg'||ext==='jpeg')&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217)mime='image/jpeg';
 if(ext==='txt'){try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))mime='text/plain';}catch{/* invalid UTF-8 */}}
 if(!mime||mime!==declared)throw new Error('File signature, extension and type must agree');
 return {mime,filename:name,size:bytes.length};
}
