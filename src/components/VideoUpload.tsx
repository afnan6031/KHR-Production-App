import { useEffect, useRef, useState } from 'react';
import { checkVideoFile, embedUrl, mb, uploadVideo, UploadCancelled, videoKind, type UploadProgress, type VideoHost } from '../lib/gofile';
import { downloadUrl } from '../lib/audio';
import { errorText } from '../lib/utils';
import { useToast } from './ui';

/* =========================================================================
   v16: Video upload — pehle Pixeldrain (10 GB, app ke andar chalti + download), na ho to Gofile.
   Live progress bar (%, MB / MB), Cancel, ya seedha link paste (Drive / Gofile / Pixeldrain / YouTube / .mp4).
   ========================================================================= */

/** Upload ki halat + shuru / cancel (form aur chat dono mein) */
export function useVideoUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [prog, setProg] = useState<UploadProgress | null>(null);
  const [host, setHost] = useState<VideoHost>('pixeldrain');
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []); // screen band ho to upload bhi band
  const start = async (f: File): Promise<string | null> => {
    const bad = checkVideoFile(f);
    if (bad) throw new Error(bad);
    ctl.current = new AbortController();
    setFile(f);
    setProg({ loaded: 0, total: f.size, pct: 0 });
    try {
      const r = await uploadVideo(f, setProg, ctl.current.signal, (h) => { setHost(h); setProg({ loaded: 0, total: f.size, pct: 0 }); });
      return r.url;
    } catch (e) {
      if (e instanceof UploadCancelled) return null;
      throw e;
    } finally {
      setFile(null);
      setProg(null);
      ctl.current = null;
    }
  };
  const cancel = () => ctl.current?.abort();
  return { uploading: !!file, file, prog, host, start, cancel };
}

/** Progress bar: naam, %, MB / MB, Cancel */
export function UploadBar({ file, prog, onCancel, host = 'pixeldrain' }: { file: File; prog: UploadProgress; onCancel: () => void; host?: VideoHost }) {
  const done = prog.pct >= 100;
  return (
    <div className="upbar" role="status" aria-live="polite">
      <div className="row between">
        <span className="upbar-name" data-notr>🎬 {file.name}</span>
        <button type="button" className="btn sm" onClick={onCancel}>Cancel</button>
      </div>
      <div className="upbar-track" aria-hidden="true">
        <i style={{ width: prog.pct + '%' }} className={done ? 'done' : ''} />
      </div>
      <div className="row between upbar-meta">
        <b className="num">{prog.pct}%</b>
        <span className="num">{mb(prog.loaded)} / {mb(prog.total)}</span>
      </div>
      <span className="muted tiny">
        {host === 'gofile'
          ? done ? 'Gofile video process kar raha hai… thora intezar' : 'Pixeldrain nahi chala — video Gofile par upload ho rahi hai. Ye screen band na karein'
          : done ? 'Pixeldrain file save kar raha hai… thora intezar' : 'Video Pixeldrain par upload ho rahi hai — ye screen band na karein'}
      </span>
    </div>
  );
}

/** Form ke andar: video file upload ya link paste */
export function VideoField({ value, onChange, onBusy }: { value: string; onChange: (url: string) => void; onBusy?: (b: boolean) => void }) {
  const toast = useToast();
  const up = useVideoUpload();
  const uploaded = (u: string) => videoKind(u) === 'gofile' || videoKind(u) === 'pixeldrain';
  const [mode, setMode] = useState<'file' | 'link'>(value && !uploaded(value) ? 'link' : 'file');
  const [link, setLink] = useState(value && !uploaded(value) ? value : '');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => onBusy?.(up.uploading), [up.uploading]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pick(f: File | undefined) {
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    try {
      const url = await up.start(f);
      if (url) {
        onChange(url);
        toast('🎬 Video upload ho gayi');
      } else toast('Upload cancel ho gaya');
    } catch (e) {
      toast(errorText(e));
    }
  }

  if (up.uploading && up.file && up.prog) return <UploadBar file={up.file} prog={up.prog} onCancel={up.cancel} host={up.host} />;

  if (value)
    return (
      <div className="vfield-done">
        <VideoCard url={value} compact />
        <button type="button" className="btn sm" onClick={() => { onChange(''); setLink(''); }}>Video hatayein</button>
      </div>
    );

  return (
    <div className="vfield">
      <div className="seg sm">
        <button type="button" className={mode === 'file' ? 'on' : ''} onClick={() => setMode('file')}>⬆ File upload</button>
        <button type="button" className={mode === 'link' ? 'on' : ''} onClick={() => setMode('link')}>🔗 Link paste</button>
      </div>
      {mode === 'file' ? (
        <>
          <input ref={fileRef} type="file" accept="video/*,.mp4,.mov,.mkv,.webm" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>🎬 Video chunein (phone / PC se, 10 GB tak)</button>
          <span className="h">MP4, MOV, MKV, WEBM. Video Pixeldrain par jati hai (na chale to Gofile), app mein sirf link save hota hai. Pixeldrain wali video app ke andar chalti aur download hoti hai.</span>
        </>
      ) : (
        <div className="row">
          <input
            className="grow"
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://pixeldrain.com/u/… · https://drive.google.com/… · https://gofile.io/d/…"
            aria-label="Video ka link"
          />
          <button
            type="button"
            className="btn primary sm"
            disabled={!link.trim()}
            onClick={() => {
              const u = link.trim();
              if (!/^https:\/\//i.test(u)) return toast('Link https:// se shuru hona chahiye');
              onChange(u);
            }}
          >
            Lagayein
          </button>
        </div>
      )}
    </div>
  );
}

/** Video ka link dikhana: kholein, copy, aur jahan mumkin ho app ke andar chalayein */
export function VideoCard({ url, title, compact }: { url: string; title?: string; compact?: boolean }) {
  const toast = useToast();
  const [play, setPlay] = useState(false);
  const [vErr, setVErr] = useState(false);
  const emb = embedUrl(url);
  const kind = videoKind(url);
  const host = kind === 'pixeldrain' ? 'Pixeldrain' : kind === 'gofile' ? 'Gofile' : kind === 'youtube' ? 'YouTube' : kind === 'drive' ? 'Google Drive' : url.replace(/^https?:\/\//, '').split('/')[0];
  const dl = kind === 'pixeldrain' ? downloadUrl(url) : '';
  return (
    <div className={'vcard' + (compact ? ' compact' : '')}>
      {play && emb ? (
        emb.type === 'video' ? (
          vErr ? (
            <p className="vcard-err small m0">Video app ke andar nahi chal saki{kind === 'pixeldrain' ? ' (Pixeldrain ka free account doosri app mein chalne se rok sakta hai — Android / Windows app mein chalegi)' : ''}. "Kholein" ya "Download" dabayein.</p>
          ) : (
            <video className="vcard-player" src={emb.src} controls autoPlay playsInline preload="metadata" onError={() => setVErr(true)} />
          )
        ) : (
          <iframe className="vcard-player" src={emb.src} title={title || 'Video'} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
        )
      ) : null}
      <div className="vcard-row">
        <span className="vcard-ico" aria-hidden="true">🎬</span>
        <span className="grow vcard-t">
          <b className="block one-line" data-notr>{title || 'Video'}</b>
          <span className="muted tiny">{host}</span>
        </span>
        {emb && !play && <button type="button" className="btn sm" onClick={() => setPlay(true)}>▶ Chalayein</button>}
        {dl && <a className="btn sm" href={dl} target="_blank" rel="noopener noreferrer">⬇ Download</a>}
        <a className={'btn sm' + (emb ? '' : ' primary')} href={url} target="_blank" rel="noopener noreferrer">Kholein ↗</a>
        <button
          type="button"
          className="btn sm"
          onClick={() => navigator.clipboard?.writeText(url).then(() => toast('Video ka link copy ho gaya'), () => toast('Copy nahi hua'))}
        >
          Copy link
        </button>
      </div>
    </div>
  );
}

/** text mein video links dhoondo (chat ke neeche card dikhane ke liye) */
export function videoLinksIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s<>"']+/g)) if (videoKind(m[0]) && !out.includes(m[0])) out.push(m[0]);
  return out.slice(0, 3);
}
