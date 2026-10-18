/**
 * App band ho tab bhi notifications (Android, Firebase Cloud Messaging).
 * - Phone ka token Supabase mein register hota hai (register_push_token)
 * - Server (khr-push function) har event par phone ko notification bhejta hai
 * - Notification par tap -> app sahi jagah khulti hai (DM, server channel, card)
 * Build mein google-services.json na ho to ye hissa band rehta hai (app crash na ho).
 */
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase';

export const pushBuilt = Capacitor.isNativePlatform() && import.meta.env.VITE_PUSH === '1';

let token = '';
let serverReady = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** true = server khud notifications bhej raha hai (app local deadline alerts schedule na kare) */
export const pushActive = () => !!token && serverReady;
export function onPushChange(fn: () => void) {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export type PushOpen = { type?: string; peer?: string; channel?: string };
const OPEN_EVT = 'khr-push-open';
let pendingOpen: PushOpen | null = null;
/** notification par tap ka data (App/Server isay sun kar screen kholte hain) */
export function takePendingOpen(): PushOpen | null {
  const p = pendingOpen;
  pendingOpen = null;
  return p;
}
export function onPushOpen(fn: (p: PushOpen) => void) {
  const h = (e: Event) => fn((e as CustomEvent<PushOpen>).detail);
  window.addEventListener(OPEN_EVT, h);
  return () => window.removeEventListener(OPEN_EVT, h);
}

let started = false;
let listening = false;
export async function initPush() {
  if (!pushBuilt || started) return;
  started = true;
  try {
    if (!listening) {
    listening = true;
    // listeners pehle, taake band app ko tap se kholne ka event bhi mile
    await PushNotifications.addListener('registration', async (t) => {
      token = t.value;
      try {
        const { data } = await supabase.rpc('register_push_token', { p_token: t.value, p_platform: 'android' });
        serverReady = data === true;
      } catch {
        serverReady = false;
      }
      emit();
    });
    await PushNotifications.addListener('registrationError', () => { token = ''; emit(); });
    await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      pendingOpen = (a.notification?.data || {}) as PushOpen;
      window.dispatchEvent(new CustomEvent(OPEN_EVT, { detail: pendingOpen }));
    });
    }

    let p = await PushNotifications.checkPermissions();
    if (p.receive === 'prompt' || p.receive === 'prompt-with-rationale') p = await PushNotifications.requestPermissions();
    if (p.receive !== 'granted') return;
    await PushNotifications.createChannel({
      id: 'khr_alerts',
      name: 'KHR alerts',
      description: 'Messages, tasks, naya kaam aur deadlines',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#E5383B'
    }).catch(() => {});
    await PushNotifications.register();
  } catch {
    /* push na chale to app phir bhi chalti rahe */
  }
}

/** logout par is phone ko notifications band */
export async function stopPush() {
  if (!token) return;
  try {
    await supabase.rpc('unregister_push_token', { p_token: token });
  } catch {
    /* koi baat nahi */
  }
  serverReady = false;
  started = false; // agla login phir se register kare
  emit();
}

/** permission dobara maangna (bell sheet ke button se) */
export async function retryPush() {
  started = false;
  await initPush();
}
