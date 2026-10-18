import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Channel } from '../lib/types';
import { DAYS_SHORT, scheduleText, todayKey, weekdayOf } from '../lib/utils';

/** Har 30 second mein naya "abhi ka time", taake Pending → Expired khud badle */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/* ---------- Segmented control ---------- */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} role="tab" aria-selected={value === o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Android back button ka stack ----------
   Jo cheez sab se upar khuli hai (sheet, image, server ki chat) wahi pehle band hoti hai. */
const backStack: { id: number; fn: { current: () => void } }[] = [];
let backSeq = 0;
export function useBackHandler(active: boolean, fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const item = { id: ++backSeq, fn: ref };
    backStack.push(item);
    return () => {
      const i = backStack.indexOf(item);
      if (i >= 0) backStack.splice(i, 1);
    };
  }, [active]);
}
/** true = kisi ne back sambhal liya */
export function runBackHandler(): boolean {
  const top = backStack[backStack.length - 1];
  if (!top) return false;
  top.fn.current();
  return true;
}

/* ---------- Toast ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<number>();
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setMsg(null), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* ---------- Bottom sheet ---------- */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useBackHandler(true, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('locked');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('locked');
    };
  }, [onClose]);
  // body par portal: card ke andar se khule tab bhi poori screen par aaye
  return createPortal(
    <div className="sheet-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-h">
          <h2>{title}</h2>
          <button className="x" onClick={onClose} aria-label="Band karein">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

/** Andar ke buttons/sheets ka click bahar wale card tak na pahunche */
export function Stop({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={className} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

/* ---------- Two-tap confirm button (no browser dialogs) ---------- */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'btn danger block' }: { label: string; confirmLabel: string; onConfirm: () => Promise<void> | void; className?: string }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        if (!armed) return setArmed(true);
        setBusy(true);
        try {
          await onConfirm();
        } finally {
          setBusy(false);
          setArmed(false);
        }
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

/* ---------- Week dots ---------- */
export function Week({ ch }: { ch: Channel }) {
  const today = weekdayOf(todayKey());
  return (
    <div className="week" aria-label={'Kaam ke din: ' + scheduleText(ch)}>
      {DAYS_SHORT.map((d, i) => {
        const on = ch.schedule_type === 'daily' || ch.work_days.includes(i);
        return (
          <span key={i} className={(on ? 'on ' : '') + (i === today ? 'today' : '')}>
            {d}
          </span>
        );
      })}
    </div>
  );
}

export function Bar({ pct, cls }: { pct: number; cls?: string }) {
  return (
    <div className={'bar ' + (cls || '')}>
      <i style={{ width: Math.max(0, Math.min(100, pct)) + '%' }} />
    </div>
  );
}

export function Delta({ d }: { d: number | null }) {
  if (d == null) return null;
  return <span className={d >= 0 ? 'up' : 'down'}>{(d >= 0 ? '▲ ' : '▼ ') + Math.abs(d).toLocaleString('en')}</span>;
}

export function Avatar({ name, url, online }: { name: string; url?: string; online?: boolean }) {
  const [broken, setBroken] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('') || '?';
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className={'av' + (url && !broken ? ' img' : '')} style={{ ['--h' as string]: String(h) }} aria-hidden="true">
      {url && !broken ? <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} /> : initials}
      {online !== undefined && <i className={'presence' + (online ? ' on' : '')} />}
    </span>
  );
}

/** KHR ka asli logo: dark mode mein main logo, light mode mein white wala, aur variant="circle" se gol */
export function Logo({ size = 34, variant = 'auto' }: { size?: number; variant?: 'auto' | 'main' | 'circle' | 'white' }) {
  const box = { width: size, height: size };
  if (variant !== 'auto') {
    const src = variant === 'circle' ? 'brand/khr-circle.png' : variant === 'white' ? 'brand/khr-white.png' : 'brand/khr-main.png';
    return <img className="logo-img" src={src} alt="KHR Production" style={box} />;
  }
  return (
    <span className="logo-auto" style={box}>
      <img className="logo-on-dark" src="brand/khr-main.png" alt="KHR Production" style={box} />
      <img className="logo-on-light" src="brand/khr-white.png" alt="KHR Production" style={box} />
    </span>
  );
}

/* ---------- Light / Dark toggle ---------- */
import { getTheme, isDark, onThemeChange, setTheme, type ThemeChoice } from '../lib/theme';

export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void, boolean] {
  const [t, setT] = useState<ThemeChoice>(getTheme);
  const [, bump] = useState(0);
  useEffect(() => onThemeChange(() => { setT(getTheme()); bump((x) => x + 1); }), []);
  return [t, setTheme, isDark(t)];
}

/** Header ka chhota button: dabane par light ↔ dark */
export function ThemeButton() {
  const [, set, dark] = useTheme();
  return (
    <button className="theme-btn" onClick={() => set(dark ? 'light' : 'dark')} aria-label={dark ? 'Light mode' : 'Dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
      {dark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
      )}
    </button>
  );
}
