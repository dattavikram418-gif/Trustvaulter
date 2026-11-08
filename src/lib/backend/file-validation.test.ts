import {describe,it,expect} from 'vitest';
import {fileBody,validateFile,MAX_FILE_BYTES} from './file-validation';
const encode=(s:string)=>new TextEncoder().encode(s);
describe('server quarantine file rules',()=>{
 it('accepts exactly 10 MB and rejects one byte above',async()=>{expect((await fileBody(new Request('http://localhost',{method:'PUT',body:new Uint8Array(10485760)}))).length).toBe(10485760);await expect(fileBody(new Request('http://localhost',{method:'PUT',body:new Uint8Array(10485761)}))).rejects.toThrow();expect(MAX_FILE_BYTES).toBe(10485760);});
 it('accepts UTF-8 TXT and rejects wrong declared type',()=>{expect(validateFile(encode('synthetic text'),'test.txt','text/plain').mime).toBe('text/plain');expect(()=>validateFile(encode('text'),'test.txt','application/pdf')).toThrow();});
 it('checks PDF signature and final marker',()=>{expect(validateFile(encode('%PDF-1.7\nsynthetic\n%%EOF'),'test.pdf','application/pdf').mime).toBe('application/pdf');expect(()=>validateFile(encode('%PDF-1.7\n'),'test.pdf','application/pdf')).toThrow();});
 it('checks PNG and JPEG markers',()=>{const png=new Uint8Array(45);png.set([137,80,78,71,13,10,26,10]);png.set(encode('IHDR'),12);png.set(encode('IEND'),37);expect(validateFile(png,'test.png','image/png').mime).toBe('image/png');expect(validateFile(new Uint8Array([255,216,255,224,0,255,217]),'test.jpg','image/jpeg').mime).toBe('image/jpeg');});
 it('rejects HTML SVG executables archives and detectable polyglots',()=>{for(const s of ['<html>bad','<svg>bad','MZbinary','PK\u0003\u0004zip','%PDF-1.7\n<script>bad\n%%EOF'])expect(()=>validateFile(encode(s),'test.txt','text/plain')).toThrow();});
 it('rejects traversal and unsafe disposition names',()=>{for(const name of ['../test.txt','test\r\n.txt','test".txt'])expect(()=>validateFile(encode('text'),name,'text/plain')).toThrow();});
});
