import { useState } from 'react';
import { useData } from '../lib/data';
import type { Task, TaskState } from '../lib/types';
import { REJECT_PENALTY, errorText, fmtClock, fmtDate, fmtDur, isLate, periodOf, roleClass, taskState, todayKey, type PeriodKind, type Score } from '../lib/utils';
import { Seg, Sheet, useToast } from './ui';

/* ================= One task row ================= */
export function TaskItem({ task, now, showName, showChannel = true, onOpenChannel, onReject }: {
  task: Task;
  now: number;
  showName?: boolean;
  showChannel?: boolean;
  onOpenChannel?: (id: string) => void;
  onReject?: (t: Task) => void;
}) {
  const d = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const st = taskState(task, now);
  const ch = d.channels.find((c) => c.id === task.channel_id);
  const mine = task.user_id === d.uid;
  const canToggle = mine && st !== 'rejected';
  const canReview = d.isOwner;
  const due = new Date(task.due_at).getTime();
  const today = todayKey();

  let line: string;
  if (st === 'pending') line = `Deadline ${fmtClock(task.due_at)} · ${fmtDur(due - now)} baqi`;
  else if (st === 'expired') line = `Deadline ${task.day !== today ? fmtDate(task.day) + ' ' : ''}${fmtClock(task.due_at)} nikal gayi · ${fmtDur(now - due)} pehle`;
  else if (st === 'done') line = `Complete ${fmtClock(task.completed_at)}${isLate(task) ? ' · deadline ke baad' : ''}`;
  else line = `Rejected${task.rejected_reason ? ': ' + task.rejected_reason : ''} · −${REJECT_PENALTY}%`;

  async function toggle() {
    setBusy(true);
    try {
      await d.setTaskDone(task.id, st !== 'done');
      toast(st !== 'done' ? 'Task complete ho gaya' : 'Task wapas pending mein');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={'task ' + st}>
      <button
        className="tick"
        disabled={!canToggle || busy}
        onClick={toggle}
        aria-pressed={st === 'done'}
        aria-label={st === 'done' ? 'Complete hata dein' : 'Complete mark karein'}
        title={canToggle ? (st === 'done' ? 'Untick: wapas pending' : 'Tick: complete') : st === 'rejected' ? 'Owner ne reject kiya' : ''}
      >
        {st === 'done' && (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5 10 17 19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {st === 'rejected' && <span aria-hidden="true">✕</span>}
      </button>
      <button className="task-body" onClick={() => onOpenChannel?.(task.channel_id)} disabled={!onOpenChannel}>
        <span className="task-title">
          {showName && <b>{d.nameOf(task.user_id)}</b>}
          {showName && showChannel && <span className="muted"> · </span>}
          {showChannel && <span>{ch?.name || 'Channel'}</span>}
        </span>
        <span className="task-meta">
          <span className={'role sm ' + roleClass(task.role)}>{task.role}</span>
          {task.day !== today && st !== 'expired' && <span className="muted">{fmtDate(task.day)}</span>}
          <span className={'task-line ' + st + (st === 'done' && isLate(task) ? ' late' : '')}>{line}</span>
        </span>
      </button>
      {canReview && (st === 'done' || st === 'expired') && onReject && (
        <button className="btn sm danger" onClick={() => onReject(task)}>
          Reject
        </button>
      )}
      {canReview && st === 'rejected' && (
        <button
          className="btn sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await d.reviewTask(task.id, false);
              toast('Rejection hata di');
            } catch (e) {
              toast(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Wapas lein
        </button>
      )}
    </div>
  );
}

/* ================= Pending / Expired / Completed board ================= */
const SECTIONS: { key: 'pending' | 'expired' | 'completed'; title: string; empty: string }[] = [
  { key: 'pending', title: 'Pending', empty: 'Koi pending task nahi.' },
  { key: 'expired', title: 'Deadline expired', empty: 'Koi task late nahi. Shabaash!' },
  { key: 'completed', title: 'Completed', empty: 'Abhi koi task complete nahi hua.' }
];

export function TaskBoard({ tasks, now, showName, onOpenChannel, emptyAll }: { tasks: Task[]; now: number; showName?: boolean; onOpenChannel?: (id: string) => void; emptyAll: string }) {
  const [rejecting, setRejecting] = useState<Task | null>(null);
  const groups: Record<string, Task[]> = { pending: [], expired: [], completed: [] };
  tasks.forEach((t) => {
    const st: TaskState = taskState(t, now);
    groups[st === 'done' || st === 'rejected' ? 'completed' : st].push(t);
  });
  groups.pending.sort((a, b) => a.due_at.localeCompare(b.due_at));
  groups.expired.sort((a, b) => a.due_at.localeCompare(b.due_at));
  groups.completed.sort((a, b) => (b.completed_at || b.rejected_at || '').localeCompare(a.completed_at || a.rejected_at || ''));

  if (!tasks.length) return <div className="empty"><b>Aaj koi task nahi</b>{emptyAll}</div>;

  return (
    <div className="board">
      {SECTIONS.map((s) => (
        <section key={s.key} className={'bsec ' + s.key}>
          <div className="bsec-h">
            <span className="dot" aria-hidden="true" />
            <h3>{s.title}</h3>
            <span className="count num">{groups[s.key].length}</span>
          </div>
          {groups[s.key].length ? (
            <div className="tasks">
              {groups[s.key].map((t) => (
                <TaskItem key={t.id} task={t} now={now} showName={showName} onOpenChannel={onOpenChannel} onReject={setRejecting} />
              ))}
            </div>
          ) : (
            <p className="muted small m0 bsec-empty">{s.empty}</p>
          )}
        </section>
      ))}
      {rejecting && <RejectSheet task={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  );
}

/* ================= Owner: reject a task ================= */
const QUICK_REASONS = ['Deadline par jaan bujh kar complete kiya', 'Kaam adhoora tha', 'Kaam ki quality theek nahi', 'Kaam kiya hi nahi'];

export function RejectSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const ch = d.channels.find((c) => c.id === task.channel_id);
  return (
    <Sheet title="Task reject karein" onClose={onClose}>
      <div className="panel tight">
        <b>{d.nameOf(task.user_id)}</b>
        <span className="muted small">
          {ch?.name} · {task.role} · {fmtDate(task.day)} · deadline {fmtClock(task.due_at)}
          {task.completed_at ? ' · complete ' + fmtClock(task.completed_at) : ''}
        </span>
      </div>
      <div className="note">
        Reject hone par ye task complete mein count nahi hoga, aur is bande ki us din, hafte aur mahine ki progress se <b>{REJECT_PENALTY}% mazeed</b> kat jayega. Leaderboard par bhi rejected count nazar aayega. Baad mein "Wapas lein" se hata bhi sakte hain.
      </div>
      <div className="f">
        Wajah
        <div className="chips">
          {QUICK_REASONS.map((r) => (
            <button type="button" key={r} className={'chip ' + (reason === r ? 'on' : '')} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
        <input id="rej-reason" type="text" maxLength={140} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ya apni wajah likhein" />
      </div>
      <button
        className="btn danger block"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await d.reviewTask(task.id, true, reason.trim());
            toast('Task reject ho gaya');
            onClose();
          } catch (e) {
            toast(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Ruk jayein…' : `Reject karein (−${REJECT_PENALTY}%)`}
      </button>
    </Sheet>
  );
}

/* ================= Period picker ================= */
export function PeriodPicker({ kind, offset, onKind, onOffset }: { kind: PeriodKind; offset: number; onKind: (k: PeriodKind) => void; onOffset: (n: number) => void }) {
  const p = periodOf(kind, offset);
  return (
    <div className="period">
      <Seg
        label="Muddat"
        value={kind}
        onChange={(k) => {
          onKind(k);
          onOffset(0);
        }}
        options={[
          { v: 'day', label: 'Daily' },
          { v: 'week', label: 'Weekly' },
          { v: 'month', label: 'Monthly' }
        ]}
      />
      <div className="pnav">
        <button className="btn sm" onClick={() => onOffset(offset - 1)} aria-label="Pichla">
          ‹
        </button>
        <span className="plabel">{p.label}</span>
        <button className="btn sm" onClick={() => onOffset(offset + 1)} disabled={offset >= 0} aria-label="Agla">
          ›
        </button>
      </div>
    </div>
  );
}

/* ================= Score ring ================= */
export function ScoreRing({ score, size = 96 }: { score: number | null; size?: number }) {
  const r = 42, c = 2 * Math.PI * r;
  const v = score ?? 0;
  const cls = score == null ? '' : v >= 85 ? 'good' : v >= 65 ? 'warn' : 'bad';
  return (
    <svg className={'ring ' + cls} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={score == null ? 'Abhi score nahi' : `Progress ${v}%`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="9" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--pc, var(--accent))" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} transform="rotate(-90 50 50)" />
      <text x="50" y="56" textAnchor="middle" fontFamily="var(--f-mono)" fontWeight="700" fontSize="22" fill="var(--fg)">
        {score == null ? '—' : v + '%'}
      </text>
    </svg>
  );
}

export function ScoreStats({ s }: { s: Score }) {
  return (
    <div className="sstats">
      <div><span className="num">{s.done}</span><small>Complete</small></div>
      <div><span className="num warn">{s.late}</span><small>Late</small></div>
      <div><span className="num bad">{s.rejected}</span><small>Rejected</small></div>
      <div><span className="num bad">{s.missed}</span><small>Missed</small></div>
      <div><span className="num muted">{s.pending}</span><small>Pending</small></div>
    </div>
  );
}
