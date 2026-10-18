/**
 * Thumbnail ImgBB par upload hota hai, aur wahan se mila direct image link Supabase ke task mein save hota hai.
 * API key build ke waqt VITE_IMGBB_API_KEY se aati hai (imgbb.com > About > API).
 */
// Owner ki di hui KHR ImgBB key. GitHub secret VITE_IMGBB_API_KEY de dein to wo is ki jagah use hogi.
const DEFAULT_KEY = '1af618e6de26da15c8c94a63248d904c';
const KEY = (import.meta.env.VITE_IMGBB_API_KEY as string | undefined) || DEFAULT_KEY;
export const imgbbReady = Boolean(KEY && KEY.length > 10);
const MAX_BYTES = 32 * 1024 * 1024; // ImgBB ki file limit

export interface ImgbbResult {
  url: string;        // direct image link (i.ibb.co/...)
  viewUrl: string;    // ImgBB page
  deleteUrl: string;  // is link se image ImgBB se delete hoti hai
}

export async function uploadToImgBB(file: File, name?: string, onStage?: (s: string) => void): Promise<ImgbbResult> {
  if (!imgbbReady) throw new Error('Thumbnail upload band hai: build mein VITE_IMGBB_API_KEY set nahi. Owner setup guide dekhe.');
  if (!file.type.startsWith('image/')) throw new Error('Sirf image file (JPG, PNG, WEBP) upload ho sakti hai.');
  if (file.size > MAX_BYTES) throw new Error('Image 32 MB se bari hai. Choti image chunein.');

  const body = new FormData();
  body.append('image', file);
  if (name) body.append('name', name.replace(/[^\w-]+/g, '-').slice(0, 80));
  onStage?.('Upload ho rahi hai…');

  let res: Response;
  try {
    res = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(KEY!)}`, { method: 'POST', body });
  } catch {
    throw new Error('ImgBB tak nahi pahunch sake. Internet check kar ke dobara try karein.');
  }
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: { url?: string; display_url?: string; url_viewer?: string; delete_url?: string }; error?: { message?: string } }
    | null;
  if (!res.ok || !json?.success || !json.data?.url) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    if (/key/i.test(msg)) throw new Error('ImgBB API key ghalat hai. Owner GitHub secret VITE_IMGBB_API_KEY check kare.');
    throw new Error('ImgBB upload nahi hua: ' + msg);
  }
  return { url: json.data.url, viewUrl: json.data.url_viewer || json.data.url, deleteUrl: json.data.delete_url || '' };
}
