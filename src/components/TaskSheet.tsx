import { useState } from 'react';
import { useData } from '../lib/data';
import type { Task } from '../lib/types';
import { REJECT_PENALTY, errorText, fmtClock, fmtDate, isLate, notStarted, roleClass, taskState } from '../lib/utils';
import { ConfirmButton, Sheet, useNow, useToast } from './ui';
import { ChannelTools, VideosSheet } from './Videos';
import { TaskTimer } from './Timer';
import { ExtensionReview, ExtensionSheet } from './Tasks';

const STATE_LABEL = { pending: 'Pending', expired: 'Deadline expired', done: 'Completed', rejected: 'Rejected' } as const;

/** Waqt ke saath date bhi (agar task ke din se alag ho) */
function when(iso: string | null, day: string) {
  if (!iso) return '—';
  const k = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(iso));
  return (k !== day ? fmtDate(k) + ' · ' : '') + fmtClock(iso);
}

/** Task ka detail: waqt + live timer, status, extension, aur us channel ki videos / messages */
export function TaskSheet({ taskId, onClose, onOpenChannel, onReject }: { taskId: string; onClose: () => void; onOpenChannel?: (id: string) => void; onReject?: (t: Task) => void }) {
  const d = useData();
  const toast = useToast();
  const now = useNow();
  const [adding, setAdding] = useState(false);
  const [ext, setExt] = useState(false);
  const task = d.tasks.find((t) => t.id === taskId); // live
  if (!task) return null;
  const ch = d.channels.find((c) => c.id === task.channel_id);
  const st = taskState(task, now);
  const canWork = d.isOwner || d.realOwner || d.rolesOf(task.channel_id).length > 0;
  const mine = task.user_id === d.uid;
  const reqs = d.deadline_requests.filter((r) => r.task_id === task.id);
  const pendingReq = reqs.find((r) => r.status === 'pending');
  const canExtend = mine && task.status === 'pending' && new Date(task.due_at).getTime() - now <= 30 * 60000 && !pendingReq;

  return (
    <Sheet title="Task" onClose={onClose}>
      <div className="ts-head">
        <div className="row between">
          <b className="ts-ch">{ch?.name || 'Channel'}</b>
          <span className={'stage ' + (st === 'done' ? 'published' : st === 'expired' || st === 'rejected' ? 'review' : '')}>{STATE_LABEL[st]}</span>
        </div>
        {task.kind === 'custom' && <div className="task-custom big">📌 {task.title}</div>}
        <div className="row">
          <span className={'role ' + roleClass(task.role)}>{task.role}</span>
          <span className="muted small">{d.nameOf(task.user_id)} · {fmtDate(task.day)}</span>
        </div>
        <TaskTimer task={task} big />
        <div className="ts-times">
          <div><small>Start</small><b className="num">{when(task.start_at, task.day)}</b></div>
          <div><small>Deadline</small><b className="num">{when(task.due_at, task.day)}</b></div>
          <div>
            <small>{st === 'rejected' ? 'Rejected' : 'Complete'}</small>
            <b className={'num ' + (isLate(task) ? 'warn' : '')}>{task.completed_at ? when(task.completed_at, task.day) : '—'}</b>
          </div>
        </div>
        {task.extended_minutes > 0 && <p className="muted tiny m0">⏳ Owner ne deadline {task.extended_minutes} minute barhayi.</p>}
        {notStarted(task, now) && <p className="muted tiny m0">Is kaam ka waqt abhi shuru nahi hua.</p>}
        {st === 'rejected' && <div className="alert">Owner ne reject kiya{task.rejected_reason ? ': ' + task.rejected_reason : ''}. Progress se −{REJECT_PENALTY}%.</div>}
      </div>

      {canExtend && (
        <button className="btn block ext-btn" onClick={() => setExt(true)}>⏳ Deadline barhane ki request</button>
      )}
      {pendingReq && mine && <div className="note">⏳ +{pendingReq.minutes} min ki request owner ke paas hai: “{pendingReq.reason}”</div>}
      {pendingReq && d.isOwner && <ExtensionReview reqId={pendingReq.id} full />}
      {reqs.filter((r) => r.status !== 'pending').slice(0, 3).map((r) => (
        <p key={r.id} className="muted tiny m0">{r.status === 'approved' ? '✓ Approve' : '✕ Reject'}: +{r.minutes} min — {r.reason}</p>
      ))}

      <section className="att">
        <div className="sec-head">
          <h3>Is channel ki videos aur messages</h3>
        </div>
        <ChannelTools channelId={task.channel_id} />
        {canWork && (
          <button className="btn sm primary" onClick={() => setAdding(true)}>+ Nai video (script / thumbnail)</button>
        )}
      </section>

      <div className="row">
        {onOpenChannel && (
          <button className="btn" onClick={() => { onClose(); onOpenChannel(task.channel_id); }}>
            Channel kholein
          </button>
        )}
        {d.isOwner && onReject && (st === 'done' || st === 'expired') && (
          <button className="btn danger" onClick={() => { onClose(); onReject(task); }}>
            Reject
          </button>
        )}
      </div>
      {d.isOwner && task.kind === 'custom' && (
        <ConfirmButton
          label="Ye kaam hatayein"
          confirmLabel="Pakka? Dobara tap karein"
          onConfirm={() => d.deleteTask(task.id).then(() => { toast('Kaam hata diya'); onClose(); }, (e) => toast(errorText(e)))}
        />
      )}
      {adding && <VideosSheet channelId={task.channel_id} taskId={task.id} create onClose={() => setAdding(false)} />}
      {ext && <ExtensionSheet task={task} onClose={() => setExt(false)} />}
    </Sheet>
  );
}
