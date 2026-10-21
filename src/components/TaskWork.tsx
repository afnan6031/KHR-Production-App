import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useData } from '../lib/data';
import type { Stage, Task, Video } from '../lib/types';
import { imgbbReady, uploadToImgBB } from '../lib/imgbb';
import { checkAudioFile, uploadToCatbox } from '../lib/catbox';
import { dayLabel, errorText, todayKey } from '../lib/utils';
import { Sheet, useToast } from './ui';
import { VideoField } from './VideoUpload';

/* =========================================================================
   v13: Kaam LAGA kar hi task mukammal (tick nahi).
   Har role apni cheez kisi EP (video card) mein lagata hai:
     Manager → title(s), Script Writer → script, Voice Over → voiceover,
     Editor → video, Graphic Designer → thumbnail, Publisher → YouTube link.
   ========================================================================= */

export type WorkKind = 'title' | 'script' | 'voiceover' | 'video' | 'thumbnail' | 'youtube';
export const ROLE_WORK: Record<string, { kind: WorkKind; icon: string; action: string; done: string; stage: Stage }> = {
  Manager: { kind: 'title', icon: '📝', action: 'Title dein', done: 'Title diya', stage: 'idea' },
  'Script Writer': { kind: 'script', icon: '📄', action: 'Script lagayein', done: 'Script lagi', stage: 'script' },
  'Voice Over': { kind: 'voiceover', icon: '🎙', action: 'Voiceover lagayein', done: 'Voiceover laga', stage: 'script' },
  Editor: { kind: 'video', icon: '🎬', action: 'Video upload karein', done: 'Video lagi', stage: 'editing' },
  'Graphic Designer': { kind: 'thumbnail', icon: '🖼', action: 'Thumbnail lagayein', done: 'Thumbnail laga', stage: 'design' },
  Publisher: { kind: 'youtube', icon: '▶', action: 'YouTube link dein', done: 'Publish hua', stage: 'published' }
};
const STAGE_ORDER: Stage[] = ['idea', 'script', 'editing', 'design', 'review', 'published'];

/** is task ko kaam laga kar mukammal karna hai? */
export const needsWork = (t: Task) => t.kind !== 'custom' && !!ROLE_WORK[t.role];

/** EP ke kaam ki cheez maujood hai? */
export function hasWork(kind: WorkKind, v: Video | undefined): boolean {
  if (!v) return false;
  if (kind === 'title') return !!v.title.trim();
  if (kind === 'script') return !!(v.script_url || v.script.trim());
  if (kind === 'voiceover') return !!v.voiceover_url;
  if (kind === 'video') return !!v.video_url;
  if (kind === 'thumbnail') return !!v.thumbnail_url;
  return !!v.youtube_url;
}

export function TaskWorkSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const cfg = ROLE_WORK[task.role];
  const ch = d.channels.find((c) => c.id === task.channel_id);
  const today = todayKey();
  // is channel ki videos (nayi pehle); pehle wahi jo is kaam ke liye ab tak khaali hain
  const eps = useMemo(
    () => d.videos.filter((v) => v.channel_id === task.channel_id).sort((a, b) => b.day.localeCompare(a.day) || b.created_at.localeCompare(a.created_at)).slice(0, 60),
    [d.videos, task.channel_id]
  );
  // v15: pehle wo EP jo isi din ke liye (advance mein) banaya gaya
  const firstOpen = eps.find((v) => v.day === task.day && !hasWork(cfg.kind, v)) || eps.find((v) => v.day === task.day) || eps.find((v) => !hasWork(cfg.kind, v));
  const linked = task.video_id ? eps.find((v) => v.id === task.video_id) : undefined;
  const [epId, setEpId] = useState<string>(cfg.kind === 'title' ? 'new' : linked?.id || firstOpen?.id || (eps[0]?.id ?? 'new'));
  const ep = epId === 'new' ? undefined : eps.find((v) => v.id === epId);
  const [newTitle, setNewTitle] = useState('');
  const [titles, setTitles] = useState(linked?.title || '');
  const [scriptUrl, setScriptUrl] = useState(ep?.script_url || '');
  const [script, setScript] = useState(ep?.script || '');
  const [videoUrl, setVideoUrl] = useState(ep?.video_url || '');
  const [vidBusy, setVidBusy] = useState(false);
  const [thumb, setThumb] = useState({ url: ep?.thumbnail_url || '', del: ep?.thumbnail_delete_url || '' });
  const [vo, setVo] = useState(ep?.voiceover_url || '');
  const [yt, setYt] = useState(ep?.youtube_url || '');
  const [busy, setBusy] = useState<'' | 'up' | 'save'>('');
  const [upPct, setUpPct] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // EP badla to us ki maujooda cheezein form mein
  const pickEp = (id: string) => {
    setEpId(id);
    const v = eps.find((x) => x.id === id);
    setScriptUrl(v?.script_url || '');
    setScript(v?.script || '');
    setVideoUrl(v?.video_url || '');
    setThumb({ url: v?.thumbnail_url || '', del: v?.thumbnail_delete_url || '' });
    setVo(v?.voiceover_url || '');
    setYt(v?.youtube_url || '');
  };

  async function pickFile(f: File | undefined) {
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    setBusy('up');
    try {
      if (cfg.kind === 'thumbnail') {
        const r = await uploadToImgBB(f, `${ch?.name || 'khr'}-${ep?.title || newTitle || 'thumbnail'}`);
        setThumb({ url: r.url, del: r.deleteUrl });
        toast('Thumbnail upload ho gaya');
      } else if (cfg.kind === 'voiceover') {
        const bad = checkAudioFile(f);
        if (bad) throw new Error(bad);
        setUpPct(0);
        setVo(await uploadToCatbox(f, setUpPct));
        toast('🎙 Voiceover upload ho gaya');
      }
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy('');
      setUpPct(null);
    }
  }

  const base = (v: Video | undefined, title: string) => ({
    id: v?.id,
    channel_id: task.channel_id,
    title,
    stage: v?.stage || cfg.stage,
    due: v?.due || null,
    script: v?.script || '',
    notes: v?.notes || '',
    script_url: v?.script_url || '',
    thumbnail_url: v?.thumbnail_url || '',
    thumbnail_delete_url: v?.thumbnail_delete_url || '',
    video_url: v?.video_url || '',
    voiceover_url: v?.voiceover_url || '',
    youtube_url: v?.youtube_url || '',
    task_id: v ? undefined : task.id,
    day: v ? undefined : task.day
  });
  const advance = (s: Stage) => (STAGE_ORDER.indexOf(cfg.stage) > STAGE_ORDER.indexOf(s) ? cfg.stage : s);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (vidBusy || busy === 'up') return toast('Upload abhi chal raha hai — mukammal hone ka intezar karein');
    setBusy('save');
    try {
      let videoId = '';
      if (cfg.kind === 'title') {
        const list = titles.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 20);
        if (!list.length) throw new Error('Kam az kam ek title likhein');
        if (linked) {
          videoId = await d.saveVideo({ ...base(linked, list[0]) });
          list.shift();
        }
        for (const t of list) {
          const id = await d.saveVideo({ ...base(undefined, t), stage: 'idea' });
          if (!videoId) videoId = id;
        }
      } else {
        const title = ep ? ep.title : newTitle.trim();
        if (!title) throw new Error('EP chunein ya naye EP ka title likhein');
        const b = base(ep, title);
        const patch: Partial<typeof b> = {};
        if (cfg.kind === 'script') {
          const su = scriptUrl.trim();
          if (su && !/^https?:\/\//i.test(su)) throw new Error('Script ka link https:// se shuru hona chahiye');
          if (!su && !script.trim()) throw new Error('Script ka link lagayein ya script likhein');
          patch.script_url = su;
          patch.script = script;
        }
        if (cfg.kind === 'video') {
          if (!videoUrl) throw new Error('Video upload karein ya link lagayein');
          patch.video_url = videoUrl;
        }
        if (cfg.kind === 'thumbnail') {
          if (!thumb.url) throw new Error('Thumbnail chunein');
          patch.thumbnail_url = thumb.url;
          patch.thumbnail_delete_url = thumb.del;
        }
        if (cfg.kind === 'voiceover') {
          const u = vo.trim();
          if (!/^https:\/\//i.test(u)) throw new Error('Voiceover upload karein ya https:// link lagayein');
          patch.voiceover_url = u;
        }
        if (cfg.kind === 'youtube') {
          const u = yt.trim();
          if (!/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(u)) throw new Error('YouTube video ka poora link paste karein (https://youtube.com/… ya https://youtu.be/…)');
          patch.youtube_url = u;
        }
        videoId = await d.saveVideo({ ...b, ...patch, stage: advance(b.stage) });
      }
      await d.submitTaskWork(task.id, videoId);
      toast('✓ ' + cfg.done + ' — task mukammal');
      onClose();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy('');
    }
  }

  return (
    <Sheet
      title={cfg.icon + ' ' + cfg.action}
      onClose={() => {
        if ((vidBusy || busy === 'up') && !window.confirm('Upload abhi chal raha hai. Band karne se ruk jayega. Phir bhi band karein?')) return;
        onClose();
      }}
    >
      <p className="muted small m0">
        <span data-notr>{ch?.name}</span> · {task.role} · {dayLabel(task.day)}
      </p>
      <form className="form" onSubmit={submit}>
        {cfg.kind === 'title' ? (
          <label className="f">
            Title(s) <span className="h">Har line mein ek title — har title ka alag EP card banega jis par script likhi jayegi</span>
            <textarea rows={4} value={titles} onChange={(e) => setTitles(e.target.value)} placeholder={'EP 090 | Super Typhoon\nEP 091 | Volcano Erupts'} required />
          </label>
        ) : (
          <>
            <label className="f">
              Kis EP mein? <span className="h">Wohi EP chunein jis ka kaam hai — kaam isi EP ke card mein nazar aayega</span>
              <select value={epId} onChange={(e) => pickEp(e.target.value)}>
                {eps.map((v) => (
                  <option key={v.id} value={v.id}>
                    {(v.day === today ? 'Aaj · ' : v.day > today ? '📅 ' + v.day.slice(5) + ' · ' : v.day.slice(5) + ' · ') + v.title + (hasWork(cfg.kind, v) ? '  ✓ (pehle se laga)' : '')}
                  </option>
                ))}
                <option value="new">＋ Naya EP</option>
              </select>
            </label>
            {epId === 'new' && (
              <label className="f">
                Naye EP ka title
                <input type="text" maxLength={200} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. EP 090 | Super Typhoon" required />
              </label>
            )}
          </>
        )}

        {cfg.kind === 'script' && (
          <>
            <label className="f">
              Script ka link <span className="h">Google Docs / Drive / Word file ka link</span>
              <input type="url" inputMode="url" value={scriptUrl} onChange={(e) => setScriptUrl(e.target.value)} placeholder="https://docs.google.com/document/d/…" />
            </label>
            <label className="f">
              Ya script yahin likhein
              <textarea rows={5} value={script} onChange={(e) => setScript(e.target.value)} placeholder={'Hook…\n\nIntro…\n\nMain points…'} />
            </label>
          </>
        )}
        {cfg.kind === 'video' && (
          <div className="f">
            Video <span className="h">Final / draft video (Gofile par jati hai) ya Drive / Gofile link</span>
            <VideoField value={videoUrl} onChange={setVideoUrl} onBusy={setVidBusy} />
          </div>
        )}
        {cfg.kind === 'thumbnail' && (
          <div className="f">
            Thumbnail
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
            {thumb.url ? (
              <div className="thumb-edit">
                <img src={thumb.url} alt="" />
                <button type="button" className="btn sm" disabled={busy !== ''} onClick={() => fileRef.current?.click()}>Badlein</button>
              </div>
            ) : (
              <button type="button" className="btn" disabled={busy !== '' || !imgbbReady} onClick={() => fileRef.current?.click()}>
                {busy === 'up' ? 'ImgBB par upload ho raha hai…' : '🖼 Thumbnail chunein (phone / PC se)'}
              </button>
            )}
          </div>
        )}
        {cfg.kind === 'voiceover' && (
          <div className="f">
            Voiceover <span className="h">Audio file (MP3, WAV, M4A…) Catbox par jati hai, ya Drive link paste karein</span>
            <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
            <button type="button" className="btn" disabled={busy !== ''} onClick={() => fileRef.current?.click()}>
              {busy === 'up' ? 'Upload ho raha hai…' : '🎙 Voiceover file chunein'}
            </button>
            {upPct !== null && (
              <div className="upbar"><div className="upbar-track"><i style={{ width: (upPct < 0 ? 100 : upPct) + '%' }} className={upPct < 0 || upPct >= 100 ? 'done' : ''} /></div></div>
            )}
            <input type="url" inputMode="url" value={vo} onChange={(e) => setVo(e.target.value)} placeholder="https://… (voiceover ka link)" aria-label="Voiceover ka link" />
            {vo && /^https:\/\//i.test(vo) && <audio controls src={vo} className="vo-audio" />}
          </div>
        )}
        {cfg.kind === 'youtube' && (
          <label className="f">
            YouTube video ka link <span className="h">Video publish hone ke baad us ka link</span>
            <input type="url" inputMode="url" value={yt} onChange={(e) => setYt(e.target.value)} placeholder="https://youtu.be/…" required />
          </label>
        )}

        <button className="btn primary block" type="submit" disabled={busy !== '' || vidBusy}>
          {busy === 'save' ? 'Save ho raha hai…' : vidBusy || busy === 'up' ? 'Upload ho raha hai…' : '✓ Lagayein aur task mukammal karein'}
        </button>
        <p className="muted tiny m0">Baad mein kuch ghalat ho to channel mein us EP ke card par "✎ Badlein" se theek kar sakte hain.</p>
      </form>
    </Sheet>
  );
}
