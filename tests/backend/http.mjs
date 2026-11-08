import assert from 'node:assert/strict';
// Tokens must be provided only for disposable provisioned accounts. Never print them.
const base=process.env.TV_TEST_HTTP_URL;
const fixtures=process.env.TV_TEST_HTTP_FIXTURES;
if(!base||!fixtures){console.log('UNRUN: TV_TEST_HTTP_URL and TV_TEST_HTTP_FIXTURES required (provisioned disposable accounts and document IDs)');process.exit(2);}
const f=JSON.parse(fixtures);
async function request(token,action,payload={}){const r=await fetch(`${base}/api/public/metadata`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,'X-Request-ID':'untrusted-caller-id'},body:JSON.stringify({action,payload})});const body=await r.json();assert.match(body.request_id,/^[0-9a-f-]{36}$/);assert.equal(r.headers.get('X-Request-ID'),body.request_id);return {status:r.status,body};}
for(const who of ['ownerB','ungranted','administrator'])for(const action of ['detail','edit','delete','grants']){const r=await request(f[who].token,action,{id:f.documentId,...(['edit','delete'].includes(action)?{revision:f.revision}:{}),...(action==='edit'?{name:'denied'}:{})});assert.equal(r.status,404);}
assert.equal((await request(f.read.token,'edit',{id:f.documentId,revision:f.revision,name:'denied'})).status,404);
assert.equal((await request(f.edit.token,'delete',{id:f.documentId,revision:f.revision})).status,404);
assert.equal((await request(f.disabled.token,'list')).status,401);
assert.equal((await request(f.revoked.token,'list')).status,401);
assert.equal((await request('invalid-bearer','list')).status,401);
const denial=await request(f.ungranted.token,'detail',{id:f.documentId});
const history=await request(f.ownerA.token,'activity',{id:f.documentId,limit:100});
assert.ok(history.body.data.some(e=>e.request_id===denial.body.request_id&&e.outcome==='denied'));
for(const who of ['ownerA','ownerB','read','edit','ungranted','administrator']) {
 const r=await fetch(`${f.dataApiUrl}/rest/v1/documents?select=*`,{headers:{apikey:f.publishableKey,Authorization:`Bearer ${f[who].token}`}});assert.ok([401,403].includes(r.status));
 const rpc=await fetch(`${f.dataApiUrl}/rest/v1/rpc/tv_operation`,{method:'POST',headers:{apikey:f.publishableKey,Authorization:`Bearer ${f[who].token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'detail',payload:{id:f.documentId}})});const result=await rpc.json();assert.equal(result.status,['ownerA','read','edit'].includes(who)?200:404);
}
console.log('PASS provisioned HTTP IDOR/session and direct Data API checks');
