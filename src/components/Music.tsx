import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useData } from '../lib/data';
import type { MusicTrack } from '../lib/types';
import { errorText } from '../lib/utils';
import { ConfirmButton, Sheet, useToast } from './ui';
import { checkAudioFile, forgetSrc, isUploaded, offlineKeys, offlineSrc, removeOffline, saveOffline, uploadToCatbox } from '../lib/catbox';

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
type Repeat = 'off' | 'all' | 'one';
interface MusicCtx {
  tracks: MusicTrack[];
  current: MusicTrack | null;
  playing: boolean;
  big: boolean;
  shuffle: boolean;
  repeat: Repeat;
  /** queue = kis list se chal raha hai (playlist); na dein to sab gaane */
  play: (id: string, queue?: string[]) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
  setBig: (b: boolean) => void;
  setShuffle: (b: boolean) => void;
  cycleRepeat: () => void;
  openLibrary: () => void;
}
const Ctx = createContext<MusicCtx | null>(null);
export const useMusic = () => useContext(Ctx);

const PREF_KEY = 'khr-mp-prefs';
function readPref<T>(k: string, def: T): T {
  try {
    const all = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return k in all ? (all[k] as T) : def;
  } catch {
    return def;
  }
}
function writePref(k: string, v: unknown) {
  try {
    const all = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    all[k] = v;
    localStorage.setItem(PREF_KEY, JSON.stringify(all));
  } catch {
    /* storage band */
  }
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const d = useData();
  const all = d.music_tracks;
  const [queue, setQueue] = useState<string[] | null>(null);
  const tracks = useMemo(() => (queue ? (queue.map((id) => all.find((t) => t.id === id)).filter(Boolean) as MusicTrack[]) : all), [queue, all]);
  const [curId, setCurId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [big, setBig] = useState(false);
  const [lib, setLib] = useState(false);
  const [shuffle, setShuffleState] = useState<boolean>(() => readPref('shuffle', false));
  const [repeat, setRepeat] = useState<Repeat>(() => readPref('repeat', 'all'));
  const history = useRef<string[]>([]);
  const current = all.find((t) => t.id === curId) || null;
  const idx = current ? tracks.findIndex((t) => t.id === current.id) : -1;

  const go = useCallback((id: string) => {
    if (curId) history.current = [...history.current.slice(-50), curId];
    setCurId(id);
    setPlaying(true);
  }, [curId]);

  /** agla gaana; auto = gaana khatam hua (repeat ke hisaab se) */
  const nextTrack = useCallback((auto = false) => {
    if (!tracks.length) return;
    if (shuffle && tracks.length > 1) {
      let j = idx;
      while (j === idx) j = Math.floor(Math.random() * tracks.length);
      return go(tracks[j].id);
    }
    if (auto && repeat === 'off' && idx === tracks.length - 1) return setPlaying(false);
    go(tracks[(idx + 1) % tracks.length].id);
  }, [tracks, idx, shuffle, repeat, go]);
  const prev = useCallback(() => {
    if (!tracks.length) return;
    const back = history.current.pop();
    if (back && tracks.some((t) => t.id === back)) { setCurId(back); setPlaying(true); return; }
    setCurId(tracks[(idx - 1 + tracks.length) % tracks.length].id);
    setPlaying(true);
  }, [tracks, idx]);

  const value = useMemo<MusicCtx>(
    () => ({
      tracks,
      current,
      playing,
      big,
      shuffle,
      repeat,
      play: (id, q) => { setQueue(q && q.length ? q : null); go(id); },
      toggle: () => setPlaying((p) => !p),
      next: () => nextTrack(false),
      prev,
      stop: () => { setCurId(null); setPlaying(false); setBig(false); },
      setBig,
      setShuffle: (b) => { setShuffleState(b); writePref('shuffle', b); },
      cycleRepeat: () => setRepeat((r) => { const n: Repeat = r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'; writePref('repeat', n); return n; }),
      openLibrary: () => setLib(true)
    }),
    [tracks, current, playing, big, shuffle, repeat, go, nextTrack, prev]
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {current && <Player key={current.id} track={current} playing={playing} big={big} repeat={repeat} onEnded={() => nextTrack(true)} onState={setPlaying} />}
      {lib && <MusicSheet onClose={() => setLib(false)} />}
    </Ctx.Provider>
  );
}

const fmtT = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
};

/** gaane ki timeline: waveform jaisi patti — tap / khinch kar aage peeche */
function Wave({ seed, t, dur, onSeek, bars = 56 }: { seed: string; t: number; dur: number; onSeek: (s: number) => void; bars?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const heights = useMemo(() => {
    let h = 2166136261;
    for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return Array.from({ length: bars }, (_, i) => {
      h = Math.imul(h ^ (i + 7), 2246822507) >>> 0;
      const wave = 0.45 + 0.35 * Math.sin(i / 3.1) * Math.cos(i / 7.3);
      return Math.max(0.18, Math.min(1, wave + ((h % 1000) / 1000 - 0.5) * 0.55));
    });
  }, [seed, bars]);
  const pctAt = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width));
  };
  const shown = drag ?? (dur ? t / dur : 0);
  const can = dur > 0;
  return (
    <div
      ref={ref}
      className={'mp-wave' + (can ? '' : ' off')}
      role="slider"
      aria-label="Gaane ki timeline"
      aria-valuemin={0}
      aria-valuemax={Math.round(dur)}
      aria-valuenow={Math.round(t)}
      tabIndex={can ? 0 : -1}
      onPointerDown={(e) => { if (!can) return; e.currentTarget.setPointerCapture(e.pointerId); setDrag(pctAt(e.clientX)); }}
      onPointerMove={(e) => { if (drag !== null) setDrag(pctAt(e.clientX)); }}
      onPointerUp={(e) => { if (drag === null) return; const p = pctAt(e.clientX); setDrag(null); onSeek(p * dur); }}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(e) => { if (!can) return; if (e.key === 'ArrowRight') onSeek(Math.min(dur, t + 5)); if (e.key === 'ArrowLeft') onSeek(Math.max(0, t - 5)); }}
    >
      {heights.map((h, i) => (
        <i key={i} className={i / bars < shown ? 'on' : ''} style={{ height: Math.round(h * 100) + '%' }} />
      ))}
    </div>
  );
}

/* ---------- player ki jagah: khinch kar kahin bhi, ya side mein pin ---------- */
type Pos = { x: number; y: number };
function useFloating(big: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(() => readPref<Pos | null>('pos', null));
  const [pin, setPin] = useState<'left' | 'right' | null>(() => readPref<'left' | 'right' | null>('pin', null));
  const [tucked, setTucked] = useState<boolean>(() => readPref('tucked', false));
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const clamp = useCallback((p: Pos): Pos => {
    const el = ref.current;
    const w = el?.offsetWidth || 340, h = el?.offsetHeight || 80;
    const top = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr')) || 56) + 8;
    const bottomGap = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--navh')) || 64) + 8;
    return { x: Math.max(8, Math.min(window.innerWidth - w - 8, p.x)), y: Math.max(top, Math.min(window.innerHeight - h - bottomGap, p.y)) };
  }, []);
  const snap = useCallback((p: Pos, side: 'left' | 'right' | null): Pos => {
    const w = ref.current?.offsetWidth || 340;
    if (side === 'left') return clamp({ x: 8, y: p.y });
    if (side === 'right') return clamp({ x: window.innerWidth - w - 8, y: p.y });
    return clamp(p);
  }, [clamp]);
  // pehli dafa: neeche daayein kone mein
  const place = useCallback(() => {
    const w = ref.current?.offsetWidth || 340, h = ref.current?.offsetHeight || 80;
    const navh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--navh')) || 64;
    const base = pos || { x: window.innerWidth - w - 16, y: window.innerHeight - h - navh - 16 };
    setPos(snap(base, pin));
  }, [pos, pin, snap]);
  useEffect(() => {
    const id = window.requestAnimationFrame(place);
    const onR = () => place();
    window.addEventListener('resize', onR);
    return () => { window.cancelAnimationFrame(id); window.removeEventListener('resize', onR); };
  }, [big]); // eslint-disable-line react-hooks/exhaustive-deps
  const handle = {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button,a,input,.mp-wave')) return;
      const r = ref.current!.getBoundingClientRect();
      drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!drag.current) return;
      setPos(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }));
    },
    onPointerUp: () => {
      if (!drag.current) return;
      drag.current = null;
      setPos((p) => {
        if (!p) return p;
        // pin ho to qareeb wale kinare se chipak jaye
        const w = ref.current?.offsetWidth || 340;
        const side = pin ? (p.x + w / 2 < window.innerWidth / 2 ? 'left' : 'right') : null;
        if (side && side !== pin) { setPin(side); writePref('pin', side); }
        const n = snap(p, side);
        writePref('pos', n);
        return n;
      });
    }
  };
  /** side mein chhupao: sirf kinare par chhoti patti dikhe */
  const tuck = (on: boolean) => {
    const w = ref.current?.offsetWidth || 340;
    const side = pin || (pos && pos.x + w / 2 < window.innerWidth / 2 ? 'left' : 'right');
    if (on && side !== pin) { setPin(side); writePref('pin', side); }
    setTucked(on);
    writePref('tucked', on);
  };
  const togglePin = () => {
    const w = ref.current?.offsetWidth || 340;
    const side = pin ? null : pos && pos.x + w / 2 < window.innerWidth / 2 ? 'left' : 'right';
    setPin(side);
    writePref('pin', side);
    if (pos) { const n = snap(pos, side); setPos(n); writePref('pos', n); }
  };
  return { ref, pos, pin, tucked, tuck, handle: tucked ? {} : handle, togglePin };
}

/** Asal player — tairta card (chhota ya bara), screen ka koi hissa nahi gherta */
function Player({ track, playing, big, repeat, onEnded, onState }: { track: MusicTrack; playing: boolean; big: boolean; repeat: Repeat; onEnded: () => void; onState: (p: boolean) => void }) {
  const m = useMusic()!;
  const src = useMemo(() => parseMusic(track.url), [track.url]);
  const ytBox = useRef<HTMLDivElement>(null);
  const yt = useRef<(YTPlayer & { getCurrentTime?: () => number; getDuration?: () => number; seekTo?: (s: number, a: boolean) => void }) | null>(null);
  const media = useRef<HTMLMediaElement | null>(null);
  const ended = useRef(onEnded);
  ended.current = onEnded;
  const repeatRef = useRef(repeat);
  repeatRef.current = repeat;
  const stateRef = useRef(onState);
  stateRef.current = onState;
  const [err, setErr] = useState('');
  const [time, setTime] = useState({ t: 0, d: 0 });
  const fl = useFloating(big);

  // gaana is device mein save ho to wahi chalao (internet ke baghair bhi)
  const [localSrc, setLocalSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (src.kind === 'audio') offlineSrc(track.url).then((u) => alive && setLocalSrc(u));
    return () => { alive = false; };
  }, [src, track.url]);
  const mediaSrc = src.kind === 'audio' ? localSrc || src.src : '';

  const finished = () => {
    if (repeatRef.current === 'one') {
      seek(0);
      if (media.current) media.current.play().catch(() => {});
      try { yt.current?.playVideo(); } catch { /* koi baat nahi */ }
      return;
    }
    ended.current();
  };

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
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, controls: 0, ...(src.list ? { list: src.list, listType: 'playlist' } : {}) },
          events: {
            onReady: (e: { target: YTPlayer }) => e.target.playVideo(),
            onStateChange: (e: { data: number }) => {
              if (e.data === YT.PlayerState.ENDED && !src.list) finished();
              if (e.data === YT.PlayerState.PLAYING) stateRef.current(true);
              if (e.data === YT.PlayerState.PAUSED) stateRef.current(false);
            },
            onError: () => setErr('Ye YouTube video app ke andar nahi chal sakti (owner ne embed band kiya ho). "Kholein" se YouTube par chalayein.')
          }
        }) as typeof yt.current;
      })
      .catch((e) => setErr(errorText(e)));
    return () => {
      dead = true;
      try { yt.current?.destroy(); } catch { /* koi baat nahi */ }
      yt.current = null;
      host.remove();
    };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  // YouTube ka waqt har aadhe second
  useEffect(() => {
    if (src.kind !== 'youtube') return;
    const id = window.setInterval(() => {
      try {
        const t = yt.current?.getCurrentTime?.() || 0, d = yt.current?.getDuration?.() || 0;
        setTime((o) => (Math.abs(o.t - t) > 0.2 || o.d !== d ? { t, d } : o));
      } catch { /* abhi tayyar nahi */ }
    }, 500);
    return () => window.clearInterval(id);
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

  function seek(s: number) {
    const to = Math.max(0, time.d ? Math.min(time.d - 0.5, s) : s);
    if (src.kind === 'audio' && media.current) media.current.currentTime = to;
    if (src.kind === 'youtube') { try { yt.current?.seekTo?.(to, true); } catch { /* koi baat nahi */ } }
    setTime((o) => ({ ...o, t: to }));
  }
  const canSeek = (src.kind === 'audio' || src.kind === 'youtube') && time.d > 0;
  const isVideo = src.kind === 'youtube' || (src.kind === 'audio' && src.video) || (src.kind === 'embed' && src.height === 0);
  const art = src.kind === 'youtube' && src.id ? `https://i.ytimg.com/vi/${src.id}/hqdefault.jpg` : '';
  const mediaEvents = {
    onEnded: finished,
    onPlay: () => onState(true),
    onPause: () => onState(false),
    onTimeUpdate: (e: React.SyntheticEvent<HTMLMediaElement>) => setTime({ t: e.currentTarget.currentTime, d: e.currentTarget.duration || 0 }),
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLMediaElement>) => setTime({ t: e.currentTarget.currentTime, d: e.currentTarget.duration || 0 })
  };
  const w = fl.ref.current?.offsetWidth || 360;
  const style = !fl.pos
    ? { visibility: 'hidden' as const }
    : fl.tucked
      ? { left: fl.pin === 'left' ? -(w - 30) : window.innerWidth - 30, top: fl.pos.y }
      : { left: fl.pos.x, top: fl.pos.y };

  return (
    <div
      ref={fl.ref}
      className={'mplayer2' + (fl.tucked ? ' tucked tucked-' + (fl.pin || 'right') : '') + (big ? ' big' : '') + (isVideo ? ' has-video' : '') + (playing ? ' is-playing' : '') + (fl.pin ? ' pinned' : '')}
      style={style}
      role="region"
      aria-label="Music player"
      data-notr
      {...fl.handle}
    >
      {fl.tucked && (
        <button className="mp2-tab" onClick={() => fl.tuck(false)} aria-label="Music player kholein" title="Music player kholein">
          <span>{fl.pin === 'left' ? '▸' : '◂'}</span>
          <span className={playing ? 'pulse' : ''}>🎵</span>
        </button>
      )}
      <div className="mp2-top">
        <span className="mp2-grip" aria-hidden="true">⠿</span>
        <span className="mp2-head">{big ? 'Now playing' : ''}</span>
        <button className="mp-btn sm" onClick={() => fl.tuck(true)} title="Side mein chhupayein" aria-label="Side mein chhupayein">{fl.pin === 'left' ? '⇤' : '⇥'}</button>
        <button className={'mp-btn sm' + (fl.pin ? ' on' : '')} onClick={fl.togglePin} title={fl.pin ? 'Pin hatayein (azaad khinchein)' : 'Side mein pin karein'} aria-label="Pin">📌</button>
        <button className="mp-btn sm" onClick={() => m.setBig(!big)} aria-label={big ? 'Chhota karein' : 'Bara karein'} title={big ? 'Chhota' : 'Bara'}>{big ? '▾' : '▴'}</button>
        <button className="mp-btn sm" onClick={m.openLibrary} aria-label="Playlist" title="Playlist">☰</button>
        <a className="mp-btn sm" href={track.url} target="_blank" rel="noopener noreferrer" aria-label="Asal jagah kholein" title="Kholein">↗</a>
        <button className="mp-btn sm" onClick={m.stop} aria-label="Band karein" title="Band">✕</button>
      </div>

      <div className="mp2-main">
        <div className={'mp2-stage' + (src.kind === 'embed' ? ' embed' : '')}>
          {src.kind === 'youtube' && <div ref={ytBox} className="mp-yt" />}
          {src.kind === 'audio' && src.video && <video ref={(el) => (media.current = el)} src={mediaSrc} autoPlay playsInline {...mediaEvents} />}
          {src.kind === 'audio' && !src.video && (
            <>
              <audio ref={(el) => (media.current = el)} src={mediaSrc} autoPlay {...mediaEvents} />
              <span className="mp2-disc" aria-hidden="true">🎵</span>
            </>
          )}
          {src.kind === 'embed' && (
            <iframe src={src.src} title={track.title || 'Music'} allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write" style={src.height ? { height: big ? src.height : 80 } : undefined} />
          )}
          {src.kind === 'link' && <div className="mp-link muted small">Ye link app ke andar nahi chal sakta. "Kholein" dabayein.</div>}
          {!big && art && <img className="mp2-art" src={art} alt="" />}
        </div>
        <span className="mp2-info">
          <b className="one-line">{track.title || track.url}</b>
          <small className="muted one-line">{err || sourceLabel(src) + (localSrc ? ' · ✓ Offline' : '')}</small>
        </span>
        {!big && (
          <span className="mp2-mini-ctl">
            {(src.kind === 'youtube' || src.kind === 'audio') && (
              <button className="mp-btn main" onClick={m.toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '⏸' : '▶'}</button>
            )}
            <button className="mp-btn" onClick={m.next} aria-label="Agla gaana" title="Agla">⏭</button>
          </span>
        )}
      </div>

      {(src.kind === 'youtube' || src.kind === 'audio') && (
        <div className="mp2-time">
          <span className="num">{fmtT(time.t)}</span>
          {big ? <Wave seed={track.id} t={time.t} dur={time.d} onSeek={seek} /> : (
            <input
              type="range"
              className="mp2-range"
              min={0}
              max={Math.max(1, time.d)}
              step={0.5}
              value={Math.min(time.t, time.d || 0)}
              disabled={!canSeek}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Gaane ki timeline"
              style={{ ['--p' as string]: (time.d ? (time.t / time.d) * 100 : 0) + '%' }}
            />
          )}
          <span className="num">{fmtT(time.d)}</span>
        </div>
      )}

      {big && (
        <div className="mp2-ctl">
          <button className={'mp-btn' + (m.shuffle ? ' on' : '')} onClick={() => m.setShuffle(!m.shuffle)} aria-label="Shuffle" title={m.shuffle ? 'Shuffle: on' : 'Shuffle: off'}>🔀</button>
          <button className="mp-btn" onClick={m.prev} aria-label="Pichla gaana" title="Pichla">⏮</button>
          <button className="mp-btn" onClick={() => seek(time.t - 10)} disabled={!canSeek} aria-label="10 second peeche" title="10 second peeche">⏪<small>10</small></button>
          {(src.kind === 'youtube' || src.kind === 'audio') && (
            <button className="mp-btn main big" onClick={m.toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '⏸' : '▶'}</button>
          )}
          <button className="mp-btn" onClick={() => seek(time.t + 10)} disabled={!canSeek} aria-label="10 second aage" title="10 second aage">⏩<small>10</small></button>
          <button className="mp-btn" onClick={m.next} aria-label="Agla gaana" title="Agla">⏭</button>
          <button className={'mp-btn' + (repeat !== 'off' ? ' on' : '')} onClick={m.cycleRepeat} aria-label="Repeat" title={repeat === 'one' ? 'Repeat: yehi gaana' : repeat === 'all' ? 'Repeat: poori playlist' : 'Repeat: off'}>
            {repeat === 'one' ? '🔂' : '🔁'}
          </button>
        </div>
      )}
      {!big && (
        <div className="mp2-quick">
          <button className="mp-btn sm" onClick={() => seek(time.t - 10)} disabled={!canSeek} aria-label="10 second peeche" title="10 second peeche">⏪</button>
          <button className="mp-btn sm" onClick={m.prev} aria-label="Pichla gaana" title="Pichla">⏮</button>
          <button className={'mp-btn sm' + (m.shuffle ? ' on' : '')} onClick={() => m.setShuffle(!m.shuffle)} aria-label="Shuffle" title="Shuffle">🔀</button>
          <button className={'mp-btn sm' + (repeat !== 'off' ? ' on' : '')} onClick={m.cycleRepeat} aria-label="Repeat" title="Repeat">{repeat === 'one' ? '🔂' : '🔁'}</button>
          <button className="mp-btn sm" onClick={() => seek(time.t + 10)} disabled={!canSeek} aria-label="10 second aage" title="10 second aage">⏩</button>
        </div>
      )}
    </div>
  );
}

/** Music library: sab gaane, apni playlists, upar "➕ Gaana" (link ya PC / phone se upload) */
export function MusicSheet({ onClose }: { onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const m = useMusic();
  const tracks = d.music_tracks;
  const lists = [...d.music_playlists].sort((a, b) => a.position - b.position);
  const [view, setView] = useState<string>('all'); // 'all' | 'uploads' | playlist id
  const [adding, setAdding] = useState<null | 'choose' | 'upload' | 'link'>(null);
  const [newList, setNewList] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [offline, setOffline] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => { offlineKeys().then((k) => setOffline(new Set(k))); }, []);

  const inList = (pid: string) => new Set(d.music_playlist_items.filter((x) => x.playlist_id === pid).map((x) => x.track_id));
  const shown = view === 'all' ? tracks : view === 'uploads' ? tracks.filter((t) => isUploaded(t.url)) : (() => {
    const order = d.music_playlist_items.filter((x) => x.playlist_id === view).sort((a, b) => a.position - b.position).map((x) => x.track_id);
    return order.map((id) => tracks.find((t) => t.id === id)).filter(Boolean) as MusicTrack[];
  })();
  const curList = lists.find((l) => l.id === view);

  async function toggleOffline(url: string) {
    if (offline.has(url)) {
      await removeOffline(url);
      forgetSrc(url);
      setOffline((s) => { const n = new Set(s); n.delete(url); return n; });
      return toast('Offline copy hata di');
    }
    setSaving(url);
    try {
      await saveOffline(url);
      setOffline((s) => new Set(s).add(url));
      toast('📥 Offline save ho gaya — ab internet ke baghair bhi chalega');
    } catch (err) {
      toast(errorText(err));
    } finally {
      setSaving(null);
    }
  }
  const move = async (i: number, dir: -1 | 1) => {
    const a = shown[i], b = shown[i + dir];
    if (!a || !b) return;
    try {
      await d.updateTrack(a.id, { position: b.position === a.position ? b.position + dir : b.position });
      await d.updateTrack(b.id, { position: a.position });
    } catch (err) {
      toast(errorText(err));
    }
  };

  if (adding === 'upload' || adding === 'link')
    return <AddSong mode={adding} playlistId={curList?.id} onBack={() => setAdding(null)} onClose={onClose} />;

  return (
    <Sheet
      title="🎵 Meri music"
      onClose={onClose}
      actions={<button type="button" className="btn primary sm" onClick={() => setAdding('choose')} aria-label="Gaana add karein" title="Gaana add karein">➕ Gaana</button>}
    >
      {adding === 'choose' && (
        <div className="add-choose">
          <b>Gaana kaise add karna hai?</b>
          <div className="two">
            <button type="button" className="choice" onClick={() => setAdding('upload')}>
              <span className="choice-ico">⬆</span>
              <b>PC / phone se upload</b>
              <small className="muted">MP3, M4A, WAV… — offline bhi chal sakta hai</small>
            </button>
            <button type="button" className="choice" onClick={() => setAdding('link')}>
              <span className="choice-ico">🔗</span>
              <b>Link paste</b>
              <small className="muted">YouTube, SoundCloud, Spotify…</small>
            </button>
          </div>
          <button type="button" className="linkbtn" onClick={() => setAdding(null)}>Rehne dein</button>
        </div>
      )}

      <div className="pl-chips">
        <button type="button" className={'chip' + (view === 'all' ? ' on' : '')} onClick={() => setView('all')}>Sab gaane<span className="c">{tracks.length}</span></button>
        <button type="button" className={'chip' + (view === 'uploads' ? ' on' : '')} onClick={() => setView('uploads')}>⬆ Upload kiye<span className="c">{tracks.filter((t) => isUploaded(t.url)).length}</span></button>
        {lists.map((l) => (
          <button type="button" key={l.id} className={'chip' + (view === l.id ? ' on' : '')} onClick={() => setView(l.id)} data-notr>
            {l.name}<span className="c">{inList(l.id).size}</span>
          </button>
        ))}
        {newList === null ? (
          <button type="button" className="chip add" onClick={() => setNewList('')}>+ Playlist</button>
        ) : (
          <form
            className="pl-new"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newList.trim()) return;
              try {
                const id = await d.createPlaylist(newList);
                setNewList(null);
                setView(id);
                toast('Playlist ban gayi — ab gaanon ke ⋯ se is mein daalein');
              } catch (err) {
                toast(errorText(err));
              }
            }}
          >
            <input autoFocus type="text" maxLength={60} value={newList} onChange={(e) => setNewList(e.target.value)} placeholder="Naam, jaise Naat / Qawwali / Sad" aria-label="Playlist ka naam" />
            <button className="btn primary sm" type="submit">Banayein</button>
            <button className="btn sm" type="button" onClick={() => setNewList(null)}>✕</button>
          </form>
        )}
      </div>

      {curList && (
        <div className="row between pl-head">
          <b data-notr>{curList.name}</b>
          <ConfirmButton className="btn sm" label="Playlist delete" confirmLabel="Pakka? (gaane nahi mitenge)" onConfirm={() => d.deletePlaylist(curList.id).then(() => setView('all'), (e) => toast(errorText(e)))} />
        </div>
      )}

      {shown.length ? (
        <div className="list tracks" data-notr>
          {shown.map((t, i) => {
            const s = parseMusic(t.url);
            const on = m?.current?.id === t.id;
            const up = isUploaded(t.url);
            return (
              <div key={t.id} className={'li track' + (on ? ' on' : '')}>
                <button className="track-play" onClick={() => (on ? m?.toggle() : m?.play(t.id, shown.map((x) => x.id)))} aria-label={on && m?.playing ? 'Pause' : 'Chalayein'}>
                  {on && m?.playing ? '⏸' : '▶'}
                </button>
                <span className="grow">
                  <span className="t block one-line">{t.title || t.url}</span>
                  <span className="d block">{up ? '⬆ Upload kiya' : sourceLabel(s)}{offline.has(t.url) ? ' · ✓ Offline' : ''}</span>
                </span>
                {up && (
                  <button className={'btn sm' + (offline.has(t.url) ? ' on' : '')} disabled={saving === t.url} onClick={() => toggleOffline(t.url)} title={offline.has(t.url) ? 'Offline copy hatayein' : 'Is device mein save karein (internet ke baghair chalane ke liye)'}>
                    {saving === t.url ? '…' : offline.has(t.url) ? '✓ Offline' : '📥 Offline'}
                  </button>
                )}
                <button className="btn sm" onClick={() => setMenu(menu === t.id ? null : t.id)} aria-label="Aur options" title="Playlist mein daalein / tarteeb / hatayein">⋯</button>
                {menu === t.id && (
                  <div className="track-menu">
                    <span className="muted tiny">Playlist mein:</span>
                    {lists.length ? lists.map((l) => {
                      const has = inList(l.id).has(t.id);
                      return (
                        <label key={l.id} className="row check">
                          <input type="checkbox" checked={has} onChange={(e) => d.setInPlaylist(l.id, t.id, e.target.checked).catch((er) => toast(errorText(er)))} />
                          <span>{l.name}</span>
                        </label>
                      );
                    }) : <span className="muted tiny">Pehle upar "+ Playlist" se playlist banayein.</span>}
                    <div className="row">
                      {view === 'all' && (
                        <>
                          <button className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Upar">↑</button>
                          <button className="btn sm" onClick={() => move(i, 1)} disabled={i === shown.length - 1} aria-label="Neeche">↓</button>
                        </>
                      )}
                      {curList && <button className="btn sm" onClick={() => d.setInPlaylist(curList.id, t.id, false).catch((e) => toast(errorText(e)))}>Is playlist se nikalein</button>}
                      <ConfirmButton className="btn sm" label="🗑 Gaana mitayein" confirmLabel="Pakka?" onConfirm={() => { if (on) m?.stop(); removeOffline(t.url); forgetSrc(t.url); return d.deleteTrack(t.id).catch((e) => toast(errorText(e))); }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty">
          <b>{curList ? 'Is playlist mein abhi koi gaana nahi' : 'Abhi koi gaana nahi'}</b>
          {curList ? '"Sab gaane" mein kisi gaane ke ⋯ dabayein aur is playlist ko chunein.' : 'Upar "➕ Gaana" dabayein — PC / phone se upload karein ya link paste karein.'}
        </div>
      )}
      {shown.length > 0 && (
        <button className="btn block" onClick={() => m?.play(shown[0].id, shown.map((x) => x.id))}>▶ {curList ? 'Ye playlist chalayein' : 'Sab chalayein'}</button>
      )}
      <p className="muted tiny m0">Music sirf aap ko nazar aata hai. Upload kiye gaanon par "📥 Offline" dabane se gaana is phone / PC mein save ho jata hai aur internet ke baghair bhi chalta hai. YouTube / link wale gaane offline nahi ho sakte.</p>
    </Sheet>
  );
}

/** Gaana add: PC / phone se upload (Catbox) ya link paste */
function AddSong({ mode, playlistId, onBack, onClose }: { mode: 'upload' | 'link'; playlistId?: string; onBack: () => void; onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const after = async (u: string, t: string) => {
    await d.addTrack(t, u);
    if (playlistId) {
      // naya gaana chalu playlist mein bhi
      const id = (await waitTrack(d, u)) || null;
      if (id) await d.setInPlaylist(playlistId, id, true).catch(() => {});
    }
  };

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return toast('Pehle audio file chunein');
    const bad = checkAudioFile(file);
    if (bad) return toast(bad);
    setBusy(true);
    setPct(0);
    try {
      const u = await uploadToCatbox(file, setPct);
      await after(u, title.trim() || file.name.replace(/\.[^.]+$/, '').slice(0, 200));
      toast('🎵 Upload ho kar music mein add ho gaya');
      onBack();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
      setPct(null);
    }
  }
  async function addLink(e: FormEvent) {
    e.preventDefault();
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) return toast('Poora link paste karein (https:// se shuru)');
    setBusy(true);
    try {
      let t = title.trim();
      if (!t) {
        try {
          const r = await fetch('https://noembed.com/embed?url=' + encodeURIComponent(u));
          const j = (await r.json()) as { title?: string };
          t = (j.title || '').slice(0, 200);
        } catch {
          /* naam na mile to link hi naam */
        }
      }
      await after(u, t || u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 80));
      toast('Music mein add ho gaya');
      onBack();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={mode === 'upload' ? '⬆ Gaana upload karein' : '🔗 Gaane ka link'} onClose={() => (busy ? undefined : onClose())}>
      <button type="button" className="back" onClick={onBack} disabled={busy}>‹ Wapas</button>
      {mode === 'upload' ? (
        <form className="form" onSubmit={upload}>
          <div className="f">
            Audio file <span className="h">MP3, M4A, WAV, OGG ya MP4 audio — 200 MB tak. File Catbox.moe par jati hai, app mein sirf link save hota hai.</span>
            <input ref={fileRef} type="file" hidden accept="audio/*,video/mp4,.mp3,.m4a,.wav,.ogg,.opus,.flac" onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 200)); }} disabled={busy} />
            <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
              🎵 {file ? <span data-notr>{file.name}</span> : 'Audio file chunein (phone / PC se)'}
            </button>
          </div>
          <label className="f">
            Naam <span className="h">Khaali chhor dein to file ka naam</span>
            <input type="text" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lofi focus mix" />
          </label>
          {pct !== null && (
            <div className="upbar" role="status">
              <div className="upbar-track" aria-hidden="true"><i style={{ width: (pct < 0 ? 100 : pct) + '%' }} className={pct < 0 || pct >= 100 ? 'done' : ''} /></div>
              <span className="muted tiny">{pct < 0 ? 'Upload ho raha hai…' : pct >= 100 ? 'Catbox file save kar raha hai…' : pct + '%'}</span>
            </div>
          )}
          <button className="btn primary block" type="submit" disabled={busy || !file}>{busy ? 'Upload ho raha hai…' : '⬆ Upload karein'}</button>
        </form>
      ) : (
        <form className="form" onSubmit={addLink}>
          <label className="f">
            Gaane / video ka link
            <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="YouTube, YouTube Music, SoundCloud, Spotify, mp3 link…" required />
          </label>
          <label className="f">
            Naam <span className="h">Khaali chhor dein to app khud dhoondegi</span>
            <input type="text" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Lofi focus mix" />
          </label>
          <button className="btn primary block" type="submit" disabled={busy}>{busy ? 'Add ho raha hai…' : '+ Music mein add karein'}</button>
          <p className="muted tiny m0">Link wale gaane (YouTube waghera) offline nahi ho sakte — offline ke liye PC / phone se upload karein.</p>
        </form>
      )}
    </Sheet>
  );
}

/** naya gaana list mein aane ka intezar (playlist mein daalne ke liye) */
async function waitTrack(d: ReturnType<typeof useData>, url: string): Promise<string | undefined> {
  const { supabase } = await import('../lib/supabase');
  const { data } = await supabase.from('music_tracks').select('id').eq('url', url).order('created_at', { ascending: false }).limit(1);
  return (data as { id: string }[] | null)?.[0]?.id ?? d.music_tracks.find((t) => t.url === url)?.id;
}
