/**
 * v16: Music / voiceover audio PIXELDRAIN par upload hota hai (Catbox band / blocked tha — ab use nahi hota).
 * Supabase par sirf link aur naam (public.user_music = music_tracks).
 * - Web + Android: XMLHttpRequest PUT https://pixeldrain.com/api/file/{naam} — live progress 0..100%
 *   (Android par browser rok de to phone ka apna HTTP, POST /api/file)
 * - Windows app: app khud (Node) upload karti hai — progress ke saath, CORS ki rukawat nahi
 * Saath mein "offline" gaane: file phone / PC mein (IndexedDB) save, internet ke baghair bhi chale.
 * Purane Catbox gaane / voiceover jo pehle se lage hain wo waise hi chalte rahenge.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';

type DesktopBridge = {
  pdUpload?: (o: { id: string; bytes: ArrayBuffer; name: string; type: string; key: string }) => Promise<{ status: number; text: string }>;
  pdCancel?: (id: string) => void;
  onPdProgress?: (cb: (p: { id: string; pct: number }) => void) => () => void;
  fetchBytes?: (url: string) => Promise<{ type: string; bytes: Uint8Array }>;
};
const desk = () => (window as unknown as { khrDesktop?: DesktopBridge }).khrDesktop;

// Key sirf GitHub secret VITE_PIXELDRAIN_API_KEY se aati hai (code mein nahi)
const API_KEY = ((import.meta.env.VITE_PIXELDRAIN_API_KEY as string | undefined) || '').trim();
const API = 'https://pixeldrain.com/api/file';
const AUTH = 'Basic ' + btoa(':' + API_KEY);
export const MAX_AUDIO_BYTES = 200 * 1024 * 1024; // 200 MB
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|wma|mp4|webm)$/i;

export function checkAudioFile(f: File): string | null {
  if (!(f.type.startsWith('audio/') || f.type === 'video/mp4' || AUDIO_EXT.test(f.name))) return 'Sirf audio file (MP3, M4A, WAV, OGG, MP4) upload ho sakti hai.';
  if (f.size > MAX_AUDIO_BYTES) return 'File 200 MB se bari hai. Choti file chunein.';
  if (!f.size) return 'Ye file khaali hai.';
  return null;
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('File parhi nahi ja saki'));
    r.readAsDataURL(b);
  });
}
function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type });
}

/** Pixeldrain ka jawab {"id":"…"} → seedha chalne wala link */
function pdUrl(text: string, status: number): string {
  let id = '';
  let msg = '';
  try {
    const j = JSON.parse(text || '{}') as { id?: string; message?: string; value?: string };
    id = j.id || '';
    msg = j.message || j.value || '';
  } catch {
    msg = (text || '').slice(0, 120);
  }
  if (id && /^[\w-]{3,40}$/.test(id)) return 'https://pixeldrain.com/api/file/' + id;
  if (status === 401 || status === 403) throw new Error('Pixeldrain ne API key qabool nahi ki (HTTP ' + status + '). GitHub secret VITE_PIXELDRAIN_API_KEY check karein.');
  if (status === 413) throw new Error('File Pixeldrain ki hadd se bari hai.');
  throw new Error('Pixeldrain upload nahi hua (HTTP ' + status + ')' + (msg ? ': ' + msg : ''));
}

const safeName = (n: string) => (n || 'audio.mp3').replace(/[\\/:*?"<>|#%]+/g, '_').slice(0, 180) || 'audio.mp3';

/**
 * Audio upload — progress (0..100). Pixeldrain ka seedha stream link wapas (https://pixeldrain.com/api/file/ID).
 * name: Blob (misal Gemini voiceover .wav) ke liye file ka naam.
 */
export async function uploadAudio(file: File | Blob, onProgress: (pct: number) => void, signal?: AbortSignal, name?: string): Promise<string> {
  if (!API_KEY) throw new Error('Pixeldrain API key nahi lagi. GitHub → Settings → Secrets and variables → Actions mein VITE_PIXELDRAIN_API_KEY add kar ke app dobara build karein.');
  const f = file instanceof File ? file : new File([file], name || 'voiceover.wav', { type: file.type || 'audio/wav' });
  const bad = checkAudioFile(f);
  if (bad) throw new Error(bad);
  const fname = safeName(name || f.name);
  const type = f.type || 'application/octet-stream';

  // Windows app: Node se (progress ke saath)
  const d = desk();
  if (d?.pdUpload) {
    const id = Math.random().toString(36).slice(2);
    onProgress(0);
    const off = d.onPdProgress?.((p) => p.id === id && onProgress(Math.min(99, p.pct)));
    const stop = () => d.pdCancel?.(id);
    signal?.addEventListener('abort', stop, { once: true });
    try {
      const res = await d.pdUpload({ id, bytes: await f.arrayBuffer(), name: fname, type, key: API_KEY });
      if (signal?.aborted) throw new Error('Upload cancel ho gaya');
      if (res.status === 0) throw new Error('Pixeldrain tak nahi pahunch sake. Internet check karein. ' + (res.text || ''));
      const u = pdUrl(res.text, res.status);
      onProgress(100);
      return u;
    } finally {
      off?.();
      signal?.removeEventListener('abort', stop);
    }
  }

  try {
    return await xhrPut(f, fname, type, onProgress, signal);
  } catch (e) {
    const err = e as Error & { net?: boolean };
    // Android: WebView ne rok diya (CORS / network) → phone ka apna HTTP
    if (err.net && Capacitor.isNativePlatform() && !signal?.aborted) return nativePost(f, fname, type, onProgress);
    throw err;
  }
}

function xhrPut(f: File, fname: string, type: string, onProgress: (pct: number) => void, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.open('PUT', API + '/' + encodeURIComponent(fname));
    xhr.setRequestHeader('Authorization', AUTH);
    xhr.setRequestHeader('Content-Type', type);
    xhr.upload.onprogress = (e) => onProgress(e.lengthComputable ? Math.min(99, Math.round((e.loaded / e.total) * 100)) : -1);
    xhr.onload = () => {
      try {
        const u = pdUrl(xhr.responseText, xhr.status);
        onProgress(100);
        resolve(u);
      } catch (e) {
        reject(e);
      }
    };
    xhr.onerror = () => {
      const e = new Error('Pixeldrain tak nahi pahunch sake. Internet check karein (web browser kabhi rok deta hai — aisa ho to Android / Windows app se upload karein, ya link paste karein).') as Error & { net?: boolean };
      e.net = true;
      reject(e);
    };
    xhr.onabort = () => reject(new Error('Upload cancel ho gaya'));
    xhr.send(f);
  });
}

async function nativePost(f: File, fname: string, type: string, onProgress: (pct: number) => void): Promise<string> {
  onProgress(-1);
  const value = await blobToBase64(f);
  const res = await CapacitorHttp.request({
    url: API,
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'multipart/form-data' },
    dataType: 'formData',
    data: [{ type: 'base64File', key: 'file', value, fileName: fname, contentType: type }],
    responseType: 'text',
    connectTimeout: 30000,
    readTimeout: 900000
  });
  const u = pdUrl(typeof res.data === 'string' ? res.data : JSON.stringify(res.data), res.status);
  onProgress(100);
  return u;
}

/** pixeldrain.com/u/ID (share link) → seedha stream link */
export function normalizeAudioUrl(url: string): string {
  const m = /^https?:\/\/(?:www\.)?pixeldrain\.com\/(?:u|api\/file)\/([\w-]{3,40})/i.exec((url || '').trim());
  return m ? 'https://pixeldrain.com/api/file/' + m[1] : url.trim();
}

/* ---------------- offline gaane (IndexedDB) ---------------- */
const DB = 'khr-audio';
const STORE = 'files';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Is device par offline save nahi ho sakta'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const q = fn(db.transaction(STORE, mode).objectStore(STORE));
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}

/** kaun se gaane offline save hain */
export async function offlineKeys(): Promise<string[]> {
  try {
    return ((await idb('readonly', (s) => s.getAllKeys())) as IDBValidKey[]).map(String);
  } catch {
    return [];
  }
}

/** gaana download kar ke is device mein rakh lo */
const hdr = (h: Record<string, string> | undefined, k: string) => {
  if (!h) return '';
  const key = Object.keys(h).find((x) => x.toLowerCase() === k.toLowerCase());
  return key ? String(h[key]) : '';
};

/** Android: file chhote tukron (Range) mein — bari file ek dafa mein mangwane par connection toot jata tha
 *  ("unexpected end of stream"). Har tukra 3 dafa koshish. */
async function nativeChunked(url: string, onProgress?: (pct: number) => void): Promise<Blob> {
  const CHUNK = 1024 * 1024; // 1 MB
  const parts: Blob[] = [];
  let start = 0;
  let total = -1;
  let type = 'audio/mpeg';
  for (let guard = 0; guard < 2000; guard++) {
    const end = total > 0 ? Math.min(total - 1, start + CHUNK - 1) : start + CHUNK - 1;
    let res: Awaited<ReturnType<typeof CapacitorHttp.get>> | null = null;
    let lastErr: unknown = null;
    for (let tryN = 0; tryN < 3 && !res; tryN++) {
      try {
        res = await CapacitorHttp.get({
          url,
          responseType: 'blob',
          headers: { Range: `bytes=${start}-${end}`, 'Accept-Encoding': 'identity', Connection: 'close' },
          connectTimeout: 20000,
          readTimeout: 60000
        });
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 600 * (tryN + 1)));
      }
    }
    if (!res) throw lastErr instanceof Error ? lastErr : new Error('Download nahi hua');
    if (res.status === 200) {
      // server ne Range nahi maana: poori file ek dafa mein aa gayi
      type = hdr(res.headers, 'Content-Type') || type;
      onProgress?.(100);
      return base64ToBlob(String(res.data), type);
    }
    if (res.status !== 206) throw new Error('Download nahi hua (HTTP ' + res.status + ')');
    type = hdr(res.headers, 'Content-Type') || type;
    const m = /\/(\d+)\s*$/.exec(hdr(res.headers, 'Content-Range'));
    if (m) total = Number(m[1]);
    const part = base64ToBlob(String(res.data), type);
    parts.push(part);
    start += part.size;
    if (total > 0) onProgress?.(Math.min(99, Math.round((start / total) * 100)));
    if (part.size === 0 || (total > 0 && start >= total)) break;
  }
  onProgress?.(100);
  return new Blob(parts, { type });
}

/** gaana download kar ke is device mein rakh lo (progress 0..100) */
export async function saveOffline(url: string, onProgress?: (pct: number) => void): Promise<void> {
  let blob: Blob | null = null;
  const dk = desk();
  if (dk?.fetchBytes) {
    try {
      const r = await dk.fetchBytes(url);
      blob = new Blob([r.bytes as unknown as BlobPart], { type: r.type });
    } catch {
      throw new Error('Download nahi hua. Internet check karein.');
    }
  } else {
    // pehle seedha (sab se tez); na chale to Android par tukron mein
    try {
      const r = await fetch(url, { mode: 'cors' });
      if (r.ok) blob = await r.blob();
    } catch {
      /* neeche dusra tareeqa */
    }
    if (!blob && Capacitor.isNativePlatform()) {
      try {
        blob = await nativeChunked(url, onProgress);
      } catch (e) {
        throw new Error('Download beech mein ruk gaya (internet kamzor ho sakta hai). Dobara "📥 Offline" dabayein. ' + ((e as Error)?.message || ''));
      }
    }
    if (!blob) throw new Error('Download nahi hua. Internet check karein (web browser kabhi is site ko rok deta hai — Android / Windows app mein try karein).');
  }
  if (!blob.size) throw new Error('Download khaali aaya. Dobara try karein.');
  try {
    await idb('readwrite', (s) => s.put(blob!, url));
  } catch {
    throw new Error('Phone / PC mein jagah nahi ya storage band hai.');
  }
}

export async function removeOffline(url: string): Promise<void> {
  try {
    await idb('readwrite', (s) => s.delete(url));
  } catch {
    /* koi baat nahi */
  }
}

/** offline file ho to us ka local link (warna null) */
const live = new Map<string, string>();
export async function offlineSrc(url: string): Promise<string | null> {
  if (live.has(url)) return live.get(url)!;
  try {
    const b = (await idb('readonly', (s) => s.get(url))) as Blob | undefined;
    if (!b) return null;
    const u = URL.createObjectURL(b);
    live.set(url, u);
    return u;
  } catch {
    return null;
  }
}
export function forgetSrc(url: string) {
  const u = live.get(url);
  if (u) URL.revokeObjectURL(u);
  live.delete(url);
}

/** sirf apne upload kiye gaane (Pixeldrain, purane Catbox) offline ho sakte hain — YouTube / links nahi */
export const canOffline = (url: string) => /^https:\/\/(files\.catbox\.moe\/|pixeldrain\.com\/api\/file\/)/i.test(url);
export const isUploaded = canOffline;
