/**
 * v19: Unified Pixeldrain uploader — Images, Videos, Audio, aur Documents sab Pixeldrain par upload hote hain.
 * Supabase par kabhi koi media upload nahi hota (sirf text aur Pixeldrain link).
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';

type DesktopBridge = {
  pdUpload?: (o: { id: string; bytes: ArrayBuffer; name: string; type: string; key: string }) => Promise<{ status: number; text: string }>;
  pdCancel?: (id: string) => void;
  onPdProgress?: (cb: (p: { id: string; pct: number }) => void) => () => void;
};
const desk = () => (window as unknown as { khrDesktop?: DesktopBridge }).khrDesktop;

const API_KEY = (import.meta.env.VITE_PIXELDRAIN_API_KEY as string | undefined) || 'f17d4dce-dae5-408d-8196-3b6f24e0ce6e';
const API = 'https://pixeldrain.com/api/file';
const AUTH = 'Basic ' + btoa(':' + API_KEY);

export const MAX_PD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export interface PdProgress {
  loaded: number;
  total: number;
  pct: number;
}

export class PdUploadCancelled extends Error {
  constructor() {
    super('Upload cancel ho gaya');
  }
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('File parhi nahi ja saki'));
    r.readAsDataURL(b);
  });
}

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
  if (status === 401 || status === 403) throw new Error('Pixeldrain ne API key qabool nahi ki (HTTP ' + status + ').');
  if (status === 413) throw new Error('File Pixeldrain ki hadd se bari hai.');
  throw new Error('Pixeldrain upload nahi hua (HTTP ' + status + ')' + (msg ? ': ' + msg : ''));
}

const safeName = (n: string) => (n || 'file.bin').replace(/[\\/:*?"<>|#%]+/g, '_').slice(0, 180) || 'file.bin';

export async function uploadToPixeldrain(
  file: File | Blob,
  onProgress?: (p: PdProgress) => void,
  signal?: AbortSignal,
  name?: string
): Promise<string> {
  const f = file instanceof File ? file : new File([file], name || 'file.bin', { type: file.type || 'application/octet-stream' });
  if (!f.size) throw new Error('Ye file khaali hai.');
  if (f.size > MAX_PD_BYTES) throw new Error('File 2 GB se bari hai. Choti file chunein.');
  const fname = safeName(name || f.name);
  const type = f.type || 'application/octet-stream';
  const total = f.size;

  const d = desk();
  if (d?.pdUpload) {
    const id = Math.random().toString(36).slice(2);
    onProgress?.({ loaded: 0, total, pct: 0 });
    const off = d.onPdProgress?.((p) => {
      if (p.id === id) {
        const pct = Math.min(99, p.pct);
        onProgress?.({ loaded: Math.round((pct / 100) * total), total, pct });
      }
    });
    const stop = () => d.pdCancel?.(id);
    signal?.addEventListener('abort', stop, { once: true });
    try {
      const res = await d.pdUpload({ id, bytes: await f.arrayBuffer(), name: fname, type, key: API_KEY });
      if (signal?.aborted) throw new PdUploadCancelled();
      if (res.status === 0) throw new Error('Pixeldrain tak nahi pahunch sake. Internet check karein. ' + (res.text || ''));
      const u = pdUrl(res.text, res.status);
      onProgress?.({ loaded: total, total, pct: 100 });
      return u;
    } finally {
      off?.();
      signal?.removeEventListener('abort', stop);
    }
  }

  try {
    return await xhrPut(f, fname, type, onProgress, signal);
  } catch (e) {
    if (e instanceof PdUploadCancelled) throw e;
    const err = e as Error & { net?: boolean };
    if (err.net && Capacitor.isNativePlatform() && !signal?.aborted) {
      return nativePost(f, fname, type, onProgress);
    }
    throw err;
  }
}

function xhrPut(f: File, fname: string, type: string, onProgress?: (p: PdProgress) => void, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal?.addEventListener('abort', abort, { once: true });
    xhr.open('PUT', API + '/' + encodeURIComponent(fname));
    xhr.setRequestHeader('Authorization', AUTH);
    xhr.setRequestHeader('Content-Type', type);
    xhr.upload.onprogress = (e) => {
      const total = e.lengthComputable ? e.total : f.size;
      const pct = total ? Math.min(99, Math.round((e.loaded / total) * 100)) : 0;
      onProgress?.({ loaded: e.loaded, total, pct });
    };
    xhr.onload = () => {
      signal?.removeEventListener('abort', abort);
      try {
        const u = pdUrl(xhr.responseText, xhr.status);
        onProgress?.({ loaded: f.size, total: f.size, pct: 100 });
        resolve(u);
      } catch (e) {
        reject(e);
      }
    };
    xhr.onerror = () => {
      signal?.removeEventListener('abort', abort);
      const e = new Error('Pixeldrain tak nahi pahunch sake. Internet check karein.') as Error & { net?: boolean };
      e.net = true;
      reject(e);
    };
    xhr.onabort = () => {
      signal?.removeEventListener('abort', abort);
      reject(new PdUploadCancelled());
    };
    xhr.send(f);
  });
}

async function nativePost(f: File, fname: string, type: string, onProgress?: (p: PdProgress) => void): Promise<string> {
  onProgress?.({ loaded: 0, total: f.size, pct: 15 });
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
  onProgress?.({ loaded: f.size, total: f.size, pct: 100 });
  return u;
}

export function normalizePixeldrainUrl(url: string): string {
  const m = /^https?:\/\/(?:www\.)?pixeldrain\.com\/(?:u|api\/file)\/([\w-]{3,40})/i.exec((url || '').trim());
  return m ? 'https://pixeldrain.com/api/file/' + m[1] : url.trim();
}
