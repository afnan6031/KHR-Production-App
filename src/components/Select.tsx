import { Children, Fragment, isValidElement, useCallback, type KeyboardEvent as RKeyboardEvent, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBackHandler } from './ui';

/**
 * v22: native <select> ka khulne wala popup browser/Android ka apna SAFED box hota hai — usay glass
 * banana mumkin nahi. Is liye ye apna dropdown hai: <select> jaisa hi use hota hai
 * (value / onChange(e.target.value) / <option> / <optgroup>), lekin menu hamare theme ka (glass mein asli glass).
 */
type OptProps = { value?: string | number; disabled?: boolean; children?: ReactNode; 'data-notr'?: boolean | string };
type Opt = { value: string; label: ReactNode; disabled: boolean; notr: boolean };
type Group = { label?: string; opts: Opt[] };

function textOf(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textOf).join('');
  if (isValidElement(n)) return textOf((n.props as { children?: ReactNode }).children);
  return '';
}

function collect(children: ReactNode, label: string | undefined, out: Group[]) {
  Children.forEach(children, (ch) => {
    if (!isValidElement(ch)) return;
    const el = ch as ReactElement<OptProps & { label?: string }>;
    if (el.type === 'option') {
      let g = out[out.length - 1];
      if (!g || g.label !== label) {
        g = { label, opts: [] };
        out.push(g);
      }
      g.opts.push({ value: String(el.props.value ?? textOf(el.props.children)), label: el.props.children, disabled: !!el.props.disabled, notr: el.props['data-notr'] !== undefined });
    } else if (el.type === 'optgroup') {
      collect(el.props.children, el.props.label, out);
    } else if (el.type === Fragment) {
      collect(el.props.children, label, out);
    }
  });
}

export interface SelectChange { target: { value: string }; currentTarget: { value: string } }

export function Select({ value, onChange, children, className, id, disabled, title, ...rest }: {
  value: string | number;
  onChange: (e: SelectChange) => void;
  children?: ReactNode;
  className?: string;
  id?: string;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
}) {
  const uid = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxH: number } | null>(null);

  const groups = useMemo(() => {
    const g: Group[] = [];
    collect(children, undefined, g);
    return g;
  }, [children]);
  const flat = useMemo(() => groups.flatMap((g) => g.opts), [groups]);
  const cur = String(value);
  const sel = flat.find((o) => o.value === cur) || flat[0];

  const close = useCallback(() => setOpen(false), []);
  useBackHandler(open, close);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const vh = window.innerHeight, vw = window.innerWidth;
    const below = vh - r.bottom - 12, above = r.top - 12;
    const up = below < 220 && above > below;
    const width = Math.min(Math.max(r.width, 190), vw - 16);
    const left = Math.max(8, Math.min(r.left, vw - width - 8));
    setPos(up
      ? { left, bottom: vh - r.top + 6, width, maxH: Math.min(360, above - 6) }
      : { left, top: r.bottom + 6, width, maxH: Math.min(360, below - 6) });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    setActive(Math.max(0, flat.findIndex((o) => o.value === cur)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: Event) => {
      const t = e.target as Node;
      if (menu.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(false);
    };
    const scroll = (e: Event) => {
      if (menu.current && e.target instanceof Node && menu.current.contains(e.target)) return;
      setOpen(false);
    };
    const resize = () => setOpen(false);
    document.addEventListener('pointerdown', down, true);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [open]);

  // chuna hua item menu ke andar nazar aaye
  useEffect(() => {
    if (!open || !pos) return;
    menu.current?.querySelector<HTMLElement>('[data-active="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, pos, active]);

  const pick = (o: Opt) => {
    if (o.disabled) return;
    setOpen(false);
    btn.current?.focus({ preventScroll: true });
    if (o.value !== cur) onChange({ target: { value: o.value }, currentTarget: { value: o.value } });
  };

  const step = (d: 1 | -1) => {
    let i = active;
    for (let n = 0; n < flat.length; n++) {
      i = (i + d + flat.length) % flat.length;
      if (!flat[i].disabled) break;
    }
    setActive(i);
  };

  const onKey = (e: RKeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(flat.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (flat[active]) pick(flat[active]); }
    else if (e.key === 'Tab') setOpen(false);
  };

  let idx = -1;
  return (
    <>
      <button
        ref={btn}
        type="button"
        id={id}
        className={'gsel' + (className ? ' ' + className : '') + (open ? ' open' : '')}
        disabled={disabled}
        title={title}
        aria-label={rest['aria-label']}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? uid : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
      >
        <span className="gsel-val" {...(sel?.notr ? { 'data-notr': '' } : {})}>{sel ? sel.label : ''}</span>
        <svg className="gsel-chev" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && pos && createPortal(
        <div
          ref={menu}
          id={uid}
          role="listbox"
          className="gsel-menu glass-pop"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: Math.max(120, pos.maxH) }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {groups.map((g, gi) => (
            <div key={gi} role="group" aria-label={g.label}>
              {g.label && <div className="gsel-group">{g.label}</div>}
              {g.opts.map((o) => {
                idx++;
                const i = idx;
                const on = o.value === cur;
                return (
                  <div
                    key={o.value + '|' + i}
                    role="option"
                    aria-selected={on}
                    aria-disabled={o.disabled || undefined}
                    data-active={i === active ? '1' : undefined}
                    className={'gsel-opt' + (on ? ' on' : '') + (i === active ? ' act' : '') + (o.disabled ? ' dis' : '')}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => pick(o)}
                  >
                    <span className="gsel-opt-t" {...(o.notr ? { 'data-notr': '' } : {})}>{o.label}</span>
                    {on && <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
