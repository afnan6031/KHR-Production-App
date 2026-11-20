/**
 * v19: Gofile.io upload hata diya gaya hai — ab saari videos seedha Pixeldrain par upload hoti hain.
 * Purane Gofile links (gofile.io/d/...) abhi bhi open ho sakte hain.
 */
import { PdUploadCancelled, normalizePixeldrainUrl, uploadToPixeldrain } from './pixeldrain';

export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
const VIDEO_EXT = /\.(mp4|mov|mkv|webm|m4v|avi|3gp)$/i;

export interface UploadProgress {
  loaded: number;
  total: number;
  pct: number;
}
export interface GofileResult {
  url: string;
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

export async function uploadToGofile(file: File, onProgress: (p: UploadProgress) => void, signal: AbortSignal): Promise<GofileResult> {
  const bad = checkVideoFile(file);
  if (bad) throw new Error(bad);
  try {
    const url = await uploadToPixeldrain(file, onProgress, signal, file.name);
    return { url, name: file.name, size: file.size };
  } catch (e) {
    if (e instanceof PdUploadCancelled) throw new UploadCancelled();
    throw e;
  }
}

export function videoKind(url: string): 'pixeldrain' | 'gofile' | 'youtube' | 'drive' | 'file' | null {
  if (/^https?:\/\/(www\.)?pixeldrain\.com\/(u|api\/file)\/[\w-]{3,40}/i.test(url)) return 'pixeldrain';
  if (/^https?:\/\/(www\.)?gofile\.io\/d\//i.test(url)) return 'gofile';
  if (/^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch|shorts|live)|youtu\.be\/)/i.test(url)) return 'youtube';
  if (/^https?:\/\/drive\.google\.com\/file\//i.test(url)) return 'drive';
  if (/^https?:\/\/[^\s]+\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return 'file';
  return null;
}

export function embedUrl(url: string): { type: 'iframe' | 'video'; src: string } | null {
  const k = videoKind(url);
  if (k === 'file') return { type: 'video', src: url };
  if (k === 'pixeldrain') return { type: 'video', src: normalizePixeldrainUrl(url) };
  if (k === 'youtube') {
    const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/)([\w-]{6,})/);
    return m ? { type: 'iframe', src: `https://www.youtube-nocookie.com/embed/${m[1]}` } : null;
  }
  if (k === 'drive') {
    const m = url.match(/\/file\/d\/([\w-]+)/);
    return m ? { type: 'iframe', src: `https://drive.google.com/file/d/${m[1]}/preview` } : null;
  }
  if (k === 'gofile') return { type: 'iframe', src: url };
  return null;
}
