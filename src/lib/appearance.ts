/**
 * User ki apni pasand — app ka background (ek rang / gradient / apni tasveer), blur, khaas rang (accent), zabaan.
 * v11: background ka rang header, neeche ki patti, cards, Windows ki upar wali patti aur
 * Android status bar par bhi aata hai (sab ek saath milte hain).
 * Profile mein save hoti hai (har device par saath), aur yahan bhi yaad rehti hai taake app khulte hi lag jaye.
 */
import type { Prefs } from './types';
import { setLang } from './i18n';
import { desktop, isDark } from './theme';
import { syncSystemBars } from './keyboard';

const KEY = 'khr-prefs';
const TINT_KEY = 'khr-tint-cache';

export function bgCss(bg: Prefs['bg']): string {
  if (!bg || bg.type === 'none') return '';
  if (bg.type === 'color') return bg.c1 || '#101828';
  if (bg.type === 'gradient') return `linear-gradient(${bg.angle ?? 135}deg, ${bg.c1 || '#2B0B14'}, ${bg.c2 || '#10183A'})`;
  if (bg.type === 'image' && bg.image) return `center / cover no-repeat url("${bg.image.replace(/"/g, '')}")`;
  return '';
}

/* ---------- rang ka hisaab ---------- */
type RGB = [number, number, number];
const hex = (c: RGB) => '#' + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
function parse(h: string | undefined): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** tasveer ka darmiyana rang (ek dafa nikal kar yaad) */
function readTintCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TINT_KEY) || '{}');
  } catch {
    return {};
  }
}
function imageTint(url: string): Promise<RGB | null> {
  const cached = parse(readTintCache()[url]);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 24;
        c.height = 24;
        const g = c.getContext('2d', { willReadFrequently: true })!;
        g.drawImage(img, 0, 0, 24, 24);
        const px = g.getImageData(0, 0, 24, 24).data;
        let r = 0, gg = 0, b = 0, n = 0;
        for (let i = 0; i < px.length; i += 4) {
          r += px[i]; gg += px[i + 1]; b += px[i + 2]; n++;
        }
        const out: RGB = [r / n, gg / n, b / n];
        try {
          const all = readTintCache();
          all[url] = hex(out);
          localStorage.setItem(TINT_KEY, JSON.stringify(all));
        } catch {
          /* storage band */
        }
        resolve(out);
      } catch {
        resolve(null); // tasveer CORS ki wajah se parhi nahi ja saki
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function tintOf(bg: Prefs['bg']): Promise<RGB | null> {
  if (!bg || bg.type === 'none') return null;
  if (bg.type === 'color') return parse(bg.c1 || '#101828');
  if (bg.type === 'gradient') {
    const a = parse(bg.c1 || '#2B0B14'), b = parse(bg.c2 || '#10183A');
    return a && b ? mix(a, b, 0.5) : a || b;
  }
  if (bg.type === 'image' && bg.image) return imageTint(bg.image);
  return null;
}

let lastPrefs: Prefs | null | undefined = null;
let tintRun = 0;

/** header / patti / cards ke rang (dark ya light theme ke hisaab se) */
async function applyTint(p?: Prefs | null) {
  const run = ++tintRun;
  const root = document.documentElement;
  const sync = !!p?.bg && p.bg.type !== 'none' && p.bg.sync !== false;
  const t = sync ? await tintOf(p!.bg) : null;
  if (run !== tintRun) return; // beech mein pasand badal gayi
  const dark = isDark();
  const base: RGB = dark ? [17, 24, 50] : [255, 255, 255];
  if (!t) {
    document.body.classList.remove('tinted-ui');
    ['--tint', '--tint-surface', '--tint-head', '--tint-nav', '--tint-line'].forEach((v) => root.style.removeProperty(v));
    desktop()?.setTheme(dark);
    syncSystemBars(dark);
    return;
  }
  // dark mein rang ko gehra, light mein halka — taake text hamesha saaf parha jaye
  const deep: RGB = dark ? mix(t, [6, 8, 20], 0.55) : mix(t, [255, 255, 255], 0.72);
  const head = hex(dark ? mix(t, [8, 10, 24], 0.62) : mix(t, [255, 255, 255], 0.8));
  root.style.setProperty('--tint', hex(t));
  root.style.setProperty('--tint-surface', hex(mix(deep, base, 0.35)));
  root.style.setProperty('--tint-head', head);
  root.style.setProperty('--tint-nav', hex(dark ? mix(t, [6, 8, 20], 0.7) : mix(t, [255, 255, 255], 0.85)));
  root.style.setProperty('--tint-line', hex(dark ? mix(t, [255, 255, 255], 0.18) : mix(t, [0, 0, 0], 0.12)));
  document.body.classList.add('tinted-ui');
  // Windows ki upar wali patti + Android status bar bhi isi rang mein
  const d = desktop() as (ReturnType<typeof desktop> & { setBar?: (c: string, dark: boolean) => void }) | undefined;
  if (d?.setBar) d.setBar(head, dark);
  else d?.setTheme(dark);
  syncSystemBars(dark, head);
}

export function applyPrefs(p?: Prefs | null, save = true) {
  lastPrefs = p;
  const root = document.documentElement;
  const body = document.body;
  const css = bgCss(p?.bg);
  let layer = document.getElementById('khr-bg');
  if (css) {
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'khr-bg';
      layer.setAttribute('aria-hidden', 'true');
      body.prepend(layer);
    }
    layer.style.background = css;
    const blur = p?.bg?.type === 'image' ? Math.max(0, Math.min(30, p?.bg?.blur ?? 8)) : 0;
    root.style.setProperty('--bg-blur', blur + 'px');
    root.style.setProperty('--bg-dim', String(Math.max(0, Math.min(0.85, p?.bg?.dim ?? (p?.bg?.type === 'image' ? 0.35 : 0)))));
    body.classList.add('custom-bg');
  } else {
    layer?.remove();
    body.classList.remove('custom-bg');
  }
  if (p?.accent && /^#[0-9a-f]{6}$/i.test(p.accent)) {
    root.style.setProperty('--accent', p.accent);
    root.style.setProperty('--accent-soft', `color-mix(in srgb, ${p.accent} 20%, var(--surface))`);
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-soft');
  }
  applyTint(p);
  setLang(p?.lang === 'en' ? 'en' : 'ur');
  if (save) {
    try {
      localStorage.setItem(KEY, JSON.stringify(p || {}));
    } catch {
      /* storage band */
    }
  }
}

/** dark / light badla to rang dobara (pasand wahi) */
export function reapplyTint() {
  applyTint(lastPrefs);
}

/** app khulte hi pichli pasand (login se pehle bhi) */
export function applySavedPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{}') as Prefs;
    applyPrefs(p, false);
  } catch {
    /* koi baat nahi */
  }
}
