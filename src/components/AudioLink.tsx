import { useEffect, useState } from 'react';
import { downloadUrl, normalizeAudioUrl, offlineSrc } from '../lib/audio';

/**
 * v16: voiceover / audio link ka player — app ke andar chalaye aur download kare.
 * - Pixeldrain (pixeldrain.com/u/… ya /api/file/…): seedha player + asli download
 * - Google Drive link: Drive ka apna player (seedha <audio> mein Drive nahi chalta)
 * - Link na chale (server band / ghalat link): saaf message + Kholein / Download
 */
export function AudioLink({ url, label = '🎙 Voiceover' }: { url: string; label?: string }) {
  const u = normalizeAudioUrl(url);
  const drive = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/i.exec(u)?.[1] || '';
  const [src, setSrc] = useState(u);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    setErr(false);
    setSrc(u);
    // offline save hai to wahi (internet ke baghair bhi)
    offlineSrc(u).then((l) => alive && l && setSrc(l));
    return () => { alive = false; };
  }, [u]);
  const dl = drive ? `https://drive.google.com/uc?export=download&id=${drive}` : downloadUrl(u);
  return (
    <div className="vo-box">
      <b>{label}</b>
      {drive ? (
        <iframe className="vo-drive" src={`https://drive.google.com/file/d/${drive}/preview`} title={label} allow="autoplay" />
      ) : !err ? (
        <audio controls preload="metadata" src={src} className="vo-audio" onError={() => setErr(true)} />
      ) : (
        <p className="vo-err small m0">
          Ye awaaz app ke andar nahi chal saki{/catbox\.moe/i.test(u) ? ' (Catbox ka server band / blocked hai — dobara upload karein, ab Pixeldrain par jayegi)' : ' (link khula nahi ya server band hai)'}. Neeche "Kholein" se try karein.
        </p>
      )}
      <div className="vo-actions">
        <a className="btn sm primary" href={dl} target="_blank" rel="noopener noreferrer" download>⬇ Download</a>
        <a className="btn sm" href={u} target="_blank" rel="noopener noreferrer">Kholein ↗</a>
      </div>
    </div>
  );
}
