import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && key && url.startsWith('https://'));

export const supabase: SupabaseClient = createClient(
  url || 'https://not-configured.supabase.co',
  key || 'not-configured',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
);

/**
 * v17: "Password bhool gaye" mein code lagate hi Supabase login kar deta hai. Naya password lagne tak
 * app ko dashboard par jane se roka jata hai (hold), phir chhor diya jata hai (release).
 */
export const authHold = { on: false };
export const AUTH_REFRESH_EVENT = 'khr-auth-refresh';
export function releaseAuthHold() {
  authHold.on = false;
  window.dispatchEvent(new Event(AUTH_REFRESH_EVENT));
}
