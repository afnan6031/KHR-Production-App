import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { VideoCard, videoLinksIn } from './VideoUpload';
import { UserAvatar } from './Messaging';
import { useData } from '../lib/data';
import type { Message } from '../lib/types';
import { dayLabel, errorText, fmtClock } from '../lib/utils';

import { ConfirmButton, Sheet, useToast } from './ui';

/* ---------- "kitne naye message" (har device par alag yaad rehta hai) ---------- */
const SEEN_EVENT = 'khr-seen';
const seenKey = (ch: string) => 'khr-seen-' + ch;
function getSeen(ch: string): string {
  try {
    return localStorage.getItem(seenKey(ch)) || '';
  } catch {
    return '';
  }
}
function markSeen(ch: string) {
  try {
    localStorage.setItem(seenKey(ch), new Date().toISOString());
  } catch {
    /* storage band ho to badge bas nahi hatega */
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

export function useUnread(channelId: string): number {
  const d = useData();
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((x) => x + 1);
    window.addEventListener(SEEN_EVENT, f);
    return () => window.removeEventListener(SEEN_EVENT, f);
  }, []);
  const seen = getSeen(channelId);
  return d.messages.filter((m) => m.channel_id === channelId && m.user_id !== d.uid && m.created_at > seen).length;
}

/* ---------- links clickable ---------- */
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="msg-link">
            {p.replace(/^https?:\/\//, '').slice(0, 60)}
            {p.replace(/^https?:\/\//, '').length > 60 ? '…' : ''}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        )
      )}
    </>
  );
}

/** Channel ki baat-cheet: message, reply, links */
export function ChatSheet({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ch = d.channels.find((c) => c.id === channelId);
  const canWrite = d.isOwner || d.rolesOf(channelId).length > 0;

  const msgs = useMemo(
    () => d.messages.filter((m) => m.channel_id === channelId).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-300),
    [d.messages, channelId]
  );
  const byId = useMemo(() => new Map(d.messages.map((m) => [m.id, m])), [d.messages]);
  const team = d.channel_members.filter((m) => m.channel_id === channelId && m.roles.length);

  // naya message aaye to neeche le jao aur "dekh liya" mark karo
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
    markSeen(channelId);
  }, [msgs.length, channelId]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await d.sendMessage(channelId, body, replyTo?.id || null);
      setText('');
      setReplyTo(null);
      inputRef.current?.focus();
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // PC par Enter = bhejein, Shift+Enter = nayi line
    if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
      e.preventDefault();
      send();
    }
  }

  let lastDay = '';
  const items: ReactNode[] = [];
  msgs.forEach((m, i) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(m.created_at));
    if (day !== lastDay) {
      items.push(<div key={'d' + day} className="msg-day"><span>{dayLabel(day)}</span></div>);
      lastDay = day;
    }
    const mine = m.user_id === d.uid;
    const prev = msgs[i - 1];
    const grouped = prev && prev.user_id === m.user_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60000 && !m.reply_to;
    const parent = m.reply_to ? byId.get(m.reply_to) : null;
    const name = d.nameOf(m.user_id);
    items.push(
      <div key={m.id} className={'msg' + (mine ? ' mine' : '') + (grouped ? ' grouped' : '')}>
        {!mine && !grouped && <UserAvatar id={m.user_id} />}
        <div className="bubble">
          {!grouped && !mine && <b className="msg-name">{name}</b>}
          {parent && (
            <div className="msg-quote">
              <b>{d.nameOf(parent.user_id)}</b>
              <span>{parent.body.slice(0, 120)}</span>
            </div>
          )}
          <div className="msg-body"><Linkify text={m.body} /></div>
          {videoLinksIn(m.body).map((u) => <VideoCard key={u} url={u} compact />)}
          <div className="msg-meta">
            <span>{fmtClock(m.created_at)}</span>
            {canWrite && (
              <button className="linkbtn" onClick={() => { setReplyTo(m); inputRef.current?.focus(); }}>Reply</button>
            )}
            {(mine || d.isOwner) && (
              <ConfirmButton className="linkbtn" label="Delete" confirmLabel="Pakka?" onConfirm={() => d.deleteMessage(m.id).catch((e) => toast(errorText(e)))} />
            )}
          </div>
        </div>
      </div>
    );
  });

  return (
    <Sheet title={(ch?.name || 'Channel') + ' · Messages'} onClose={onClose}>
      <div className="chat-team muted tiny">
        {team.length ? team.map((m) => d.nameOf(m.user_id)).join(', ') : 'Abhi team add nahi'}
        {' · '}sirf is channel ki team aur owner ye messages dekh sakte hain
      </div>
      <div className="chat">
        {msgs.length ? items : <div className="empty"><b>Abhi koi message nahi</b>Pehla message likhein: kaam ki update, sawal, ya koi link.</div>}
        <div ref={endRef} />
      </div>
      {canWrite ? (
        <div className="composer">
          {replyTo && (
            <div className="reply-bar">
              <span>
                <b>{d.nameOf(replyTo.user_id)}</b> ko reply: {replyTo.body.slice(0, 80)}
              </span>
              <button className="x" onClick={() => setReplyTo(null)} aria-label="Reply hatayein">×</button>
            </div>
          )}
          <div className="composer-row">
            <textarea
              ref={inputRef}
              id="chat-input"
              rows={Math.min(5, Math.max(1, text.split('\n').length))}
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              placeholder="Message ya link likhein…"
            />
            <button className="btn primary" onClick={send} disabled={busy || !text.trim()} aria-label="Bhejein">
              Bhejein
            </button>
          </div>
        </div>
      ) : (
        <p className="note">Sirf is channel ki team message bhej sakti hai.</p>
      )}
    </Sheet>
  );
}
