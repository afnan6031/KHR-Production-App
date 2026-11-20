import { useMemo, useState } from 'react';
import { UserAvatar } from '../components/Messaging';
import { useData } from '../lib/data';
import { PTS_LATE, PTS_MISSED, PTS_ON_TIME, REJECT_PENALTY, dayLabel, errorText, inPeriod, periodOf, rankUsers, roleClass, scoreOf, taskState, type PeriodKind, type Score } from '../lib/utils';
import { downloadMemberProgressPdf, downloadTeamRankingPdf } from '../lib/pdf';
import { PeriodPicker, ScoreRing, TaskItem, RejectSheet } from '../components/Tasks';
import { DateFilter, useNow, useToast } from '../components/ui';
import type { Task } from '../lib/types';

const cls = (v: number | null) => (v == null ? 'muted' : v >= 85 ? 'good' : v >= 65 ? 'warn' : 'bad');

export function MiniScore({ label, s }: { label: string; s: Score }) {
  return (
    <span className="mini">
      <small>{label}</small>
      <b className={'num ' + cls(s.score)}>{s.score == null ? '—' : s.score + '%'}</b>
      <small className="muted">{s.done}/{s.counted} tasks{s.rejected ? ` · ${s.rejected} rej` : ''}</small>
    </span>
  );
}

export function LeaderboardScreen({ openProgress }: { openProgress: (uid: string) => void }) {
  const d = useData();
  const toast = useToast();
  const now = useNow(60000);
  const [kind, setKind] = useState<PeriodKind>('month');
  const [offset, setOffset] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const p = periodOf(kind, offset);
  const rows = useMemo(() => rankUsers(d.tasks, p, now), [d.tasks, p.from, p.to, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = rows.slice(0, 3);
  const podiumOrder = [top[1], top[0], top[2]].filter(Boolean);
  const canOpen = (uid: string) => d.isOwner || uid === d.uid;

  async function exportTeamPdf() {
    if (!rows.length) return;
    setPdfBusy(true);
    try {
      const msg = await downloadTeamRankingPdf({
        periodLabel: p.label,
        rows: rows.map((r) => ({ rank: r.rank, name: d.nameOf(r.user_id), title: d.profileOf(r.user_id)?.title, score: r.score, points: r.points, onTime: r.onTime, late: r.late, missed: r.missed, rejected: r.rejected, done: r.done, counted: r.counted }))
      });
      toast('📄 ' + msg);
    } catch (e) { toast(errorText(e)); }
    finally { setPdfBusy(false); }
  }

  async function exportMemberPdf(uid: string) {
    setPdfBusy(true);
    try {
      const person = d.profileOf(uid);
      const inP = d.tasks.filter((t) => t.user_id === uid && inPeriod(t, p));
      const total = scoreOf(inP, now);
      const rank = rows.find((r) => r.user_id === uid)?.rank;
      const byCh = new Map<string, Map<string, Task[]>>();
      inP.forEach((t) => { const m = byCh.get(t.channel_id) || new Map<string, Task[]>(); m.set(t.role, [...(m.get(t.role) || []), t]); byCh.set(t.channel_id, m); });
      const channels = [...byCh.entries()].map(([cid, roles]) => ({
        name: d.channels.find((c) => c.id === cid)?.name || 'Channel',
        score: scoreOf([...roles.values()].flat(), now).score,
        roles: [...roles.entries()].map(([role, ts]) => { const rs = scoreOf(ts, now); return { role, score: rs.score, done: rs.done, counted: rs.counted }; })
      })).sort((a, b) => a.name.localeCompare(b.name));
      const tasks = [...inP].sort((a, b) => b.day.localeCompare(a.day)).map((t) => ({ day: t.day, channel: d.channels.find((c) => c.id === t.channel_id)?.name || 'Channel', role: t.role, status: taskState(t, now).toUpperCase() }));
      const msg = await downloadMemberProgressPdf({ name: person?.full_name || 'Member', title: person?.title, periodLabel: p.label, rank, score: total.score, onTime: total.onTime, late: total.late, missed: total.missed, rejected: total.rejected, pending: total.pending + total.grace, points: total.points, counted: total.counted, done: total.done, channels, tasks });
      toast('📄 ' + msg);
    } catch (e) { toast(errorText(e)); }
    finally { setPdfBusy(false); }
  }

  return (
    <>
      <div className="sec-head wrap">
        <div className="hello">
          <h1>Leaderboard</h1>
          <p>Sab se zyada waqt par kaam karne wale top 3. Monthly reward ke liye "Monthly" mein pichla mahina dekhein.</p>
        </div>
        {d.isOwner && rows.length > 0 && (
          <button type="button" className="btn primary sm" disabled={pdfBusy} onClick={exportTeamPdf}>{pdfBusy ? 'PDF ban raha hai…' : '📄 Team Standing PDF'}</button>
        )}
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
                <small className="muted">{r.points} pts · {r.done}/{r.counted}</small>
                {r.rejected > 0 && <small className="bad">{r.rejected} rejected</small>}
                <span className="plinth" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="panel">
            <div className="list">
              {rows.map((r) => (
                <div className="li" key={r.user_id}>
                  <button className="li-main" onClick={() => canOpen(r.user_id) && openProgress(r.user_id)} disabled={!canOpen(r.user_id)}>
                    <span className={'rank num r' + Math.min(r.rank, 4)}>{r.rank}</span>
                    <UserAvatar id={r.user_id} />
                    <span className="grow">
                      <span className="t block">{d.nameOf(r.user_id)}{r.user_id === d.uid && <span className="muted"> (aap)</span>}</span>
                      {d.profileOf(r.user_id)?.title && <span className="ptitle sm block" data-notr>🏆 {d.profileOf(r.user_id)?.title}</span>}
                      <span className="d block">
                        {r.points} points · {r.onTime} waqt par · {r.late} extra mein · {r.missed} ended
                        {r.extended > 0 && <span className="warn"> · {r.extended} extension</span>}
                        {r.rejected > 0 && <b className="bad"> · {r.rejected} rejected</b>}
                      </span>
                    </span>
                    <b className={'num ' + cls(r.score)}>{r.score}%</b>
                  </button>
                  {d.isOwner && <button type="button" className="btn sm" disabled={pdfBusy} title="Individual PDF download karein" onClick={() => exportMemberPdf(r.user_id)}>📄 PDF</button>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <p className="muted tiny m0">
        Points: waqt par complete = {PTS_ON_TIME} · deadline ke baad 24 ghante ki extra deadline mein = {PTS_LATE} · extra deadline bhi guzar gayi = {PTS_MISSED}. Score = points ÷ (tasks × {PTS_ON_TIME}) × 100, aur har rejected task par kul score se −{REJECT_PENALTY}%.
      </p>
    </>
  );
}

export function ProgressScreen({ userId, onBack, openChannel }: { userId: string; onBack?: () => void; openChannel: (id: string) => void }) {
  const d = useData();
  const toast = useToast();
  const now = useNow();
  const [kind, setKind] = useState<PeriodKind>('week');
  const [offset, setOffset] = useState(0);
  const [rejecting, setRejecting] = useState<Task | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const p = periodOf(kind, offset);
  const person = d.profiles.find((x) => x.id === userId);
  const mine = d.tasks.filter((t) => t.user_id === userId);
  const inP = mine.filter((t) => inPeriod(t, p));
  const total = scoreOf(inP, now);
  const monthRank = rankUsers(d.tasks, periodOf('month'), now).find((r) => r.user_id === userId);
  const periodRank = rankUsers(d.tasks, p, now).find((r) => r.user_id === userId);

  const byCh = new Map<string, Map<string, Task[]>>();
  inP.forEach((t) => { const m = byCh.get(t.channel_id) || new Map<string, Task[]>(); m.set(t.role, [...(m.get(t.role) || []), t]); byCh.set(t.channel_id, m); });
  const chans = [...byCh.entries()].map(([cid, roles]) => ({
    cid, name: d.channels.find((c) => c.id === cid)?.name || 'Channel',
    s: scoreOf([...roles.values()].flat(), now),
    roles: [...roles.entries()].map(([role, ts]) => ({ role, s: scoreOf(ts, now) })).sort((a, b) => a.role.localeCompare(b.role))
  })).sort((a, b) => a.name.localeCompare(b.name));

  const days = [...new Set(inP.map((t) => t.day))].sort((a, b) => b.localeCompare(a));
  const [hday, setHday] = useState('');
  const [pick, setPick] = useState('');
  const curDay = hday || (days.includes(pick) ? pick : days[0]) || '';
  const dayTasks = (hday ? mine : inP).filter((t) => t.day === curDay).sort((a, b) => a.due_at.localeCompare(b.due_at));

  async function exportMyPdf() {
    setPdfBusy(true);
    try {
      const msg = await downloadMemberProgressPdf({
        name: person?.full_name || 'Member', title: person?.title, periodLabel: p.label, rank: periodRank?.rank,
        score: total.score, onTime: total.onTime, late: total.late, missed: total.missed, rejected: total.rejected,
        pending: total.pending + total.grace, points: total.points, counted: total.counted, done: total.done,
        channels: chans.map((c) => ({ name: c.name, score: c.s.score, roles: c.roles.map((r) => ({ role: r.role, score: r.s.score, done: r.s.done, counted: r.s.counted })) })),
        tasks: [...inP].sort((a, b) => b.day.localeCompare(a.day)).map((t) => ({ day: t.day, channel: d.channels.find((c) => c.id === t.channel_id)?.name || 'Channel', role: t.role, status: taskState(t, now).toUpperCase() }))
      });
      toast('📄 ' + msg);
    } catch (e) { toast(errorText(e)); }
    finally { setPdfBusy(false); }
  }

  return (
    <>
      {onBack && <button className="back" onClick={onBack}>‹ Wapas</button>}
      <div className="pg-head">
        <UserAvatar id={userId} />
        <div className="grow">
          <h1>{person?.full_name || 'Member'}{userId === d.uid && <span className="muted h-sub"> (aap)</span>}</h1>
          {person?.title && <div className="ptitle" data-notr>🏆 {person.title}</div>}
          <p className="muted m0 small">{monthRank ? `Is mahine rank #${monthRank.rank}` : 'Is mahine abhi rank nahi'}{person?.contact && d.isOwner ? ' · ID: ' + person.contact : ''}</p>
        </div>
        <button type="button" className="btn primary sm" disabled={pdfBusy} onClick={exportMyPdf}>{pdfBusy ? 'PDF…' : '📄 PDF Download'}</button>
      </div>
      <PeriodPicker kind={kind} offset={offset} onKind={setKind} onOffset={setOffset} />
      <section className="pg-sum">
        <ScoreRing score={total.score} size={78} />
        <div className="pg-chips">
          <span className="pc good"><b className="num">{total.onTime}</b><small>Waqt par</small></span>
          <span className="pc warn"><b className="num">{total.late}</b><small>Extra mein</small></span>
          <span className="pc bad"><b className="num">{total.missed}</b><small>Ended</small></span>
          <span className="pc bad"><b className="num">{total.rejected}</b><small>Rejected</small></span>
          <span className="pc"><b className="num">{total.pending + total.grace}</b><small>Baqi</small></span>
          <span className="pc accent"><b className="num">{total.points}</b><small>Points</small></span>
        </div>
      </section>
      <section className="sec">
        <div className="sec-head"><h2>Channels</h2><span className="eyebrow">{chans.length}</span></div>
        {chans.length ? (
          <div className="pg-tiles">
            {chans.map((c) => (
              <button key={c.cid} className="pg-tile" onClick={() => openChannel(c.cid)}>
                <span className="row between"><b className="pg-tile-t">{c.name}</b><b className={'num ' + cls(c.s.score)}>{c.s.score == null ? '—' : c.s.score + '%'}</b></span>
                <span className="pg-roles">
                  {c.roles.map((r) => (
                    <span key={r.role} className="pg-role">
                      <i className={'role sm ' + roleClass(r.role)}>{r.role}</i>
                      <small className={'num ' + cls(r.s.score)}>{r.s.score == null ? '—' : r.s.score + '%'}</small>
                      <small className="muted">{r.s.done}/{r.s.counted}</small>
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        ) : <div className="empty">Is muddat mein koi task nahi.</div>}
      </section>
      <section className="sec">
        <div className="sec-head wrap"><h2>Tasks ki history</h2><DateFilter value={hday} onChange={setHday} label="Koi aur din" /></div>
        {days.length > 0 && !hday && (
          <div className="pg-days" role="tablist" aria-label="Din">
            {days.map((day) => {
              const ts = inP.filter((t) => t.day === day);
              const sc = scoreOf(ts, now);
              return (
                <button key={day} role="tab" aria-selected={day === curDay} className={day === curDay ? 'on' : ''} onClick={() => setPick(day)}>
                  <span>{dayLabel(day).replace(/, \d{4}$/, '')}</span>
                  <b className={'num ' + cls(sc.score)}>{sc.score == null ? ts.length : sc.score + '%'}</b>
                </button>
              );
            })}
          </div>
        )}
        {dayTasks.length ? (
          <div className="tasks">{dayTasks.map((t) => <TaskItem key={t.id} task={t} now={now} onOpenChannel={openChannel} onReject={setRejecting} />)}</div>
        ) : <div className="empty">{hday ? 'Is din koi task nahi.' : 'Is muddat mein koi task nahi.'}</div>}
      </section>
      {rejecting && <RejectSheet task={rejecting} onClose={() => setRejecting(null)} />}
    </>
  );
}
