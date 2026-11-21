/**
 * v23 — Glass theme ka "3D + 90 FPS" engine.
 *
 * v22 mein har box par SVG "lens" (feDisplacementMap) + live backdrop-filter tha — ye GPU par nahi chalta,
 * isi se 10 FPS jaisi lag aati thi. v23 mein wo sab HATA diya gaya.
 *
 * Ab 3D ka asli kaam CSS se hota hai (layered gradient + bevel inset shadow + soft drop shadow). Ye sab
 * ek dafa paint hota hai, scroll par koi kharcha nahi. Live blur sirf chhoti cheezon par (header, neeche ki patti,
 * dropdown, popup ke peechhe) aur wo bhi sirf "full" level par. Phone / kamzor PC par "lite" level khud lagta hai
 * (blur nahi, 3D shading wahi rehti hai).
 *
 * Desktop par mouse ke saath cards halka sa 3D tilt hote hain (ek hi card, rAF se, compositor par).
 */
export type GlassFxMode = 'auto' | 'full' | 'fast';
export type GlassLevel = 'full' | 'lite';

const MODE_KEY = 'khr-glass-fx';
const EVT = 'khr-glass-fx';

export function getGlassFx(): GlassFxMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'full' || v === 'fast' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function autoLevel(): GlassLevel {
  try {
    // phone / tablet (touch) — live blur nahi, 3D shading poori
    if (window.matchMedia?.('(pointer: coarse)').matches) return 'lite';
    const nav = navigator as Navigator & { deviceMemory?: number };
    if ((nav.deviceMemory && nav.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2)) return 'lite';
  } catch {
    /* purana engine */
  }
  return 'full';
}

function effectiveLevel(): GlassLevel {
  const m = getGlassFx();
  if (m === 'fast') return 'lite';
  if (m === 'full') return 'full';
  return autoLevel();
}

let level: GlassLevel = 'full';
let active = false;

export function currentGlassLevel(): GlassLevel {
  return level;
}

function apply() {
  level = effectiveLevel();
  document.documentElement.setAttribute('data-fx', level);
  if (level === 'full' && canTilt()) startTilt();
  else stopTilt();
}

export function setGlassFx(mode: GlassFxMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* storage band */
  }
  if (active) apply();
  window.dispatchEvent(new Event(EVT));
}

export function onGlassFxChange(fn: () => void): () => void {
  window.addEventListener(EVT, fn);
  return () => window.removeEventListener(EVT, fn);
}

/* ---------- 3D tilt (sirf mouse wale PC / Windows app par) ---------- */
const TILT = '.card, .stat, .tstat-card, .pg-tile, .pod, .vtile, .acard, .vcard, .dcard, .pcard';
let tiltOn = false;
let cur: HTMLElement | null = null;
let box: DOMRect | null = null;
let raf = 0;
let mx = 0;
let my = 0;
let leaveTimer = 0;

function canTilt(): boolean {
  try {
    return !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function paint() {
  raf = 0;
  if (!cur || !box) return;
  const px = Math.max(0, Math.min(1, (mx - box.left) / Math.max(1, box.width)));
  const py = Math.max(0, Math.min(1, (my - box.top) / Math.max(1, box.height)));
  // bare card par kam jhukao, chhote par zyada (warna kinare ubharte hain)
  const max = box.width > 560 ? 1.1 : box.width > 320 ? 2.4 : 4.2;
  cur.style.setProperty('--rx', ((0.5 - py) * max * 2).toFixed(2) + 'deg');
  cur.style.setProperty('--ry', ((px - 0.5) * max * 2).toFixed(2) + 'deg');
}

function release(el: HTMLElement) {
  el.style.removeProperty('--rx');
  el.style.removeProperty('--ry');
  window.clearTimeout(leaveTimer);
  leaveTimer = window.setTimeout(() => el.removeAttribute('data-tilt'), 260);
}

function onMove(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return;
  const t = (e.target as Element | null)?.closest?.(TILT) as HTMLElement | null;
  if (t !== cur) {
    if (cur) release(cur);
    cur = t;
    box = t ? t.getBoundingClientRect() : null;
    if (t) {
      window.clearTimeout(leaveTimer);
      t.setAttribute('data-tilt', '');
    }
  }
  if (!cur) return;
  mx = e.clientX;
  my = e.clientY;
  if (!raf) raf = requestAnimationFrame(paint);
}

function onLeaveWindow() {
  if (cur) release(cur);
  cur = null;
  box = null;
}

function startTilt() {
  if (tiltOn) return;
  tiltOn = true;
  document.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('mouseleave', onLeaveWindow);
  // scroll par rect purana ho jata hai — tilt chhod do
  window.addEventListener('scroll', onLeaveWindow, { capture: true, passive: true });
}

function stopTilt() {
  if (!tiltOn) return;
  tiltOn = false;
  document.removeEventListener('pointermove', onMove);
  document.documentElement.removeEventListener('mouseleave', onLeaveWindow);
  window.removeEventListener('scroll', onLeaveWindow, true);
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (cur) release(cur);
  cur = null;
  box = null;
}

/** Glass theme chalu hone par. Dobara bulane se koi nuqsan nahi. */
export function enableGlassFx() {
  active = true;
  apply();
}

/** Glass theme se bahar jane par sab saaf. */
export function disableGlassFx() {
  active = false;
  stopTilt();
  document.documentElement.removeAttribute('data-fx');
}
