/**
 * v19: Saari images pehle PIXELDRAIN par upload hoti hain (fast loading).
 * Agar Pixeldrain fail ho to automatically ImgBB backup par upload hoti hai.
 * Purani ImgBB (i.ibb.co) images waise hi chalti rehti hain.
 */
import { uploadToPixeldrain } from './pixeldrain';

const DEFAULT_KEY = '1af618e6de26da15c8c94a63248d904c';
const KEY = (import.meta.env.VITE_IMGBB_API_KEY as string | undefined) || DEFAULT_KEY;
const hasImgbbKey = Boolean(KEY && KEY.length > 10);
export const imgbbReady = true;
const MAX_BYTES = 32 * 1024 * 1024;

export interface ImgbbResult {
  url: string;
  viewUrl: string;
  deleteUrl: string;
}

async function uploadToImgBBBackup(file: File, name?: string, onStage?: (s: string) => void): Promise<ImgbbResult> {
  if (!hasImgbbKey) throw new Error('Image upload nahi hui (Pixeldrain aur ImgBB dono unavailable).');
  const body = new FormData();
  body.append('image', file);
  if (name) body.append('name', name.replace(/[^\w-]+/g, '-').slice(0, 80));
  onStage?.('Backup server (ImgBB) par upload ho rahi hai…');

  let res: Response;
  try {
    res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(KEY!)}`, { method: 'POST', body });
  } catch {
    throw new Error('Image upload nahi hui. Internet check kar ke dobara try karein.');
  }
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: { url?: string; display_url?: string; url_viewer?: string; delete_url?: string }; error?: { message?: string } }
    | null;
  if (!res.ok || !json?.success || !json.data?.url) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    throw new Error('Image upload nahi hui: ' + msg);
  }
  return { url: json.data.url, viewUrl: json.data.url_viewer || json.data.url, deleteUrl: json.data.delete_url || '' };
}

export async function uploadToImgBB(file: File, name?: string, onStage?: (s: string) => void): Promise<ImgbbResult> {
  if (!file.type.startsWith('image/')) throw new Error('Sirf image file (JPG, PNG, WEBP) upload ho sakti hai.');
  if (file.size > MAX_BYTES) throw new Error('Image 32 MB se bari hai. Choti image chunein.');
  try {
    onStage?.('Upload ho rahi hai…');
    const ext = (file.name.split('.').pop() || file.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
    const fname = name ? `${name.replace(/[^\w-]+/g, '-').slice(0, 80)}.${ext}` : file.name;
    const url = await uploadToPixeldrain(file, undefined, undefined, fname);
    return { url, viewUrl: url, deleteUrl: '' };
  } catch {
    return uploadToImgBBBackup(file, name, onStage);
  }
}
