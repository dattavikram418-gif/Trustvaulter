import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { operation, type Identity } from './client';
import { BACKEND_CONFIGURED } from './config';
const Account = createContext<{ identity: Identity | null; loading: boolean; error: string; refresh: () => Promise<void>; logout: () => Promise<void> } | null>(null);
export function AccountProvider({ children }: { children: ReactNode }) {
 const [identity, setIdentity] = useState<Identity | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
 const query = useQueryClient(); const router = useRouter();
 const refresh = async () => {
   setLoading(true);
   try { const { data, error: e } = await supabase.auth.getUser(); if (e || !data.user) { setIdentity(null); setError(''); } else { setIdentity(await operation<Identity>('identity')); setError(''); } }
   catch (e) { setIdentity(null); setError(e instanceof Error ? e.message : 'Account unavailable'); }
   finally { setLoading(false); }
 };
 useEffect(() => {
   if (!BACKEND_CONFIGURED) { setLoading(false); setError('Backend configuration missing'); return; }
   void refresh();
   const { data } = supabase.auth.onAuthStateChange(event => {
     if (!['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event)) return;
     if (event === 'SIGNED_OUT') { setIdentity(null); query.clear(); }
     else { setTimeout(() => { void refresh(); }, 0); }
     void router.invalidate();
   });
   const focus = () => { void refresh(); };
   window.addEventListener('focus', focus);
   return () => { data.subscription.unsubscribe(); window.removeEventListener('focus', focus); };
 }, []);
 const logout = async () => { await query.cancelQueries(); query.clear(); const { error } = await supabase.auth.signOut({ scope: 'global' }); if (error) { setError('Sign-out failed; retry.'); return; } setIdentity(null); await router.navigate({ to: '/auth', replace: true }); };
 return <Account.Provider value={{ identity, loading, error, refresh, logout }}>{children}</Account.Provider>;
}
export function useAccount() { const account = useContext(Account); if (!account) throw new Error('Missing account provider'); return account; }
