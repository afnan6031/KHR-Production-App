import { useState } from 'react';
import { useData } from '../lib/data';
import type { Task } from '../lib/types';
import { REJECT_PENALTY, fmtClock, fmtDate, isLate, notStarted, roleClass, taskState } from '../lib/utils';
import { Sheet, useNow } from './ui';
import { AttachSheet, ChannelTools } from './Attachments';
import { TaskTimer } from './Timer';

const STATE_LABEL = { pending: 'Pending', expired: 'Deadline expired', done: 'Completed', rejected: 'Rejected' } as const;

/** Ek din ke task ka detail: waqt + live timer, status, aur us din ki scripts / thumbnails / messages */
export function TaskSheet({ taskId, onClose, onOpenChannel, onReject }: { taskId: string; onClose: () => void; onOpenChannel?: (id: string) => void; onReject?: (t: Task) => void }) {
  const d = useData();
  const now = useNow();
  const [adding, setAdding] = useState<'script' | 'thumbnail' | null>(null);
  const task = d.tasks.find((t) => t.id === taskId); // live
  if (!task) return null;
  const ch = d.channels.find((c) => c.id === task.channel_id);
  const st = taskState(task, now);
  const canAttach = d.isOwner || d.rolesOf(task.channel_id).length > 0;
  const mineCount = d.attachments.filter((a) => a.task_id === task.id).length;

  return (
    <Sheet title="Task" onClose={onClose}>
      <div className="ts-head">
        <div className="row between">
          <b className="ts-ch">{ch?.name || 'Channel'}</b>
          <span className={'stage ' + (st === 'done' ? 'published' : st === 'expired' || st === 'rejected' ? 'review' : '')}>{STATE_LABEL[st]}</span>
        </div>
        <div className="row">
          <span className={'role ' + roleClass(task.role)}>{task.role}</span>
          <span className="muted small">{d.nameOf(task.user_id)} · {fmtDate(task.day)}</span>
        </div>
        <TaskTimer task={task} big />
        <div className="ts-times">
          <div><small>Start</small><b className="num">{task.start_at ? fmtClock(task.start_at) : '—'}</b></div>
          <div><small>Deadline</small><b className="num">{fmtClock(task.due_at)}</b></div>
          <div>
            <small>{st === 'rejected' ? 'Rejected' : 'Complete'}</small>
            <b className={'num ' + (isLate(task) ? 'warn' : '')}>{task.completed_at ? fmtClock(task.completed_at) : '—'}</b>
          </div>
        </div>
        {notStarted(task, now) && <p className="muted tiny m0">Is role ka waqt abhi shuru nahi hua.</p>}
        {st === 'rejected' && <div className="alert">Owner ne reject kiya{task.rejected_reason ? ': ' + task.rejected_reason : ''}. Progress se −{REJECT_PENALTY}%.</div>}
      </div>

      <section className="att">
        <div className="sec-head">
          <h3>Is channel ki aaj ki scripts, thumbnails aur messages</h3>
        </div>
        <ChannelTools channelId={task.channel_id} />
        {canAttach && (
          <div className="row">
            <button className="btn sm primary" onClick={() => setAdding('script')}>+ Script</button>
            <button className="btn sm primary" onClick={() => setAdding('thumbnail')}>+ Thumbnail</button>
            {mineCount > 0 && <span className="muted tiny">{mineCount} is task se lagaye gaye</span>}
          </div>
        )}
        <p className="muted tiny m0">Har din ki list naye din khaali shuru hoti hai. Purani scripts aur thumbnails "Scripts" / "Thumbnails" button mein date ke saath milti hain.</p>
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
      {adding && <AttachSheet channelId={task.channel_id} initial={adding} taskId={task.id} onClose={() => setAdding(null)} />}
    </Sheet>
  );
}
