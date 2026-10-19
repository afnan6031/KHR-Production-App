import { useData } from '../lib/data';
import type { Channel } from '../lib/types';
import { fmtDate, inPeriod, isToday, periodOf, perfClass, roleClass, roleTimeText, scheduleText, scoreOf, taskState, timeLine, todayKey } from '../lib/utils';
import { Bar, Week } from './ui';
import { ChannelTools } from './Videos';
import type { KeyboardEvent } from 'react';

/** har channel ka apna halka rang (id se) */
export function channelHue(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 33 + c.charCodeAt(0)) % 360;
  return h;
}

/** Card poora clickable hai (channel kholta hai), andar ke Videos/Messages buttons alag kaam karte hain */
const cardProps = (onOpen: () => void, id = '') => ({
  className: 'card clickable tinted',
  style: { ['--ch-h' as string]: String(channelHue(id)) },
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

/** Aaj is channel ke tasks: kitne complete / kitne total */
function useTodayCount(channelId: string, userId?: string) {
  const d = useData();
  const today = todayKey();
  const ts = d.tasks.filter((t) => t.channel_id === channelId && t.day === today && (!userId || t.user_id === userId));
  return { total: ts.length, done: ts.filter((t) => taskState(t) === 'done').length };
}

/** v9: member ka EK card har channel ka — us mein us ke saare roles likhe hote hain */
export function MemberCard({ ch, roles, onOpen }: { ch: Channel; roles: string[]; onOpen: () => void }) {
  const d = useData();
  const perfs = roles.map((r) => d.perf.latest(ch.id, d.uid, r)).filter(Boolean) as { pct: number; rated_on: string }[];
  const avg = perfs.length ? Math.round(perfs.reduce((a, p) => a + p.pct, 0) / perfs.length) : null;
  const pc = avg != null ? perfClass(avg) : '';
  const week = periodOf('week');
  const ws = scoreOf(d.tasks.filter((t) => t.channel_id === ch.id && t.user_id === d.uid && inPeriod(t, week)));
  const tc = useTodayCount(ch.id, d.uid);
  return (
    <div {...cardProps(onOpen, ch.id)}>
      <div className="card-top">
        <span className="eyebrow">{roles.length} role{roles.length > 1 ? 's' : ''}</span>
        {isToday(ch) && <span className="live">Aaj kaam</span>}
      </div>
      <div>
        <h3>{ch.name}</h3>
        {ch.about && <p className="about">{ch.about}</p>}
      </div>
      <div className="role-lines">
        {roles.map((r) => (
          <div className="role-line" key={r}>
            <span className={'role sm ' + roleClass(r)}>{r}</span>
            <span className="muted tiny">{roleTimeText(ch, r)}</span>
          </div>
        ))}
      </div>
      <div className="metrics">
        <div className="metric">
          <div className="l">Meri performance</div>
          <div className={'v ' + pc}>{avg != null ? avg + '%' : '—'}</div>
          <Bar pct={avg || 0} cls={pc} />
          <div className="s">{perfs.length ? 'Update ' + fmtDate(perfs.map((p) => p.rated_on).sort().pop()) : 'Abhi number nahi mila'}</div>
        </div>
        <div className="metric">
          <div className="l">Aaj ke tasks</div>
          <div className="v">{tc.total ? `${tc.done}/${tc.total}` : '—'}</div>
          <div className="s">{tc.total ? 'complete' : 'Aaj kaam nahi'}</div>
        </div>
      </div>
      <div className="tprog">
        <span className="muted">Is hafte</span>
        <b className={'num ' + (ws.score == null ? 'muted' : perfClass(ws.score))}>{ws.score == null ? '—' : ws.score + '%'}</b>
        <span className="muted">{ws.done}/{ws.counted} complete</span>
        {ws.rejected > 0 && <span className="bad">{ws.rejected} rejected</span>}
      </div>
      <div className="foot">
        <Week ch={ch} />
        {ch.deadline && <span>Deadline {fmtDate(ch.deadline)}</span>}
      </div>
      <ChannelTools channelId={ch.id} />
    </div>
  );
}

export function OwnerCard({ ch, onOpen }: { ch: Channel; onOpen: () => void }) {
  const d = useData();
  const members = d.channel_members.filter((m) => m.channel_id === ch.id && m.roles.length);
  const pcts: number[] = [];
  members.forEach((m) => m.roles.forEach((r) => {
    const p = d.perf.latest(ch.id, m.user_id, r);
    if (p) pcts.push(p.pct);
  }));
  const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const ac = avg != null ? perfClass(avg) : '';
  const tc = useTodayCount(ch.id);
  return (
    <div {...cardProps(onOpen, ch.id)}>
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
          <div className="l">Aaj ke tasks</div>
          <div className="v">{tc.total ? `${tc.done}/${tc.total}` : '—'}</div>
          <div className="s">{tc.total ? 'complete' : 'Aaj kaam nahi'}</div>
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

/** v9: ek card har channel ka (us channel mein mere saare roles ke saath) */
export function useMyCards(onlyToday: boolean) {
  const d = useData();
  const out: { ch: Channel; roles: string[] }[] = [];
  [...d.channels]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((ch) => {
      if (onlyToday && !isToday(ch)) return;
      const roles = d.rolesOf(ch.id);
      if (roles.length) out.push({ ch, roles });
    });
  return out;
}
