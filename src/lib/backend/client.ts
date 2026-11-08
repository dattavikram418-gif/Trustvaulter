export interface Identity { id: string; display_name: string; role: 'administrator' | 'document_creator' | 'viewer' }
export interface DocumentRecord { id: string; owner_id: string; name: string; category: string; created_at: string; updated_at: string; acl_revision: number; access: 'owner' | 'read' | 'edit'; lifecycle: string }
export interface PermissionChanges { target_user_id: string; old_permission: 'read' | 'edit' | null; new_permission: 'read' | 'edit' | null; prior_acl_revision: number; new_acl_revision: number }
export interface EventRecord { sequence: number; at: string; actor_id: string | null; document_id: string | null; action: string; outcome: string; request_id: string | null; canonical_version?: number; session_id?: string | null; changes?: Partial<PermissionChanges> }
export interface AdminEvent { sequence: string; at: string; actor_id: string | null; document_id: string | null; action: string; outcome: string; request_id: string | null; permission_detail: 'recorded' | 'unavailable' | 'not_applicable'; recipient_id: string | null; old_permission: 'read' | 'edit' | null; new_permission: 'read' | 'edit' | null; prior_acl_revision: string | null; new_acl_revision: string | null }
/** Bigint sequence/revision values are exact decimal strings; never convert to JS numbers. */
export interface AdminEventPage { events: AdminEvent[]; next_before: string | null }
export interface GrantRecord { document_id: string; user_id: string; permission: 'read' | 'edit'; shared_email: string | null }
export interface AccountNotification { id: string; kind: 'own_sign_in' | 'account_sign_in' | 'own_session_denied' | 'account_session_denied'; subject_id: string; first_at: string; last_at: string; occurrences: number; read_at: string | null }
export class BoundaryError extends Error { constructor(public status: number, message: string, public requestId?: string) { super(message); } }
export async function operation<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
 const { supabase } = await import('@/integrations/supabase/client');
 const { data } = await supabase.auth.getSession(); // Attachment only; server + database independently validate.
 const response = await fetch('/api/public/metadata', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) }, body: JSON.stringify({ action, payload }), cache: 'no-store' });
 const result = await response.json() as { data?: T; error?: string; request_id?: string };
 if (!response.ok || result.data === undefined) throw new BoundaryError(response.status, result.error ?? 'Request unavailable', result.request_id);
 return result.data;
}
export function pageHead(title: string, description: string) {
 return { meta: [{ title: `${title} — TrustVault` }, { name: 'description', content: description }, { property: 'og:title', content: `${title} — TrustVault` }, { property: 'og:description', content: description }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }] };
}
