import { useState, type KeyboardEvent } from 'react';
import { useData } from '../lib/data';
import type { Channel } from '../lib/types';
import { CHANNEL_PERF_RULES, channelPerf, fmtDate, inPeriod, isToday, periodOf, perfClass, roleClass, roleTimeText, scheduleText, scoreOf, taskState, timeLine, todayKey } from '../lib/utils';
import { Bar, Week } from './ui';
import { ChannelTools } from './Videos';

/** har channel ka apna halka rang (id se) */
export function channelHue(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 33 + c.charCodeAt(0)) % 360;
  return h;
}

/* ---------- v15: card ka size (bara / darmiyana / chhota / list) — har device par yaad ---------- */
export type CardSize = 'l' | 'm' | 's' | 'list';
const SIZE_KEY = 'khr-card-size';
export function useCardSize(): [CardSize, (s: CardSize) => void] {
  const [s, setS] = useState<CardSize>(() => {
    try {
      const v = localStorage.getItem(SIZE_KEY);
      return v === 'm' || v === 's' || v === 'list' ? v : 'l';
    } catch {
      return 'l';
    }
  });
  const set = (v: CardSize) => {
    setS(v);
    try { localStorage.setItem(SIZE_KEY, v); } catch { /* storage band */ }
    window.dispatchEvent(new Event('khr-card-size'));
  };
  return [s, set];
}
export function CardSizePicker({ value, onChange }: { value: CardSize; onChange: (s: CardSize) => void }) {
  const opts: { v: CardSize; label: string; icon: JSX.Element }[] = [
    { v: 'l', label: 'Large', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /></svg> },
    { v: 'm', label: 'Medium', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="8" height="16" rx="2" /><rect x="13" y="4" width="8" height="16" rx="2" /></svg> },
    { v: 's', label: 'Small', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="8" height="7" rx="1.5" /><rect x="13" y="4" width="8" height="7" rx="1.5" /><rect x="3" y="13" width="8" height="7" rx="1.5" /><rect x="13" y="13" width="8" height="7" rx="1.5" /></svg> },
    { v: 'list', label: 'List', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1.5" /><rect x="3" y="10" width="18" height="4" rx="1.5" /><rect x="3" y="16" width="18" height="4" rx="1.5" /></svg> }
  ];
  return (
    <div className="size-pick" role="group" aria-label="Card ka size">
      {opts.map((o) => (
        <button key={o.v} type="button" className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)} aria-pressed={value === o.v} title={o.label}>
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Card poora clickable hai (channel kholta hai), andar ke Videos/Messages buttons alag kaam karte hain */
const cardProps = (onOpen: () => void, id = '', size: CardSize = 'l') => ({
  className: 'card clickable tinted size-' + size,
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

/** v15: channel ki auto performance (is mahine) — team ke tasks se, har role barabar */
export function useChannelPerf(ch: Channel, kind: 'week' | 'month' = 'month') {
  const d = useData();
  const p = periodOf(kind);
  const roles = [...new Set(d.channel_members.filter((m) => m.channel_id === ch.id).flatMap((m) => m.roles))];
  return channelPerf(d.tasks.filter((t) => t.channel_id === ch.id && inPeriod(t, p)), roles);
}

function PerfMetric({ label, pct, sub }: { label: string; pct: number | null; sub?: string }) {
  const pc = pct != null ? perfClass(pct) : '';
  return (
    <div className="metric" title={CHANNEL_PERF_RULES}>
      <div className="l">{label}</div>
      <div className={'v ' + pc}>{pct != null ? pct + '%' : '—'}</div>
      <Bar pct={pct || 0} cls={pc} />
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

/** v9: member ka EK card har channel ka — us mein us ke saare roles likhe hote hain. v15: kisi bhi user ka (owner preview) */
export function MemberCard({ ch, roles, onOpen, userId, size = 'l' }: { ch: Channel; roles: string[]; onOpen: () => void; userId?: string; size?: CardSize }) {
  const d = useData();
  const uid = userId || d.uid;
  const me = uid === d.uid;
  const month = periodOf('month');
  const ms = scoreOf(d.tasks.filter((t) => t.channel_id === ch.id && t.user_id === uid && inPeriod(t, month)));
  const cp = useChannelPerf(ch);
  const tc = useTodayCount(ch.id, uid);
  const myLabel = me ? 'Meri performance' : 'Performance';

  if (size === 'list')
    return (
      <div {...cardProps(onOpen, ch.id, size)}>
        <span className="cl-name">
          <b>{ch.name}</b>
          {isToday(ch) && <span className="live">Aaj</span>}
        </span>
        <span className="cl-roles">{roles.map((r) => <span key={r} className={'role sm ' + roleClass(r)}>{r}</span>)}</span>
        <span className="cl-num"><small>{me ? 'Meri' : 'User'}</small><b className={'num ' + (ms.score == null ? 'muted' : perfClass(ms.score))}>{ms.score == null ? '—' : ms.score + '%'}</b></span>
        <span className="cl-num"><small>Channel</small><b className={'num ' + (cp.pct == null ? 'muted' : perfClass(cp.pct))}>{cp.pct == null ? '—' : cp.pct + '%'}</b></span>
        <span className="cl-num"><small>Aaj</small><b className="num">{tc.total ? `${tc.done}/${tc.total}` : '—'}</b></span>
        <span className="cl-go" aria-hidden="true">›</span>
      </div>
    );

  return (
    <div {...cardProps(onOpen, ch.id, size)}>
      <div className="card-top">
        <span className="eyebrow">{roles.length} role{roles.length > 1 ? 's' : ''}</span>
        {isToday(ch) && <span className="live">Aaj kaam</span>}
      </div>
      <div>
        <h3>{ch.name}</h3>
        {size === 'l' && ch.about && <p className="about">{ch.about}</p>}
      </div>
      {size === 's' ? (
        <div className="role-chips">{roles.map((r) => <span key={r} className={'role sm ' + roleClass(r)}>{r}</span>)}</div>
      ) : (
        <div className="role-lines">
          {roles.map((r) => (
            <div className="role-line" key={r}>
              <span className={'role sm ' + roleClass(r)}>{r}</span>
              <span className="muted tiny">{roleTimeText(ch, r)}</span>
            </div>
          ))}
        </div>
      )}
      <div className={'metrics' + (size === 's' ? ' tight' : ' three')}>
        <PerfMetric label={myLabel} pct={ms.score} sub={size === 'l' ? `${ms.points} points · ${ms.done}/${ms.counted} complete` : undefined} />
        <PerfMetric label="Channel performance" pct={cp.pct} sub={size === 'l' ? 'poori team · is mahine' : undefined} />
        <div className="metric">
          <div className="l">Aaj ke tasks</div>
          <div className="v">{tc.total ? `${tc.done}/${tc.total}` : '—'}</div>
          {size !== 's' && <div className="s">{tc.total ? 'complete' : 'Aaj kaam nahi'}</div>}
        </div>
      </div>
      {size === 'l' && (
        <div className="foot">
          <Week ch={ch} />
          {ch.deadline && <span>Deadline {fmtDate(ch.deadline)}</span>}
        </div>
      )}
      <ChannelTools channelId={ch.id} showToday={size === 'l'} compact={size !== 'l'} />
    </div>
  );
}

export function OwnerCard({ ch, onOpen, size = 'l' }: { ch: Channel; onOpen: () => void; size?: CardSize }) {
  const d = useData();
  const members = d.channel_members.filter((m) => m.channel_id === ch.id && m.roles.length);
  const cp = useChannelPerf(ch);
  const tc = useTodayCount(ch.id);
  const roleN = new Set(members.flatMap((m) => m.roles)).size;

  if (size === 'list')
    return (
      <div {...cardProps(onOpen, ch.id, size)}>
        <span className="cl-name">
          <b>{ch.name}</b>
          {isToday(ch) && <span className="live">Aaj</span>}
        </span>
        <span className="cl-roles muted tiny">{scheduleText(ch)} · {members.length} log · {roleN} roles</span>
        <span className="cl-num"><small>Performance</small><b className={'num ' + (cp.pct == null ? 'muted' : perfClass(cp.pct))}>{cp.pct == null ? '—' : cp.pct + '%'}</b></span>
        <span className="cl-num"><small>Aaj</small><b className="num">{tc.total ? `${tc.done}/${tc.total}` : '—'}</b></span>
        <span className="cl-go" aria-hidden="true">›</span>
      </div>
    );

  return (
    <div {...cardProps(onOpen, ch.id, size)}>
      <div className="card-top">
        <span className="eyebrow">{scheduleText(ch)}</span>
        {isToday(ch) && <span className="live">Aaj kaam</span>}
      </div>
      <div>
        <h3>{ch.name}</h3>
        {size === 'l' && ch.about && <p className="about">{ch.about}</p>}
      </div>
      <div className={'metrics' + (size === 's' ? ' tight' : '')}>
        <PerfMetric label="Channel performance" pct={cp.pct} sub={size === 'l' ? `${roleN} roles · is mahine · auto` : undefined} />
        <div className="metric">
          <div className="l">Aaj ke tasks</div>
          <div className="v">{tc.total ? `${tc.done}/${tc.total}` : '—'}</div>
          {size !== 's' && <div className="s">{tc.total ? 'complete' : 'Aaj kaam nahi'}</div>}
        </div>
      </div>
      {size === 'l' && cp.roles.some((r) => r.pct != null) && (
        <div className="role-perf">
          {cp.roles.filter((r) => r.pct != null).map((r) => (
            <span key={r.role} className={'rp ' + perfClass(r.pct!)} title={`${r.role}: ${r.onTime} waqt par · ${r.extended} extension · ${r.late} delay · ${r.missed} expire · ${r.rejected} reject`}>
              <i className={'role sm ' + roleClass(r.role)}>{r.role}</i>
              <b className="num">{r.pct}%</b>
            </span>
          ))}
        </div>
      )}
      {size !== 's' && (members.length ? (
        <div className="people">
          {members.map((m) => (
            <span className="person" key={m.user_id}>
              <b>{d.nameOf(m.user_id)}</b>{size === 'l' ? ' · ' + m.roles.join(', ') : ''}
            </span>
          ))}
        </div>
      ) : (
        <div className="muted small">Abhi koi member add nahi</div>
      ))}
      {size === 'l' && (
        <div className="foot">
          <Week ch={ch} />
          <span>{timeLine(ch)}</span>
        </div>
      )}
      <ChannelTools channelId={ch.id} showToday={size === 'l'} compact={size !== 'l'} />
    </div>
  );
}

/** v9: ek card har channel ka (us channel mein mere saare roles ke saath). v15: kisi aur user ke bhi (owner preview) */
export function useMyCards(onlyToday: boolean, userId?: string) {
  const d = useData();
  const uid = userId || d.uid;
  const out: { ch: Channel; roles: string[] }[] = [];
  [...d.channels]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((ch) => {
      if (onlyToday && !isToday(ch)) return;
      const roles = d.rolesOf(ch.id, uid);
      if (roles.length) out.push({ ch, roles });
    });
  return out;
}
