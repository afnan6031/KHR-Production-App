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

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="var(--logo-bg)" />
      <path d="M12 22 50 14l1.6 7.4L13.6 29.4z" fill="var(--accent)" />
      <path d="M20 19.6 24 26M30.5 17.4l4 6.4M41 15.2l4 6.4" stroke="var(--logo-bg)" strokeWidth="3" />
      <rect x="12" y="31" width="40" height="20" rx="4" fill="var(--logo-fg)" />
      <text x="32" y="46" textAnchor="middle" fontFamily="var(--f-display)" fontWeight="800" fontSize="13" fill="var(--logo-bg)">KHR</text>
      <circle cx="49" cy="34.5" r="2.4" fill="var(--live)" />
    </svg>
  );
}
