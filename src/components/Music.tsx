import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useData } from '../lib/data';
import type { MusicTrack } from '../lib/types';
import { errorText } from '../lib/utils';
import { ConfirmButton, Sheet, useToast } from './ui';

/* =========================================================================
   v9: MUSIC — har user ki apni playlist. YouTube / YouTube Music, SoundCloud,
   Spotify, Vimeo, Google Drive aur seedhe audio/video links app ke andar chalte hain.
   Neeche chhota player rehta hai, screen badlein to bhi gaana chalta rahe.
   ========================================================================= */

export type Source =
  | { kind: 'youtube'; id: string; list?: string }
  | { kind: 'audio'; src: string; video: boolean }
  | { kind: 'embed'; src: string; height: number; label: string }
  | { kind: 'link'; src: string };

export function parseMusic(url: string): Source {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return { kind: 'link', src: url };
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  if (host === 'youtu.be') return { kind: 'youtube', id: u.pathname.slice(1).split('/')[0], list: u.searchParams.get('list') || undefined };
  if (host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    const list = u.searchParams.get('list') || undefined;
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{6,})/);
    if (v || m) return { kind: 'youtube', id: (v || m![1]).slice(0, 20), list };
    if (list) return { kind: 'youtube', id: '', list };
  }
  if (host === 'soundcloud.com' || host === 'on.soundcloud.com')
    return { kind: 'embed', src: 'https://w.soundcloud.com/player/?auto_play=true&visual=false&url=' + encodeURIComponent(url), height: 120, label: 'SoundCloud' };
  if (host === 'open.spotify.com') {
    const m = u.pathname.match(/\/(track|album|playlist|episode|show|artist)\/([\w]+)/);
    if (m) return { kind: 'embed', src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: m[1] === 'track' || m[1] === 'episode' ? 152 : 352, label: 'Spotify' };
  }
  if (host === 'vimeo.com') {
    const m = u.pathname.match(/\/(\d+)/);
    if (m) return { kind: 'embed', src: `https://player.vimeo.com/video/${m[1]}?autoplay=1`, height: 0, label: 'Vimeo' };
  }
  if (host === 'drive.google.com') {
    const m = u.pathname.match(/\/file\/d\/([\w-]+)/) || [null, u.searchParams.get('id')];
    if (m[1]) return { kind: 'embed', src: `https://drive.google.com/file/d/${m[1]}/preview`, height: 0, label: 'Google Drive' };
  }
  if (/\.(mp3|m4a|aac|ogg|oga|wav|flac|opus)(\?|$)/i.test(u.pathname)) return { kind: 'audio', src: url, video: false };
  if (/\.(mp4|webm|m4v|mov)(\?|$)/i.test(u.pathname)) return { kind: 'audio', src: url, video: true };
  return { kind: 'link', src: url };
}

export const sourceLabel = (s: Source) => (s.kind === 'youtube' ? 'YouTube' : s.kind === 'audio' ? (s.video ? 'Video' : 'Audio') : s.kind === 'embed' ? s.label : 'Link');

/* ---------- YouTube IFrame API (ek dafa load) ---------- */
type YTPlayer = { playVideo(): void; pauseVideo(): void; destroy(): void; loadVideoById(id: string): void };
type YTNs = { Player: new (el: HTMLElement, o: unknown) => YTPlayer; PlayerState: { ENDED: number; PLAYING: number; PAUSED: number } };
let ytPromise: Promise<YTNs> | null = null;
function loadYT(): Promise<YTNs> {
  const w = window as unknown as { YT?: YTNs & { loaded?: number }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (!ytPromise)
    ytPromise = new Promise((res, rej) => {
      const prev = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        prev?.();
        res(w.YT!);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => {
        ytPromise = null;
        rej(new Error('YouTube load nahi hua'));
      };
      document.head.appendChild(s);
    });
  return ytPromise;
}

/* ---------- Player state ---------- */
interface MusicCtx {
  tracks: MusicTrack[];
  current: MusicTrack | null;
  playing: boolean;
  big: boolean;
  play: (id: string) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
  setBig: (b: boolean) => void;
  openLibrary: () => void;
}
const Ctx = createContext<MusicCtx | null>(null);
export const useMusic = () => useContext(Ctx);

export function MusicProvider({ children }: { children: ReactNode }) {
  const d = useData();
  const tracks = d.music_tracks;
  const [curId, setCurId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [big, setBig] = useState(false);
  const [lib, setLib] = useState(false);
  const current = tracks.find((t) => t.id === curId) || null;
  const idx = current ? tracks.indexOf(current) : -1;

  const next = useCallback(() => {
    if (!tracks.length) return;
    setCurId(tracks[(idx + 1) % tracks.length].id);
    setPlaying(true);
  }, [tracks, idx]);
  const prev = useCallback(() => {
    if (!tracks.length) return;
    setCurId(tracks[(idx - 1 + tracks.length) % tracks.length].id);
    setPlaying(true);
  }, [tracks, idx]);

  const value = useMemo<MusicCtx>(
    () => ({
      tracks,
      current,
      playing,
      big,
      play: (id) => { setCurId(id); setPlaying(true); },
      toggle: () => setPlaying((p) => !p),
      next,
      prev,
      stop: () => { setCurId(null); setPlaying(false); setBig(false); },
      setBig,
      openLibrary: () => setLib(true)
    }),
    [tracks, current, playing, big, next, prev]
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {current && <Player key={current.id} track={current} playing={playing} big={big} onEnded={next} onState={setPlaying} />}
      {lib && <MusicSheet onClose={() => setLib(false)} />}
    </Ctx.Provider>
  );
}

/** Asal player (screen ke neeche chhota, ya bara) */
function Player({ track, playing, big, onEnded, onState }: { track: MusicTrack; playing: boolean; big: boolean; onEnded: () => void; onState: (p: boolean) => void }) {
  const m = useMusic()!;
  const src = useMemo(() => parseMusic(track.url), [track.url]);
  const ytBox = useRef<HTMLDivElement>(null);
  const yt = useRef<YTPlayer | null>(null);
  const media = useRef<HTMLMediaElement | null>(null);
  const ended = useRef(onEnded);
  ended.current = onEnded;
  const stateRef = useRef(onState);
  stateRef.current = onState;
  const [err, setErr] = useState('');

  // YouTube player banao
  useEffect(() => {
    if (src.kind !== 'youtube' || !ytBox.current) return;
    let dead = false;
    const host = document.createElement('div');
    ytBox.current.appendChild(host);
    loadYT()
      .then((YT) => {
        if (dead) return;
        yt.current = new YT.Player(host, {
          width: '100%',
          height: '100%',
          videoId: src.id || undefined,
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, ...(src.list ? { list: src.list, listType: 'playlist' } : {}) },
          events: {
            onReady: (e: { target: YTPlayer }) => e.target.playVideo(),
            onStateChange: (e: { data: number }) => {
              if (e.data === YT.PlayerState.ENDED && !src.list) ended.current();
              if (e.data === YT.PlayerState.PLAYING) stateRef.current(true);
              if (e.data === YT.PlayerState.PAUSED) stateRef.current(false);
            },
            onError: () => setErr('Ye YouTube video app ke andar nahi chal sakti (owner ne embed band kiya ho). "Kholein" se YouTube par chalayein.')
          }
        });
      })
      .catch((e) => setErr(errorText(e)));
    return () => {
      dead = true;
      try { yt.current?.destroy(); } catch { /* koi baat nahi */ }
      yt.current = null;
      host.remove();
    };
  }, [src]);

  // play / pause
  useEffect(() => {
    if (src.kind === 'youtube') {
      try { if (playing) yt.current?.playVideo(); else yt.current?.pauseVideo(); } catch { /* abhi tayyar nahi */ }
    }
    if (src.kind === 'audio' && media.current) {
      if (playing) media.current.play().catch(() => stateRef.current(false));
      else media.current.pause();
    }
  }, [playing, src]);

  const showVideo = src.kind === 'youtube' || (src.kind === 'audio' && src.video) || (src.kind === 'embed' && src.height === 0);
  return (
    <div className={'mplayer' + (big ? ' big' : '') + (showVideo ? ' has-video' : '')} role="region" aria-label="Music player" data-notr>
      <div className="mp-stage">
        {src.kind === 'youtube' && <div ref={ytBox} className="mp-yt" />}
        {src.kind === 'audio' && (src.video ? (
          <video ref={(el) => (media.current = el)} src={src.src} autoPlay playsInline controls={big} onEnded={() => ended.current()} onPlay={() => onState(true)} onPause={() => onState(false)} />
        ) : (
          <audio ref={(el) => (media.current = el)} src={src.src} autoPlay controls={big} onEnded={() => ended.current()} onPlay={() => onState(true)} onPause={() => onState(false)} />
        ))}
        {src.kind === 'embed' && (
          <iframe
            src={src.src}
            title={track.title || 'Music'}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
            style={src.height ? { height: big ? src.height : Math.min(src.height, 80) } : undefined}
          />
        )}
        {src.kind === 'link' && <div className="mp-link muted small">Ye link app ke andar nahi chal sakta. "Kholein" dabayein.</div>}
      </div>
      <div className="mp-bar">
        <span className="mp-t grow">
          <b className="one-line">{track.title || track.url}</b>
          <small className="muted one-line">{err || sourceLabel(src)}</small>
        </span>
        <button className="mp-btn" onClick={m.prev} aria-label="Pichla gaana" title="Pichla">⏮</button>
        {(src.kind === 'youtube' || src.kind === 'audio') && (
          <button className="mp-btn main" onClick={m.toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '⏸' : '▶'}</button>
        )}
        <button className="mp-btn" onClick={m.next} aria-label="Agla gaana" title="Agla">⏭</button>
        <button className="mp-btn" onClick={() => m.setBig(!big)} aria-label={big ? 'Chhota karein' : 'Bara karein'} title={big ? 'Chhota' : 'Bara'}>{big ? '▾' : '▴'}</button>
        <button className="mp-btn" onClick={m.openLibrary} aria-label="Playlist" title="Playlist">☰</button>
        <a className="mp-btn" href={track.url} target="_blank" rel="noopener noreferrer" aria-label="Asal jagah kholein" title="Kholein">↗</a>
        <button className="mp-btn" onClick={m.stop} aria-label="Band karein" title="Band">✕</button>
      </div>
    </div>
  );
}

/** Playlist: link paste karein, list, chalayein, tarteeb, hatayein */
export function MusicSheet({ onClose }: { onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const m = useMusic();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const tracks = d.music_tracks;

  async function add(e: FormEvent) {
    e.preventDefault();
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) return toast('Poora link paste karein (https:// se shuru)');
    setBusy(true);
    try {
      let t = title.trim();
      if (!t) {
        // naam khud dhoondo (YouTube / SoundCloud / Vimeo)
        try {
          const r = await fetch('https://noembed.com/embed?url=' + encodeURIComponent(u));
          const j = (await r.json()) as { title?: string };
          t = (j.title || '').slice(0, 200);
        } catch {
          /* naam na mile to link hi naam */
        }
      }
      await d.addTrack(t || u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 80), u);
      setUrl('');
      setTitle('');
      toast('Playlist mein add ho gaya');
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const move = async (i: number, dir: -1 | 1) => {
    const a = tracks[i], b = tracks[i + dir];
    if (!a || !b) return;
    try {
      await d.updateTrack(a.id, { position: b.position === a.position ? b.position + dir : b.position });
      await d.updateTrack(b.id, { position: a.position });
    } catch (err) {
      toast(errorText(err));
    }
  };

  return (
    <Sheet title="🎵 Meri music playlist" onClose={onClose}>
      <form className="form" onSubmit={add}>
        <label className="f">
          Gaane / video ka link
          <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="YouTube, YouTube Music, SoundCloud, Spotify, mp3 link…" required />
        </label>
        <label className="f">
          Naam <span className="h">Khaali chhor dein to app khud dhoondegi</span>
          <input type="text" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lofi focus mix" />
        </label>
        <button className="btn primary block" type="submit" disabled={busy}>{busy ? 'Add ho raha hai…' : '+ Playlist mein add karein'}</button>
      </form>
      {tracks.length ? (
        <div className="list tracks" data-notr>
          {tracks.map((t, i) => {
            const s = parseMusic(t.url);
            const on = m?.current?.id === t.id;
            return (
              <div key={t.id} className={'li track' + (on ? ' on' : '')}>
                <button className="track-play" onClick={() => (on ? m?.toggle() : m?.play(t.id))} aria-label={on && m?.playing ? 'Pause' : 'Chalayein'}>
                  {on && m?.playing ? '⏸' : '▶'}
                </button>
                <span className="grow">
                  <span className="t block one-line">{t.title || t.url}</span>
                  <span className="d block">{sourceLabel(s)}</span>
                </span>
                <button className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Upar">↑</button>
                <button className="btn sm" onClick={() => move(i, 1)} disabled={i === tracks.length - 1} aria-label="Neeche">↓</button>
                <ConfirmButton className="btn sm" label="✕" confirmLabel="Hatayein?" onConfirm={() => { if (on) m?.stop(); return d.deleteTrack(t.id).catch((e) => toast(errorText(e))); }} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty"><b>Playlist khaali hai</b>Upar kisi bhi gaane ka link paste karein — YouTube, SoundCloud, Spotify ya mp3. Phir yahin se chalayein.</div>
      )}
      {tracks.length > 0 && !m?.current && (
        <button className="btn block" onClick={() => m?.play(tracks[0].id)}>▶ Poori playlist chalayein</button>
      )}
      <p className="muted tiny m0">Playlist sirf aap ko nazar aati hai. Spotify par poora gaana sunne ke liye Spotify mein login hona zaroori hai.</p>
    </Sheet>
  );
}
