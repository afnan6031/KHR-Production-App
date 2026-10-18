import { useMemo, useState } from 'react';
import { UserAvatar } from '../components/Messaging';
import { useData } from '../lib/data';
import { REJECT_PENALTY, inPeriod, periodOf, rankUsers, roleClass, scoreOf, type PeriodKind, type Score } from '../lib/utils';
import { PeriodPicker, ScoreRing, ScoreStats, TaskItem } from '../components/Tasks';
import { RejectSheet } from '../components/Tasks';
import { Bar, useNow } from '../components/ui';
import type { Task } from '../lib/types';

const cls = (v: number | null) => (v == null ? 'muted' : v >= 85 ? 'good' : v >= 65 ? 'warn' : 'bad');

export function MiniScore({ label, s }: { label: string; s: Score }) {
  return (
    <span className="mini">
      <small>{label}</small>
      <b className={'num ' + cls(s.score)}>{s.score == null ? '—' : s.score + '%'}</b>
      <small className="muted">
        {s.done}/{s.counted} tasks{s.rejected ? ` · ${s.rejected} rej` : ''}
      </small>
    </span>
  );
}

/* ================= Leaderboard ================= */
export function LeaderboardScreen({ openProgress }: { openProgress: (uid: string) => void }) {
  const d = useData();
  const now = useNow(60000);
  const [kind, setKind] = useState<PeriodKind>('month');
  const [offset, setOffset] = useState(0);
  const p = periodOf(kind, offset);
  const rows = useMemo(() => rankUsers(d.tasks, p, now), [d.tasks, p.from, p.to, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = rows.slice(0, 3);
  const podiumOrder = [top[1], top[0], top[2]].filter(Boolean);
  const canOpen = (uid: string) => d.isOwner || uid === d.uid;

  return (
    <>
      <div className="hello">
        <h1>Leaderboard</h1>
        <p>Sab se zyada waqt par kaam karne wale top 3. Monthly reward ke liye "Monthly" mein pichla mahina dekhein.</p>
      </div>
      <PeriodPicker kind={kind} offset={offset} onKind={setKind} onOffset={setOffset} />
      {rows.length === 0 ? (
        <div className="empty"><b>Is muddat mein abhi koi score nahi</b>Jab tasks ki deadline guzregi ya log tasks complete karenge, ranking yahan aayegi.</div>
      ) : (
        <>
          <div className="podium">
            {podiumOrder.map((r) => (
              <button key={r.user_id} className={'pod p' + r.rank} onClick={() => canOpen(r.user_id) && openProgress(r.user_id)} disabled={!canOpen(r.user_id)}>
                <span className="medal" aria-hidden="true">{r.rank}</span>
                <UserAvatar id={r.user_id} />
                <b className="pname">{d.nameOf(r.user_id)}</b>
                <span className={'num pscore ' + cls(r.score)}>{r.score}%</span>
                <small className="muted">{r.done}/{r.counted} tasks</small>
                {r.rejected > 0 && <small className="bad">{r.rejected} rejected</small>}
                <span className="plinth" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="panel">
            <div className="list">
              {rows.map((r) => (
                <button className="li" key={r.user_id} onClick={() => canOpen(r.user_id) && openProgress(r.user_id)} disabled={!canOpen(r.user_id)}>
                  <span className={'rank num r' + Math.min(r.rank, 4)}>{r.rank}</span>
                  <UserAvatar id={r.user_id} />
                  <span className="grow">
                    <span className="t block">{d.nameOf(r.user_id)}{r.user_id === d.uid && <span className="muted"> (aap)</span>}</span>
                    <span className="d block">
                      {r.done} complete · {r.late} late · {r.missed} missed{r.rejected ? '' : ''}
                      {r.rejected > 0 && <b className="bad"> · {r.rejected} rejected</b>}
                    </span>
                  </span>
                  <b className={'num ' + cls(r.score)}>{r.score}%</b>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <p className="muted tiny m0">
        Score = waqt par ya late complete tasks ÷ jin tasks ki deadline guzar chuki × 100. Har rejected task count nahi hota aur upar se −{REJECT_PENALTY}% lagta hai. Barabar score par zyada complete tasks wala upar.
      </p>
    </>
  );
}

/* ================= One person's progress ================= */
export function ProgressScreen({ userId, onBack, openChannel }: { userId: string; onBack?: () => void; openChannel: (id: string) => void }) {
  const d = useData();
  const now = useNow();
  const [kind, setKind] = useState<PeriodKind>('week');
  const [offset, setOffset] = useState(0);
  const [rejecting, setRejecting] = useState<Task | null>(null);
  const p = periodOf(kind, offset);
  const person = d.profiles.find((x) => x.id === userId);
  const mine = d.tasks.filter((t) => t.user_id === userId);
  const inP = mine.filter((t) => inPeriod(t, p));
  const total = scoreOf(inP, now);
  const quick = (['day', 'week', 'month'] as const).map((k) => ({ k, s: scoreOf(mine.filter((t) => inPeriod(t, periodOf(k))), now) }));

  // per channel + role breakdown
  const keys = new Map<string, { channel_id: string; role: string; ts: Task[] }>();
  inP.forEach((t) => {
    const k = t.channel_id + '|' + t.role;
    const e = keys.get(k) || { channel_id: t.channel_id, role: t.role, ts: [] };
    e.ts.push(t);
    keys.set(k, e);
  });
  const breakdown = [...keys.values()]
    .map((e) => ({ ...e, s: scoreOf(e.ts, now), name: d.channels.find((c) => c.id === e.channel_id)?.name || 'Channel' }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.role.localeCompare(b.role));
  const history = [...inP].sort((a, b) => b.day.localeCompare(a.day) || a.due_at.localeCompare(b.due_at));
  const monthRank = rankUsers(d.tasks, periodOf('month'), now).find((r) => r.user_id === userId);

  return (
    <>
      {onBack && <button className="back" onClick={onBack}>‹ Wapas</button>}
      <div className="prof-head">
        <UserAvatar id={userId} />
        <div className="grow">
          <h1>{person?.full_name || 'Member'}{userId === d.uid && <span className="muted h-sub"> (aap)</span>}</h1>
          <p className="muted m0 small">
            {monthRank ? `Is mahine rank #${monthRank.rank}` : 'Is mahine abhi rank nahi'}
            {person?.contact && d.isOwner ? ' · ID: ' + person.contact : ''}
          </p>
        </div>
      </div>
      <div className="mini-scores static">
        {quick.map(({ k, s }) => (
          <MiniScore key={k} label={k === 'day' ? 'Aaj' : k === 'week' ? 'Is hafte' : 'Is mahine'} s={s} />
        ))}
      </div>

      <PeriodPicker kind={kind} offset={offset} onKind={setKind} onOffset={setOffset} />
      <section className="panel overall">
        <ScoreRing score={total.score} />
        <div className="grow">
          <div className="eyebrow">Overall progress</div>
          <div className="small muted">{p.label}</div>
          <ScoreStats s={total} />
        </div>
      </section>

      <section className="sec">
        <h2>Har channel par progress</h2>
        {breakdown.length ? (
          <div className="panel">
            <div className="list">
              {breakdown.map((b) => (
                <button className="li" key={b.channel_id + b.role} onClick={() => openChannel(b.channel_id)}>
                  <span className="grow stack tight">
                    <span className="row between">
                      <span className="t">{b.name}</span>
                      <b className={'num ' + cls(b.s.score)}>{b.s.score == null ? '—' : b.s.score + '%'}</b>
                    </span>
                    <span className="row between">
                      <span className={'role sm ' + roleClass(b.role)}>{b.role}</span>
                      <span className="d">
                        {b.s.done}/{b.s.counted} complete{b.s.late ? ` · ${b.s.late} late` : ''}{b.s.rejected ? ` · ${b.s.rejected} rejected` : ''}{b.s.pending ? ` · ${b.s.pending} pending` : ''}
                      </span>
                    </span>
                    <Bar pct={b.s.score ?? 0} cls={b.s.score == null ? '' : cls(b.s.score)} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty">Is muddat mein koi task nahi.</div>
        )}
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2>Tasks ki history</h2>
          <span className="eyebrow">{history.length}</span>
        </div>
        {history.length ? (
          <div className="tasks">
            {history.map((t) => (
              <TaskItem key={t.id} task={t} now={now} onOpenChannel={openChannel} onReject={setRejecting} />
            ))}
          </div>
        ) : (
          <div className="empty">Is muddat mein koi task nahi.</div>
        )}
      </section>
      {rejecting && <RejectSheet task={rejecting} onClose={() => setRejecting(null)} />}
    </>
  );
}
