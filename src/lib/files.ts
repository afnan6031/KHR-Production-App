/**
 * v20: Unified in-app file & media downloader (Images, Videos, Audio, Documents).
 * - PC / Web: direct download (no external webpage)
 * - Windows Desktop (Electron): Node fetch bridge -> direct save (no CORS issues)
 * - Android App (Capacitor): Documents/KHR folder + share sheet
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';

type DesktopBridge = {
  fetchBytes?: (url: string) => Promise<{ type: string; bytes: Uint8Array }>;
};
const desk = () => (window as unknown as { khrDesktop?: DesktopBridge }).khrDesktop;

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

export function isInternalMediaUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.)?(?:pixeldrain\.com\/(?:u|api\/file)\/|i\.ibb\.co\/|ibb\.co\/|files\.catbox\.moe\/)/i.test((url || '').trim());
}

function normalizeUrl(url: string): string {
  const m = /^https?:\/\/(?:www\.)?pixeldrain\.com\/(?:u|api\/file)\/([\w-]{3,40})/i.exec((url || '').trim());
  return m ? 'https://pixeldrain.com/api/file/' + m[1] : (url || '').trim();
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
  'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac',
  'application/pdf': 'pdf', 'text/plain': 'txt', 'application/zip': 'zip'
};

function ensureExt(name: string, mime: string): string {
  const clean = (name || 'file').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'file';
  if (/\.[a-z0-9]{2,6}$/i.test(clean)) return clean;
  const ext = MIME_EXT[(mime || '').split(';')[0].trim().toLowerCase()];
  return ext ? `${clean}.${ext}` : clean;
}

/** wapas: user ko dikhane wala chhota sa message */
export async function saveBlobFile(blob: Blob, name: string): Promise<string> {
  const safe = ensureExt(name, blob.type);
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safe;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    return 'Download ho gaya: ' + safe;
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const data = await blobToBase64(blob);
  let saved = '';
  try {
    await Filesystem.writeFile({ path: 'KHR/' + safe, data, directory: Directory.Documents, recursive: true });
    saved = 'Phone ke Documents/KHR folder mein save: ' + safe;
  } catch {
    /* purane Android par ijazat nahi — share se save karein */
  }
  try {
    const tmp = await Filesystem.writeFile({ path: safe, data, directory: Directory.Cache });
    await Share.share({ title: safe, files: [tmp.uri], dialogTitle: 'File save / share karein' });
  } catch {
    if (!saved) throw new Error('File save nahi hui. Phone mein jagah check karein.');
  }
  return saved || 'Share se save kar lein: ' + safe;
}

/**
 * v20: Koi bhi media URL (image, video, audio, document) seedha app ke andar se download karein
 * — bina kisi external website page khole.
 */
export async function downloadMediaUrl(rawUrl: string, name?: string): Promise<string> {
  const url = normalizeUrl(rawUrl);
  const fallbackName = name || url.split('/').pop()?.split('?')[0] || 'khr-file';

  // 1) Windows Electron app: Node bridge se (zero CORS)
  const dk = desk();
  if (dk?.fetchBytes && isInternalMediaUrl(url)) {
    const r = await dk.fetchBytes(url);
    const blob = new Blob([r.bytes as unknown as BlobPart], { type: r.type || 'application/octet-stream' });
    return saveBlobFile(blob, ensureExt(fallbackName, r.type));
  }

  // 2) Direct CORS fetch (works on Web + Android for Pixeldrain & many hosts)
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (r.ok) {
      const blob = await r.blob();
      if (blob.size > 0) return saveBlobFile(blob, ensureExt(fallbackName, blob.type));
    }
  } catch {
    /* fallback neeche */
  }

  // 3) Android native HTTP fallback (no CORS restrictions)
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({ url, responseType: 'blob', connectTimeout: 25000, readTimeout: 180000 });
    if (res.status >= 200 && res.status < 300 && res.data) {
      const ctKey = Object.keys(res.headers || {}).find((k) => k.toLowerCase() === 'content-type');
      const mime = ctKey ? String(res.headers[ctKey]) : 'application/octet-stream';
      const blob = base64ToBlob(String(res.data), mime);
      return saveBlobFile(blob, ensureExt(fallbackName, mime));
    }
  }

  // 4) Web direct download fallback (Pixeldrain ?download triggers direct file download, no webpage)
  const dlUrl = /^https:\/\/pixeldrain\.com\/api\/file\//i.test(url) ? url + '?download' : url;
  const a = document.createElement('a');
  a.href = dlUrl;
  a.download = fallbackName;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'Download shuru ho gaya: ' + fallbackName;
}
