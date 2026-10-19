/**
 * v9: Videos Gofile.io par upload hoti hain (Supabase par kabhi nahi).
 * - XMLHttpRequest se, taake app mein live progress (%, MB) aur Cancel ho sake
 * - Owner ka Gofile token saath jata hai, is liye saari videos owner ke Gofile account mein jati hain
 *   (GitHub secret VITE_GOFILE_TOKEN de dein to wo is ki jagah use hoga)
 * - Main server (upload.gofile.io) na mile to regional servers par dobara koshish
 */
const DEFAULT_TOKEN = 'zjULNbQbF5HXu7sFsRjvdlTHw5qsHHvM';
const TOKEN = (import.meta.env.VITE_GOFILE_TOKEN as string | undefined) || DEFAULT_TOKEN;
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const ENDPOINTS = [
  'https://upload.gofile.io/uploadfile',
  'https://upload-ap-sgp.gofile.io/uploadfile',
  'https://upload-eu-par.gofile.io/uploadfile',
  'https://upload-na-phx.gofile.io/uploadfile'
];
const VIDEO_EXT = /\.(mp4|mov|mkv|webm|m4v|avi|3gp)$/i;

export interface UploadProgress {
  loaded: number;
  total: number;
  pct: number;
}
export interface GofileResult {
  url: string;   // https://gofile.io/d/xxxx  (yahan video chalti / download hoti hai)
  name: string;
  size: number;
}

export class UploadCancelled extends Error {
  constructor() {
    super('Upload cancel kar diya');
  }
}

export function checkVideoFile(f: File): string | null {
  if (!(f.type.startsWith('video/') || VIDEO_EXT.test(f.name))) return 'Sirf video file (MP4, MOV, MKV, WEBM) upload ho sakti hai.';
  if (f.size > MAX_VIDEO_BYTES) return 'Video 2 GB se bari hai. Choti file chunein ya Google Drive ka link paste karein.';
  if (f.size === 0) return 'Ye file khaali hai.';
  return null;
}

export const mb = (n: number) => (n / (1024 * 1024)).toFixed(1) + ' MB';

function once(endpoint: string, file: File, onProgress: (p: UploadProgress) => void, signal: AbortSignal): Promise<GofileResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal.addEventListener('abort', abort, { once: true });
    xhr.open('POST', endpoint);
    xhr.upload.onprogress = (e) => {
      const total = e.lengthComputable ? e.total : file.size;
      onProgress({ loaded: e.loaded, total, pct: total ? Math.min(100, Math.round((e.loaded / total) * 100)) : 0 });
    };
    xhr.onload = () => {
      signal.removeEventListener('abort', abort);
      let json: { status?: string; data?: { downloadPage?: string; name?: string; size?: number } } | null = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* neeche error */
      }
      if (xhr.status >= 200 && xhr.status < 300 && json?.status === 'ok' && json.data?.downloadPage) {
        resolve({ url: json.data.downloadPage, name: json.data.name || file.name, size: json.data.size || file.size });
      } else {
        const e = new Error(`Gofile ne upload qabool nahi kiya (${json?.status || 'HTTP ' + xhr.status}).`);
        (e as Error & { retry?: boolean }).retry = xhr.status === 0 || xhr.status >= 500;
        reject(e);
      }
    };
    xhr.onerror = () => {
      signal.removeEventListener('abort', abort);
      const e = new Error('Gofile tak nahi pahunch sake (internet / network).');
      (e as Error & { retry?: boolean }).retry = true;
      reject(e);
    };
    xhr.onabort = () => reject(new UploadCancelled());
    const fd = new FormData();
    // token form mein (header nahi) — is tarah browser ko extra CORS check nahi karna parta
    if (TOKEN) fd.append('token', TOKEN);
    fd.append('file', file, file.name);
    xhr.send(fd);
  });
}

/** Video upload: progress har lamhe, Cancel ke liye AbortController ka signal */
export async function uploadToGofile(file: File, onProgress: (p: UploadProgress) => void, signal: AbortSignal): Promise<GofileResult> {
  const bad = checkVideoFile(file);
  if (bad) throw new Error(bad);
  let last: unknown = null;
  for (const ep of ENDPOINTS) {
    if (signal.aborted) throw new UploadCancelled();
    try {
      onProgress({ loaded: 0, total: file.size, pct: 0 });
      return await once(ep, file, onProgress, signal);
    } catch (e) {
      if (e instanceof UploadCancelled) throw e;
      last = e;
      if (!(e as { retry?: boolean }).retry) break; // server ne saaf mana kiya: dobara faida nahi
    }
  }
  throw last instanceof Error ? last : new Error('Video upload nahi hui.');
}

/** link kis cheez ka hai (chat / video mein sahi tarah dikhane ke liye) */
export function videoKind(url: string): 'gofile' | 'youtube' | 'drive' | 'file' | null {
  if (/^https?:\/\/(www\.)?gofile\.io\/d\//i.test(url)) return 'gofile';
  if (/^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch|shorts|live)|youtu\.be\/)/i.test(url)) return 'youtube';
  if (/^https?:\/\/drive\.google\.com\/file\//i.test(url)) return 'drive';
  if (/^https?:\/\/[^\s]+\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return 'file';
  return null;
}

/** app ke andar chalne wala link (YouTube / Drive embed, ya seedhi file); Gofile apne page par khulta hai */
export function embedUrl(url: string): { type: 'iframe' | 'video'; src: string } | null {
  const k = videoKind(url);
  if (k === 'file') return { type: 'video', src: url };
  if (k === 'youtube') {
    const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/)([\w-]{6,})/);
    return m ? { type: 'iframe', src: `https://www.youtube-nocookie.com/embed/${m[1]}` } : null;
  }
  if (k === 'drive') {
    const m = url.match(/\/file\/d\/([\w-]+)/);
    return m ? { type: 'iframe', src: `https://drive.google.com/file/d/${m[1]}/preview` } : null;
  }
  return null;
}
