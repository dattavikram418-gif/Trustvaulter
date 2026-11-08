import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const url=process.env.SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;const publishable=process.env.SUPABASE_PUBLISHABLE_KEY;
if(!url||!key||!publishable)throw new Error('Managed runtime bindings unavailable');
const shim=k=>(input,init)=>{const h=new Headers(init?.headers);h.set('apikey',k);if(h.get('Authorization')===`Bearer ${k}`)h.delete('Authorization');return fetch(input,{...init,headers:h});};
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:shim(key)}});
const fixtures={dataApiUrl:url,publishableKey:publishable};
const suffix=randomBytes(6).toString('hex');
for(const name of ['ownerA','ownerB','read','edit','ungranted','administrator','disabled','revoked']) {
 const email=`tv-phase1-${name.toLowerCase()}-${suffix}@example.com`;const password=randomBytes(32).toString('base64url');
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});
 if(error||!data.user)throw new Error(`Test provisioning failed for ${name}`);
 const client=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:shim(publishable)}});
 const login=await client.auth.signInWithPassword({email,password});
 if(login.error||!login.data.session)throw new Error(`Test login failed for ${name}`);
 fixtures[name]={id:data.user.id,token:login.data.session.access_token,email,password};
 console.log(`${name}: ${data.user.id}`);
}
mkdirSync('/tmp/browser/phase1',{recursive:true});writeFileSync('/tmp/browser/phase1/fixtures.json',JSON.stringify(fixtures),{mode:0o600});
console.log('Provisioned disposable accounts; credentials kept in private temporary test fixture, never repository or output.');
