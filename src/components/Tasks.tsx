import { useState } from 'react';
import { useData } from '../lib/data';
import type { Task, TaskState } from '../lib/types';
import { REJECT_PENALTY, errorText, fmtClock, fmtDate, graceEnd, notStarted, periodOf, roleClass, taskState, todayKey, type PeriodKind, type Score, fmtWhen } from '../lib/utils';
import { Seg, Sheet, useToast } from './ui';
import { TaskSheet } from './TaskSheet';
import { TaskTimer } from './Timer';
import { ROLE_WORK, TaskWorkSheet, needsWork } from './TaskWork';

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
  const work = needsWork(task) ? ROLE_WORK[task.role] : null;
  const [workOpen, setWorkOpen] = useState(false);
  // v13: in roles mein tick nahi — kaam lagao to khud mukammal
  // v15: extra 24 ghante bhi guzar gaye to member complete nahi kar sakta (owner kar sakta hai)
  const closed = st === 'ended' && !d.isOwner;
  const canToggle = !work && mine && st !== 'rejected' && !closed && !(early && st !== 'done');
  const canWork = !!work && (mine || d.isOwner) && st !== 'rejected' && !closed && !early;
  const ep = task.video_id ? d.videos.find((v) => v.id === task.video_id) : undefined;
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
        disabled={work ? !canWork : !canToggle || busy}
        onClick={work ? () => canWork && setWorkOpen(true) : toggle}
        aria-pressed={st === 'done'}
        aria-label={st === 'done' ? 'Complete hata dein' : 'Complete mark karein'}
        title={closed ? 'Extra deadline bhi khatam' : work ? (canWork ? work.action : early ? 'Waqt shuru hone ke baad' : '') : canToggle ? (st === 'done' ? 'Untick: wapas pending' : 'Tick: complete') : st === 'rejected' ? 'Owner ne reject kiya' : early ? 'Waqt shuru hone ke baad tick kar sakenge' : ''}
      >
        {st === 'done' && (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5 10 17 19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {(st === 'rejected' || st === 'ended') && <span aria-hidden="true">✕</span>}
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
        {st === 'expired' && <span className="grace-tag">⏳ Extra deadline: {fmtWhen(new Date(graceEnd(task)).toISOString())} tak</span>}
        <TaskTimer task={task} />
        {ep && (
          <span className="att-ind">
            <span className="att-chip">{work?.icon} <span data-notr>{ep.title}</span></span>
            {ep.thumbnail_url && <img src={ep.thumbnail_url} alt="" loading="lazy" />}
          </span>
        )}
        {!ep && (nScripts > 0 || thumbs.length > 0) && (
          <span className="att-ind">
            {nScripts > 0 && <span className="att-chip">{nScripts} script{nScripts > 1 ? 's' : ''}</span>}
            {thumbs.slice(0, 3).map((v) => <img key={v.id} src={v.thumbnail_url} alt={v.title} loading="lazy" />)}
          </span>
        )}
      </button>
      {work && canWork && (
        <button className={'btn sm work-btn' + (st === 'done' ? '' : ' primary')} onClick={() => setWorkOpen(true)}>
          {st === 'done' ? '✎ ' + work.done + ' — badlein' : work.icon + ' ' + work.action}
        </button>
      )}
      {workOpen && <TaskWorkSheet task={task} onClose={() => setWorkOpen(false)} />}
      {open && <TaskSheet taskId={task.id} onClose={() => setOpen(false)} onOpenChannel={onOpenChannel} onReject={onReject} />}
      {canExtend && (
        <button className="btn sm ext-btn" onClick={() => setExtOpen(true)} title="Deadline barhane ki request">
          ⏳ Waqt barhayein
        </button>
      )}
      {req && mine && <span className="ext-wait" title={req.reason}>⏳ +{req.minutes} min · owner ke paas</span>}
      {req && d.isOwner && <ExtensionReview reqId={req.id} />}
      {extOpen && <ExtensionSheet task={task} onClose={() => setExtOpen(false)} />}
      {canReview && (st === 'done' || st === 'expired' || st === 'ended') && onReject && (
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

/* ================= Pending / Expired / Ended / Completed board (v19) ================= */
type SecKey = 'pending' | 'expired' | 'ended' | 'completed';
const SECTIONS: { key: SecKey; icon: string; title: string; short: string; hint?: string; empty: string }[] = [
  { key: 'pending', icon: '⏳', title: 'Pending', short: 'Pending', empty: 'Koi pending task nahi.' },
  { key: 'expired', icon: '⚠️', title: 'Deadline expired', short: 'Expired', hint: 'extra 24 ghante', empty: 'Koi task late nahi. Shabaash!' },
  { key: 'ended', icon: '⛔', title: 'Deadline ended', short: 'Ended', hint: 'waqt khatam', empty: 'Koi task reh nahi gaya.' },
  { key: 'completed', icon: '✅', title: 'Completed', short: 'Done', empty: 'Abhi koi task complete nahi hua.' }
];

function TaskMiniCard({ task, now, showName, onOpenChannel, onReject }: {
  task: Task; now: number; showName?: boolean; onOpenChannel?: (id: string) => void; onReject?: (t: Task) => void;
}) {
  const d = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [extOpen, setExtOpen] = useState(false);
  const st = taskState(task, now);
  const ch = d.channels.find((c) => c.id === task.channel_id);
  const mine = task.user_id === d.uid;
  const early = notStarted(task, now);
  const work = needsWork(task) ? ROLE_WORK[task.role] : null;
  const closed = st === 'ended' && !d.isOwner;
  const canToggle = !work && mine && st !== 'rejected' && !closed && !(early && st !== 'done');
  const canWork = !!work && (mine || d.isOwner) && st !== 'rejected' && !closed && !early;
  const ep = task.video_id ? d.videos.find((v) => v.id === task.video_id) : undefined;
  const canReview = d.isOwner;
  const today = todayKey();
  const req = d.deadline_requests.find((r) => r.task_id === task.id && r.status === 'pending');
  const canExtend = mine && task.status === 'pending' && new Date(task.due_at).getTime() - now <= 30 * 60000 && new Date(task.due_at).getTime() > now - 7 * 864e5 && !req;

  async function toggle() {
    setBusy(true);
    try { await d.setTaskDone(task.id, st !== 'done'); toast(st !== 'done' ? 'Task complete ho gaya' : 'Task wapas pending mein'); }
    catch (e) { toast(errorText(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className={'tmini ' + st}>
      <div className="tmini-top">
        <button type="button" className="tmini-ch" onClick={() => (onOpenChannel && ch ? onOpenChannel(ch.id) : setOpen(true))} title={ch?.name || 'Channel'}>
          <span className="tmini-ch-name" data-notr>{ch?.name || 'Channel'}</span>
        </button>
        {task.day !== today && <span className="tmini-day muted">{fmtDate(task.day)}</span>}
      </div>
      <button type="button" className="tmini-mid" onClick={() => setOpen(true)}>
        {task.kind === 'custom' && task.title && <span className="task-custom">📌 {task.title}</span>}
        <div className="tmini-role-row">
          <span className={'role sm ' + roleClass(task.role)}>{task.role}</span>
          {showName && <span className="tmini-who" data-notr>{d.nameOf(task.user_id)}</span>}
        </div>
        <div className="tmini-time"><TaskTimer task={task} /></div>
        {ep && <span className="tmini-ep" data-notr>{work?.icon} {ep.title}</span>}
      </button>
      <div className="tmini-foot">
        {work && canWork && (
          <button type="button" className={'btn sm tmini-attach' + (st === 'done' ? '' : ' primary')} onClick={() => setWorkOpen(true)}>
            {st === 'done' ? `✎ ${work.done}` : `📎 ${work.action}`}
          </button>
        )}
        {!work && canToggle && (
          <button type="button" className={'btn sm tmini-attach' + (st === 'done' ? '' : ' primary')} disabled={busy} onClick={toggle}>
            {st === 'done' ? '✓ Complete' : '✓ Complete karein'}
          </button>
        )}
        {early && st === 'pending' && <span className="muted tiny">🔒 Waqt shuru nahi</span>}
        {canExtend && <button type="button" className="btn sm ext-btn" onClick={() => setExtOpen(true)}>⏳ +Waqt</button>}
        {canReview && (st === 'done' || st === 'expired' || st === 'ended') && onReject && (
          <button type="button" className="btn sm danger" onClick={() => onReject(task)}>Reject</button>
        )}
        {canReview && st === 'rejected' && (
          <button type="button" className="btn sm" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await d.reviewTask(task.id, false); toast('Rejection hata di'); }
            catch (e) { toast(errorText(e)); }
            finally { setBusy(false); }
          }}>Wapas lein</button>
        )}
      </div>
      {req && mine && <div className="tmini-ext"><span className="ext-wait" title={req.reason}>⏳ +{req.minutes} min · owner ke paas</span></div>}
      {req && d.isOwner && <div className="tmini-ext"><ExtensionReview reqId={req.id} /></div>}
      {workOpen && <TaskWorkSheet task={task} onClose={() => setWorkOpen(false)} />}
      {open && <TaskSheet taskId={task.id} onClose={() => setOpen(false)} onOpenChannel={onOpenChannel} onReject={onReject} />}
      {extOpen && <ExtensionSheet task={task} onClose={() => setExtOpen(false)} />}
    </div>
  );
}

export function TaskBoard({ tasks, now, showName, onOpenChannel, emptyAll, emptyTitle = 'Aaj koi task nahi', groupByChannel: _groupByChannel = true, foldId: _foldId = 'board' }: { tasks: Task[]; now: number; showName?: boolean; onOpenChannel?: (id: string) => void; emptyAll: string; emptyTitle?: string; groupByChannel?: boolean; foldId?: string }) {
  const [active, setActive] = useState<SecKey | null>(null);
  const [rejecting, setRejecting] = useState<Task | null>(null);
  const groups: Record<SecKey, Task[]> = { pending: [], expired: [], ended: [], completed: [] };
  tasks.forEach((t) => {
    const st: TaskState = taskState(t, now);
    groups[st === 'done' || st === 'rejected' ? 'completed' : st].push(t);
  });
  groups.ended.sort((a, b) => b.due_at.localeCompare(a.due_at));
  const byStart = (a: Task, b: Task) => (a.start_at || a.due_at).localeCompare(b.start_at || b.due_at) || a.due_at.localeCompare(b.due_at);
  groups.pending.sort(byStart);
  groups.expired.sort((a, b) => a.due_at.localeCompare(b.due_at));
  groups.completed.sort((a, b) => (b.completed_at || b.rejected_at || '').localeCompare(a.completed_at || a.rejected_at || ''));

  if (!tasks.length) return <div className="empty"><b>{emptyTitle}</b>{emptyAll}</div>;

  const activeSec = active ? SECTIONS.find((s) => s.key === active) : null;
  const activeList = active ? groups[active] : [];

  return (
    <div className="tboard-v19">
      <div className="tstat-bar" role="tablist" aria-label="Task status">
        {SECTIONS.map((s) => {
          const isOpen = active === s.key;
          const cnt = groups[s.key].length;
          return (
            <button key={s.key} type="button" role="tab" aria-selected={isOpen} className={'tstat-card ' + s.key + (isOpen ? ' on' : '')} onClick={() => setActive((cur) => (cur === s.key ? null : s.key))}>
              <div className="tstat-top">
                <span className="tstat-dot" aria-hidden="true" />
                <span className="tstat-cnt num">{cnt}</span>
              </div>
              <div className="tstat-label">
                <span className="bt-full">{s.title}</span>
                <span className="bt-short">{s.short}</span>
              </div>
              {s.hint && cnt > 0 && <small className="tstat-hint muted">{s.hint}</small>}
            </button>
          );
        })}
      </div>
      {activeSec && (
        <div className={'tmini-panel ' + activeSec.key}>
          <div className="tmini-panel-head">
            <div className="row">
              <span className="tstat-dot" aria-hidden="true" />
              <b>{activeSec.title}</b>
              <span className="count num">{activeList.length}</span>
            </div>
            <button type="button" className="btn sm" onClick={() => setActive(null)}>Band karein ✕</button>
          </div>
          {!activeList.length ? (
            <p className="muted small m0">{activeSec.empty}</p>
          ) : (
            <div className="tmini-grid">
              {activeList.map((t) => (
                <TaskMiniCard key={t.id} task={t} now={now} showName={showName} onOpenChannel={onOpenChannel} onReject={setRejecting} />
              ))}
            </div>
          )}
        </div>
      )}
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
        Reject hone par ye task complete mein count nahi hoga (0 point), aur is bande ki us din, hafte aur mahine ki kul progress se <b>{REJECT_PENALTY}%</b> kat jayega — jhoot bol kar complete karne ki saza. Leaderboard par bhi rejected count nazar aayega. Baad mein "Wapas lein" se hata bhi sakte hain.
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
      <div><span className="num bad">{s.missed}</span><small>Ended</small></div>
      <div><span className="num bad">{s.rejected}</span><small>Rejected</small></div>
      <div><span className="num">{s.points}</span><small>Points</small></div>
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
      <p className="muted tiny m0">{expired ? 'Deadline guzar chuki hai: owner approve kare to waqt aap ki request ke waqt se gina jayega.' : 'Owner approve kare to deadline itni barh jayegi. Reject kare to wahi rahegi.'} Waqt par complete = poore points. Barhayi hui deadline ranking mein barabari ke waqt thora peeche karti hai.</p>
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
