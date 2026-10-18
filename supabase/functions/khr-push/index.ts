// KHR Production — "khr-push" Edge Function
// Database (push_outbox) se notifications utha kar Firebase (FCM) ke zariye phones par bhejta hai,
// is liye app band ho tab bhi message / deadline / assign waghera ka alert aata hai.
//
// Secrets (Supabase Dashboard > Edge Functions > Secrets):
//   FCM_SERVICE_ACCOUNT  = Firebase service account ki poori JSON file ka text
//   KHR_PUSH_SECRET      = wahi lamba secret jo SQL mein khr_private.push_config mein likha
// "Verify JWT" OFF rakhein (ye function apna secret khud check karta hai).
import { createClient } from 'npm:@supabase/supabase-js@2';

const SA = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT') ?? '{}');
const SECRET = Deno.env.get('KHR_PUSH_SECRET') ?? '';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

let cached: { token: string; exp: number } | null = null;
async function googleToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp > now + 120) return cached.token;
  const aud = SA.token_uri || 'https://oauth2.googleapis.com/token';
  const unsigned = enc({ alg: 'RS256', typ: 'JWT' }) + '.' +
    enc({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud, iat: now, exp: now + 3600 });
  const pem = String(SA.private_key).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const r = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + b64url(sig) })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Google token nahi mila: ' + JSON.stringify(j));
  cached = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return cached.token;
}

type Row = { id: number; user_id: string; title: string; body: string; data: Record<string, unknown>; tokens: string[] };

async function sendOne(access: string, token: string, row: Row): Promise<'ok' | 'drop' | 'fail'> {
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(row.data ?? {})) data[k] = String(v);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${SA.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: row.title, body: row.body },
        data,
        android: {
          priority: 'HIGH',
          notification: { channel_id: 'khr_alerts', icon: 'ic_stat_khr', color: '#E5383B', sound: 'default', default_vibrate_timings: true }
        }
      }
    })
  });
  if (res.ok) return 'ok';
  const t = await res.text();
  // phone se app hat gayi / token purana -> token mita do
  if (res.status === 404 || t.includes('UNREGISTERED') || (res.status === 400 && t.includes('registration token'))) return 'drop';
  console.error('FCM error', res.status, t);
  return 'fail';
}

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-khr-secret') !== SECRET) return new Response('forbidden', { status: 403 });
  if (!SA.client_email) return new Response('FCM_SERVICE_ACCOUNT secret missing', { status: 500 });
  let sent = 0;
  for (let round = 0; round < 5; round++) {
    const { data: rows, error } = await db.rpc('khr_claim_push', { p_limit: 200 });
    if (error) return new Response(error.message, { status: 500 });
    if (!rows?.length) break;
    const access = await googleToken();
    const jobs: Promise<void>[] = [];
    for (const row of rows as Row[]) {
      for (const tk of row.tokens ?? []) {
        jobs.push(sendOne(access, tk, row).then(async (r) => {
          if (r === 'ok') sent++;
          if (r === 'drop') await db.rpc('khr_drop_token', { p_token: tk });
        }));
      }
    }
    await Promise.all(jobs);
    if (rows.length < 200) break;
  }
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
});
