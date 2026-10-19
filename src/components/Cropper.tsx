import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Sheet } from './ui';

/**
 * v9: Tasveer crop karna — DP ke liye square (1:1), banner ke liye chaura (3:1).
 * Ungli / mouse se khiskayein, slider se zoom. Nateeja JPEG banta hai jo ImgBB par jata hai.
 */
export function CropSheet({ file, aspect, outWidth, title, onDone, onClose, round }: {
  file: File;
  aspect: number;
  outWidth: number;
  title: string;
  round?: boolean;
  onDone: (f: File) => void | Promise<void>;
  onClose: () => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // image ka center, frame ke center se (px)
  const [busy, setBusy] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const [fw, setFw] = useState(300);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFw(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fh = fw / aspect;
  // "cover": kam se kam itna bara ke frame poora bhar jaye
  const base = img ? Math.max(fw / img.width, fh / img.height) : 1;
  const scale = base * zoom;
  const iw = img ? img.width * scale : 0;
  const ih = img ? img.height * scale : 0;
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.max(-(iw - fw) / 2, Math.min((iw - fw) / 2, p.x)),
    y: Math.max(-(ih - fh) / 2, Math.min((ih - fh) / 2, p.y))
  });
  const cp = clamp(pos);

  const down = (e: RPointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      drag.current = null;
    } else drag.current = { x: e.clientX, y: e.clientY, px: cp.x, py: cp.y };
  };
  const move = (e: RPointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      setZoom(Math.max(1, Math.min(4, (pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist)));
    } else if (drag.current) {
      setPos({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y });
    }
  };
  const up = (e: RPointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    if (!pts.current.size) {
      drag.current = null;
      setPos(clamp(pos));
    }
  };

  async function done() {
    if (!img) return;
    setBusy(true);
    try {
      const outH = Math.round(outWidth / aspect);
      const c = document.createElement('canvas');
      c.width = outWidth;
      c.height = outH;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      // frame ka hissa asal tasveer mein kahan hai
      const sx = (iw / 2 - fw / 2 - cp.x) / scale;
      const sy = (ih / 2 - fh / 2 - cp.y) / scale;
      ctx.drawImage(img, sx, sy, fw / scale, fh / scale, 0, 0, outWidth, outH);
      const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Crop nahi hua'))), 'image/jpeg', 0.9));
      await onDone(new File([blob], 'khr-' + Date.now() + '.jpg', { type: 'image/jpeg' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <p className="muted small m0">Tasveer ko ungli se khiskayein, aur neeche slider (ya do ungliyon) se zoom karein.</p>
      <div
        ref={frame}
        className={'crop-frame' + (round ? ' round' : '')}
        style={{ aspectRatio: String(aspect) }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {img ? (
          <img
            src={img.src}
            alt=""
            draggable={false}
            style={{ width: iw, height: ih, transform: `translate(calc(-50% + ${cp.x}px), calc(-50% + ${cp.y}px))` }}
          />
        ) : (
          <span className="muted">Tasveer khul rahi hai…</span>
        )}
      </div>
      <label className="f">
        Zoom
        <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
      </label>
      <div className="row">
        <button className="btn" onClick={() => { setZoom(1); setPos({ x: 0, y: 0 }); }}>Reset</button>
        <button className="btn primary grow" disabled={!img || busy} onClick={done}>{busy ? 'Upload ho rahi hai…' : '✓ Crop kar ke lagayein'}</button>
      </div>
    </Sheet>
  );
}
