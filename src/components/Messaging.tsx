import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useData } from '../lib/data';
import { imgbbReady, uploadToImgBB } from '../lib/imgbb';
import { APP_TZ, errorText, fmtClock } from '../lib/utils';
import { Avatar, ConfirmButton, useBackHandler, useToast } from './ui';
import { dayLabel } from './Attachments';

/* ---------- Server roles ka rang ---------- */
const ROLE_TONES = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
export function roleTone(role: string, isOwner?: boolean): string {
  if (isOwner) return 'gold';
  if (!role) return '';
  let h = 0;
  for (const c of role.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ROLE_TONES[h % ROLE_TONES.length];
}

/** Profile photo + online dot, kisi bhi user id ke liye */
export function UserAvatar({ id, status = false }: { id: string | null | undefined; status?: boolean }) {
  const d = useData();
  const p = d.profileOf(id);
  return <Avatar name={p?.full_name || 'Member'} url={p?.avatar_url || undefined} online={status ? !!id && d.online.has(id) : undefined} />;
}

/* ---------- links clickable ---------- */
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
export function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="msg-link">
            {p.replace(/^https?:\/\//, '').slice(0, 70)}
            {p.replace(/^https?:\/\//, '').length > 70 ? '…' : ''}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        )
      )}
    </>
  );
}

export interface FeedItem {
  id: string;
  user_id: string | null;
  body: string;
  image_url?: string;
  reply_to?: string | null;
  created_at: string;
  read_at?: string | null;
}

/** Discord jaisi message list: photo, naam (role ke rang mein), waqt, text, image, reply */
export function MessageFeed({ items, byId, onReply, canDelete, onDelete, onOpenUser, onImage, empty, showRead }: {
  items: FeedItem[];
  byId?: Map<string, FeedItem>;
  onReply?: (m: FeedItem) => void;
  canDelete?: (m: FeedItem) => boolean;
  onDelete?: (m: FeedItem) => Promise<void>;
  onOpenUser?: (id: string) => void;
  onImage?: (url: string) => void;
  empty: ReactNode;
  showRead?: boolean;
}) {
  const d = useData();
  const toast = useToast();
  const endRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items.length]);
  // keyboard khulne par list chhoti ho to aakhri message nazar mein rahe (har frame par, smooth)
  useEffect(() => {
    const el = feedRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const onScroll = () => { atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; };
    const ro = new ResizeObserver(() => { if (atBottom.current) el.scrollTop = el.scrollHeight; });
    el.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(el);
    return () => { ro.disconnect(); el.removeEventListener('scroll', onScroll); };
  }, [items.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!items.length) return <div className="feed" ref={feedRef}><div className="empty">{empty}</div></div>;

  let lastDay = '';
  const out: ReactNode[] = [];
  items.forEach((m, i) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(new Date(m.created_at));
    const newDay = day !== lastDay;
    if (newDay) {
      out.push(<div key={'d' + day} className="feed-day"><span>{dayLabel(day)}</span></div>);
      lastDay = day;
    }
    const prev = items[i - 1];
    const grouped = !newDay && !!prev && prev.user_id === m.user_id && !m.reply_to && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60000;
    const p = d.profileOf(m.user_id);
    const parent = m.reply_to && byId ? byId.get(m.reply_to) : null;
    out.push(
      <div key={m.id} className={'fmsg' + (grouped ? ' grouped' : '')}>
        <div className="fmsg-av">
          {!grouped && (
            <button className="avbtn" onClick={() => m.user_id && onOpenUser?.(m.user_id)} aria-label={'Profile: ' + (p?.full_name || '')}>
              <UserAvatar id={m.user_id} />
            </button>
          )}
          {grouped && <span className="fmsg-time-side">{fmtClock(m.created_at).replace(/ (AM|PM)/, '')}</span>}
        </div>
        <div className="fmsg-main">
          {parent && (
            <div className="fmsg-quote">
              ↱ <b>{d.nameOf(parent.user_id)}</b> <span>{parent.body ? parent.body.slice(0, 100) : 'Image'}</span>
            </div>
          )}
          {!grouped && (
            <div className="fmsg-head">
              <button className={'fmsg-name ' + roleTone(p?.server_role || '', p?.is_owner)} onClick={() => m.user_id && onOpenUser?.(m.user_id)}>
                {p?.full_name || 'Member'}
              </button>
              {p?.server_role && <span className={'rtag ' + roleTone(p.server_role, p.is_owner)}>{p.server_role}</span>}
              <span className="fmsg-time">{fmtClock(m.created_at)}</span>
            </div>
          )}
          {m.body && <div className="fmsg-body"><Linkify text={m.body} /></div>}
          {m.image_url && (
            <button className="fmsg-img" onClick={() => onImage?.(m.image_url!)} aria-label="Image bari dekhein">
              <img src={m.image_url} alt="Bheji gayi image" loading="lazy" />
            </button>
          )}
          <div className="fmsg-actions">
            {onReply && <button className="linkbtn" onClick={() => onReply(m)}>Reply</button>}
            {canDelete?.(m) && onDelete && (
              <ConfirmButton className="linkbtn" label="Delete" confirmLabel="Pakka?" onConfirm={() => onDelete(m).catch((e) => toast(errorText(e)))} />
            )}
            {showRead && m.user_id === d.uid && <span className="muted">{m.read_at ? 'Parh liya' : 'Bheja'}</span>}
          </div>
        </div>
      </div>
    );
  });
  return (
    <div className="feed" ref={feedRef}>
      {out}
      <div ref={endRef} />
    </div>
  );
}

/** Message likhne ki jagah: text + image (ImgBB) + reply */
export function Composer({ placeholder, disabledNote, replyTo, onCancelReply, onSend }: {
  placeholder: string;
  disabledNote?: string;
  replyTo?: FeedItem | null;
  onCancelReply?: () => void;
  onSend: (body: string, imageUrl: string) => Promise<void>;
}) {
  const d = useData();
  const toast = useToast();
  const [text, setText] = useState('');
  const [img, setImg] = useState<{ url: string; name: string } | null>(null);
  const [busy, setBusy] = useState<'' | 'img' | 'send'>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  if (disabledNote) return <div className="composer locked-note">🔒 {disabledNote}</div>;

  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy('img');
    try {
      const r = await uploadToImgBB(f, 'khr-' + Date.now());
      setImg({ url: r.url, name: f.name });
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function send() {
    const body = text.trim();
    if (!body && !img) return;
    setBusy('send');
    try {
      await onSend(body, img?.url || '');
      setText('');
      setImg(null);
      inputRef.current?.focus();
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy('');
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="composer">
      {replyTo && (
        <div className="reply-bar">
          <span>
            <b>{d.nameOf(replyTo.user_id)}</b> ko reply: {replyTo.body ? replyTo.body.slice(0, 80) : 'Image'}
          </span>
          <button className="x" onClick={onCancelReply} aria-label="Reply hatayein">×</button>
        </div>
      )}
      {img && (
        <div className="img-pending">
          <img src={img.url} alt="" />
          <span className="small">{img.name}</span>
          <button className="x" onClick={() => setImg(null)} aria-label="Image hatayein">×</button>
        </div>
      )}
      <div className="composer-row">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <button className="attach" onClick={() => fileRef.current?.click()} disabled={busy !== '' || !imgbbReady} aria-label="Image lagayein" title="Image lagayein">
          {busy === 'img' ? <span className="spin" aria-hidden="true" /> : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-8 8" /></svg>
          )}
        </button>
        <textarea
          ref={inputRef}
          rows={Math.min(5, Math.max(1, text.split('\n').length))}
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <button className="btn primary" onClick={send} disabled={busy !== '' || (!text.trim() && !img)}>
          Bhejein
        </button>
      </div>
    </div>
  );
}

/** Image bari dekhne ke liye */
export function ImageViewer({ url, onClose }: { url: string; onClose: () => void }) {
  useBackHandler(true, onClose);
  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-label="Image">
      <img src={url} alt="" onClick={(e) => e.stopPropagation()} />
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <a className="btn sm" href={url} target="_blank" rel="noopener noreferrer">Original kholein ↗</a>
        <button className="btn sm" onClick={onClose}>Band karein</button>
      </div>
    </div>
  );
}
