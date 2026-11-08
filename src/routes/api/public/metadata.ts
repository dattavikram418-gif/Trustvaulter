import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { boundedBody } from '@/lib/backend/bounded-body';

export const Route = createFileRoute('/api/public/metadata')({
 server: { handlers: { POST: async ({ request }) => {
   const reply = (status: number, body: unknown, requestId?: string) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...(requestId ? { 'X-Request-ID': requestId } : {}) } });
   const url = process.env['SUPABASE_URL']; const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
   if (!url || !key) return reply(503, { error: 'Service unavailable' });
   const authorization = request.headers.get('Authorization') ?? '';
   const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
   const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization }, fetch: (input, init) => { const h = new Headers(init?.headers); h.set('apikey', key); if (h.get('Authorization') === `Bearer ${key}`) h.delete('Authorization'); return fetch(input, { ...init, headers: h }); } } });
   const { data: user, error: authError } = token ? await client.auth.getUser(token) : { data: { user: null }, error: true };
   if (authError || !user.user) {
     try {
       const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
       const { data: requestId, error } = await supabaseAdmin.rpc('tv_session_failure_correlated');
       if (error || typeof requestId !== 'string') return reply(503, { error: 'Service unavailable' });
       return reply(401, { error: 'Authentication required', request_id: requestId }, requestId);
     } catch { return reply(503, { error: 'Service unavailable' }); }
   }
   // Pass raw invalid parameters to the DB allowlist so authenticated denials commit an audit.
   let body: unknown;
   try { const text = await boundedBody(request); if (text === null) { const { data, error } = await client.rpc('tv_operation', { action: 'request_too_large' }); const result = data as { request_id?: string } | null; if (error || !result?.request_id) return reply(503, { error: 'Service unavailable' }); return reply(413, { error: 'Request too large', request_id: result.request_id }, result.request_id); } body = JSON.parse(text); }
   catch { body = {}; }
   const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
   const envelopeValid = Object.keys(input).every(k => k === 'action' || k === 'payload');
   const { data, error } = await client.rpc('tv_operation', { action: envelopeValid && typeof input['action'] === 'string' ? input['action'] : 'invalid', payload: (Object.hasOwn(input,'payload') ? input['payload'] : {}) as Json });
   if (error || !data || typeof data !== 'object' || Array.isArray(data)) return reply(503, { error: 'Service unavailable' });
   const result = data as { status?: number; data?: unknown; error?: string; request_id?: string };
   return reply(result.status ?? 503, result, result.request_id);
 } } },
});
