import { useEffect, useState } from 'react';
import { currentGlassLevel, getGlassFx, onGlassFxChange, setGlassFx, type GlassFxMode } from '../lib/glassfx';
import { Seg } from './ui';

/** Glass ki quality: Auto (device ke hisaab se khud), 3D Full (header / menu par live blur + mouse tilt), Fast (live blur bilkul nahi). */
export function GlassFxPick() {
  const [mode, setMode] = useState<GlassFxMode>(getGlassFx());
  const [, bump] = useState(0);
  useEffect(() => onGlassFxChange(() => { setMode(getGlassFx()); bump((x) => x + 1); }), []);
  const lvl = currentGlassLevel();
  return (
    <div className="f">
      Glass quality
      <Seg<GlassFxMode>
        label="Glass quality"
        value={mode}
        onChange={setGlassFx}
        options={[{ v: 'auto', label: 'Auto' }, { v: 'full', label: '3D Full' }, { v: 'fast', label: 'Fast' }]}
      />
      <span className="h">
        {mode === 'auto'
          ? `Auto: PC par 3D Full, phone par Fast (3D shading dono mein poori). Abhi: ${lvl === 'full' ? '3D Full' : 'Fast'}`
          : mode === 'full'
            ? '3D shading + header / neeche ki patti / dropdown / popup par live glass blur + PC par mouse ke saath card tilt.'
            : '3D shading wahi, lekin live blur bilkul band — sab se smooth (90 FPS) scroll.'}
      </span>
    </div>
  );
}
