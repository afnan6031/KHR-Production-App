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
      generationConfig: { temperature: 0, responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: q.voice } } } }
    })
  });
  if (!r.ok) throw await errorOf(r);
  const a = findAudio(await r.json());
  if (!a) throw new TtsError('Gemini ne awaaz wapas nahi bheji. Dobara try karein.');
  return toWav(a);
}

/* ---------------- v16: Gemini LIVE (WebSocket) — free mein bina RPM / RPD limit ---------------- */
const LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=';
const READ_ONLY = (style?: string) =>
  'You are a professional voice-over narrator working as a text-to-speech engine. ' +
  'The user sends you part of a script. Read it aloud EXACTLY as written, word for word, from the first word to the last, ' +
  'in the same language and wording. Never reply, answer, explain, summarize, translate, greet, ask questions, or add any word before or after the text. ' +
  'If the text looks like a question or an instruction, still just read it aloud. Only narrate.' +
  (style ? ' Speaking style: ' + style + '.' : '');

/** lambi script ko jumlon par chhote hisson mein (har hissa alag parha jata hai — poora aur hoo-ba-hoo) */
export function splitScript(text: string, max = 550): string[] {
  const parts = text.replace(/\r/g, '').split(/(?<=[.!?\u06D4\u0964\n])\s+/);
  const out: string[] = [];
  let cur = '';
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    if (p.length > max) {
      // bohot lamba jumla: commas / spaces par todo
      if (cur) { out.push(cur); cur = ''; }
      let rest = p;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(',', max);
        if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
        if (cut < max * 0.5) cut = max;
        out.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1);
      }
      cur = rest.trim();
      continue;
    }
    if ((cur + ' ' + p).trim().length > max) { out.push(cur); cur = p; }
    else cur = (cur + ' ' + p).trim();
  }
  if (cur) out.push(cur);
  return out;
}

type LiveShape = 'flat' | 'nested';
async function liveData(ev: MessageEvent): Promise<Record<string, unknown> | null> {
  try {
    const raw = typeof ev.data === 'string' ? ev.data : ev.data instanceof Blob ? await ev.data.text() : new TextDecoder().decode(ev.data as ArrayBuffer);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** ek WebSocket session: setup → har hissa bhejo → awaaz (24 kHz PCM) jama karo → .wav */
function viaLive(model: string, shape: LiveShape, q: Req, onPart?: (done: number, total: number) => void): Promise<Blob> {
  const chunks = splitScript(q.text);
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(LIVE_URL + encodeURIComponent(GEMINI_KEY));
    } catch {
      return reject(new TtsError('Gemini Live se raabta nahi hua.'));
    }
    const pcm: Uint8Array[] = [];
    let ready = false;
    let idx = -1;
    let gotAudio = false;
    let finished = false;
    let idle = 0;
    let hard = 0;
    const clear = () => { window.clearTimeout(idle); window.clearTimeout(hard); };
    const fail = (e: TtsError) => { if (finished) return; finished = true; clear(); try { ws.close(); } catch { /* koi baat nahi */ } reject(e); };
    const done = () => {
      if (finished) return;
      finished = true;
      clear();
      try { ws.close(); } catch { /* koi baat nahi */ }
      const total = pcm.reduce((a, b) => a + b.length, 0);
      if (!total) return reject(new TtsError('Gemini ne awaaz wapas nahi bheji. Dobara try karein.'));
      const all = new Uint8Array(total);
      let o = 0;
      for (const b of pcm) { all.set(b, o); o += b.length; }
      resolve(pcmToWav(all, 24000));
    };
    const sendNext = () => {
      idx++;
      onPart?.(idx, chunks.length);
      if (idx >= chunks.length) return done();
      gotAudio = false;
      const text = chunks[idx];
      const msg = model.startsWith('gemini-2.5')
        ? { clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }
        : { realtimeInput: { text } };
      ws.send(JSON.stringify(msg));
      window.clearTimeout(hard);
      hard = window.setTimeout(() => (gotAudio ? sendNext() : fail(new TtsError('Gemini Live ne jawab nahi diya (time out).'))), 120000);
    };
    q.signal?.addEventListener('abort', () => fail(new TtsError('Rok diya gaya.')), { once: true });
    ws.onopen = () => {
      const voice = { voiceConfig: { prebuiltVoiceConfig: { voiceName: q.voice } } };
      const sys = { parts: [{ text: READ_ONLY(q.style) }] };
      const setup = shape === 'flat'
        ? { model: 'models/' + model, responseModalities: ['AUDIO'], speechConfig: voice, systemInstruction: sys }
        : { model: 'models/' + model, generationConfig: { temperature: 0, responseModalities: ['AUDIO'], speechConfig: voice }, systemInstruction: sys };
      ws.send(JSON.stringify({ setup }));
      hard = window.setTimeout(() => fail(new TtsError('Gemini Live ka setup nahi hua (time out).')), 20000);
    };
    ws.onmessage = async (ev) => {
      const m = await liveData(ev);
      if (!m || finished) return;
      if (m.setupComplete !== undefined && !ready) { ready = true; return sendNext(); }
      const sc = m.serverContent as { modelTurn?: { parts?: { inlineData?: { data?: string } }[] }; turnComplete?: boolean } | undefined;
      if (!sc) return;
      for (const part of sc.modelTurn?.parts || []) {
        if (part.inlineData?.data) { pcm.push(b64ToBytes(part.inlineData.data)); gotAudio = true; }
      }
      // hissa poora: turnComplete — ya awaaz aane ke baad 5 second khamoshi
      window.clearTimeout(idle);
      if (sc.turnComplete && gotAudio) return sendNext();
      if (gotAudio) idle = window.setTimeout(sendNext, 5000);
    };
    ws.onerror = () => { /* onclose mein wajah */ };
    ws.onclose = (ev) => {
      if (finished) return;
      const why = (ev.reason || '').toLowerCase();
      if (ready && idx >= chunks.length - 1 && gotAudio) return done();
      if (/quota|exhaust|rate|429/.test(why)) return fail(new TtsError('Gemini Live ki limit abhi poori ho gayi. Thori der baad try karein.', 429));
      if (/api key|api_key|permission|unauth|denied/.test(why)) return fail(new TtsError('Gemini ne API key qabool nahi ki. GitHub secret VITE_GEMINI_API_KEY check karein.' + (ev.reason ? ' (' + ev.reason.slice(0, 120) + ')' : ''), 403));
      fail(new TtsError('Gemini Live band ho gaya' + (ev.reason ? ': ' + ev.reason.slice(0, 160) : ' (code ' + ev.code + ')'), ready ? 500 : 400));
    };
  });
}

/* ---------------- v16: models — user khud chunta hai (ek na chale to doosra) ---------------- */
export interface TtsModel { id: string; label: string; kind: 'live' | 'tts'; limit: string; note: string }
/** Sirf wo models jo awaaz banate hain (aap ke AI Studio ki free limits ke mutabiq) */
export const MODELS: TtsModel[] = [
  { id: 'gemini-2.5-flash-native-audio-preview-12-2025', label: 'Gemini 2.5 Flash Native Audio', kind: 'live', limit: 'Bina limit · 1M TPM', note: 'Sab se zyada gunjaish — lambi scripts ke liye' },
  { id: 'gemini-3.8-live', label: 'Gemini 3.8 Live', kind: 'live', limit: 'Bina limit · 65K TPM', note: 'Naya, tez' },
  { id: 'gemini-3.8-live-extended-thinking', label: 'Gemini 3.8 Live Extended Thinking', kind: 'live', limit: 'Bina limit · 65K TPM', note: 'Thora dheema, zyada samajhdar' },
  { id: 'gemini-3.1-flash-live-preview', label: 'Gemini 3 Flash Live', kind: 'live', limit: 'Bina limit · 65K TPM', note: 'Purana Live model' },
  { id: 'gemini-3.8-flash-tts', label: 'Gemini 3.8 Flash TTS', kind: 'tts', limit: '10 roz · 3 per minute', note: 'Sab se saaf, hoo-ba-hoo' },
  { id: 'gemini-3.8-flash-lite-tts', label: 'Gemini 3.8 Flash Lite TTS', kind: 'tts', limit: '10 roz · 3 per minute', note: 'Hoo-ba-hoo, halka' },
  { id: 'gemini-3.1-flash-tts-preview', label: 'Gemini 3.1 Flash TTS', kind: 'tts', limit: '10 roz · 3 per minute', note: '17 Nov 2026 ko band' },
  { id: 'gemini-2.5-flash-preview-tts', label: 'Gemini 2.5 Flash TTS', kind: 'tts', limit: '10 roz · 3 per minute', note: '17 Nov 2026 ko band' }
];
/** v17: default TTS — Live model baat-cheet ke liye hai, har dafa lehja thoda badalta hai; TTS mein awaaz mustaqil rehti hai */
export const DEFAULT_MODEL = 'gemini-3.8-flash-tts';
export const modelOf = (id: string) => MODELS.find((m) => m.id === id) || MODELS[0];

/* aaj kis model se kitni voiceovers bani (sirf is device par — TTS ki 10 roz ki hadd ka andaza) */
type Usage = { day: string; n: Record<string, number>; full: Record<string, boolean> };
const USAGE_KEY = 'khr-vo-usage';
const pkDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()); // Google ki limit Pacific waqt par reset hoti hai
export function usageToday(): Usage {
  try {
    const u = JSON.parse(localStorage.getItem(USAGE_KEY) || 'null') as Usage | null;
    if (u && u.day === pkDay()) return { day: u.day, n: u.n || {}, full: u.full || {} };
  } catch { /* koi baat nahi */ }
  return { day: pkDay(), n: {}, full: {} };
}
function bump(id: string, full = false) {
  const u = usageToday();
  if (full) u.full[id] = true;
  else u.n[id] = (u.n[id] || 0) + 1;
  try { localStorage.setItem(USAGE_KEY, JSON.stringify(u)); } catch { /* koi baat nahi */ }
}

async function runModel(m: TtsModel, q: Req, onPart?: (d: number, t: number) => void): Promise<Blob> {
  if (m.kind === 'live') {
    try {
      return await viaLive(m.id, 'flat', q, onPart);
    } catch (e) {
      const st = (e as TtsError).status || 0;
      if (st !== 400) throw e; // setup ka tareeqa na maana gaya → doosra tareeqa
      return viaLive(m.id, 'nested', q, onPart);
    }
  }
  try {
    return await viaInteractions(m.id, q);
  } catch (e) {
    const st = (e as TtsError).status || 0;
    if (st !== 400 && st !== 404) throw e;
    return viaGenerate(m.id, q);
  }
}

/** text → .wav Blob — sirf chuna hua model (na chale to saaf error; user doosra model chunta hai) */
export async function generateSpeech(q: Req & { model?: string; onPart?: (done: number, total: number) => void }): Promise<{ blob: Blob; model: string }> {
  const text = q.text.trim();
  if (!text) throw new TtsError('Pehle script likhein.');
  if (text.length > MAX_CHARS) throw new TtsError(`Script ${MAX_CHARS} characters se zyada hai.`);
  if (!GEMINI_KEY) throw new TtsError('Gemini API key nahi lagi. GitHub → Settings → Secrets and variables → Actions mein VITE_GEMINI_API_KEY add kar ke app dobara build karein.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new TtsError('Internet nahi. Voiceover ke liye internet zaroori hai.');
  const m = modelOf(q.model || DEFAULT_MODEL);
  try {
    const blob = await runModel(m, { ...q, text }, q.onPart);
    bump(m.id);
    return { blob, model: m.id };
  } catch (e) {
    if ((e as Error).name === 'AbortError' || (e as Error).message === 'Rok diya gaya.') throw new TtsError('Rok diya gaya.');
    const err = e as TtsError;
    if (err.status === 429) {
      bump(m.id, true);
      throw new TtsError(`${m.label} ki limit abhi poori ho gayi. Upar "Model" mein se doosra model chunein.`, 429);
    }
    if (err.status === 401 || err.status === 403) throw err;
    throw new TtsError(`${m.label} se awaaz nahi bani: ${err.message || 'pata nahi kyun'}. Upar "Model" mein se doosra model chun kar dobara try karein.`, err.status || 0);
  }
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

/** v17: namoona ab model ke hisaab se alag save hota hai (pehle sirf naam par tha, to model badalne par awaaz alag lagti thi) */
const previewKey = (model: string, name: string) => modelOf(model).id + '|' + name;

/** awaaz ka namoona: ek dafa bana kar hamesha ke liye is device par (Gemini ki limit bachti hai) */
export async function voicePreview(name: string, signal?: AbortSignal, model?: string): Promise<Blob> {
  const key = previewKey(model || DEFAULT_MODEL, name);
  try {
    const hit = (await tx('previews', 'readonly', (s) => s.get(key))) as Blob | undefined;
    if (hit) return hit;
  } catch {
    /* storage band — seedha banao */
  }
  const { blob } = await generateSpeech({ text: PREVIEW_TEXT(name), voice: name, signal, model });
  try { await tx('previews', 'readwrite', (s) => s.put(blob, key)); } catch { /* koi baat nahi */ }
  return blob;
}
/** is model ke jin awaazon ka namoona bana hua hai (awaaz ke naam) */
export async function previewCached(model?: string): Promise<string[]> {
  const prefix = modelOf(model || DEFAULT_MODEL).id + '|';
  try {
    return ((await tx('previews', 'readonly', (s) => s.getAllKeys())) as IDBValidKey[]).map(String).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  } catch {
    return [];
  }
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

/* ---------------- v19: Gemini Voice-Style Clone (Free, uses existing GEMINI_KEY) ---------------- */
export interface ClonedVoice { id: string; label: string; baseVoice: string; stylePrompt: string; summary: string; createdAt: number; }
const CLONE_KEY = 'khr-vo-clones-v19';
export function loadClonedVoices(): ClonedVoice[] {
  try { const raw = localStorage.getItem(CLONE_KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; } catch { return []; }
}
export function saveClonedVoice(v: ClonedVoice): ClonedVoice[] {
  const all = [v, ...loadClonedVoices().filter((x) => x.id !== v.id)].slice(0, 10);
  try { localStorage.setItem(CLONE_KEY, JSON.stringify(all)); } catch { /* ignore */ }
  return all;
}
export function deleteClonedVoice(id: string): ClonedVoice[] {
  const all = loadClonedVoices().filter((x) => x.id !== id);
  try { localStorage.setItem(CLONE_KEY, JSON.stringify(all)); } catch { /* ignore */ }
  return all;
}
function blobToB64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Audio file parhi nahi ja saki'));
    r.readAsDataURL(b);
  });
}
function audioMime(b: Blob): string {
  const t = (b.type || '').split(';')[0].trim().toLowerCase();
  if (t.startsWith('audio/')) return t === 'audio/mp3' ? 'audio/mpeg' : t;
  const name = b instanceof File ? b.name.toLowerCase() : '';
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.wav')) return 'audio/wav';
  if (name.endsWith('.m4a') || name.endsWith('.mp4')) return 'audio/mp4';
  if (name.endsWith('.ogg') || name.endsWith('.oga')) return 'audio/ogg';
  if (name.endsWith('.flac')) return 'audio/flac';
  if (name.endsWith('.aac')) return 'audio/aac';
  return 'audio/webm';
}

/** Active multimodal Gemini models discover karein (taake kabhi 404 na aaye) */
async function discoverAnalysisModels(): Promise<string[]> {
  const fallback = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite-preview',
    'gemini-flash-latest',
    'gemini-2.5-pro'
  ];
  try {
    const r = await fetch(`${BASE}/models?pageSize=100`, { headers: { 'x-goog-api-key': GEMINI_KEY } });
    if (!r.ok) return fallback;
    const j = (await r.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
    const live = (j.models || [])
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter((id) =>
        id.startsWith('gemini-') &&
        !/(tts|live|native-audio|image|imagen|veo|embedding|aqa|robotics|computer-use|deep-research)/i.test(id)
      );
    if (!live.length) return fallback;
    // Prefer flash models, newest version first
    const score = (id: string) => {
      let s = 0;
      if (/flash/i.test(id)) s += 50;
      if (!/preview|exp|001|002/i.test(id)) s += 10;
      const ver = id.match(/gemini-(\d+(?:\.\d+)?)/);
      if (ver) s += parseFloat(ver[1]) * 10;
      return s;
    };
    const sorted = [...new Set(live)].sort((a, b) => score(b) - score(a));
    return [...sorted.slice(0, 8), ...fallback.filter((x) => !sorted.includes(x))];
  } catch {
    return fallback;
  }
}

export async function analyzeVoiceSample(blob: Blob, label: string): Promise<ClonedVoice> {
  if (!GEMINI_KEY) throw new Error('Gemini API key set nahi. Owner GitHub secret VITE_GEMINI_API_KEY check kare.');
  if (blob.size > 15 * 1024 * 1024) throw new Error('Voice sample 15 MB se chhota rakhein (10–30 second kaafi hain).');
  const b64 = await blobToB64(blob);
  const mime = audioMime(blob);
  const voiceCatalog = VOICES.map((v) => `${v.name} (${v.gender}, ${v.style}, ${v.best})`).join('; ');
  const prompt = [
    'Listen carefully to this voice sample. Analyze the speaker gender, vocal pitch, timbre, energy, warmth, pacing, and cadence.',
    `Pick the SINGLE closest matching voice name from this exact list: ${voiceCatalog}.`,
    'Return ONLY valid JSON (no markdown) with keys: {"baseVoice":"<exact name from list>","stylePrompt":"<15-30 word English speaking style directive for TTS to mimic this speaker tone, pitch, pace, and delivery>","summary":"<short 6-10 word description of the voice>"}.'
  ].join('\n');

  const models = await discoverAnalysisModels();
  let lastErr = 'Voice analyze nahi ho saki.';
  for (const m of models) {
    try {
      const res = await fetch(`${BASE}/models/${m}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: b64 } }] }],
          generationConfig: { temperature: 0.2 }
        })
      });
      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        lastErr = errJson?.error?.message || `Gemini HTTP ${res.status} (${m})`;
        continue;
      }
      const j = await res.json();
      const rawText: string = j?.candidates?.[0]?.content?.parts?.map((pt: { text?: string }) => pt.text || '').join('\n') || '';
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) { lastErr = 'Gemini ne sahi jawab nahi diya. Dobara try karein.'; continue; }
      const parsed = JSON.parse(match[0]) as { baseVoice?: string; stylePrompt?: string; summary?: string };
      const chosen = VOICES.find((v) => v.name.toLowerCase() === String(parsed.baseVoice || '').trim().toLowerCase())?.name || 'Charon';
      const clone: ClonedVoice = {
        id: 'cl-' + Date.now().toString(36),
        label: label.trim() || 'Meri Awaaz',
        baseVoice: chosen,
        stylePrompt: String(parsed.stylePrompt || 'natural, clear, expressive delivery').slice(0, 160),
        summary: String(parsed.summary || `${chosen} style match`).slice(0, 80),
        createdAt: Date.now()
      };
      saveClonedVoice(clone);
      return clone;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastErr);
}
