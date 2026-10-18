import { useData } from '../lib/data';
import type { Channel } from '../lib/types';
import { fmtDate, fmtN, inPeriod, isToday, periodOf, perfClass, roleClass, roleTimeText, scheduleText, scoreOf, timeLine, viewsFor } from '../lib/utils';
import { Bar, Delta, Week } from './ui';
import { ChannelTools } from './Attachments';
import type { KeyboardEvent } from 'react';

/** Card poora clickable hai (channel kholta hai), andar ke Scripts/Thumbnails/Messages buttons alag kaam karte hain */
const cardProps = (onOpen: () => void) => ({
  className: 'card clickable',
  role: 'button',
  tabIndex: 0,
  onClick: onOpen,
  onKeyDown: (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  }
});

export function MemberCard({ ch, role, onOpen }: { ch: Channel; role: string; onOpen: () => void }) {
  const d = useData();
  const p = d.perf.latest(ch.id, d.uid, role);
  const vi = viewsFor(d.channel_views, ch.id);
  const pc = p ? perfClass(p.pct) : '';
  const week = periodOf('week');
  const ws = scoreOf(d.tasks.filter((t) => t.channel_id === ch.id && t.user_id === d.uid && t.role === role && inPeriod(t, week)));
  return (
    <div {...cardProps(onOpen)}>
      <div className="card-top">
        <span className={'role ' + roleClass(role)}>{role}</span>
        {isToday(ch) && <span className="live">Aaj kaam</span>}
      </div>
      <div>
        <h3>{ch.name}</h3>
        {ch.about && <p className="about">{ch.about}</p>}
      </div>
      <div className="metrics">
        <div className="metric">
          <div className="l">Meri performance</div>
          <div className={'v ' + pc}>{p ? p.pct + '%' : '—'}</div>
          <Bar pct={p?.pct || 0} cls={pc} />
          <div className="s">{p ? 'Update ' + fmtDate(p.rated_on) : 'Abhi number nahi mila'}</div>
        </div>
        <div className="metric">
          <div className="l">Channel views</div>
          <div className="v">{vi ? fmtN(Number(vi.last.views)) : '—'}</div>
          <div className="s">
            {vi ? (
              <>
                <Delta d={vi.delta} /> {fmtDate(vi.last.day)}
              </>
            ) : (
              'Views abhi nahi likhe'
            )}
          </div>
        </div>
      </div>
      <div className="tprog">
        <span className="muted">Is hafte ke tasks</span>
        <b className={'num ' + (ws.score == null ? 'muted' : perfClass(ws.score))}>{ws.score == null ? '—' : ws.score + '%'}</b>
        <span className="muted">{ws.done}/{ws.counted} complete</span>
        {ws.rejected > 0 && <span className="bad">{ws.rejected} rejected</span>}
      </div>
      <div className="foot">
        <Week ch={ch} />
        <span>{roleTimeText(ch, role)}{ch.deadline ? ' · Deadline ' + fmtDate(ch.deadline) : ''}</span>
      </div>
      <ChannelTools channelId={ch.id} />
    </div>
  );
}

export function OwnerCard({ ch, onOpen }: { ch: Channel; onOpen: () => void }) {
  const d = useData();
  const vi = viewsFor(d.channel_views, ch.id);
  const members = d.channel_members.filter((m) => m.channel_id === ch.id && m.roles.length);
  const pcts: number[] = [];
  members.forEach((m) => m.roles.forEach((r) => {
    const p = d.perf.latest(ch.id, m.user_id, r);
    if (p) pcts.push(p.pct);
  }));
  const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const ac = avg != null ? perfClass(avg) : '';
  return (
    <div {...cardProps(onOpen)}>
      <div className="card-top">
        <span className="eyebrow">{scheduleText(ch)}</span>
        {isToday(ch) && <span className="live">Aaj kaam</span>}
      </div>
      <div>
        <h3>{ch.name}</h3>
        {ch.about && <p className="about">{ch.about}</p>}
      </div>
      <div className="metrics">
        <div className="metric">
          <div className="l">Team avg performance</div>
          <div className={'v ' + ac}>{avg != null ? avg + '%' : '—'}</div>
          <Bar pct={avg || 0} cls={ac} />
        </div>
        <div className="metric">
          <div className="l">Views {vi ? '(' + fmtDate(vi.last.day) + ')' : ''}</div>
          <div className="v">{vi ? fmtN(Number(vi.last.views)) : '—'}</div>
          <div className="s">{vi ? <Delta d={vi.delta} /> : 'Abhi nahi likhe'}</div>
        </div>
      </div>
      {members.length ? (
        <div className="people">
          {members.map((m) => (
            <span className="person" key={m.user_id}>
              <b>{d.nameOf(m.user_id)}</b> · {m.roles.join(', ')}
            </span>
          ))}
        </div>
      ) : (
        <div className="muted small">Abhi koi member add nahi</div>
      )}
      <div className="foot">
        <Week ch={ch} />
        <span>{timeLine(ch)}</span>
      </div>
      <ChannelTools channelId={ch.id} />
    </div>
  );
}

/** Ek card har (channel, role) ke liye */
export function useMyCards(onlyToday: boolean) {
  const d = useData();
  const out: { ch: Channel; role: string }[] = [];
  [...d.channels]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((ch) => {
      if (onlyToday && !isToday(ch)) return;
      d.rolesOf(ch.id).forEach((role) => out.push({ ch, role }));
    });
  return out;
}
