/**
 * v22 — iOS 26/27 "Liquid Glass" ka asli lens effect.
 *
 * Glass box ke KINARE par peechhe ka background pani ki boond ki tarah mura hua / khichta hua nazar aata hai
 * (sirf blur nahi). Ye SVG displacement filter se hota hai jo `backdrop-filter: url(#...)` mein lagta hai.
 * Is ke liye har box ke size ke hisaab se chhota sa "refraction map" banta hai (ek dafa, phir cache).
 *
 * Sirf Chromium engine (Chrome, Android WebView, Windows/Electron app) `url()` ko backdrop-filter mein chalata hai;
 * Safari / Firefox par ye khud band rehta hai aur normal blur-glass dikhta hai.
 *
 * FPS: "Auto" mode scroll ke dauran frame time napta hai — agar phone 90 FPS nahi nikaal pa raha to khud
 * lens -> sirf blur -> flat glass ki taraf halka karta hai (phir yaad rakhta hai).
 */
export type GlassFxMode = 'auto' | 'full' | 'fast';
type Level = 'lens' | 'blur' | 'flat';
const LEVELS: Level[] = ['lens', 'blur', 'flat'];

const MODE_KEY = 'khr-glass-fx';
const LEVEL_KEY = 'khr-glass-fx-level';
const EVT = 'khr-glass-fx';

/** Jin cheezon par lens lagta hai (sirf sab se upar wali glass surfaces; andar wale box par nahi — wahan blur pehle hi band hai) */
const SURFACES = [
  'header.top', 'nav.tabs', '.sheet', '.gsel-menu', '.panel', '.card', '.stat', '.tstat-card', '.tmini-panel', '.pg-sum', '.pg-tile',
  '.script-box', '.studio-side', '.vpick', '.take', '.daypick-btn', '.pod', '.vmore-menu', '.fmsg-actions', '.mplayer', '.mplayer2',
  '.bsec', '.plan-ch', 'main.server-main .srv-side', 'main.server-main .srv-main', 'main.server-main .srv-members'
].join(',');

const W_STEPS = [48, 72, 100, 140, 190, 260, 340, 440, 600, 900];
const H_STEPS = [24, 36, 48, 64, 90, 130, 190, 270, 400, 700, 1100];
const snap = (v: number, steps: number[]) => steps.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), steps[0]);

const NS = 'http://www.w3.org/2000/svg';
let host: SVGSVGElement | null = null;
const made = new Set<string>();

export function supportsLens(): boolean {
  try {
    const ua = navigator.userAgent;
    // Chromium (Chrome / Edge / Android WebView / Electron). iOS ke browser (CriOS/FxiOS) asal mein WebKit hain.
    if (/CriOS|FxiOS|EdgiOS/.test(ua)) return false;
    if (!/Chrome\/\d+/.test(ua)) return false;
    return typeof CSS !== 'undefined' && CSS.supports('backdrop-filter', 'url(#a) blur(2px)');
  } catch {
    return false;
  }
}

function ensureHost() {
  if (host && host.isConnected) return host;
  host = document.createElementNS(NS, 'svg') as SVGSVGElement;
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('width', '0');
  host.setAttribute('height', '0');
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  document.body.appendChild(host);
  return host;
}

/** W x H ke box ke liye refraction filter (kinaron par andar ki taraf khichta hai, beech mein bilkul seedha) */
function lensFilter(w: number, h: number): string {
  const id = `khr-lens-${w}x${h}`;
  if (made.has(id)) return id;
  made.add(id);
  const b = Math.round(Math.max(10, Math.min(26, Math.min(w, h) * 0.34))); // kinare ki patti (px)
  const scale = Math.round(b * 1.7); // kinare par kitna khichta hai
  const grad = (gid: string, x1: number, y1: number, x2: number, y2: number, rgb: string) =>
    `<linearGradient id="${gid}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
    `<stop offset="0" stop-color="${rgb}" stop-opacity="1"/><stop offset=".38" stop-color="${rgb}" stop-opacity=".46"/>` +
    `<stop offset=".72" stop-color="${rgb}" stop-opacity=".12"/><stop offset="1" stop-color="${rgb}" stop-opacity="0"/></linearGradient>`;
  const map =
    `<svg xmlns="${NS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs>` +
    grad('l', 0, 0, 1, 0, 'rgb(255,128,128)') + grad('r', 1, 0, 0, 0, 'rgb(0,128,128)') +
    grad('t', 0, 0, 0, 1, 'rgb(128,255,128)') + grad('m', 0, 1, 0, 0, 'rgb(128,0,128)') +
    `</defs><rect width="${w}" height="${h}" fill="rgb(128,128,128)"/>` +
    `<rect x="0" y="0" width="${b}" height="${h}" fill="url(#l)"/><rect x="${w - b}" y="0" width="${b}" height="${h}" fill="url(#r)"/>` +
    `<rect x="0" y="0" width="${w}" height="${b}" fill="url(#t)"/><rect x="0" y="${h - b}" width="${w}" height="${b}" fill="url(#m)"/></svg>`;
  const f = document.createElementNS(NS, 'filter');
  f.setAttribute('id', id);
  f.setAttribute('x', '0');
  f.setAttribute('y', '0');
  f.setAttribute('width', '100%');
  f.setAttribute('height', '100%');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  const img = document.createElementNS(NS, 'feImage');
  img.setAttribute('href', 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(map));
  img.setAttribute('preserveAspectRatio', 'none');
  img.setAttribute('result', 'map');
  const disp = document.createElementNS(NS, 'feDisplacementMap');
  disp.setAttribute('in', 'SourceGraphic');
  disp.setAttribute('in2', 'map');
  disp.setAttribute('scale', String(scale));
  disp.setAttribute('xChannelSelector', 'R');
  disp.setAttribute('yChannelSelector', 'G');
  f.append(img, disp);
  ensureHost().appendChild(f);
  return id;
}

/* ---------- surfaces ko dhoondna aur unke size ke hisaab se filter dena ---------- */
let ro: ResizeObserver | null = null;
let mo: MutationObserver | null = null;
let pending: Node[] = [];
let scanQueued = false;

function isTop(el: Element) {
  return !el.parentElement?.closest(SURFACES);
}

function assign(el: HTMLElement) {
  const w = snap(el.offsetWidth || 1, W_STEPS);
  const h = snap(el.offsetHeight || 1, H_STEPS);
  const next = `url(#${lensFilter(w, h)})`;
  if (el.style.getPropertyValue('--lens') !== next) el.style.setProperty('--lens', next);
}

function consider(el: Element) {
  if (!(el instanceof HTMLElement) || !el.matches(SURFACES)) return;
  if (!isTop(el)) {
    if (el.hasAttribute('data-lens')) { el.removeAttribute('data-lens'); ro?.unobserve(el); }
    return;
  }
  if (el.hasAttribute('data-lens')) return;
  el.setAttribute('data-lens', '');
  assign(el);
  ro?.observe(el);
}

function scan() {
  scanQueued = false;
  const nodes = pending;
  pending = [];
  for (const n of nodes) {
    if (!(n instanceof Element) || !n.isConnected) continue;
    consider(n);
    n.querySelectorAll(SURFACES).forEach(consider);
  }
}

function queue(n: Node) {
  pending.push(n);
  if (!scanQueued) {
    scanQueued = true;
    requestAnimationFrame(scan);
  }
}

function startLens() {
  if (ro) return;
  ensureHost();
  lensFilter(snap(360, W_STEPS), snap(160, H_STEPS));
  ro = new ResizeObserver((list) => {
    for (const e of list) {
      const el = e.target as HTMLElement;
      if (!el.isConnected) { ro?.unobserve(el); continue; }
      assign(el);
    }
  });
  mo = new MutationObserver((list) => {
    for (const m of list) m.addedNodes.forEach(queue);
  });
  mo.observe(document.body, { childList: true, subtree: true });
  queue(document.body);
}

function stopLens() {
  ro?.disconnect();
  mo?.disconnect();
  ro = mo = null;
  pending = [];
  document.querySelectorAll('[data-lens]').forEach((el) => {
    el.removeAttribute('data-lens');
    (el as HTMLElement).style.removeProperty('--lens');
  });
}

/* ---------- mode / level ---------- */
export function getGlassFx(): GlassFxMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'full' || v === 'fast' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function savedLevel(): Level {
  try {
    const v = localStorage.getItem(LEVEL_KEY) as Level | null;
    return v && LEVELS.includes(v) ? v : 'lens';
  } catch {
    return 'lens';
  }
}

let level: Level = 'lens';
let active = false;

function effectiveLevel(): Level {
  const mode = getGlassFx();
  if (mode === 'fast') return 'flat';
  const want: Level = mode === 'full' ? 'lens' : savedLevel();
  // lens sirf Chromium par; baqi jagah ek darja neeche (blur)
  return want === 'lens' && !supportsLens() ? 'blur' : want;
}

function apply() {
  level = effectiveLevel();
  document.documentElement.setAttribute('data-fx', level);
  if (level === 'lens') startLens();
  else stopLens();
}

export function setGlassFx(mode: GlassFxMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
    if (mode === 'auto') localStorage.removeItem(LEVEL_KEY); // phir se sab se achhe level se shuru
  } catch { /* storage band */ }
  samples.length = 0;
  bad = 0;
  if (active) apply();
  window.dispatchEvent(new Event(EVT));
}

export function onGlassFxChange(fn: () => void): () => void {
  window.addEventListener(EVT, fn);
  return () => window.removeEventListener(EVT, fn);
}

export function currentGlassLevel(): Level {
  return level;
}

/* ---------- FPS governor (sirf Auto mode) ---------- */
const samples: number[] = [];
const history: number[] = [];
let bad = 0;
let scrolling = false;
let lastT = 0;
let raf = 0;
let idle = 0;

function degrade() {
  const i = LEVELS.indexOf(savedLevel());
  if (i >= LEVELS.length - 1) return;
  const next = LEVELS[i + 1];
  try { localStorage.setItem(LEVEL_KEY, next); } catch { /* storage band */ }
  apply();
  window.dispatchEvent(new Event(EVT));
}

function evaluate() {
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  samples.length = 0;
  const sorted = history.slice().sort((a, b) => a - b);
  const vsync = sorted[Math.floor(sorted.length * 0.1)] || 16.7; // screen ka asli frame time (60Hz ~16.7, 90Hz ~11.1)
  // 60Hz par bhi poora 60 chahiye; 90/120Hz par kam az kam 70% refresh
  const slow = mean > Math.max(18.5, vsync * 1.45);
  bad = slow ? bad + 1 : Math.max(0, bad - 1);
  if (bad >= 3 && getGlassFx() === 'auto') {
    bad = 0;
    degrade();
  }
}

function tick(t: number) {
  const dt = t - lastT;
  lastT = t;
  if (dt > 4 && dt < 100 && !document.hidden) {
    samples.push(dt);
    history.push(dt);
    if (history.length > 400) history.splice(0, history.length - 400);
    if (samples.length >= 45) evaluate();
  }
  raf = scrolling ? requestAnimationFrame(tick) : 0;
}

function onScroll() {
  if (getGlassFx() !== 'auto' || level === 'flat') return;
  if (!scrolling) {
    scrolling = true;
    lastT = performance.now();
    raf = requestAnimationFrame(tick);
  }
  window.clearTimeout(idle);
  idle = window.setTimeout(() => {
    scrolling = false;
    samples.length = 0; // adhoori window ginti mein nahi
  }, 180);
}

/** Glass theme chalu hone par. Dobara bulane se koi nuqsan nahi. */
export function enableGlassFx() {
  if (!active) {
    active = true;
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  }
  apply();
}

/** Glass theme se bahar jane par sab saaf. */
export function disableGlassFx() {
  if (active) {
    active = false;
    window.removeEventListener('scroll', onScroll, true);
    if (raf) cancelAnimationFrame(raf);
    scrolling = false;
  }
  stopLens();
  document.documentElement.removeAttribute('data-fx');
}
