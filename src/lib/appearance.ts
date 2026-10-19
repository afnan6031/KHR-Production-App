/**
 * v9: User ki apni pasand — app ka background (ek rang / gradient / apni tasveer) aur khaas rang (accent).
 * Profile mein save hoti hai (har device par saath), aur yahan bhi yaad rehti hai taake app khulte hi lag jaye.
 */
import type { Prefs } from './types';
import { setLang } from './i18n';

const KEY = 'khr-prefs';

export function bgCss(bg: Prefs['bg']): string {
  if (!bg || bg.type === 'none') return '';
  if (bg.type === 'color') return bg.c1 || '#101828';
  if (bg.type === 'gradient') return `linear-gradient(${bg.angle ?? 135}deg, ${bg.c1 || '#2B0B14'}, ${bg.c2 || '#10183A'})`;
  if (bg.type === 'image' && bg.image) return `center / cover no-repeat url("${bg.image.replace(/"/g, '')}")`;
  return '';
}

export function applyPrefs(p?: Prefs | null, save = true) {
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
  setLang(p?.lang === 'en' ? 'en' : 'ur');
  if (save) {
    try {
      localStorage.setItem(KEY, JSON.stringify(p || {}));
    } catch {
      /* storage band */
    }
  }
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
