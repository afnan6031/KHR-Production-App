import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
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
function Inline({ text }: { text: string }) {
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
export function RichText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((ln, i) => {
        const h = ln.match(/^(#{1,3})\s+(.*)$/);
        if (h) return <div key={i} className={'md-h' + h[1].length}><Inline text={h[2]} /></div>;
        if (/^>\s?/.test(ln)) return <div key={i} className="md-quote"><Inline text={ln.replace(/^>\s?/, '')} /></div>;
        if (/^[-•]\s+/.test(ln)) return <div key={i} className="md-li">• <Inline text={ln.replace(/^[-•]\s+/, '')} /></div>;
        return <div key={i} className="md-p">{ln ? <Inline text={ln} /> : <br />}</div>;
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
}

/** Discord jaisi message list: photo, naam (role ke rang mein), waqt, text, image, reply */
export function MessageFeed({ items, byId, onReply, canDelete, onDelete, onOpenUser, onImage, empty, showRead, kind, canPin, onForward }: {
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
}) {
  const d = useData();
  const toast = useToast();
  const [sel, setSel] = useState<string | null>(null);
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
    out.push(
      <div
        key={m.id}
        id={'m-' + m.id}
        className={'fmsg' + (grouped ? ' grouped' : '') + (sel === m.id ? ' sel' : '') + (m.pinned_at ? ' pinned' : '')}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a,button,textarea,input,img')) return;
          setSel((x) => (x === m.id ? null : m.id));
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
                maxLength={4000}
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
                <RichText text={m.body} />
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
          <div className="fmsg-actions" role="toolbar" aria-label="Message options">
            {onReply && <button className="act" onClick={() => { onReply(m); setSel(null); }} title="Reply">↩ Reply</button>}
            {m.body && <button className="act" onClick={() => { copy(m); setSel(null); }} title="Copy text">⧉ Copy</button>}
            {kind && m.user_id === d.uid && m.body !== undefined && (
              <button className="act" onClick={() => { setEditing({ id: m.id, text: m.body }); setSel(null); }} title="Edit">✎ Edit</button>
            )}
            {onForward && <button className="act" onClick={() => { onForward(m); setSel(null); }} title="Forward">↪ Forward</button>}
            {kind && canPin && (
              <button
                className="act"
                title={m.pinned_at ? 'Unpin' : 'Pin'}
                onClick={() => { d.pinChat(kind, m.id, !m.pinned_at).then(() => toast(m.pinned_at ? 'Unpin ho gaya' : '📌 Pin ho gaya'), (e) => toast(errorText(e))); setSel(null); }}
              >
                📌 {m.pinned_at ? 'Unpin' : 'Pin'}
              </button>
            )}
            {canDelete?.(m) && onDelete && (
              <ConfirmButton className="act danger" label="🗑 Delete" confirmLabel="Pakka?" onConfirm={() => onDelete(m).catch((e) => toast(errorText(e)))} />
            )}
          </div>
          {showRead && m.user_id === d.uid && <span className="fmsg-read muted">{m.read_at ? 'Parh liya' : 'Bheja'}</span>}
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
  const [emoji, setEmoji] = useState(false);
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
      {vid.uploading && vid.file && vid.prog && <UploadBar file={vid.file} prog={vid.prog} onCancel={vid.cancel} />}
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
