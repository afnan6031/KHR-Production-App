import { useState } from 'react';
import type React from 'react';
import { useData } from '../lib/data';
import type { Task, TaskState } from '../lib/types';
import { REJECT_PENALTY, errorText, fmtClock, fmtDate, notStarted, periodOf, roleClass, taskState, todayKey, type PeriodKind, type Score, fmtWhen } from '../lib/utils';
import { Chevron, Seg, Sheet, useFold, useToast } from './ui';
import { TaskSheet } from './TaskSheet';
import { TaskTimer } from './Timer';
import { ChannelTools } from './Videos';

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
  const [open, setOpen] = useState(false);
  const st = taskState(task, now);
  const ch = d.channels.find((c) => c.id === task.channel_id);
  const mine = task.user_id === d.uid;
  const early = notStarted(task, now);
  // waqt shuru hone se pehle tick nahi (untick hamesha ho sakta hai)
  const canToggle = mine && st !== 'rejected' && !(early && st !== 'done');
  const canReview = d.isOwner;
  const today = todayKey();
  const vids = d.videos.filter((v) => v.task_id === task.id);
  const nScripts = vids.filter((v) => v.script_url || v.script).length;
  const thumbs = vids.filter((v) => v.thumbnail_url);
  const [extOpen, setExtOpen] = useState(false);
  const req = d.deadline_requests.find((r) => r.task_id === task.id && r.status === 'pending');
  // deadline mein 30 minute ya kam baqi, ya guzar chuki: extension maang sakte hain
  const canExtend = mine && task.status === 'pending' && new Date(task.due_at).getTime() - now <= 30 * 60000 && new Date(task.due_at).getTime() > now - 7 * 864e5 && !req;

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
        title={canToggle ? (st === 'done' ? 'Untick: wapas pending' : 'Tick: complete') : st === 'rejected' ? 'Owner ne reject kiya' : early ? 'Waqt shuru hone ke baad tick kar sakenge' : ''}
      >
        {st === 'done' && (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5 10 17 19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {st === 'rejected' && <span aria-hidden="true">✕</span>}
        {early && st === 'pending' && (
          <svg viewBox="0 0 24 24" className="lock" aria-hidden="true"><rect x="6" y="11" width="12" height="9" rx="2" fill="currentColor" /><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" strokeWidth="2.2" /></svg>
        )}
      </button>
      <button className="task-body" onClick={() => setOpen(true)} aria-label={'Task kholein: ' + (ch?.name || '') + ' ' + task.role}>
        {task.kind === 'custom' && task.title && <span className="task-custom">📌 {task.title}</span>}
        <span className="task-title">
          {showName && <b>{d.nameOf(task.user_id)}</b>}
          {showName && showChannel && <span className="muted"> · </span>}
          {showChannel && <span>{ch?.name || 'Channel'}</span>}
          {!showName && !showChannel && <span className={'role ' + roleClass(task.role)}>{task.role}</span>}
        </span>
        <span className="task-meta">
          {(showName || showChannel) && <span className={'role sm ' + roleClass(task.role)}>{task.role}</span>}
          {task.day !== today && <span className="muted">{fmtDate(task.day)}</span>}
        </span>
        <TaskTimer task={task} />
        {(nScripts > 0 || thumbs.length > 0) && (
          <span className="att-ind">
            {nScripts > 0 && <span className="att-chip">{nScripts} script{nScripts > 1 ? 's' : ''}</span>}
            {thumbs.slice(0, 3).map((v) => <img key={v.id} src={v.thumbnail_url} alt={v.title} loading="lazy" />)}
          </span>
        )}
      </button>
      {open && <TaskSheet taskId={task.id} onClose={() => setOpen(false)} onOpenChannel={onOpenChannel} onReject={onReject} />}
      {canExtend && (
        <button className="btn sm ext-btn" onClick={() => setExtOpen(true)} title="Deadline barhane ki request">
          ⏳ Waqt barhayein
        </button>
      )}
      {req && mine && <span className="ext-wait" title={req.reason}>⏳ +{req.minutes} min · owner ke paas</span>}
      {req && d.isOwner && <ExtensionReview reqId={req.id} />}
      {extOpen && <ExtensionSheet task={task} onClose={() => setExtOpen(false)} />}
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

/** Har section ke andar pehle channel ka card, phir us channel ke tasks (tick ke saath) */
/** Board mein ek channel ka group: naam (channel kholta hai) + dropdown */
function ChannelGroup({ foldKey, name, count, onOpen, children }: { foldKey: string; name: string; count: number; onOpen?: () => void; children: React.ReactNode }) {
  const [open, toggle] = useFold(foldKey, true);
  return (
    <div className={'cgroup' + (open ? '' : ' closed')}>
      <div className="cgroup-h">
        <button className="cgroup-name" onClick={onOpen} disabled={!onOpen}>{name}</button>
        <button type="button" className="cgroup-fold" onClick={toggle} aria-expanded={open} aria-label={open ? 'Band karein' : 'Kholein'}>
          <span className="muted tiny">{count} task{count > 1 ? 's' : ''}</span>
          <Chevron open={open} />
        </button>
      </div>
      {open && children}
    </div>
  );
}

/** Board ka ek hissa: header par tap = dropdown khule / band (Completed shuru mein band) */
function BoardSection({ k, title, count, foldId, children }: { k: string; title: string; count: number; foldId: string; children: React.ReactNode }) {
  const [open, toggle] = useFold(foldId + '-' + k, k !== 'completed');
  return (
    <section className={'bsec ' + k + (open ? ' open' : ' closed')}>
      <button type="button" className="bsec-h" onClick={toggle} aria-expanded={open}>
        <span className="dot" aria-hidden="true" />
        <h3>{title}</h3>
        <span className="count num">{count}</span>
        <Chevron open={open} />
      </button>
      {open ? children : count > 0 ? <p className="muted tiny m0 bsec-empty">{count} task — dekhne ke liye upar tap karein</p> : null}
    </section>
  );
}

export function TaskBoard({ tasks, now, showName, onOpenChannel, emptyAll, groupByChannel = true, foldId = 'board' }: { tasks: Task[]; now: number; showName?: boolean; onOpenChannel?: (id: string) => void; emptyAll: string; groupByChannel?: boolean; foldId?: string }) {
  const d = useData();
  const [rejecting, setRejecting] = useState<Task | null>(null);
  const groups: Record<string, Task[]> = { pending: [], expired: [], completed: [] };
  tasks.forEach((t) => {
    const st: TaskState = taskState(t, now);
    groups[st === 'done' || st === 'rejected' ? 'completed' : st].push(t);
  });
  const byStart = (a: Task, b: Task) => (a.start_at || a.due_at).localeCompare(b.start_at || b.due_at) || a.due_at.localeCompare(b.due_at);
  groups.pending.sort(byStart);
  groups.expired.sort((a, b) => a.due_at.localeCompare(b.due_at));
  groups.completed.sort((a, b) => (b.completed_at || b.rejected_at || '').localeCompare(a.completed_at || a.rejected_at || ''));

  if (!tasks.length) return <div className="empty"><b>Aaj koi task nahi</b>{emptyAll}</div>;

  const chName = (id: string) => d.channels.find((c) => c.id === id)?.name || 'Channel';

  return (
    <div className="board">
      {SECTIONS.map((s) => {
        const list = groups[s.key];
        // channel-wise groups (pehla task jis channel ka, wo channel pehle)
        const order: string[] = [];
        list.forEach((t) => !order.includes(t.channel_id) && order.push(t.channel_id));
        return (
          <BoardSection key={s.key} k={s.key} title={s.title} count={list.length} foldId={foldId}>
            {!list.length && <p className="muted small m0 bsec-empty">{s.empty}</p>}
            {list.length > 0 && !groupByChannel && (
              <div className="tasks">
                {list.map((t) => (
                  <TaskItem key={t.id} task={t} now={now} showName={showName} onOpenChannel={onOpenChannel} onReject={setRejecting} />
                ))}
              </div>
            )}
            {list.length > 0 &&
              groupByChannel &&
              order.map((cid) => {
                const ts = list.filter((t) => t.channel_id === cid);
                return (
                  <ChannelGroup key={cid} foldKey={foldId + '-' + s.key + '-' + cid} name={chName(cid)} count={ts.length} onOpen={onOpenChannel ? () => onOpenChannel(cid) : undefined}>
                    <ChannelTools channelId={cid} showToday={false} compact />
                    <div className="tasks">
                      {ts.map((t) => (
                        <TaskItem key={t.id} task={t} now={now} showName={showName} showChannel={false} onOpenChannel={onOpenChannel} onReject={setRejecting} />
                      ))}
                    </div>
                  </ChannelGroup>
                );
              })}
          </BoardSection>
        );
      })}
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
          {ch?.name} · {task.role} · {fmtDate(task.day)} · deadline {fmtWhen(task.due_at)}
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

/* ================= v9: Deadline extension ================= */
const EXT_CHOICES = [15, 30, 60, 120, 240, 1440];
const minLabel = (m: number) => (m >= 1440 ? m / 1440 + ' din' : m >= 60 ? m / 60 + ' ghanta' : m + ' min');

export function ExtensionSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const [mins, setMins] = useState(60);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const ch = d.channels.find((c) => c.id === task.channel_id);
  const expired = new Date(task.due_at).getTime() < Date.now();
  return (
    <Sheet title="Deadline barhane ki request" onClose={onClose}>
      <div className="panel tight">
        <b>{task.title || ch?.name}</b>
        <span className="muted small">{ch?.name} · {task.role} · deadline {fmtWhen(task.due_at)}{expired ? ' (guzar chuki)' : ''}</span>
      </div>
      <div className="f">
        Kitna waqt chahiye
        <div className="chips">
          {EXT_CHOICES.map((m) => (
            <button type="button" key={m} className={'chip ' + (mins === m ? 'on' : '')} onClick={() => setMins(m)}>+{minLabel(m)}</button>
          ))}
        </div>
        <div className="row">
          <input type="number" min={5} max={10080} value={mins} onChange={(e) => setMins(Math.max(5, Math.min(10080, Number(e.target.value) || 5)))} aria-label="Minutes" style={{ maxWidth: 120 }} />
          <span className="muted small">minute</span>
        </div>
      </div>
      <label className="f">
        Wajah <span className="h">Owner ko batayein kyun waqt chahiye</span>
        <textarea rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Render slow hai, bijli chali gayi, script der se mili" />
      </label>
      <p className="muted tiny m0">{expired ? 'Deadline guzar chuki hai: owner approve kare to waqt aap ki request ke waqt se gina jayega.' : 'Owner approve kare to deadline itni barh jayegi. Reject kare to wahi rahegi.'}</p>
      <button
        className="btn primary block"
        disabled={busy || reason.trim().length < 2}
        onClick={async () => {
          setBusy(true);
          try {
            await d.requestExtension(task.id, mins, reason.trim());
            toast('Request owner ko bhej di');
            onClose();
          } catch (e) {
            toast(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Bhej rahe hain…' : `+${minLabel(mins)} ki request bhejein`}
      </button>
    </Sheet>
  );
}

/** Owner: task ke saath hi Approve / Reject */
export function ExtensionReview({ reqId, full }: { reqId: string; full?: boolean }) {
  const d = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const r = d.deadline_requests.find((x) => x.id === reqId);
  if (!r || r.status !== 'pending') return null;
  const t = d.tasks.find((x) => x.id === r.task_id);
  const act = async (ok: boolean) => {
    setBusy(true);
    try {
      await d.reviewExtension(r.id, ok);
      toast(ok ? 'Deadline barha di' : 'Request reject kar di');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ext-review">
      <span className="grow">
        ⏳ <b>{full ? d.nameOf(r.user_id) + ' · ' : ''}+{minLabel(r.minutes)}</b>
        {full && t && <span className="muted"> · {d.channels.find((c) => c.id === t.channel_id)?.name} ({t.title || t.role}) · deadline {fmtWhen(t.due_at)}</span>}
        <span className="block small">{r.reason}</span>
      </span>
      <button className="btn sm primary" disabled={busy} onClick={() => act(true)}>Approve</button>
      <button className="btn sm danger" disabled={busy} onClick={() => act(false)}>Reject</button>
    </div>
  );
}
