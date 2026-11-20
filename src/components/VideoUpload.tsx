import { useEffect, useRef, useState } from 'react';
import { checkVideoFile, embedUrl, mb, uploadToGofile, UploadCancelled, videoKind, type UploadProgress } from '../lib/gofile';
import { downloadMediaUrl, isInternalMediaUrl } from '../lib/files';
import { errorText } from '../lib/utils';
import { useToast } from './ui';

/** Upload ki halat + shuru / cancel */
export function useVideoUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [prog, setProg] = useState<UploadProgress | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  const start = async (f: File): Promise<string | null> => {
    const bad = checkVideoFile(f);
    if (bad) throw new Error(bad);
    ctl.current = new AbortController();
    setFile(f);
    setProg({ loaded: 0, total: f.size, pct: 0 });
    try {
      const r = await uploadToGofile(f, setProg, ctl.current.signal);
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
  return { uploading: !!file, file, prog, start, cancel };
}

/** Progress bar: naam, %, MB / MB, Cancel (white-label) */
export function UploadBar({ file, prog, onCancel }: { file: File; prog: UploadProgress; onCancel: () => void }) {
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
      <span className="muted tiny">{done ? 'Video save ho rahi hai… thora intezar' : 'Video upload ho rahi hai — ye screen band na karein'}</span>
    </div>
  );
}

/** Form ke andar: video file upload ya link paste */
export function VideoField({ value, onChange, onBusy }: { value: string; onChange: (url: string) => void; onBusy?: (b: boolean) => void }) {
  const toast = useToast();
  const up = useVideoUpload();
  const [mode, setMode] = useState<'file' | 'link'>(value && !isInternalMediaUrl(value) && videoKind(value) !== 'gofile' ? 'link' : 'file');
  const [link, setLink] = useState(value && !isInternalMediaUrl(value) && videoKind(value) !== 'gofile' ? value : '');
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

  if (up.uploading && up.file && up.prog) return <UploadBar file={up.file} prog={up.prog} onCancel={up.cancel} />;

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
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>🎬 Video chunein (phone / PC se, 2 GB tak)</button>
          <span className="h">MP4, MOV, MKV, WEBM. Video seedha app mein play aur download hoti hai.</span>
        </>
      ) : (
        <div className="row">
          <input
            className="grow"
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://drive.google.com/… ya YouTube link"
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

/** v20: White-label Video Card — app ke andar play + direct in-app download (no external host branding) */
export function VideoCard({ url, title, compact }: { url: string; title?: string; compact?: boolean }) {
  const toast = useToast();
  const [play, setPlay] = useState(false);
  const [dlBusy, setDlBusy] = useState(false);
  const emb = embedUrl(url);
  const kind = videoKind(url);
  const internal = isInternalMediaUrl(url) || kind === 'file';
  const host = internal ? 'KHR Video' : kind === 'youtube' ? 'YouTube' : kind === 'drive' ? 'Google Drive' : kind === 'gofile' ? 'Video Link' : url.replace(/^https?:\/\//, '').split('/')[0];

  async function download() {
    setDlBusy(true);
    try {
      const msg = await downloadMediaUrl(url, (title || 'video').replace(/[^\w.\s-]+/g, '_') + '.mp4');
      toast('⬇ ' + msg);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setDlBusy(false);
    }
  }

  return (
    <div className={'vcard' + (compact ? ' compact' : '')}>
      {play && emb ? (
        emb.type === 'video' ? (
          <video className="vcard-player" src={emb.src} controls autoPlay playsInline controlsList="nodownload" />
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
        {emb && !play && <button type="button" className="btn primary sm" onClick={() => setPlay(true)}>▶ Chalayein</button>}
        {emb && play && <button type="button" className="btn sm" onClick={() => setPlay(false)}>Band</button>}
        <button type="button" className="btn sm icon-dl" disabled={dlBusy} onClick={download} title="Video download karein" aria-label="Video download karein">
          {dlBusy ? '⏳' : '⬇'}
        </button>
      </div>
    </div>
  );
}

/** text mein video links dhoondo (chat ke neeche card dikhane ke liye) */
export function videoLinksIn(text: string): string[] {
  const out: string[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const prev = i > 0 ? lines[i - 1].trim() : '';
    const isAudioOrDoc = prev.startsWith('🎵') || prev.startsWith('📎');
    for (const m of lines[i].matchAll(/https?:\/\/[^\s<>"']+/g)) {
      const u = m[0]; const k = videoKind(u);
      if (!k || (k === 'pixeldrain' && isAudioOrDoc)) continue;
      if (!out.includes(u)) out.push(u);
    }
  }
  return out.slice(0, 3);
}
