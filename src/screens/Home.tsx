import { useMemo, useState } from 'react';
import { useData } from '../lib/data';
import type { Task } from '../lib/types';
import { DAYS_LONG, DAYS_UR, addDays, errorText, fmtN, inPeriod, isToday, periodOf, scoreOf, taskState, todayKey, weekdayOf } from '../lib/utils';
import { OwnerCard } from '../components/Cards';
import { TaskBoard } from '../components/Tasks';
import { Avatar, ConfirmButton, useNow, useToast } from '../components/ui';
import { MiniScore } from './Progress';

/** Aaj ke tasks + pichle 7 din ke jo abhi bhi pending/expired hain */
function boardTasks(tasks: Task[], today: string, userId?: string) {
  const weekAgo = addDays(today, -7);
  return tasks.filter((t) => (!userId || t.user_id === userId) && (t.day === today || (t.status === 'pending' && t.day >= weekAgo && t.day < today)));
}

export function HomeScreen({ openChannel, openProgress, goTeam, newChannel }: { openChannel: (id: string) => void; openProgress: (uid: string) => void; goTeam: () => void; newChannel: () => void }) {
  const d = useData();
  const now = useNow();
  const today = todayKey();
  const [scope, setScope] = useState<'team' | 'mine'>('team');
  const greet = (
    <div className="hello">
      <span className="eyebrow">
        {DAYS_UR[weekdayOf(today)]} · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
      </span>
      <h1>Assalam o Alaikum, {d.me?.full_name || (d.isOwner ? 'Owner' : '')}</h1>
    </div>
  );

  const myTasks = useMemo(() => boardTasks(d.tasks, today, d.uid), [d.tasks, today, d.uid]);
  const myScores = useMemo(() => {
    const mine = d.tasks.filter((t) => t.user_id === d.uid);
    return (['day', 'week', 'month'] as const).map((k) => ({ k, s: scoreOf(mine.filter((t) => inPeriod(t, periodOf(k))), now) }));
  }, [d.tasks, d.uid, now]);

  if (!d.isOwner) {
    return (
      <>
        {greet}
        <button className="mini-scores" onClick={() => openProgress(d.uid)} aria-label="Meri progress kholein">
          {myScores.map(({ k, s }) => (
            <MiniScore key={k} label={k === 'day' ? 'Aaj' : k === 'week' ? 'Is hafte' : 'Is mahine'} s={s} />
          ))}
        </button>
        <section className="sec">
          <div className="sec-head">
            <h2>Aaj ke kaam</h2>
            <span className="eyebrow">{DAYS_LONG[weekdayOf(today)]}</span>
          </div>
          <TaskBoard tasks={myTasks} now={now} onOpenChannel={openChannel} emptyAll="Aaj aap ke kisi channel ka kaam ka din nahi, ya owner ne abhi aap ko kisi channel mein role nahi diya." />
          <p className="muted tiny m0">Kaam khatam ho to gol nishan par tick karein. Ghalti se tick ho jaye to dobara tap kar ke hata dein.</p>
        </section>
      </>
    );
  }

  // ---------- Owner ----------
  const teamTasks = boardTasks(d.tasks, today);
  const shown = scope === 'mine' ? myTasks : teamTasks;
  const todayAll = d.tasks.filter((t) => t.day === today);
  const cnt = { pending: 0, expired: 0, done: 0 };
  todayAll.forEach((t) => {
    const st = taskState(t, now);
    if (st === 'pending') cnt.pending++;
    else if (st === 'expired') cnt.expired++;
    else cnt.done++;
  });
  const pending = d.profiles.filter((p) => p.status === 'pending');
  const todayCh = [...d.channels].filter((c) => isToday(c, today)).sort((a, b) => a.name.localeCompare(b.name));
  const tv = d.channel_views.filter((v) => v.day === today);

  return (
    <>
      {greet}
      <div className="stats four">
        <div className="stat"><div className="v">{cnt.pending}</div><div className="l">Aaj pending</div></div>
        <div className="stat"><div className={'v ' + (cnt.expired ? 'bad' : '')}>{cnt.expired}</div><div className="l">Aaj expired</div></div>
        <div className="stat"><div className="v good">{cnt.done}</div><div className="l">Aaj completed</div></div>
        <div className="stat"><div className="v">{tv.length ? fmtN(tv.reduce((a, v) => a + Number(v.views), 0)) : '—'}</div><div className="l">Aaj ke views</div></div>
      </div>
      {pending.length > 0 && (
        <div className="panel row-panel">
          <div className="grow">
            <b>{pending.length} naye member</b>
            <div className="muted small">Team mein shamil hone ki request bheji hai.</div>
          </div>
          <button className="btn primary sm" onClick={goTeam}>
            Dekhein
          </button>
        </div>
      )}
      <section className="sec">
        <div className="sec-head">
          <h2>Aaj ke tasks</h2>
          {myTasks.length > 0 && (
            <div className="seg sm">
              <button className={scope === 'team' ? 'on' : ''} onClick={() => setScope('team')}>Poori team</button>
              <button className={scope === 'mine' ? 'on' : ''} onClick={() => setScope('mine')}>Mere</button>
            </div>
          )}
        </div>
        <TaskBoard
          tasks={shown}
          now={now}
          showName={scope === 'team'}
          onOpenChannel={openChannel}
          emptyAll={d.channels.length ? 'Aaj kisi channel ka kaam ka din nahi, ya channels mein abhi team add nahi.' : 'Pehle channel card banayein aur us mein team ko roles dein.'}
        />
      </section>
      <section className="sec">
        <div className="sec-head">
          <h2>Aaj ki production</h2>
          <span className="eyebrow">{todayCh.length} channels</span>
        </div>
        {todayCh.length ? (
          <div className="cards">
            {todayCh.map((c) => (
              <OwnerCard key={c.id} ch={c} onOpen={() => openChannel(c.id)} />
            ))}
          </div>
        ) : d.channels.length ? (
          <div className="empty"><b>Aaj kisi channel ka din nahi</b>Channels tab se kaam ke din set kar sakte hain.</div>
        ) : (
          <div className="empty">
            <b>Pehla channel banayein</b>Channel card bana kar us mein team ke log aur un ke roles add karein.
            <button className="btn primary" onClick={newChannel}>+ Naya channel</button>
          </div>
        )}
      </section>
    </>
  );
}

/* ================= Team (owner) ================= */
export function TeamScreen({ openProgress }: { openProgress: (uid: string) => void }) {
  const d = useData();
  const toast = useToast();
  const now = useNow(60000);
  const month = periodOf('month');
  const pending = d.profiles.filter((p) => p.status === 'pending').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const approved = d.profiles.filter((p) => p.status === 'approved' && !p.is_owner).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const rejected = d.profiles.filter((p) => p.status === 'rejected');
  const act = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast(errorText(e));
    }
  };
  const rolesAcross = (uid: string) => d.channels.flatMap((c) => d.rolesOf(c.id, uid).map((r) => c.name + ': ' + r));

  return (
    <>
      <div className="hello">
        <h1>Team</h1>
        <p>Naye log yahan approve karein. Kisi bhi bande par tap kar ke us ki poori progress dekhein.</p>
      </div>
      <section className="sec">
        <div className="sec-head">
          <h2>Approval ki requests</h2>
          <span className="eyebrow">{pending.length}</span>
        </div>
        {pending.length ? (
          <div className="panel">
            <div className="list">
              {pending.map((p) => (
                <div className="li" key={p.id}>
                  <Avatar name={p.full_name} />
                  <div className="grow">
                    <div className="t">{p.full_name}</div>
                    <div className="d">ID: {p.contact || '—'}{p.note ? ' · ' + p.note : ''}</div>
                  </div>
                  <div className="row">
                    <button className="btn sm danger" onClick={() => act(() => d.setStatus(p.id, 'rejected'), 'Reject kar diya')}>Reject</button>
                    <button className="btn sm primary" onClick={() => act(() => d.setStatus(p.id, 'approved'), 'Approve ho gaya')}>Approve</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty"><b>Koi request nahi</b>Team member app install kar ke "Naya account" banaye. Us ki request yahan aayegi.</div>
        )}
      </section>
      <section className="sec">
        <div className="sec-head">
          <h2>Approved team</h2>
          <span className="eyebrow">{month.label} progress</span>
        </div>
        {approved.length ? (
          <div className="panel">
            <div className="list">
              {approved.map((p) => {
                const s = scoreOf(d.tasks.filter((t) => t.user_id === p.id && inPeriod(t, month)), now);
                const rs = rolesAcross(p.id);
                return (
                  <div className="li" key={p.id}>
                    <button className="li-main" onClick={() => openProgress(p.id)}>
                      <Avatar name={p.full_name} />
                      <span className="grow">
                        <span className="t block">{p.full_name}</span>
                        <span className="d block">{rs.length ? rs.join(' · ') : 'Kisi channel mein role nahi'}</span>
                      </span>
                      <span className="score-chip">
                        <b className={'num ' + (s.score == null ? 'muted' : s.score >= 85 ? 'good' : s.score >= 65 ? 'warn' : 'bad')}>{s.score == null ? '—' : s.score + '%'}</b>
                        {s.rejected > 0 && <small className="bad">{s.rejected} rejected</small>}
                      </span>
                    </button>
                    <ConfirmButton className="btn sm" label="Hatayein" confirmLabel="Pakka?" onConfirm={() => act(() => d.removeUser(p.id), 'Team se hata diya')} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="empty">Abhi koi approved member nahi.</div>
        )}
      </section>
      {rejected.length > 0 && (
        <section className="sec">
          <h2>Reject / hataye gaye</h2>
          <div className="panel">
            <div className="list">
              {rejected.map((p) => (
                <div className="li" key={p.id}>
                  <Avatar name={p.full_name} />
                  <div className="grow">
                    <div className="t">{p.full_name}</div>
                    <div className="d">ID: {p.contact || '—'}</div>
                  </div>
                  <button className="btn sm" onClick={() => act(() => d.setStatus(p.id, 'approved'), 'Approve ho gaya')}>Approve</button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
