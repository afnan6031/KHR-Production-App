import { useEffect, useState } from 'react';
import { currentGlassLevel, getGlassFx, onGlassFxChange, setGlassFx, type GlassFxMode } from '../lib/glassfx';
import { Seg } from './ui';

/** Glass ki quality: Auto (phone ke hisaab se khud), Lens (sab se sundar), Fast (sab se tez scroll). */
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
        options={[{ v: 'auto', label: 'Auto' }, { v: 'full', label: 'Lens (sab se sundar)' }, { v: 'fast', label: 'Fast (sab se smooth)' }]}
      />
      <span className="h">
        {mode === 'auto'
          ? `Auto: scroll slow ho to khud halka kar deta hai. Abhi: ${lvl === 'lens' ? 'Lens (kinare par refraction)' : lvl === 'blur' ? 'sirf blur' : 'flat (sab se tez)'}`
          : mode === 'full'
            ? 'Kinare par background boond ki tarah mura hua dikhta hai. Purane phone par scroll halka sa bhari ho sakta hai.'
            : 'Cards par live blur band — sab se smooth scroll. Header, neeche ki patti aur popup glass hi rehte hain.'}
      </span>
    </div>
  );
}
