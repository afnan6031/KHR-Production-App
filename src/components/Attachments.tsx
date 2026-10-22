/**
 * v16: Purani "Attachments" ki jagah — scripts / thumbnails / video / voiceover ab EP (Video) ke andar hain.
 * Ye file sirf ek chhoti, poori tarah typed list deti hai (koi `any` nahi, DataCtx ka `attachments` istemal nahi hota)
 * taake GitHub par purani Attachments.tsx is se badal jaye aur Android / Windows / Web teeno builds pass hon.
 */
import type { Video } from '../lib/types';

export type AttachmentKind = 'script' | 'thumbnail' | 'video' | 'voiceover' | 'youtube' | 'facebook';

export interface AttachmentLink {
  kind: AttachmentKind;
  label: string;
  url: string;
}

const LABELS: Record<AttachmentKind, string> = {
  script: '📄 Script',
  thumbnail: '🖼 Thumbnail',
  video: '🎬 Video',
  voiceover: '🎙 Voiceover',
  youtube: '▶ YouTube',
  facebook: '📘 Facebook'
};

/** EP ke saare lage hue links (tarteeb se) */
export function attachmentsOf(v: Video): AttachmentLink[] {
  const pairs: [AttachmentKind, string | undefined][] = [
    ['script', v.script_url],
    ['thumbnail', v.thumbnail_url],
    ['video', v.video_url],
    ['voiceover', v.voiceover_url],
    ['youtube', v.youtube_url],
    ['facebook', v.facebook_url]
  ];
  return pairs
    .filter((p): p is [AttachmentKind, string] => typeof p[1] === 'string' && p[1].length > 0)
    .map(([kind, url]) => ({ kind, label: LABELS[kind], url }));
}

/** a, b dono ki qisam saaf likhi hai (pehle yahan "implicitly any" ka error aata tha) */
export const byKind = (a: AttachmentLink, b: AttachmentLink): number =>
  (Object.keys(LABELS) as AttachmentKind[]).indexOf(a.kind) - (Object.keys(LABELS) as AttachmentKind[]).indexOf(b.kind);

export function AttachmentList({ video }: { video: Video }) {
  const list = attachmentsOf(video).sort(byKind);
  if (!list.length) return null;
  return (
    <div className="fb-links">
      {list.map((a: AttachmentLink) => (
        <a key={a.kind} className="btn sm" href={a.url} target="_blank" rel="noopener noreferrer">
          {a.label}
        </a>
      ))}
    </div>
  );
}
