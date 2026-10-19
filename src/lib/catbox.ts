/**
 * v11: Music / audio Catbox.moe par upload hota hai (Supabase par sirf link aur naam).
 * - Android app: phone ka apna (native) HTTP — browser ki CORS rukawat nahi
 * - Windows app: app khud Catbox ko ijazat deti hai (electron/main.cjs)
 * - Web: seedha koshish; browser rok de to saaf message
 * Saath mein "offline" gaane: file phone / PC mein (IndexedDB) save, internet ke baghair bhi chale.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';

type DesktopBridge = {
  catboxUpload?: (bytes: ArrayBuffer, name: string, type: string, userhash: string) => Promise<{ status: number; text: string }>;
  fetchBytes?: (url: string) => Promise<{ type: string; bytes: Uint8Array }>;
};
const desk = () => (window as unknown as { khrDesktop?: DesktopBridge }).khrDesktop;

const USERHASH = (import.meta.env.VITE_CATBOX_USERHASH as string | undefined) || '9278fdb8ccc65a11a55508b';
const API = 'https://catbox.moe/user/api.php';
export const MAX_AUDIO_BYTES = 200 * 1024 * 1024; // Catbox ki hadd
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|wma|mp4|webm)$/i;

export function checkAudioFile(f: File): string | null {
  if (!(f.type.startsWith('audio/') || f.type === 'video/mp4' || AUDIO_EXT.test(f.name))) return 'Sirf audio file (MP3, M4A, WAV, OGG, MP4 audio) upload ho sakti hai.';
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

function okUrl(text: string): string {
  const t = (text || '').trim();
  if (/^https:\/\/files\.catbox\.moe\/\S+$/i.test(t)) return t;
  throw new Error('Catbox ne upload qabool nahi kiya: ' + (t.slice(0, 120) || 'khaali jawab'));
}

const isUrl = (t: string) => /^https:\/\/files\.catbox\.moe\/\S+$/i.test((t || '').trim());

/** Audio upload — progress (0..100); Android / Windows app mein progress ka andaza nahi hota (-1).
 *  Userhash qabool na ho (misal HTTP 412) to bina userhash dobara (file phir bhi hamesha rehti hai). */
export async function uploadToCatbox(file: File, onProgress: (pct: number) => void, signal?: AbortSignal): Promise<string> {
  const bad = checkAudioFile(file);
  if (bad) throw new Error(bad);
  try {
    return await uploadOnce(file, onProgress, signal, USERHASH);
  } catch (e) {
    if ((e as Error).message === 'Upload cancel ho gaya') throw e;
    return uploadOnce(file, onProgress, signal, '');
  }
}

async function uploadOnce(file: File, onProgress: (pct: number) => void, signal: AbortSignal | undefined, userhash: string): Promise<string> {
  const d = desk();
  if (d?.catboxUpload) {
    onProgress(-1);
    const res = await d.catboxUpload(await file.arrayBuffer(), file.name.replace(/[^\w.\- ()&]+/g, '_') || 'audio.mp3', file.type || 'audio/mpeg', userhash);
    if (isUrl(res.text)) return res.text.trim();
    throw new Error('Catbox upload nahi hua (HTTP ' + res.status + ')' + (res.text && res.text.length < 120 ? ': ' + res.text : ''));
  }
  if (Capacitor.isNativePlatform()) {
    onProgress(-1);
    const value = await blobToBase64(file);
    const res = await CapacitorHttp.request({
      url: API,
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data' },
      dataType: 'formData',
      data: [
        { type: 'string', key: 'reqtype', value: 'fileupload' },
        ...(userhash ? [{ type: 'string', key: 'userhash', value: userhash }] : []),
        { type: 'base64File', key: 'fileToUpload', value, fileName: file.name.replace(/[^\w.\- ]+/g, '_') || 'audio.mp3', contentType: file.type || 'audio/mpeg' }
      ],
      responseType: 'text',
      connectTimeout: 30000,
      readTimeout: 600000
    });
    if (res.status < 200 || res.status >= 300) throw new Error('Catbox upload nahi hua (HTTP ' + res.status + ')');
    return okUrl(typeof res.data === 'string' ? res.data : JSON.stringify(res.data));
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.open('POST', API);
    xhr.upload.onprogress = (e) => onProgress(e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : -1);
    xhr.onload = () => {
      try {
        if (xhr.status < 200 || xhr.status >= 300) throw new Error('Catbox upload nahi hua (HTTP ' + xhr.status + ')');
        resolve(okUrl(xhr.responseText));
      } catch (e) {
        reject(e);
      }
    };
    xhr.onerror = () =>
      reject(new Error('Catbox tak nahi pahunch sake. Internet check karein. (Web browser kabhi Catbox ko rok deta hai — aisa ho to Android / Windows app se upload karein, ya gaane ka link paste karein.)'));
    xhr.onabort = () => reject(new Error('Upload cancel ho gaya'));
    const fd = new FormData();
    fd.append('reqtype', 'fileupload');
    if (userhash) fd.append('userhash', userhash);
    fd.append('fileToUpload', file, file.name);
    xhr.send(fd);
  });
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
export async function saveOffline(url: string): Promise<void> {
  let blob: Blob;
  const dk = desk();
  if (dk?.fetchBytes) {
    try {
      const r = await dk.fetchBytes(url);
      blob = new Blob([r.bytes as unknown as BlobPart], { type: r.type });
    } catch {
      throw new Error('Download nahi hua. Internet check karein.');
    }
  } else if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url, responseType: 'blob', readTimeout: 600000 });
    if (res.status < 200 || res.status >= 300) throw new Error('Download nahi hua (HTTP ' + res.status + ')');
    const type = String(res.headers?.['Content-Type'] || res.headers?.['content-type'] || 'audio/mpeg');
    blob = base64ToBlob(String(res.data), type);
  } else {
    let r: Response;
    try {
      r = await fetch(url, { mode: 'cors' });
    } catch {
      throw new Error('Download nahi hua. Internet check karein (web browser kabhi is site ko rok deta hai — Android / Windows app mein try karein).');
    }
    if (!r.ok) throw new Error('Download nahi hua (HTTP ' + r.status + ')');
    blob = await r.blob();
  }
  try {
    await idb('readwrite', (s) => s.put(blob, url));
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

/** Catbox / seedhi audio file — offline save ho sakti hai */
/** sirf apne upload kiye (Catbox) gaane offline ho sakte hain — YouTube / links nahi */
export const canOffline = (url: string) => /^https:\/\/files\.catbox\.moe\//i.test(url);
export const isUploaded = canOffline;
