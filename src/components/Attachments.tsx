import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useData } from '../lib/data';
import type { Attachment } from '../lib/types';
import { imgbbReady, uploadToImgBB } from '../lib/imgbb';
import { addDays, errorText, fmtClock, fmtDate, todayKey } from '../lib/utils';
import { ConfirmButton, Seg, Sheet, Stop, useToast } from './ui';
import { ChatSheet, useUnread } from './Chat';

type Kind = Attachment['kind'];
const LABEL: Record<Kind, { one: string; many: string }> = {
  script: { one: 'Script', many: 'Scripts' },
  thumbnail: { one: 'Thumbnail', many: 'Thumbnails' }
};

export function dayLabel(day: string): string {
  const t = todayKey();
  if (day === t) return 'Aaj · ' + fmtDate(day);
  if (day === addDays(t, -1)) return 'Kal · ' + fmtDate(day);
  return new Date(day + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const IconScript = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h5" /></svg>
);
const IconThumb = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-8 8" /></svg>
);
const IconChat = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
);

type Open = { kind: 'script' | 'thumbnail'; focus?: string; tab?: 'today' | 'history' } | { kind: 'chat' } | null;

/**
 * Har channel card ke andar: Scripts / Thumbnails / Messages ke buttons.
 * showToday = aaj ki scripts ke titles aur thumbnails bhi card par dikhao.
 */
export function ChannelTools({ channelId, showToday = true, compact }: { channelId: string; showToday?: boolean; compact?: boolean }) {
  const d = useData();
  const [open, setOpen] = useState<Open>(null);
  const today = todayKey();
  const all = d.attachments.filter((a) => a.channel_id === channelId);
  const scripts = all.filter((a) => a.kind === 'script' && a.day === today).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const thumbs = all.filter((a) => a.kind === 'thumbnail' && a.day === today).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const msgCount = d.messages.filter((m) => m.channel_id === channelId).length;
  const unread = useUnread(channelId);

  return (
    <Stop className={'tools' + (compact ? ' compact' : '')}>
      <div className="tools-btns">
        <button type="button" className="tbtn" onClick={() => setOpen({ kind: 'script' })} aria-label={`Scripts: aaj ${scripts.length}`}>
          <IconScript />
          <span>Scripts</span>
          <b className="num">{scripts.length}</b>
        </button>
        <button type="button" className="tbtn" onClick={() => setOpen({ kind: 'thumbnail' })} aria-label={`Thumbnails: aaj ${thumbs.length}`}>
          <IconThumb />
          <span className="lg">Thumbnails</span><span className="sm">Thumbs</span>
          <b className="num">{thumbs.length}</b>
        </button>
        <button type="button" className={'tbtn' + (unread ? ' hot' : '')} onClick={() => setOpen({ kind: 'chat' })} aria-label={`Messages${unread ? `: ${unread} naye` : ''}`}>
          <IconChat />
          <span className="lg">Messages</span><span className="sm">Chat</span>
          <b className="num">{unread ? unread : msgCount}</b>
          {unread > 0 && <i className="tdot" aria-hidden="true" />}
        </button>
      </div>
      {showToday && (scripts.length > 0 || thumbs.length > 0) && (
        <div className="today-att">
          {scripts.map((a) => (
            <button type="button" key={a.id} className="ta-script" onClick={() => setOpen({ kind: 'script', focus: a.id })}>
              <IconScript />
              <span className="ta-t">{a.title}</span>
              <small>{fmtClock(a.created_at)}</small>
            </button>
          ))}
          {thumbs.length > 0 && (
            <div className="ta-thumbs">
              {thumbs.map((a) => (
                <button type="button" key={a.id} className="ta-thumb" onClick={() => setOpen({ kind: 'thumbnail', focus: a.id })} title={a.title}>
                  <img src={a.url} alt={a.title} loading="lazy" />
                  <span>{a.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {showToday && (
        <div className="hist-row">
          <button type="button" className="hist-btn" onClick={() => setOpen({ kind: 'script', tab: 'history' })}>
            <IconScript /> Scripts history <b className="num">{all.filter((a) => a.kind === 'script' && a.day !== today).length}</b>
          </button>
          <button type="button" className="hist-btn" onClick={() => setOpen({ kind: 'thumbnail', tab: 'history' })}>
            <IconThumb /> Thumbnails history <b className="num">{all.filter((a) => a.kind === 'thumbnail' && a.day !== today).length}</b>
          </button>
        </div>
      )}
      {open && open.kind !== 'chat' && <AttachSheet channelId={channelId} initial={open.kind} focus={open.focus} initialTab={open.tab} onClose={() => setOpen(null)} />}
      {open?.kind === 'chat' && <ChatSheet channelId={channelId} onClose={() => setOpen(null)} />}
    </Stop>
  );
}

/** Ek channel ki saari scripts / thumbnails: aaj add karein, kisi par tap kar ke parhein/dekhein, aur poori history date ke saath */
export function AttachSheet({ channelId, initial, focus, taskId, initialTab, onClose }: { channelId: string; initial: Kind; focus?: string; taskId?: string; initialTab?: 'today' | 'history'; onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>(initial);
  const [mode, setMode] = useState<'link' | 'write'>('link');
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<string | null>(focus || null);
  const [tab, setTab] = useState<'today' | 'history'>(initialTab || 'today');
  const [adding, setAdding] = useState(!focus);
  const fileRef = useRef<HTMLInputElement>(null);

  const ch = d.channels.find((c) => c.id === channelId);
  const today = todayKey();
  const canAttach = d.isOwner || d.rolesOf(channelId).length > 0;
  const myTodayTask = taskId ? d.tasks.find((t) => t.id === taskId) : d.tasks.find((t) => t.channel_id === channelId && t.user_id === d.uid && t.day === today);
  const items = d.attachments.filter((a) => a.channel_id === channelId && a.kind === kind).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const days = [...new Set(items.map((a) => a.day))].sort((a, b) => b.localeCompare(a));
  const todayCount = items.filter((a) => a.day === today).length;
  const pv = view ? d.attachments.find((a) => a.id === view) : null;
  useEffect(() => {
    if (pv && pv.day !== today) setTab('history');
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  const canDelete = (a: Attachment) => d.isOwner || a.created_by === d.uid;

  async function add(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    setBusy(true);
    try {
      if (kind === 'script') {
        if (!t) throw new Error('Script ka title likhein');
        const u = mode === 'link' ? link.trim() : '';
        const body = mode === 'write' ? text.trim() : '';
        if (mode === 'link' && !/^https?:\/\//i.test(u)) throw new Error('Link https:// se shuru hona chahiye (Google Docs / Drive ka link copy karein).');
        if (mode === 'write' && !body) throw new Error('Script likhein');
        await d.addAttachment({ channel_id: channelId, task_id: myTodayTask?.id || null, kind, title: t, url: u, body });
        toast('Script add ho gayi');
      } else {
        if (!file && !/^https:\/\//i.test(link.trim())) throw new Error('Thumbnail ki image chunein (ya https image link daalein)');
        if (!t) throw new Error('Thumbnail ka title likhein (jaise: EP 087 thumbnail)');
        let url = link.trim();
        let del = '';
        const name = t;
        if (file) {
          const r = await uploadToImgBB(file, `${ch?.name || 'khr'}-${today}-${name}`);
          url = r.url;
          del = r.deleteUrl;
        }
        await d.addAttachment({ channel_id: channelId, task_id: myTodayTask?.id || null, kind, title: name, url, delete_url: del });
        toast('Thumbnail add ho gaya');
        setFile(null);
        if (fileRef.current) fileRef.current.value = '';
      }
      setTitle('');
      setLink('');
      setText('');
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={(ch?.name || 'Channel') + ' · ' + LABEL[kind].many} onClose={onClose}>
      <Seg
        label="Qism"
        value={kind}
        onChange={(k) => {
          setKind(k);
          setView(null);
        }}
        options={[
          { v: 'script', label: 'Scripts' },
          { v: 'thumbnail', label: 'Thumbnails' }
        ]}
      />

      {pv && pv.kind === kind && (
        <article className="viewer">
          <div className="row between top">
            <div className="grow">
              <span className="eyebrow">{dayLabel(pv.day)} · {fmtClock(pv.created_at)}</span>
              <h3 className="viewer-t">{pv.title}</h3>
              <span className="muted tiny">{d.nameOf(pv.created_by)} ne lagaya</span>
            </div>
            <button className="x" onClick={() => setView(null)} aria-label="Band karein">×</button>
          </div>
          {pv.kind === 'thumbnail' ? (
            <a href={pv.url} target="_blank" rel="noopener noreferrer" className="viewer-img">
              <img src={pv.url} alt={pv.title} />
            </a>
          ) : (
            <>
              {pv.body && <div className="script-body">{pv.body}</div>}
              {pv.url && (
                <div className="script-link">
                  <span className="mono-url">{pv.url.replace(/^https?:\/\//, '')}</span>
                  <a className="btn primary sm" href={pv.url} target="_blank" rel="noopener noreferrer">Script kholein ↗</a>
                </div>
              )}
            </>
          )}
          <div className="row">
            {pv.url && (
              <button
                className="btn sm"
                onClick={() =>
                  navigator.clipboard?.writeText(pv.url).then(
                    () => toast('Link copy ho gaya'),
                    () => toast('Copy nahi hua, link par lamba daba kar copy karein')
                  )
                }
              >
                Link copy karein
              </button>
            )}
            {canDelete(pv) && (
              <ConfirmButton
                className="btn sm danger"
                label="Hatayein"
                confirmLabel="Pakka?"
                onConfirm={() => d.deleteAttachment(pv.id).then(() => { setView(null); toast('Hata diya'); }, (e) => toast(errorText(e)))}
              />
            )}
          </div>
        </article>
      )}

      {canAttach ? (
        adding ? (
          <form className="form att" onSubmit={add}>
            <div className="row between">
              <h3>Aaj ki nayi {LABEL[kind].one.toLowerCase()}</h3>
              {items.length > 0 && <button type="button" className="linkbtn" onClick={() => setAdding(false)}>Chhupayein</button>}
            </div>
            <label className="f">
              Title
              <input id="at-title" type="text" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'script' ? 'e.g. EP 087 | California Wildfire' : 'e.g. EP 087 thumbnail'} required />
            </label>
            {kind === 'script' ? (
              <>
                <div className="seg sm">
                  <button type="button" className={mode === 'link' ? 'on' : ''} onClick={() => setMode('link')}>Link daalein</button>
                  <button type="button" className={mode === 'write' ? 'on' : ''} onClick={() => setMode('write')}>Yahin likhein</button>
                </div>
                {mode === 'link' ? (
                  <label className="f">
                    Script ka link
                    <input id="at-link" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/…" />
                  </label>
                ) : (
                  <label className="f">
                    Script
                    <textarea id="at-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Hook…\n\nIntro…\n\nMain points…\n\nOutro / CTA…'} />
                    <span className="h num">{text.trim() ? text.trim().split(/\s+/).length : 0} words</span>
                  </label>
                )}
              </>
            ) : (
              <div className="f">
                Image
                <input ref={fileRef} id="at-file" type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <div className="row">
                  <button type="button" className="btn sm" onClick={() => fileRef.current?.click()} disabled={busy || !imgbbReady}>
                    {file ? 'Doosri image chunein' : 'Phone / PC se image chunein'}
                  </button>
                  <span className="muted small">{file ? file.name : ''}</span>
                </div>
                {!file && (
                  <input id="at-imglink" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="ya image ka https link paste karein" />
                )}
              </div>
            )}
            <button className="btn primary block" type="submit" disabled={busy}>
              {busy ? (kind === 'thumbnail' && file ? 'ImgBB par upload ho raha hai…' : 'Save ho raha hai…') : kind === 'script' ? '+ Script add karein' : '+ Thumbnail add karein'}
            </button>
          </form>
        ) : (
          <button className="btn primary block" onClick={() => setAdding(true)}>
            + Nayi {LABEL[kind].one.toLowerCase()} add karein
          </button>
        )
      ) : (
        <p className="note">Scripts aur thumbnails sirf is channel ki team add kar sakti hai.</p>
      )}

      <div className="seg sm">
        <button type="button" className={tab === 'today' ? 'on' : ''} onClick={() => setTab('today')}>Aaj ({todayCount})</button>
        <button type="button" className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>History ({items.length - todayCount})</button>
      </div>
      <section className="sec">
        {tab === 'today' && !todayCount && <div className="empty">Aaj abhi koi {LABEL[kind].one.toLowerCase()} nahi lagayi gayi.</div>}
        {tab === 'history' && items.length === todayCount && <div className="empty">Pichle dinon ki koi {LABEL[kind].one.toLowerCase()} nahi. Kal se aaj wali yahan aa jayengi.</div>}
        {days.filter((day) => (tab === 'today' ? day === today : day !== today)).map((day) => {
          const list = items.filter((a) => a.day === day);
          return (
            <div key={day} className="aday">
              <div className="aday-h">
                <span>{dayLabel(day)}</span>
                <span className="muted num">{list.length} {list.length === 1 ? LABEL[kind].one.toLowerCase() : LABEL[kind].many.toLowerCase()}</span>
              </div>
              {kind === 'script' ? (
                <div className="list">
                  {list.map((a) => (
                    <button className={'li' + (view === a.id ? ' sel' : '')} key={a.id} onClick={() => setView(a.id)}>
                      <span className="aicon"><IconScript /></span>
                      <span className="grow">
                        <span className="t block">{a.title}</span>
                        <span className="d block">
                          {fmtClock(a.created_at)} · {d.nameOf(a.created_by)} · {a.body ? `${a.body.trim().split(/\s+/).length} words` : a.url.replace(/^https?:\/\//, '').slice(0, 32)}
                        </span>
                      </span>
                      <span className="muted">›</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="tgrid">
                  {list.map((a) => (
                    <button className={'tcell' + (view === a.id ? ' sel' : '')} key={a.id} onClick={() => setView(a.id)}>
                      <span className="tcell-img"><img src={a.url} alt={a.title} loading="lazy" /></span>
                      <b className="tcell-t">{a.title}</b>
                      <span className="muted tiny">{fmtClock(a.created_at)} · {d.nameOf(a.created_by)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </Sheet>
  );
}
