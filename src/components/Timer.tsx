import type { Task } from '../lib/types';
import { GRACE_MS, PTS_MISSED, REJECT_PENALTY, fmtClock, isLate, fmtWhen } from '../lib/utils';
import { useNow } from './ui';

/** 01:23:45 */
function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (h >= 24 ? Math.floor(h / 24) + 'd ' + pad(h % 24) : pad(h)) + ':' + pad(m) + ':' + pad(x);
}

/**
 * Task ka live timer:
 *  - waqt shuru nahi hua → "Shuru hone mein 01:12:30"
 *  - waqt chal raha hai  → "Baqi 02:14:09" + progress bar
 *  - deadline guzar gayi → "Late 00:42:10"
 *  - complete / rejected → kab hua
 */
export function TaskTimer({ task, big }: { task: Task; big?: boolean }) {
  const live = task.status === 'pending';
  const now = useNow(live ? 1000 : 600000);
  const start = task.start_at ? new Date(task.start_at).getTime() : null;
  const due = new Date(task.due_at).getTime();

  if (task.status === 'done') {
    const late = isLate(task);
    const diff = Math.abs(new Date(task.completed_at!).getTime() - due);
    return (
      <div className={'timer done' + (late ? ' late' : '') + (big ? ' big' : '')}>
        <span className="tchip">{late ? 'Extra deadline mein complete · 0 point' : 'Waqt par complete'}</span>
        <span className="tclock">{fmtClock(task.completed_at)}</span>
        <span className="tsub">{late ? `deadline ke ${hms(diff)} baad` : `deadline se ${hms(diff)} pehle`}</span>
      </div>
    );
  }
  if (task.status === 'rejected') {
    return (
      <div className={'timer rejected' + (big ? ' big' : '')}>
        <span className="tchip">Rejected</span>
        <span className="tsub">{task.rejected_reason || 'Owner ne reject kiya'} · −{REJECT_PENALTY}%</span>
      </div>
    );
  }

  if (start && now < start) {
    return (
      <div className={'timer upcoming' + (big ? ' big' : '')} role="timer" aria-live="off">
        <span className="tchip">Abhi waqt nahi</span>
        <span className="tclock num">{hms(start - now)}</span>
        <span className="tsub">mein shuru · {fmtClock(task.start_at)} – {fmtClock(task.due_at)}</span>
      </div>
    );
  }
  if (now < due) {
    const total = start ? due - start : 0;
    const pct = total > 0 ? Math.min(100, ((now - start!) / total) * 100) : 0;
    const left = due - now;
    const urgent = left < 30 * 60000 || (total > 0 && left / total < 0.15);
    return (
      <div className={'timer running' + (urgent ? ' urgent' : '') + (big ? ' big' : '')} role="timer" aria-live="off">
        <span className="tchip"><i className="pulse" aria-hidden="true" />Waqt chal raha hai</span>
        <span className="tclock num">{hms(left)}</span>
        <span className="tsub">baqi · deadline {fmtWhen(task.due_at)}</span>
        {total > 0 && (
          <span className="tbar" aria-hidden="true">
            <i style={{ width: pct + '%' }} />
          </span>
        )}
      </div>
    );
  }
  // v15: deadline ke baad 24 ghante ki extra deadline
  const grace = due + GRACE_MS;
  if (now < grace) {
    return (
      <div className={'timer late grace' + (big ? ' big' : '')} role="timer" aria-live="off">
        <span className="tchip">⏳ Extra deadline</span>
        <span className="tclock num">{hms(grace - now)}</span>
        <span className="tsub">baqi · {fmtWhen(new Date(grace).toISOString())} tak (is mein complete = 0 point, na kiya to {PTS_MISSED})</span>
      </div>
    );
  }
  return (
    <div className={'timer late ended' + (big ? ' big' : '')} role="timer" aria-live="off">
      <span className="tchip">Deadline ended</span>
      <span className="tsub">extra 24 ghante bhi guzar gaye · {PTS_MISSED} point · deadline {fmtWhen(task.due_at)}</span>
    </div>
  );
}
