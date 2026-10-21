import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type React from 'react';
import { useData } from '../lib/data';
import { imgbbReady, uploadToImgBB } from '../lib/imgbb';
import { APP_TZ, dayLabel, errorText, fmtClock } from '../lib/utils';
import { Avatar, ConfirmButton, useBackHandler, useToast } from './ui';
import { UploadBar, VideoCard, useVideoUpload, videoLinksIn } from './VideoUpload';


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

/* ---------- v9: Discord jaisa likhna: # bara heading, **bold**, *italic*, ~~kata~~, `code`, > quote ---------- */
const INLINE_RE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\*[^*\n]+\*|https?:\/\/[^\s<>"']+)/g;
const escRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** @naam / @everyone dhoondne wala pattern (lambe naam pehle) */
export function mentionRe(names: string[]): RegExp | null {
  const list = [...new Set(names.filter((n) => n && n.trim()))].sort((a, b) => b.length - a.length).map(escRe);
  return new RegExp('(@(?:everyone|' + (list.length ? list.join('|') : '\\u0000') + '))(?![\\w])', 'gi');
}
function Inline({ text, mre }: { text: string; mre?: RegExp | null }) {
  if (mre) {
    const segs = text.split(mre);
    if (segs.length > 1)
      return <>{segs.map((p, i) => (i % 2 === 1 ? <span key={i} className="mention">{p}</span> : <InlineBase key={i} text={p} />))}</>;
  }
  return <InlineBase text={text} />;
}
function InlineBase({ text }: { text: string }) {
  const parts = text.split(INLINE_RE);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{p}</Fragment>;
        if (p.startsWith('**')) return <b key={i}>{p.slice(2, -2)}</b>;
        if (p.startsWith('__')) return <u key={i}>{p.slice(2, -2)}</u>;
        if (p.startsWith('~~')) return <s key={i}>{p.slice(2, -2)}</s>;
        if (p.startsWith('`')) return <code key={i} className="md-code">{p.slice(1, -1)}</code>;
        if (p.startsWith('*')) return <i key={i}>{p.slice(1, -1)}</i>;
        return <Linkify key={i} text={p} />;
      })}
    </>
  );
}
export function RichText({ text, mre }: { text: string; mre?: RegExp | null }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((ln, i) => {
        const h = ln.match(/^(#{1,3})\s+(.*)$/);
        if (h) return <div key={i} className={'md-h' + h[1].length}><Inline text={h[2]} mre={mre} /></div>;
        if (/^>\s?/.test(ln)) return <div key={i} className="md-quote"><Inline text={ln.replace(/^>\s?/, '')} mre={mre} /></div>;
        if (/^[-•]\s+/.test(ln)) return <div key={i} className="md-li">• <Inline text={ln.replace(/^[-•]\s+/, '')} mre={mre} /></div>;
        return <div key={i} className="md-p">{ln ? <Inline text={ln} mre={mre} /> : <br />}</div>;
      })}
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
  edited_at?: string | null;
  pinned_at?: string | null;
  fwd_from?: string | null;
  /** v10: internet ka intezar (🕓) / nahi gaya */
  pending?: boolean;
  failed?: string;
}

/** WhatsApp jaisa: 🕓 internet ka intezar, ya ⚠ nahi gaya + dobara */
export function SendState({ pending, failed }: { pending?: boolean; failed?: string }) {
  const d = useData();
  if (failed)
    return (
      <span className="send-state bad">
        ⚠ Nahi gaya <button className="linkbtn" onClick={() => d.retryPending()}>Dobara bhejein</button>
      </span>
    );
  if (pending) return <span className="send-state" title="Internet aate hi khud chala jayega">🕓 Internet ka intezar — aate hi chala jayega</span>;
  return null;
}

/* ---------- v15: likha hua message (draft) yaad rahe — tab badlein, app band karein, wapas wahin ---------- */
export const MSG_MAX = 2000;
const DRAFT_PREFIX = 'khr-draft-';
const draftMem = new Map<string, string>();
function readDraft(key?: string): string {
  if (!key) return '';
  if (draftMem.has(key)) return draftMem.get(key)!;
  try { return localStorage.getItem(DRAFT_PREFIX + key) || ''; } catch { return ''; }
}
function writeDraft(key: string | undefined, v: string) {
  if (!key) return;
  draftMem.set(key, v);
  try { if (v) localStorage.setItem(DRAFT_PREFIX + key, v); else localStorage.removeItem(DRAFT_PREFIX + key); } catch { /* storage band */ }
}
/** text + draft: har tabdeeli foran yaad (memory), storage mein thori der baad */
export function useDraft(key?: string): [string, (v: string) => void] {
  const [text, setTextState] = useState(() => readDraft(key));
  const timer = useRef(0);
  useEffect(() => { setTextState(readDraft(key)); }, [key]);
  const setText = (v: string) => {
    setTextState(v);
    if (!key) return;
    draftMem.set(key, v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => writeDraft(key, v), 400);
  };
  useEffect(() => () => { window.clearTimeout(timer.current); if (key) writeDraft(key, draftMem.get(key) || ''); }, [key]);
  return [text, setText];
}
/** Discord jaisa: likhte likhte box khud bara (screen ke aadhe tak), phir andar scroll */
export function useAutoGrow(ref: React.RefObject<HTMLTextAreaElement>, value: string, maxVh = 45) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = Math.max(120, Math.round(window.innerHeight * (maxVh / 100)));
    const h = Math.min(el.scrollHeight + 2, max);
    el.style.height = h + 'px';
    el.style.overflowY = el.scrollHeight + 2 > max ? 'auto' : 'hidden';
  }, [ref, value, maxVh]);
}
/** message ke ⋯ menu se composer mein kuch daalna (quote / mention) */
const INSERT_EVENT = 'khr-compose-insert';
export function composeInsert(key: string, text: string) {
  window.dispatchEvent(new CustomEvent(INSERT_EVENT, { detail: { key, text } }));
}

/** Discord jaisi message list: photo, naam (role ke rang mein), waqt, text, image, reply */
export function MessageFeed({ items, byId, onReply, canDelete, onDelete, onOpenUser, onImage, empty, showRead, kind, canPin, onForward, composeKey, onMarkUnread }: {
  items: FeedItem[];
  byId?: Map<string, FeedItem>;
  onReply?: (m: FeedItem) => void;
  canDelete?: (m: FeedItem) => boolean;
  onDelete?: (m: FeedItem) => Promise<void>;
  onOpenUser?: (id: string) => void;
  onImage?: (url: string) => void;
  empty: ReactNode;
  showRead?: boolean;
  /** v9: server channel / DM — edit, pin, forward, copy */
  kind?: 'srv' | 'dm';
  canPin?: boolean;
  onForward?: (m: FeedItem) => void;
  /** v15: is chat ka composer (quote / mention wahan jata hai) */
  composeKey?: string;
  onMarkUnread?: (m: FeedItem) => void;
}) {
  const d = useData();
  const toast = useToast();
  const [sel, setSelState] = useState<string | null>(null);
  const [menuUp, setMenuUp] = useState(false);
  const [menuMax, setMenuMax] = useState(480);
  const [info, setInfo] = useState<string | null>(null);
  /** ⋯ menu kholo — neeche jagah na ho to upar ki taraf */
  const setSel = (v: string | null | ((x: string | null) => string | null), anchor?: HTMLElement | null) => {
    if (anchor) {
      // v15: chat ki dikhne wali jagah (composer se upar) ke hisaab se — neeche jagah kam ho to menu upar khule
      const r = anchor.getBoundingClientRect();
      let box: HTMLElement | null = anchor.parentElement;
      while (box && box !== document.body) {
        const oy = getComputedStyle(box).overflowY;
        if (oy === 'auto' || oy === 'scroll') break;
        box = box.parentElement;
      }
      const b = box && box !== document.body ? box.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const below = b.bottom - r.bottom - 8;
      const above = r.top - b.top - 8;
      const up = below < 460 && above > below;
      setMenuUp(up);
      setMenuMax(Math.max(160, Math.floor(up ? above + r.height : below)));
    }
    setSelState(v);
  };
  useEffect(() => {
    if (!sel) return;
    const close = (e: Event) => {
      const el = e.target as HTMLElement;
      if (el.closest?.('.fmsg-actions') || el.closest?.('.fmsg-more')) return;
      setSelState(null);
    };
    const esc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setSelState(null);
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', esc); };
  }, [sel]);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const copy = (m: FeedItem) =>
    navigator.clipboard?.writeText(m.body || m.image_url || '').then(() => toast('Text copy ho gaya'), () => toast('Copy nahi hua'));
  const saveEdit = async () => {
    if (!editing || !kind) return;
    try {
      await d.editChat(kind, editing.id, editing.text);
      setEditing(null);
    } catch (e) {
      toast(errorText(e));
    }
  };
  const mre = useMemo(() => mentionRe(d.profiles.map((p) => p.full_name)), [d.profiles]);
  const myName = (d.me?.full_name || '').toLowerCase();
  const mentionsMe = (m: FeedItem) => {
    if (!m.body || m.user_id === d.uid) return false;
    const b = m.body.toLowerCase();
    return b.includes('@everyone') || (!!myName && b.includes('@' + myName));
  };
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
    const isEditing = editing?.id === m.id;
    const local = !!(m.pending || m.failed);
    out.push(
      <div
        key={m.id}
        id={'m-' + m.id}
        className={'fmsg' + (grouped ? ' grouped' : '') + (sel === m.id ? ' sel' : '') + (m.pinned_at ? ' pinned' : '') + (mentionsMe(m) ? ' mention-me' : '')}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest('a,textarea,input,img') || isEditing) return;
          e.preventDefault();
          setSel(m.id, e.currentTarget.querySelector('.fmsg-more') as HTMLElement);
        }}
      >
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
          {m.fwd_from && <div className="fmsg-fwd">↪ Forwarded · {d.nameOf(m.fwd_from)}</div>}
          {isEditing ? (
            <div className="fmsg-edit">
              <textarea
                autoFocus
                rows={Math.min(6, Math.max(2, editing.text.split('\n').length))}
                value={editing.text}
                maxLength={MSG_MAX}
                onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditing(null);
                  if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); saveEdit(); }
                }}
              />
              <div className="row">
                <button className="btn sm primary" onClick={saveEdit}>Save</button>
                <button className="btn sm" onClick={() => setEditing(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            m.body && (
              <div className="fmsg-body" data-notr>
                <RichText text={m.body} mre={mre} />
                {m.edited_at && <span className="fmsg-edited muted"> (edited)</span>}
              </div>
            )
          )}
          {!isEditing && m.body && videoLinksIn(m.body).map((u) => <VideoCard key={u} url={u} title={videoTitle(m.body, u)} compact />)}
          {m.image_url && (
            <button className="fmsg-img" onClick={() => onImage?.(m.image_url!)} aria-label="Image bari dekhein">
              <img src={m.image_url} alt="Bheji gayi image" loading="lazy" />
            </button>
          )}
          {m.pinned_at && <span className="fmsg-pin">📌 Pinned</span>}
          {local && <SendState pending={m.pending} failed={m.failed} />}
          <button type="button" className="fmsg-more" onClick={(e) => setSel((x) => (x === m.id ? null : m.id), e.currentTarget)} aria-label="Message options" aria-expanded={sel === m.id} title="Options">⋯</button>
          {sel === m.id && (
            <div className={'fmsg-actions' + (menuUp ? ' up' : '')} style={{ maxHeight: menuMax }} role="menu" aria-label="Message options">
              {onReply && !local && <button role="menuitem" className="act" onClick={() => { onReply(m); setSel(null); }}><i>↩</i>Reply</button>}
              {composeKey && !local && m.body && (
                <button role="menuitem" className="act" onClick={() => { composeInsert(composeKey, m.body.split('\n').map((l) => '> ' + l).join('\n') + '\n'); setSel(null); }}><i>❝</i>Quote</button>
              )}
              {composeKey && m.user_id && m.user_id !== d.uid && p?.full_name && (
                <button role="menuitem" className="act" onClick={() => { composeInsert(composeKey, '@' + p.full_name + ' '); setSel(null); }}><i>@</i>Mention</button>
              )}
              <div className="act-sep" />
              {m.body && <button role="menuitem" className="act" onClick={() => { copy(m); setSel(null); }}><i>⧉</i>Copy text</button>}
              {(() => {
                const ls = (m.body || '').match(/https?:\/\/[^\s<>"']+/g) || (m.image_url ? [m.image_url] : [] as string[]);
                return ls.length ? (
                  <button role="menuitem" className="act" onClick={() => { navigator.clipboard?.writeText(ls[0] || "").then(() => toast('Link copy ho gaya'), () => toast('Copy nahi hua')); setSel(null); }}><i>🔗</i>Copy link</button>
                ) : null;
              })()}
              {kind && !local && m.user_id === d.uid && m.body !== undefined && (
                <button role="menuitem" className="act" onClick={() => { setEditing({ id: m.id, text: m.body }); setSel(null); }}><i>✎</i>Edit</button>
              )}
              {onForward && !local && <button role="menuitem" className="act" onClick={() => { onForward(m); setSel(null); }}><i>↪</i>Forward</button>}
              {kind && canPin && !local && (
                <button
                  role="menuitem"
                  className="act"
                  onClick={() => { d.pinChat(kind, m.id, !m.pinned_at).then(() => toast(m.pinned_at ? 'Unpin ho gaya' : '📌 Pin ho gaya'), (e) => toast(errorText(e))); setSel(null); }}
                >
                  <i>📌</i>{m.pinned_at ? 'Unpin' : 'Pin'}
                </button>
              )}
              {onMarkUnread && !local && m.user_id !== d.uid && <button role="menuitem" className="act" onClick={() => { onMarkUnread(m); setSel(null); }}><i>●</i>Mark unread</button>}
              <button role="menuitem" className="act" onClick={() => { setInfo((x) => (x === m.id ? null : m.id)); setSel(null); }}><i>ℹ</i>Message info</button>
              {canDelete?.(m) && onDelete && (
                <>
                  <div className="act-sep" />
                  <ConfirmButton className="act danger" label="🗑 Delete" confirmLabel="Pakka delete?" onConfirm={() => onDelete(m).then(() => setSel(null)).catch((e) => toast(errorText(e)))} />
                </>
              )}
            </div>
          )}
          {info === m.id && (
            <div className="fmsg-info" data-notr>
              <span>Bheja: {new Date(m.created_at).toLocaleString('en-GB', { timeZone: APP_TZ, dateStyle: 'medium', timeStyle: 'short' })}</span>
              {m.edited_at && <span>Edit: {new Date(m.edited_at).toLocaleString('en-GB', { timeZone: APP_TZ, dateStyle: 'medium', timeStyle: 'short' })}</span>}
              {m.read_at && <span>Parha: {new Date(m.read_at).toLocaleString('en-GB', { timeZone: APP_TZ, dateStyle: 'medium', timeStyle: 'short' })}</span>}
              <span>{(m.body || '').length} characters</span>
              <button className="linkbtn" onClick={() => setInfo(null)}>Band</button>
            </div>
          )}
          {showRead && !local && m.user_id === d.uid && <span className="fmsg-read muted">{m.read_at ? 'Parh liya' : 'Bheja'}</span>}
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

/** message mein video ke link se pehle wali line ("🎬 naam") title ke taur par */
function videoTitle(body: string, url: string): string | undefined {
  const lines = body.split('\n');
  const i = lines.findIndex((l) => l.includes(url));
  const prev = i > 0 ? lines[i - 1].trim() : '';
  return prev.startsWith('🎬') ? prev.replace(/^🎬\s*/, '') : undefined;
}

/** Message likhne ki jagah: text + image (ImgBB) + video (Gofile) + reply */
export interface Mentionable { id: string; name: string; url?: string; sub?: string }
export function Composer({ placeholder, disabledNote, replyTo, onCancelReply, onSend, mentions, draftKey }: {
  /** v14: @ likhne par in logon ki list (+ @everyone) */
  mentions?: Mentionable[];
  /** v15: likha hua text yaad rakhne ki chaabi (har chat ki alag) */
  draftKey?: string;
  placeholder: string;
  disabledNote?: string;
  replyTo?: FeedItem | null;
  onCancelReply?: () => void;
  onSend: (body: string, imageUrl: string) => Promise<void>;
}) {
  const d = useData();
  const toast = useToast();
  const [text, setText] = useDraft(draftKey);
  const [img, setImg] = useState<{ url: string; name: string } | null>(null);
  const [busy, setBusy] = useState<'' | 'img' | 'send'>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [emoji, setEmoji] = useState(false);
  const [mq, setMq] = useState<{ q: string; at: number } | null>(null);
  const [mi, setMi] = useState(0);
  const mList = useMemo(() => {
    if (!mq || !mentions) return [] as Mentionable[];
    const q = mq.q.toLowerCase();
    const all: Mentionable[] = [{ id: 'everyone', name: 'everyone', sub: 'Sab ko mention' }, ...mentions];
    return all.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 8);
  }, [mq, mentions]);
  const checkMention = (val: string, caret: number) => {
    if (!mentions) return;
    const before = val.slice(0, caret);
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
    if (m) { setMq({ q: m[2], at: caret - m[2].length - 1 }); setMi(0); } else setMq(null);
  };
  const pickMention = (x: Mentionable) => {
    if (!mq) return;
    const el = inputRef.current;
    const caret = el?.selectionStart ?? text.length;
    const ins = '@' + x.name + ' ';
    const nt = text.slice(0, mq.at) + ins + text.slice(caret);
    setText(nt);
    setMq(null);
    const pos = mq.at + ins.length;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos, pos); });
  };
  const vid = useVideoUpload();
  const vidRef = useRef<HTMLInputElement>(null);
  async function pickVideo(f: File | undefined) {
    if (vidRef.current) vidRef.current.value = '';
    if (!f) return;
    try {
      const url = await vid.start(f);
      if (!url) return toast('Upload cancel ho gaya');
      const body = (text.trim() ? text.trim() + '\n' : '') + '🎬 ' + f.name + '\n' + url;
      await onSend(body, '');
      setText('');
      toast('🎬 Video bhej di');
    } catch (e) {
      toast(errorText(e));
    }
  }
  const insert = (e: string) => {
    const el = inputRef.current;
    const a = el?.selectionStart ?? text.length, b = el?.selectionEnd ?? text.length;
    const nt = text.slice(0, a) + e + text.slice(b);
    setText(nt);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + e.length, a + e.length); });
  };

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);
  useAutoGrow(inputRef, text);
  // ⋯ menu se quote / mention
  const textRef = useRef(text);
  textRef.current = text;
  useEffect(() => {
    if (!draftKey) return;
    const on = (e: Event) => {
      const det = (e as CustomEvent<{ key: string; text: string }>).detail;
      if (!det || det.key !== draftKey) return;
      const cur = textRef.current;
      const nt = det.text.startsWith('>') ? det.text + cur : (cur && !/\s$/.test(cur) ? cur + ' ' : cur) + det.text;
      setText(nt.slice(0, MSG_MAX));
      requestAnimationFrame(() => { const el = inputRef.current; el?.focus(); el?.setSelectionRange(nt.length, nt.length); });
    };
    window.addEventListener(INSERT_EVENT, on);
    return () => window.removeEventListener(INSERT_EVENT, on);
  }, [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (mq && mList.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMi((i) => (i + 1) % mList.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMi((i) => (i - 1 + mList.length) % mList.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mList[mi] || mList[0]); return; }
      if (e.key === 'Escape') { setMq(null); return; }
    }
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
      {vid.uploading && vid.file && vid.prog && <UploadBar file={vid.file} prog={vid.prog} onCancel={vid.cancel} />}
      {mq && mList.length > 0 && (
        <div className="mention-pop" role="listbox" aria-label="Mention karein">
          {mList.map((x, i) => (
            <button type="button" key={x.id} role="option" aria-selected={i === mi} className={i === mi ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pickMention(x); }}>
              {x.id === 'everyone' ? <span className="av">@</span> : <Avatar name={x.name} url={x.url} />}
              <b data-notr>@{x.name}</b>
              {x.sub && <small>{x.sub}</small>}
            </button>
          ))}
        </div>
      )}
      {emoji && <EmojiPicker onPick={insert} onClose={() => setEmoji(false)} />}
      <div className="composer-row">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <button className="attach" onClick={() => fileRef.current?.click()} disabled={busy !== '' || !imgbbReady} aria-label="Image lagayein" title="Image lagayein">
          {busy === 'img' ? <span className="spin" aria-hidden="true" /> : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-8 8" /></svg>
          )}
        </button>
        <input ref={vidRef} type="file" accept="video/*,.mp4,.mov,.mkv,.webm" hidden onChange={(e) => pickVideo(e.target.files?.[0])} />
        <button className="attach" type="button" onClick={() => vidRef.current?.click()} disabled={busy !== '' || vid.uploading} aria-label="Video bhejein" title="Video bhejein (Gofile, 2 GB tak)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>
        </button>
        <button className={'attach' + (emoji ? ' on' : '')} type="button" onClick={() => setEmoji((x) => !x)} aria-label="Emoji" title="Emoji">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><path d="M9 9.5h.01M15 9.5h.01" strokeWidth="3" strokeLinecap="round" /></svg>
        </button>
        <textarea
          ref={inputRef}
          rows={1}
          maxLength={MSG_MAX}
          value={text}
          onChange={(e) => { setText(e.target.value); checkMention(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
          onClick={(e) => checkMention(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
          onKeyDown={onKey}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <button className="btn primary" onClick={send} disabled={busy !== '' || (!text.trim() && !img)}>
          Bhejein
        </button>
      </div>
      {text.length > MSG_MAX - 400 && <div className={'char-count num' + (text.length >= MSG_MAX ? ' bad' : '')}>{text.length}/{MSG_MAX}</div>}
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

/* ---------- v9: Emoji ---------- */
const EMOJI: Record<string, string> = {
  'Chehre': '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😋 😛 😜 🤪 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤯 😳 🥵 🥶 😱 😨 😰 😥 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠',
  'Haath': '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐 🖖 👋 🤝 🙏 ✍️ 💪 👏 🙌 👐 🤲',
  'Dil': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝',
  'Kaam': '✅ ☑️ ✔️ ❌ ⚠️ ⏰ ⏳ ⌛ 📌 📍 📎 📝 📄 📃 📑 📊 📈 📉 🗂 📁 📂 🗓 📅 🎬 🎥 📹 🎞 📷 📸 🖼 🎨 🎙 🎧 🎵 🎶 💻 🖥 ⌨️ 🖱 📱 💡 🔥 ⭐ 🌟 ✨ 💯 🎯 🏆 🥇 🥈 🥉 🎉 🎊 🚀 💰 💸',
  'Aur': '☕ 🍵 🍕 🍔 🍟 🌮 🍰 🎂 🍫 🍿 🥤 🌙 ☀️ 🌧 ⚡ 🌈 🕌 🤲 🇵🇰 👀 🙈 🙉 🙊 💤 💬 🗨 💭'
};
export function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const [cat, setCat] = useState(Object.keys(EMOJI)[0]);
  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="emoji-pick" role="dialog" aria-label="Emoji" data-notr>
      <div className="emoji-cats">
        {Object.keys(EMOJI).map((c) => (
          <button key={c} type="button" className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>{EMOJI[c].split(' ')[0]} <span>{c}</span></button>
        ))}
        <button type="button" className="x" onClick={onClose} aria-label="Band karein">×</button>
      </div>
      <div className="emoji-grid">
        {EMOJI[cat].split(' ').map((e) => (
          <button key={e} type="button" onClick={() => onPick(e)} aria-label={e}>{e}</button>
        ))}
      </div>
    </div>
  );
}
