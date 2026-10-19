import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useData } from '../lib/data';
import { STAGES, type Stage, type Video } from '../lib/types';
import { imgbbReady, uploadToImgBB } from '../lib/imgbb';
import { dayLabel, errorText, fmtClock, fmtDate, stageLabel, todayKey } from '../lib/utils';
import { ConfirmButton, DateFilter, Fold, Sheet, Stop, useToast } from './ui';
import { ChatSheet, useUnread } from './Chat';
import { ImageViewer } from './Messaging';
import { VideoCard, VideoField } from './VideoUpload';

/* =========================================================================
   v9: VIDEOS — har video mein title, script (Google Doc link ya likhi hui),
   thumbnail (ImgBB) aur notes. Script Writer video bana kar script lagaye,
   baad mein Graphic Designer usi video ko edit kar ke thumbnail laga de.
   Purani scripts / thumbnails bhi yahin history mein hain.
   ========================================================================= */

export const IconVideo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-2.5v9L17 14" /></svg>
);
const IconChat = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
);
const IconHistory = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>
);

type Tab = 'today' | 'history';
type Open = { kind: 'videos'; tab?: Tab; focus?: string; create?: boolean } | { kind: 'chat' } | null;

/** video kis ne banayi — team se nikal bhi jaye to naam rahe */
export function useMaker() {
  const d = useData();
  return (v: Video, edit = false) => {
    const id = edit ? v.updated_by : v.created_by;
    const live = d.profileOf(id)?.full_name;
    return live || (edit ? v.updated_by_name : v.created_by_name) || d.nameOf(id);
  };
}

/** Channel card ke andar: Videos + Chat, aaj ki har video ka chhota card, aur purani videos ka button */
export function ChannelTools({ channelId, showToday = true, compact }: { channelId: string; showToday?: boolean; compact?: boolean }) {
  const d = useData();
  const [open, setOpen] = useState<Open>(null);
  const today = todayKey();
  const all = d.videos.filter((v) => v.channel_id === channelId);
  const todays = all.filter((v) => v.day === today).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const old = all.length - todays.length;
  const msgCount = d.messages.filter((m) => m.channel_id === channelId).length;
  const unread = useUnread(channelId);

  return (
    <Stop className={'tools' + (compact ? ' compact' : '')}>
      <div className="tools-btns two-btns">
        <button type="button" className="tbtn" onClick={() => setOpen({ kind: 'videos', tab: 'today' })} aria-label={`Videos: aaj ${todays.length}`}>
          <IconVideo />
          <span className="tlabel">Videos</span>
          <b className="num">{todays.length}</b>
        </button>
        <button type="button" className={'tbtn' + (unread ? ' hot' : '')} onClick={() => setOpen({ kind: 'chat' })} aria-label={`Messages${unread ? `: ${unread} naye` : ''}`}>
          <IconChat />
          <span className="tlabel"><span className="lg">Messages</span><span className="sm">Chat</span></span>
          <b className="num">{unread ? unread : msgCount}</b>
          {unread > 0 && <i className="tdot" aria-hidden="true" />}
        </button>
      </div>
      {showToday && todays.length > 0 && (
        <div className="mini-vids">
          {todays.slice(0, 4).map((v) => (
            <button type="button" key={v.id} className="mv" onClick={() => setOpen({ kind: 'videos', tab: 'today', focus: v.id })} title={v.title}>
              <span className="mv-img">{v.thumbnail_url ? <img src={v.thumbnail_url} alt="" loading="lazy" /> : <IconVideo />}</span>
              <span className="mv-body">
                <span className="mv-t" data-notr>{v.title}</span>
                <span className="mv-tags">
                  {v.script_url || v.script ? <i title="Script lagi hui">📄</i> : null}
                  {v.thumbnail_url ? <i title="Thumbnail">🖼</i> : null}
                  {v.video_url ? <i title="Video lagi hui">🎬</i> : null}
                </span>
              </span>
            </button>
          ))}
          {todays.length > 4 && (
            <button type="button" className="linkbtn tiny" onClick={() => setOpen({ kind: 'videos', tab: 'today' })}>+{todays.length - 4} aur</button>
          )}
        </div>
      )}
      {showToday && (
        <button type="button" className="hist-btn" onClick={() => setOpen({ kind: 'videos', tab: 'history' })}>
          <IconHistory /> Purani videos <b className="num">{old}</b>
        </button>
      )}
      {open?.kind === 'videos' && <VideosSheet channelId={channelId} initialTab={open.tab} focus={open.focus} create={open.create} onClose={() => setOpen(null)} />}
      {open?.kind === 'chat' && <ChatSheet channelId={channelId} onClose={() => setOpen(null)} />}
    </Stop>
  );
}

/** Ek video ka card: thumbnail, title, kis ne banayi, kya kya laga hai */
export function VideoTile({ v, onOpen, showDay }: { v: Video; onOpen: () => void; showDay?: boolean }) {
  const maker = useMaker();
  return (
    <button type="button" className="vtile" onClick={onOpen}>
      <span className="vtile-img">
        {v.thumbnail_url ? <img src={v.thumbnail_url} alt="" loading="lazy" /> : <span className="vtile-ph"><IconVideo /></span>}
        <span className={'stage ' + v.stage}>{stageLabel(v.stage)}</span>
      </span>
      <span className="vtile-body">
        <span className="vtile-t" data-notr>{v.title}</span>
        <span className="vtile-d">
          {showDay ? dayLabel(v.day) + ' · ' : ''}
          {fmtClock(v.created_at)}
        </span>
        <span className="vtile-by"><span>by</span> <b data-notr>{maker(v)}</b></span>
        <span className="vtile-tags">
          <i className={v.script_url || v.script ? 'on' : ''}>📄 <span>Script</span></i>
          <i className={v.thumbnail_url ? 'on' : ''}>🖼 <span>Thumbnail</span></i>
          <i className={v.video_url ? 'on' : ''}>🎬 <span>Video</span></i>
        </span>
      </span>
    </button>
  );
}

/** Videos dekhne ki jagah: Aaj ki videos / Purani videos (date, search, tarteeb, stage) */
export function VideoBrowser({ channelId, tab, setTab, onOpen, onCreate }: {
  channelId: string;
  tab: Tab;
  setTab: (t: Tab) => void;
  onOpen: (v: Video) => void;
  onCreate?: () => void;
}) {
  const d = useData();
  const today = todayKey();
  const [day, setDay] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'new' | 'old'>('new');
  const [stage, setStage] = useState<Stage | 'all'>('all');
  const all = useMemo(() => d.videos.filter((v) => v.channel_id === channelId), [d.videos, channelId]);
  const todays = all.filter((v) => v.day === today).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const olds = all.filter((v) => v.day !== today);
  const ql = q.trim().toLowerCase();
  const list = olds
    .filter((v) => (!day || v.day === day) && (stage === 'all' || v.stage === stage) && (!ql || v.title.toLowerCase().includes(ql)))
    .sort((a, b) => (sort === 'new' ? b.day.localeCompare(a.day) || b.created_at.localeCompare(a.created_at) : a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at)));

  return (
    <div className="vbrowser">
      <div className="vb-tabs">
        <button type="button" className={'vb-tab' + (tab === 'today' ? ' on' : '')} onClick={() => setTab('today')}>
          🎬 Aaj ki videos <b className="num">{todays.length}</b>
        </button>
        <button type="button" className={'vb-tab' + (tab === 'history' ? ' on' : '')} onClick={() => setTab('history')}>
          <IconHistory /> Purani videos <b className="num">{olds.length}</b>
        </button>
        {onCreate && <button type="button" className="btn primary sm vb-new" onClick={onCreate}>+ Nai video</button>}
      </div>

      {tab === 'today' &&
        (todays.length ? (
          <div className="vgrid">{todays.map((v) => <VideoTile key={v.id} v={v} onOpen={() => onOpen(v)} />)}</div>
        ) : (
          <div className="empty">Aaj abhi koi video nahi.{onCreate ? ' Upar "+ Nai video" se banayein.' : ''}</div>
        ))}

      {tab === 'history' && (
        <>
          <div className="vb-filters">
            <DateFilter value={day} onChange={setDay} label="Kis din ki" />
            <label className="f vb-sort">
              Tarteeb
              <select value={sort} onChange={(e) => setSort(e.target.value as 'new' | 'old')}>
                <option value="new">Nayi pehle (latest → old)</option>
                <option value="old">Purani pehle (old → latest)</option>
              </select>
            </label>
            <label className="f vb-q">
              Dhoondein
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title dhoondein…" aria-label="Title dhoondein" />
            </label>
          </div>
          <div className="chips scroll">
            <button type="button" className={'chip ' + (stage === 'all' ? 'on' : '')} onClick={() => setStage('all')}>Sab<span className="c">{olds.length}</span></button>
            {STAGES.map((s) => (
              <button type="button" key={s.key} className={'chip ' + (stage === s.key ? 'on' : '')} onClick={() => setStage(s.key)}>
                {s.label}<span className="c">{olds.filter((v) => v.stage === s.key).length}</span>
              </button>
            ))}
          </div>
          {list.length ? (
            <div className="vgrid">{list.map((v) => <VideoTile key={v.id} v={v} showDay onOpen={() => onOpen(v)} />)}</div>
          ) : (
            <div className="empty">{day ? fmtDate(day) + ' ki koi video nahi.' : olds.length ? 'Is filter mein koi video nahi' : 'Pichle dinon ki koi video nahi.'}</div>
          )}
        </>
      )}
    </div>
  );
}

/** Ek channel ki saari videos (card ke Videos button se) */
export function VideosSheet({ channelId, initialTab, focus, create, taskId, onClose }: {
  channelId: string;
  initialTab?: Tab;
  focus?: string;
  create?: boolean;
  taskId?: string;
  onClose: () => void;
}) {
  const d = useData();
  const [tab, setTab] = useState<Tab>(initialTab || 'today');
  const [view, setView] = useState<string | null>(focus || null);
  const [editing, setEditing] = useState<Video | 'new' | null>(create ? 'new' : null);
  const ch = d.channels.find((c) => c.id === channelId);
  const canWork = d.isOwner || d.realOwner || d.rolesOf(channelId).length > 0;
  const cur = view ? d.videos.find((v) => v.id === view) : null;

  if (editing) return <VideoForm channelId={channelId} video={editing === 'new' ? null : editing} taskId={taskId} onClose={() => setEditing(null)} onSaved={(id) => { setEditing(null); setView(id); }} />;
  if (cur)
    return (
      <Sheet title={(ch?.name || 'Channel') + ' · Video'} onClose={() => (focus && view === focus ? onClose() : setView(null))}>
        <VideoView video={cur} canEdit={canWork} onEdit={() => setEditing(cur)} onClose={() => setView(null)} />
      </Sheet>
    );
  return (
    <Sheet title={(ch?.name || 'Channel') + ' · Videos'} onClose={onClose}>
      <VideoBrowser channelId={channelId} tab={tab} setTab={setTab} onOpen={(v) => setView(v.id)} onCreate={canWork ? () => setEditing('new') : undefined} />
    </Sheet>
  );
}

/** purana naam (dusri files ke liye) */
export function VideoList({ videos, onOpen }: { videos: Video[]; onOpen: (v: Video) => void; foldPrefix?: string; openDays?: number }) {
  return <div className="vgrid">{videos.map((v) => <VideoTile key={v.id} v={v} showDay onOpen={() => onOpen(v)} />)}</div>;
}

/** Ek video: thumbnail, script, notes, aur Edit */
export function VideoView({ video, canEdit, onEdit, onClose }: { video: Video; canEdit: boolean; onEdit: () => void; onClose: () => void }) {
  const maker = useMaker();
  const toast = useToast();
  const [img, setImg] = useState(false);
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast('Link copy ho gaya'), () => toast('Copy nahi hua'));
  return (
    <article className="viewer video-view">
      <div className="row between top">
        <div className="grow">
          <span className="eyebrow">{dayLabel(video.day)} · {fmtClock(video.created_at)}</span>
          <h3 className="viewer-t">{video.title}</h3>
          <span className="muted tiny">
            <span data-notr>{maker(video)}</span> ne banayi
            {video.updated_by && video.updated_by !== video.created_by ? <> · aakhri edit <span data-notr>{maker(video, true)}</span></> : null}
          </span>
        </div>
        <button className="x" onClick={onClose} aria-label="Band karein">×</button>
      </div>
      <div className="row">
        <span className={'stage ' + video.stage}>{stageLabel(video.stage)}</span>
        {video.due && <span className="muted small">Due {fmtDate(video.due)}</span>}
      </div>
      {video.thumbnail_url ? (
        <button className="viewer-img" onClick={() => setImg(true)} aria-label="Thumbnail bara dekhein">
          <img src={video.thumbnail_url} alt={video.title} />
        </button>
      ) : (
        <div className="vv-empty muted small">🖼 Abhi thumbnail nahi laga{canEdit ? ' — Edit dabayein aur lagayein' : ''}</div>
      )}
      {video.script_url ? (
        <div className="script-link">
          <span className="mono-url">{video.script_url.replace(/^https?:\/\//, '')}</span>
          <a className="btn primary sm" href={video.script_url} target="_blank" rel="noopener noreferrer">Script kholein ↗</a>
          <button className="btn sm" onClick={() => copy(video.script_url)}>Copy</button>
        </div>
      ) : !video.script ? (
        <div className="vv-empty muted small">📄 Abhi script nahi lagi{canEdit ? ' — Edit dabayein aur link lagayein' : ''}</div>
      ) : null}
      {video.script && (
        <Fold id={'vs-' + video.id} title={`Script (${video.script.trim().split(/\s+/).length} words)`} defaultOpen={!video.script_url}>
          <div className="script-body">{video.script}</div>
        </Fold>
      )}
      {video.video_url ? (
        <VideoCard url={video.video_url} title={video.title} />
      ) : (
        <div className="vv-empty muted small">🎬 Abhi video file nahi lagi{canEdit ? ' — Edit dabayein aur upload karein' : ''}</div>
      )}
      {video.notes && <div className="note pre">{video.notes}</div>}
      {canEdit && (
        <button className="btn block" onClick={onEdit}>
          ✎ Edit (script / thumbnail / video / stage)
        </button>
      )}
      {img && video.thumbnail_url && <ImageViewer url={video.thumbnail_url} onClose={() => setImg(false)} />}
    </article>
  );
}

/** Nai video banana ya edit: title, stage, script link / text, thumbnail (ImgBB), notes */
export function VideoForm({ channelId, video, taskId, onClose, onSaved }: { channelId: string; video: Video | null; taskId?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const d = useData();
  const toast = useToast();
  const [title, setTitle] = useState(video?.title || '');
  const [stage, setStage] = useState<Stage>(video?.stage || 'script');
  const [due, setDue] = useState(video?.due || '');
  const [scriptUrl, setScriptUrl] = useState(video?.script_url || '');
  const [script, setScript] = useState(video?.script || '');
  const [writeOpen, setWriteOpen] = useState(!!video?.script);
  const [thumb, setThumb] = useState({ url: video?.thumbnail_url || '', del: video?.thumbnail_delete_url || '' });
  const [notes, setNotes] = useState(video?.notes || '');
  const [videoUrl, setVideoUrl] = useState(video?.video_url || '');
  const [vidBusy, setVidBusy] = useState(false);
  const [busy, setBusy] = useState<'' | 'img' | 'save'>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const ch = d.channels.find((c) => c.id === channelId);
  const myTask = taskId || d.tasks.find((t) => t.channel_id === channelId && t.user_id === d.uid && t.day === todayKey())?.id || null;

  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy('img');
    try {
      const r = await uploadToImgBB(f, `${ch?.name || 'khr'}-${title || 'thumbnail'}`);
      setThumb({ url: r.url, del: r.deleteUrl });
      toast('Thumbnail upload ho gaya');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return toast('Video / script ka title likhein');
    if (vidBusy) return toast('Video abhi upload ho rahi hai — 100% hone ka intezar karein');
    const su = scriptUrl.trim();
    if (su && !/^https?:\/\//i.test(su)) return toast('Script ka link https:// se shuru hona chahiye (Google Docs ka link copy karein)');
    setBusy('save');
    try {
      const id = await d.saveVideo({
        id: video?.id, channel_id: channelId, title: t, stage, due: due || null, script, notes,
        script_url: su, thumbnail_url: thumb.url, thumbnail_delete_url: thumb.del, video_url: videoUrl, task_id: myTask
      });
      toast(video ? 'Video update ho gayi' : 'Video add ho gayi');
      onSaved(id);
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy('');
    }
  }

  return (
    <Sheet
      title={video ? 'Video edit' : 'Nai video'}
      onClose={() => {
        if (vidBusy && !window.confirm('Video abhi upload ho rahi hai. Band karne se upload ruk jayega. Phir bhi band karein?')) return;
        onClose();
      }}
    >
      <form className="form" onSubmit={submit}>
        <label className="f">
          Title <span className="h">Video / script ka naam, jaise "EP 087 | California Wildfire"</span>
          <input id="v-title" type="text" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. EP 087 | California Wildfire" />
        </label>
        <label className="f">
          Script ka link <span className="h">Google Docs / Drive / Word file ka link</span>
          <input id="v-surl" type="url" inputMode="url" value={scriptUrl} onChange={(e) => setScriptUrl(e.target.value)} placeholder="https://docs.google.com/document/d/…" />
        </label>
        {writeOpen ? (
          <label className="f">
            <span className="row between"><span>Script yahin likhein (optional)</span><span className="h num">{script.trim() ? script.trim().split(/\s+/).length : 0} words</span></span>
            <textarea id="v-script" rows={8} value={script} onChange={(e) => setScript(e.target.value)} placeholder={'Hook…\n\nIntro…\n\nMain points…\n\nOutro / CTA…'} />
          </label>
        ) : (
          <button type="button" className="linkbtn" onClick={() => setWriteOpen(true)}>+ Script app ke andar likhein</button>
        )}
        <div className="f">
          Thumbnail
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          {thumb.url ? (
            <div className="thumb-edit">
              <img src={thumb.url} alt="" />
              <div className="stack">
                <button type="button" className="btn sm" disabled={busy !== ''} onClick={() => fileRef.current?.click()}>{busy === 'img' ? 'Upload…' : 'Badlein'}</button>
                <button type="button" className="btn sm" onClick={() => setThumb({ url: '', del: '' })}>Hatayein</button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn" disabled={busy !== '' || !imgbbReady} onClick={() => fileRef.current?.click()}>
              {busy === 'img' ? 'ImgBB par upload ho raha hai…' : '🖼 Thumbnail chunein (phone / PC se)'}
            </button>
          )}
          <span className="h">Baad mein Graphic Designer is video ko Edit kar ke bhi thumbnail laga sakta hai.</span>
        </div>
        <div className="f">
          Video <span className="h">Editor final / draft video yahan upload kare (ya Drive / Gofile link)</span>
          <VideoField value={videoUrl} onChange={setVideoUrl} onBusy={setVidBusy} />
        </div>
        <div className="two">
          <label className="f">
            Stage
            <select id="v-stage" value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label className="f">
            Due date
            <input id="v-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        <label className="f">
          Notes <span className="h">Editor / manager ke liye</span>
          <textarea id="v-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. B-roll add karo, thumbnail mein face close-up" />
        </label>
        <button className="btn primary block" type="submit" disabled={busy !== '' || vidBusy}>
          {vidBusy ? 'Video upload ho rahi hai…' : busy === 'save' ? 'Save ho raha hai…' : video ? 'Save karein' : 'Video add karein'}
        </button>
        {video && (d.isOwner || d.realOwner || video.created_by === d.uid) && (
          <ConfirmButton
            label="Video delete karein"
            confirmLabel="Pakka delete? Dobara tap karein"
            onConfirm={async () => {
              try {
                await d.deleteVideo(video.id);
                toast('Video delete ho gayi');
                onClose();
              } catch (err) {
                toast(errorText(err));
              }
            }}
          />
        )}
      </form>
    </Sheet>
  );
}
