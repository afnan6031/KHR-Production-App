/**
 * v16: Google Gemini se voiceover (text → awaaz). Audio sirf is device par banti hai;
 * "Playlist mein save" dabane par Pixeldrain par jati hai — Supabase par sirf link.
 *
 * Model: pehle gemini-3.8-flash-tts (naya, stable), na chale to flash-lite, phir purana
 * gemini-2.5-flash-preview-tts (Google ise 17 Nov 2026 ko band kar raha hai).
 */
// Key sirf GitHub secret VITE_GEMINI_API_KEY se aati hai (code mein likhi key GitHub block kar deta hai aur leak hoti hai)
export const GEMINI_KEY = ((import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || '').trim();
export const MAX_CHARS = 4000;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type Gender = 'female' | 'male';
export interface Voice { name: string; style: string; best: string; gender: Gender }

/** Gemini ki 30 prebuilt awaazein — official andaaz + kis kaam ke liye achhi */
export const VOICES: Voice[] = [
  { name: 'Charon', style: 'Informative', best: 'Documentary', gender: 'male' },
  { name: 'Kore', style: 'Firm', best: 'News · Explainer', gender: 'female' },
  { name: 'Puck', style: 'Upbeat', best: 'YouTube intro', gender: 'male' },
  { name: 'Fenrir', style: 'Excitable', best: 'Energetic', gender: 'male' },
  { name: 'Aoede', style: 'Breezy', best: 'Lifestyle', gender: 'female' },
  { name: 'Leda', style: 'Youthful', best: 'Shorts · Reels', gender: 'female' },
  { name: 'Orus', style: 'Firm', best: 'Deep narration', gender: 'male' },
  { name: 'Zephyr', style: 'Bright', best: 'Friendly', gender: 'female' },
  { name: 'Algenib', style: 'Gravelly', best: 'Deep · Thriller', gender: 'male' },
  { name: 'Sulafat', style: 'Warm', best: 'Storytelling', gender: 'female' },
  { name: 'Vindemiatrix', style: 'Gentle', best: 'Calm', gender: 'female' },
  { name: 'Iapetus', style: 'Clear', best: 'Tutorial', gender: 'male' },
  { name: 'Rasalgethi', style: 'Informative', best: 'History · Facts', gender: 'male' },
  { name: 'Sadaltager', style: 'Knowledgeable', best: 'Documentary', gender: 'male' },
  { name: 'Gacrux', style: 'Mature', best: 'Serious', gender: 'female' },
  { name: 'Alnilam', style: 'Firm', best: 'Authority', gender: 'male' },
  { name: 'Schedar', style: 'Even', best: 'Audiobook', gender: 'male' },
  { name: 'Achernar', style: 'Soft', best: 'Calm · Sleep', gender: 'female' },
  { name: 'Enceladus', style: 'Breathy', best: 'Emotional', gender: 'male' },
  { name: 'Algieba', style: 'Smooth', best: 'Ads', gender: 'male' },
  { name: 'Despina', style: 'Smooth', best: 'Ads', gender: 'female' },
  { name: 'Erinome', style: 'Clear', best: 'Explainer', gender: 'female' },
  { name: 'Callirrhoe', style: 'Easy-going', best: 'Vlog', gender: 'female' },
  { name: 'Umbriel', style: 'Easy-going', best: 'Casual talk', gender: 'male' },
  { name: 'Autonoe', style: 'Bright', best: 'Promo', gender: 'female' },
  { name: 'Laomedeia', style: 'Upbeat', best: 'Kids · Fun', gender: 'female' },
  { name: 'Pulcherrima', style: 'Forward', best: 'Bold promo', gender: 'female' },
  { name: 'Achird', style: 'Friendly', best: 'Conversational', gender: 'male' },
  { name: 'Zubenelgenubi', style: 'Casual', best: 'Podcast', gender: 'male' },
  { name: 'Sadachbia', style: 'Lively', best: 'Energetic', gender: 'male' }
];

export class TtsError extends Error {
  status: number;
  constructor(msg: string, status = 0) {
    super(msg);
    this.status = status;
  }
}

/* ---------------- PCM → WAV ---------------- */
export function pcmToWav(pcm: Uint8Array, rate = 24000, channels = 1, bits = 16): Blob {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  const block = (channels * bits) / 8;
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * block, true); v.setUint16(32, block, true); v.setUint16(34, bits, true);
  w(36, 'data'); v.setUint32(40, pcm.length, true);
  return new Blob([header, pcm as unknown as BlobPart], { type: 'audio/wav' });
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/[\r\n\s]/g, ''));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/** jawab mein kahin bhi audio dhoondo (Interactions: steps[].content[] {type:'audio', data}; generateContent: inlineData) */
function findAudio(node: unknown, depth = 0): { data: string; mime: string } | null {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  if (Array.isArray(node)) {
    for (const x of node) { const r = findAudio(x, depth + 1); if (r) return r; }
    return null;
  }
  const o = node as Record<string, unknown>;
  const mime = String(o.mime_type || o.mimeType || '');
  if (typeof o.data === 'string' && o.data.length > 100 && (o.type === 'audio' || /audio/i.test(mime))) return { data: o.data, mime: mime || 'audio/wav' };
  for (const k of ['inlineData', 'inline_data']) {
    const id = o[k] as Record<string, unknown> | undefined;
    if (id && typeof id.data === 'string') return { data: id.data, mime: String(id.mimeType || id.mime_type || 'audio/L16;rate=24000') };
  }
  for (const k of Object.keys(o)) {
    const r = findAudio(o[k], depth + 1);
    if (r) return r;
  }
  return null;
}

function toWav(a: { data: string; mime: string }): Blob {
  const bytes = b64ToBytes(a.data);
  const isRiff = bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  if (isRiff) return new Blob([bytes as unknown as BlobPart], { type: 'audio/wav' });
  const rate = Number(/rate=(\d+)/i.exec(a.mime)?.[1]) || 24000;
  return pcmToWav(bytes, rate);
}

async function errorOf(r: Response): Promise<TtsError> {
  let msg = '';
  try {
    const j = (await r.json()) as { error?: { message?: string; status?: string } };
    msg = j.error?.message || j.error?.status || '';
  } catch {
    /* koi baat nahi */
  }
  if (r.status === 429) return new TtsError('Gemini ki free limit abhi poori ho gayi (bohot zyada requests). Thori der baad dobara try karein.', 429);
  if (r.status === 401 || r.status === 403) return new TtsError('Gemini ne API key qabool nahi ki. GitHub secret VITE_GEMINI_API_KEY check karein.' + (msg ? ' (' + msg.slice(0, 120) + ')' : ''), r.status);
  return new TtsError('Gemini se awaaz nahi bani (HTTP ' + r.status + ')' + (msg ? ': ' + msg.slice(0, 200) : ''), r.status);
}

interface Req { text: string; voice: string; style?: string; signal?: AbortSignal }

/** naya Interactions API (Gemini 3.8 TTS) */
async function viaInteractions(model: string, q: Req): Promise<Blob> {
  const content: Record<string, unknown> = { type: 'text', text: q.text };
  if (q.style) content.annotations = [{ type: 'speech_metadata', style: q.style }];
  const r = await fetch(BASE + '/interactions', {
    method: 'POST',
    signal: q.signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      model,
      input: [{ type: 'user_input', content: [content] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: q.voice }] }
    })
  });
  if (!r.ok) throw await errorOf(r);
  const a = findAudio(await r.json());
  if (!a) throw new TtsError('Gemini ne awaaz wapas nahi bheji. Dobara try karein.');
  return toWav(a);
}

/** purana generateContent API (Gemini 2.5 TTS) */
async function viaGenerate(model: string, q: Req): Promise<Blob> {
  const r = await fetch(`${BASE}/models/${model}:generateContent`, {
    method: 'POST',
    signal: q.signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: q.style ? `Say in a ${q.style} way: ${q.text}` : q.text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: q.voice } } } }
    })
  });
  if (!r.ok) throw await errorOf(r);
  const a = findAudio(await r.json());
  if (!a) throw new TtsError('Gemini ne awaaz wapas nahi bheji. Dobara try karein.');
  return toWav(a);
}

const ROUTES: { label: string; run: (q: Req) => Promise<Blob> }[] = [
  { label: 'gemini-3.8-flash-tts', run: (q) => viaInteractions('gemini-3.8-flash-tts', q) },
  { label: 'gemini-3.8-flash-lite-tts', run: (q) => viaInteractions('gemini-3.8-flash-lite-tts', q) },
  { label: 'gemini-2.5-flash-preview-tts', run: (q) => viaGenerate('gemini-2.5-flash-preview-tts', q) }
];
let goodRoute = 0;

/** text → .wav Blob. Pehla model na mile / na chale to agla (key / limit ki ghalti par ruk jata hai). */
export async function generateSpeech(q: Req): Promise<{ blob: Blob; model: string }> {
  const text = q.text.trim();
  if (!text) throw new TtsError('Pehle script likhein.');
  if (text.length > MAX_CHARS) throw new TtsError(`Script ${MAX_CHARS} characters se zyada hai.`);
  if (!GEMINI_KEY) throw new TtsError('Gemini API key nahi lagi. GitHub → Settings → Secrets and variables → Actions mein VITE_GEMINI_API_KEY add kar ke app dobara build karein.');
  let last: unknown = null;
  for (let i = 0; i < ROUTES.length; i++) {
    const idx = (goodRoute + i) % ROUTES.length;
    try {
      const blob = await ROUTES[idx].run({ ...q, text });
      goodRoute = idx;
      return { blob, model: ROUTES[idx].label };
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new TtsError('Rok diya gaya.');
      last = e;
      const st = (e as TtsError).status || 0;
      if (st === 401 || st === 403 || st === 429) throw e; // key / limit: dusra model bhi nahi chalega
      if (!(e instanceof TtsError)) {
        // internet hi nahi
        if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new TtsError('Internet nahi. Voiceover ke liye internet zaroori hai.');
      }
    }
  }
  throw last instanceof Error ? last : new TtsError('Gemini se awaaz nahi bani.');
}

/* ---------------- waveform (seek bar par lehrein) ---------------- */
export async function peaksOf(blob: Blob, bars = 160): Promise<number[]> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer);
  // "data" chunk dhoondo
  let off = 12;
  let start = 44;
  let len = buf.length - 44;
  while (off + 8 < buf.length) {
    const id = String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
    const size = dv.getUint32(off + 4, true);
    if (id === 'data') { start = off + 8; len = Math.min(size, buf.length - start); break; }
    off += 8 + size + (size % 2);
  }
  const samples = Math.floor(len / 2);
  const per = Math.max(1, Math.floor(samples / bars));
  const out: number[] = [];
  for (let b = 0; b < bars; b++) {
    let peak = 0;
    const s0 = b * per;
    for (let i = s0; i < Math.min(samples, s0 + per); i += 4) {
      const v = Math.abs(dv.getInt16(start + i * 2, true));
      if (v > peak) peak = v;
    }
    out.push(peak / 32768);
  }
  const mx = Math.max(0.05, ...out);
  return out.map((x) => Math.max(0.04, Math.min(1, x / mx)));
}

/* ---------------- awaaz ke namoone + pichli banayi hui voiceovers (sirf is device par) ---------------- */
const DB = 'khr-voice';
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no idb'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('previews');
      r.result.createObjectStore('history', { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const q = fn(db.transaction(store, mode).objectStore(store));
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}

const PREVIEW_TEXT = (name: string) => `Assalam o Alaikum! Main ${name} hoon. Ye meri awaaz ka chhota sa namoona hai — aap ki agli video ke liye.`;

/** awaaz ka namoona: ek dafa bana kar hamesha ke liye is device par (Gemini ki limit bachti hai) */
export async function voicePreview(name: string, signal?: AbortSignal): Promise<Blob> {
  try {
    const hit = (await tx('previews', 'readonly', (s) => s.get(name))) as Blob | undefined;
    if (hit) return hit;
  } catch {
    /* storage band — seedha banao */
  }
  const { blob } = await generateSpeech({ text: PREVIEW_TEXT(name), voice: name, signal });
  try { await tx('previews', 'readwrite', (s) => s.put(blob, name)); } catch { /* koi baat nahi */ }
  return blob;
}
export async function previewCached(): Promise<string[]> {
  try { return ((await tx('previews', 'readonly', (s) => s.getAllKeys())) as IDBValidKey[]).map(String); } catch { return []; }
}

export interface Take { id: string; at: number; voice: string; style: string; text: string; blob: Blob; model: string; url?: string }
const KEEP = 6;
export async function loadTakes(): Promise<Take[]> {
  try {
    const all = (await tx('history', 'readonly', (s) => s.getAll())) as Take[];
    return all.sort((a, b) => b.at - a.at).slice(0, KEEP);
  } catch {
    return [];
  }
}
export async function saveTake(t: Take): Promise<void> {
  try {
    await tx('history', 'readwrite', (s) => s.put(t));
    const all = (await tx('history', 'readonly', (s) => s.getAll())) as Take[];
    const old = all.sort((a, b) => b.at - a.at).slice(KEEP);
    for (const o of old) await tx('history', 'readwrite', (s) => s.delete(o.id));
  } catch {
    /* jagah nahi — sirf is dafa */
  }
}
export async function deleteTake(id: string): Promise<void> {
  try { await tx('history', 'readwrite', (s) => s.delete(id)); } catch { /* koi baat nahi */ }
}
