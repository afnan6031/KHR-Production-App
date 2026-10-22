import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../lib/data';
import { errorText } from '../lib/utils';
import { MAX_CHARS, VOICES, deleteTake, generateSpeech, loadTakes, peaksOf, previewCached, saveTake, voicePreview, type Take, type Voice } from '../lib/gemini';
import { uploadAudio } from '../lib/audio';
import { saveBlobFile } from '../lib/files';
import { useMusic } from '../components/Music';
import { Sheet, useToast } from '../components/ui';

/**
 * v16: 🎙 Voiceover Studio — Google Gemini se script ki awaaz.
 * Awaaz pehle sirf is device par banti hai; "Playlist mein save" par Pixeldrain (Supabase par sirf link).
 */

const STYLES: { k: string; label: string; style: string }[] = [
  { k: 'normal', label: 'Normal', style: '' },
  { k: 'doc', label: 'Documentary', style: 'a calm, authoritative documentary narrator' },
  { k: 'story', label: 'Kahani', style: 'a warm storyteller, engaging and expressive' },
  { k: 'news', label: 'News', style: 'a clear, confident news anchor' },
  { k: 'calm', label: 'Calm', style: 'soft, calm and soothing' },
  { k: 'hype', label: 'Energetic', style: 'energetic and excited, like a YouTube intro' }
];
const PACES: { k: string; label: string; style: string }[] = [
  { k: 'n', label: 'Normal raftar', style: '' },
  { k: 's', label: 'Aahista', style: 'speaking slowly with clear pauses' },
  { k: 'f', label: 'Tez', style: 'speaking at a brisk pace' }
];

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const fmt = (s: number) => (isFinite(s) && s > 0 ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00');

/** har awaaz ki apni "voiceprint" (naam se bani choti lehrein) */
function Voiceprint({ v, live, size = 'm' }: { v: Voice; live?: boolean; size?: 's' | 'm' }) {
  const h = hash(v.name);
  const hue = h % 360;
  const bars = Array.from({ length: 9 }, (_, i) => 0.28 + (((h >> (i * 3)) & 7) / 7) * 0.72);
  return (
    <span className={'vprint ' + size + (live ? ' live' : '')} style={{ ['--vh' as string]: hue }} aria-hidden="true">
      {bars.map((b, i) => <i key={i} style={{ height: Math.round(b * 100) + '%', animationDelay: i * 70 + 'ms' }} />)}
    </span>
  );
}

/** lehron wala player — click / drag se aage peeche */
function WavePlayer({ blob, onPlay }: { blob: Blob; onPlay?: () => void }) {
  const [url, setUrl] = useState('');
  const [peaks, setPeaks] = useState<number[]>([]);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const a = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    setT(0);
    peaksOf(blob, 120).then(setPeaks).catch(() => setPeaks([]));
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  const seekTo = (x: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (x - r.left) / r.width));
    if (a.current && dur) { a.current.currentTime = p * dur; setT(p * dur); }
  };
  const p = dur ? t / dur : 0;
  return (
    <div className="wplayer">
      <button type="button" className="wp-play" onClick={() => { const el = a.current; if (!el) return; if (el.paused) { onPlay?.(); el.play().catch(() => {}); } else el.pause(); }} aria-label={playing ? 'Rokein' : 'Chalayein'}>
        {playing ? <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg> : <svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>}
      </button>
      <div
        className="wp-wave"
        role="slider"
        tabIndex={0}
        aria-label="Awaaz mein aage / peeche"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(t)}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); seekTo(e.clientX, e.currentTarget); }}
        onPointerMove={(e) => { if (e.buttons) seekTo(e.clientX, e.currentTarget); }}
        onKeyDown={(e) => {
          if (!a.current) return;
          if (e.key === 'ArrowRight') a.current.currentTime = Math.min(dur, a.current.currentTime + 5);
          if (e.key === 'ArrowLeft') a.current.currentTime = Math.max(0, a.current.currentTime - 5);
        }}
      >
        {(peaks.length ? peaks : Array(120).fill(0.15)).map((v, i, arr) => (
          <i key={i} className={i / arr.length < p ? 'on' : ''} style={{ height: Math.round(v * 100) + '%' }} />
        ))}
      </div>
      <span className="wp-time num">{fmt(t)} / {fmt(dur)}</span>
      <audio
        ref={a}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}

function VoiceList({ voice, setVoice, preview, previewing, cached }: { voice: string; setVoice: (n: string) => void; preview: (v: Voice) => void; previewing: string; cached: Set<string> }) {
  const [q, setQ] = useState('');
  const [g, setG] = useState<'all' | 'female' | 'male'>('all');
  const list = VOICES.filter((v) => (g === 'all' || v.gender === g) && (v.name + ' ' + v.style + ' ' + v.best).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="vlib">
      <div className="vlib-tools">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Awaaz dhoondein (Deep, Calm, Kore…)" aria-label="Awaaz dhoondein" />
        <div className="seg sm" role="group" aria-label="Awaaz ki qisam">
          <button type="button" className={g === 'all' ? 'on' : ''} onClick={() => setG('all')}>Sab</button>
          <button type="button" className={g === 'female' ? 'on' : ''} onClick={() => setG('female')}>Aurat</button>
          <button type="button" className={g === 'male' ? 'on' : ''} onClick={() => setG('male')}>Mard</button>
        </div>
      </div>
      <div className="vlib-list" role="listbox" aria-label="Awaazein">
        {list.map((v) => {
          const on = v.name === voice;
          const busy = previewing === v.name + ':load';
          const live = previewing === v.name;
          return (
            <div key={v.name} className={'vrow' + (on ? ' on' : '')} role="option" aria-selected={on}>
              <button type="button" className="vrow-main" onClick={() => setVoice(v.name)}>
                <Voiceprint v={v} live={live} />
                <span className="vrow-txt">
                  <b data-notr>{v.name}</b>
                  <small>{v.style}, {v.best}</small>
                </span>
                <span className={'vg ' + v.gender} title={v.gender === 'female' ? 'Aurat' : 'Mard'}>{v.gender === 'female' ? '♀' : '♂'}</span>
              </button>
              <button type="button" className={'vprev' + (live ? ' live' : '')} onClick={() => preview(v)} aria-label={(live ? 'Namoona rokein: ' : 'Namoona sunein: ') + v.name} title={cached.has(v.name) ? 'Namoona sunein' : 'Namoona sunein (pehli dafa banega)'}>
                {busy ? <span className="spin sm" /> : live ? '■' : '▶'}
              </button>
            </div>
          );
        })}
        {!list.length && <p className="muted small m0">Is naam / andaaz ki koi awaaz nahi.</p>}
      </div>
    </div>
  );
}

export function VoiceStudio() {
  const d = useData();
  const toast = useToast();
  const music = useMusic();
  const [text, setText] = useState(() => { try { return localStorage.getItem('khr-vo-draft') || ''; } catch { return ''; } });
  const [voice, setVoice] = useState(() => { try { return localStorage.getItem('khr-vo-voice') || 'Charon'; } catch { return 'Charon'; } });
  const [styleK, setStyleK] = useState('normal');
  const [custom, setCustom] = useState('');
  const [pace, setPace] = useState('n');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [previewing, setPreviewing] = useState('');
  const [cached, setCached] = useState<Set<string>>(new Set());
  const [pickOpen, setPickOpen] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [plist, setPlist] = useState('');
  const abort = useRef<AbortController | null>(null);
  const pv = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { loadTakes().then((t) => { setTakes(t); if (t[0]) setTake(t[0]); }); previewCached().then((k) => setCached(new Set(k))); }, []);
  useEffect(() => { const id = window.setTimeout(() => { try { localStorage.setItem('khr-vo-draft', text); } catch { /* koi baat nahi */ } }, 400); return () => window.clearTimeout(id); }, [text]);
  useEffect(() => { try { localStorage.setItem('khr-vo-voice', voice); } catch { /* koi baat nahi */ } }, [voice]);
  useEffect(() => () => { pv.current?.pause(); abort.current?.abort(); }, []);
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    return () => window.clearInterval(id);
  }, [busy]);

  const len = text.length;
  const over = len > MAX_CHARS;
  const empty = text.trim().length === 0;
  const v = VOICES.find((x) => x.name === voice) || VOICES[0];
  const styleText = useMemo(() => {
    const s = styleK === 'custom' ? custom.trim() : STYLES.find((x) => x.k === styleK)?.style || '';
    const p = PACES.find((x) => x.k === pace)?.style || '';
    return [s, p].filter(Boolean).join(', ');
  }, [styleK, custom, pace]);
  const estSec = Math.round(len / 14);

  const stopMusic = () => { if (music?.playing) music.toggle(); };

  async function preview(x: Voice) {
    if (previewing === x.name) { pv.current?.pause(); setPreviewing(''); return; }
    pv.current?.pause();
    setPreviewing(x.name + ':load');
    try {
      const blob = await voicePreview(x.name);
      setCached((c) => new Set(c).add(x.name));
      const el = new Audio(URL.createObjectURL(blob));
      pv.current = el;
      el.onended = () => setPreviewing((p) => (p === x.name ? '' : p));
      stopMusic();
      setPreviewing(x.name);
      await el.play();
    } catch (e) {
      setPreviewing('');
      toast(errorText(e));
    }
  }

  async function generate() {
    if (empty || over || busy) return;
    pv.current?.pause();
    setPreviewing('');
    setBusy(true);
    setElapsed(0);
    abort.current = new AbortController();
    try {
      const { blob, model } = await generateSpeech({ text, voice, style: styleText, signal: abort.current.signal });
      const t: Take = { id: Date.now().toString(36), at: Date.now(), voice, style: styleText, text: text.trim(), blob, model };
      setTake(t);
      setTakes((all) => [t, ...all.filter((x) => x.id !== t.id)].slice(0, 6));
      saveTake(t);
      toast('🎙 Voiceover tayyar');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  async function download() {
    if (!take) return;
    try {
      const day = new Date(take.at).toISOString().slice(0, 10);
      toast(await saveBlobFile(take.blob, `voiceover-${take.voice}-${day}-${take.id}.wav`));
    } catch (e) {
      toast(errorText(e));
    }
  }

  async function toPlaylist() {
    if (!take || saving !== null) return;
    setSaving(0);
    try {
      const title = 'Voiceover · ' + take.voice + ' · ' + take.text.replace(/\s+/g, ' ').slice(0, 40);
      const url = await uploadAudio(take.blob, setSaving, undefined, `voiceover-${take.voice}-${take.id}.wav`);
      const id = await d.addTrack(title, url);
      if (plist) await d.setInPlaylist(plist, id, true).catch(() => {});
      const t = { ...take, url };
      setTake(t);
      setTakes((all) => all.map((x) => (x.id === t.id ? t : x)));
      saveTake(t);
      toast('➕ Aap ki music playlist mein save ho gaya');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="studio">
      <header className="studio-head">
        <h1>Voiceover studio</h1>
        <p className="muted">Script likhein, awaaz chunein, aur Gemini se voiceover banayein. Pasand aaye to download karein ya apni playlist mein rakh lein.</p>
      </header>

      <div className="studio-grid">
        <section className="studio-main">
          <button type="button" className="vpick" onClick={() => setPickOpen(true)}>
            <Voiceprint v={v} live={previewing === v.name} />
            <span className="vrow-txt"><b data-notr>{v.name}</b><small>{v.style}, {v.best}</small></span>
            <span className="btn sm">Awaaz badlein</span>
          </button>

          <div className={'script-box' + (over ? ' over' : '')}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Yahan apni script likhein ya paste karein…"
              aria-label="Script"
              spellCheck={false}
              data-notr
            />
            <div className="script-foot">
              <span className={'cc num' + (over ? ' bad' : len > MAX_CHARS * 0.9 ? ' warn' : '')} aria-live="polite">{len} / {MAX_CHARS}</span>
              {len > 0 && !over && <span className="muted small">{`~${fmt(estSec)} minute ki awaaz`}</span>}
              {len > 0 && <button type="button" className="linkbtn" onClick={() => setText('')}>Saaf karein</button>}
            </div>
          </div>

          <div className="tone">
            <div className="tone-row" role="group" aria-label="Andaaz">
              {STYLES.map((s) => (
                <button key={s.k} type="button" className={'chip sm' + (styleK === s.k ? ' on' : '')} onClick={() => setStyleK(s.k)}>{s.label}</button>
              ))}
              <button type="button" className={'chip sm' + (styleK === 'custom' ? ' on' : '')} onClick={() => setStyleK('custom')}>Apna andaaz…</button>
            </div>
            {styleK === 'custom' && (
              <input type="text" maxLength={160} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Misal: whispering, mysterious, horror story" aria-label="Apna andaaz (English mein)" />
            )}
            <select value={pace} onChange={(e) => setPace(e.target.value)} aria-label="Raftar">
              {PACES.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}
            </select>
          </div>

          <div className="gen-bar">
            {busy ? (
              <div className="gen-busy" role="status">
                <Voiceprint v={v} live size="s" />
                <span><b>{v.name}</b> awaaz bana rahi hai… <span className="num">{elapsed}s</span></span>
                <button type="button" className="btn sm" onClick={() => abort.current?.abort()}>Rokein</button>
              </div>
            ) : (
              <button type="button" className="btn primary gen-btn" disabled={empty || over || busy} onClick={generate}>
                Generate Voiceover
              </button>
            )}
            {over && (
              <p className="gen-warn" role="alert">
                {`⚠️ Characters 4000 se ziada hain! Voice generate karne ke liye script ko 4000 characters ya us se kam rakhein (Current: ${len} / 4000).`}
              </p>
            )}
          </div>

          {take && (
            <div className="take">
              <div className="take-head">
                <Voiceprint v={VOICES.find((x) => x.name === take.voice) || v} size="s" />
                <div className="grow">
                  <b data-notr>{take.voice}</b>
                  <small className="muted block" data-notr>{take.text.slice(0, 90)}{take.text.length > 90 ? '…' : ''}</small>
                </div>
              </div>
              <WavePlayer blob={take.blob} onPlay={stopMusic} />
              <div className="take-actions">
                <button type="button" className="btn" onClick={download}>⬇️ Download Audio (.wav)</button>
                {take.url ? (
                  <span className="chip good sm">✓ Playlist mein save hai</span>
                ) : (
                  <>
                    {d.music_playlists.length > 0 && (
                      <select value={plist} onChange={(e) => setPlist(e.target.value)} aria-label="Kis playlist mein" disabled={saving !== null}>
                        <option value="">Sab gaane</option>
                        {d.music_playlists.map((p) => <option key={p.id} value={p.id} data-notr>{p.name}</option>)}
                      </select>
                    )}
                    <button type="button" className="btn primary" onClick={toPlaylist} disabled={saving !== null}>
                      {saving !== null ? (saving < 0 ? 'Save ho raha hai…' : 'Save ho raha hai… ' + saving + '%') : '➕ Save to My Playlist'}
                    </button>
                  </>
                )}
              </div>
              {saving !== null && (
                <div className="upbar" role="status"><div className="upbar-track" aria-hidden="true"><i style={{ width: (saving < 0 ? 100 : saving) + '%' }} className={saving < 0 || saving >= 100 ? 'done' : ''} /></div></div>
              )}
            </div>
          )}

          {takes.length > 1 && (
            <div className="takes">
              <h2>Pichli voiceovers</h2>
              <p className="muted tiny m0">Sirf is device par (aakhri 6). Playlist mein save ki hui har jagah milti hain.</p>
              {takes.map((t) => (
                <div key={t.id} className={'take-li' + (take?.id === t.id ? ' on' : '')}>
                  <button type="button" className="take-li-main" onClick={() => setTake(t)}>
                    <Voiceprint v={VOICES.find((x) => x.name === t.voice) || v} size="s" />
                    <span className="grow"><b data-notr>{t.voice}</b> <small className="muted" data-notr>{t.text.slice(0, 60)}</small></span>
                    {t.url && <span className="chip good sm">✓</span>}
                  </button>
                  <button type="button" className="icon-btn" aria-label="Mitayein" onClick={() => { deleteTake(t.id); setTakes((all) => all.filter((x) => x.id !== t.id)); if (take?.id === t.id) setTake(null); }}>×</button>
                </div>
              ))}
            </div>
          )}
          <p className="muted tiny m0">Gemini ki free limit mein din bhar mein kuch hi voiceovers banti hain. Har awaaz ka namoona sirf pehli dafa banta hai, phir is device par yaad rehta hai. Urdu script se behtar Roman Urdu / Hindi / English chalti hai.</p>
        </section>

        <aside className="studio-side">
          <h2>Awaazein</h2>
          <VoiceList voice={voice} setVoice={setVoice} preview={preview} previewing={previewing} cached={cached} />
        </aside>
      </div>

      {pickOpen && (
        <Sheet title="Awaaz chunein" onClose={() => setPickOpen(false)}>
          <VoiceList voice={voice} setVoice={(n) => { setVoice(n); setPickOpen(false); }} preview={preview} previewing={previewing} cached={cached} />
        </Sheet>
      )}
    </div>
  );
}
