import { useState } from 'react';
import { UserAvatar } from '../components/Messaging';
import { useData } from '../lib/data';
import { STAGES, type Channel, type Stage } from '../lib/types';
import { channelTimeline, fmtDate, fmtTime, toMin, inPeriod, periodOf, perfClass, roleClass, roleTime, scheduleText, scoreOf, timeLine, todayKey, type PeriodKind } from '../lib/utils';
import { MemberCard, OwnerCard, useMyCards } from '../components/Cards';
import { Bar, DateFilter, Fold, Logo, Seg, Week, useNow } from '../components/ui';
import { TaskBoard } from '../components/Tasks';
import { ChannelTools, VideoList, VideosSheet } from '../components/Videos';
import { AssignTaskSheet } from '../components/Assign';
import { boardTasks } from './Home';

/* ================= Pending / Rejected ================= */
export function GateScreen({ onSignOut }: { onSignOut: () => void }) {
  const d = useData();
  const me = d.me;
  const rejected = me?.status === 'rejected';
  return (
    <div className="auth">
      <div className="auth-brand">
        <Logo size={56} />
        <h1>{rejected ? 'Request approve nahi hui' : 'Approval ka intezar'}</h1>
      </div>
      <p className="muted m0">
        {rejected
          ? 'Owner ne aap ki request approve nahi ki. Agar ghalti hui hai to owner se baat karein.'
          : 'Aap ki request owner ke paas chali gayi hai. Approve hote hi dashboard yahin khul jayega, app band karne ki zaroorat nahi.'}
      </p>
      {me && (
        <div className="panel">
          <div className="eyebrow">Bheji gayi details</div>
          <div>
            <b>{me.full_name}</b>
            <div className="muted">ID: {me.contact || '—'}</div>
          </div>
        </div>
      )}
      <div className="row">
        <button className="btn" onClick={() => d.reload()}>
          Dobara check karein
        </button>
        <button className="btn" onClick={onSignOut}>
          Logout
        </button>
      </div>
    </div>
  );
}

/* ================= My cards ================= */
export function MyCardsScreen({ openChannel }: { openChannel: (id: string) => void }) {
  const cards = useMyCards(false);
  return (
    <>
      <div className="hello">
        <h1>Mere cards</h1>
        <p>Har channel ka ek card — us mein aap ke saare roles.</p>
      </div>
      {cards.length ? (
        <div className="cards">
          {cards.map(({ ch, roles }) => (
            <MemberCard key={ch.id} ch={ch} roles={roles} onOpen={() => openChannel(ch.id)} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <b>Abhi koi card nahi</b>Jab owner aap ko kisi channel mein role dega, card yahan aa jayega.
        </div>
      )}
    </>
  );
}

/* ================= Channels (owner) ================= */
export function ChannelsScreen({ openChannel, newChannel }: { openChannel: (id: string) => void; newChannel: () => void }) {
  const d = useData();
  const list = [...d.channels].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <div className="sec-head">
        <div className="hello">
          <h1>Channels</h1>
          <p>{list.length} channel cards</p>
        </div>
        <button className="btn primary" onClick={newChannel}>
          + Naya
        </button>
      </div>
      {list.length ? (
        <div className="cards">
          {list.map((c) => (
            <OwnerCard key={c.id} ch={c} onOpen={() => openChannel(c.id)} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <b>Koi channel nahi</b>Channel card banayein, kaam ke din aur time set karein, phir team members ko roles dein.
          <button className="btn primary" onClick={newChannel}>
            + Naya channel
          </button>
        </div>
      )}
    </>
  );
}

/* ================= Channel detail ================= */
export function ChannelScreen({ channel, onBack, onEdit, onPerf, openProgress }: { channel: Channel; onBack: () => void; onEdit: () => void; onPerf: () => void; openProgress: (uid: string) => void }) {
  const d = useData();
  const now = useNow();
  const [pk, setPk] = useState<PeriodKind>('week');
  const period = periodOf(pk);
  const chTasks = d.tasks.filter((t) => t.channel_id === channel.id);
  const todayTasks = boardTasks(chTasks, todayKey());
  const [stage, setStage] = useState<Stage | 'all'>('all');
  const [vday, setVday] = useState('');
  const [vq, setVq] = useState('');
  const [vOpen, setVOpen] = useState<{ focus?: string; create?: boolean } | null>(null);
  const [assign, setAssign] = useState(false);
  const mine = d.rolesOf(channel.id);
  const members = d.channel_members.filter((m) => m.channel_id === channel.id && m.roles.length);
  const vids = d.videos.filter((v) => v.channel_id === channel.id);
  const counts: Record<string, number> = {};
  vids.forEach((v) => (counts[v.stage] = (counts[v.stage] || 0) + 1));
  const ql = vq.trim().toLowerCase();
  const shown = vids.filter((v) => (stage === 'all' || v.stage === stage) && (!vday || v.day === vday) && (!ql || v.title.toLowerCase().includes(ql)));
  const canWork = d.isOwner || d.realOwner || mine.length > 0;

  return (
    <>
      <button className="back" onClick={onBack}>
        ‹ Wapas
      </button>
      <div className="ch-head">
        {mine.length > 0 && (
          <div className="chips">
            {mine.map((r) => (
              <span key={r} className={'role ' + roleClass(r)}>
                {r}
              </span>
            ))}
          </div>
        )}
        <h1>{channel.name}</h1>
        {channel.about && <p className="pre">{channel.about}</p>}
        <div className="foot">
          <Week ch={channel} />
          <span>
            {scheduleText(channel)} · {timeLine(channel)}
          </span>
        </div>
        {d.isOwner && (
          <div className="row">
            <button className="btn sm" onClick={onEdit}>Channel edit karein</button>
            <button className="btn sm" onClick={onPerf}>Performance dein</button>
            <button className="btn sm primary" onClick={() => setAssign(true)}>+ Kaam assign karein</button>
          </div>
        )}
      </div>

      {/* v9: Videos sab se upar — script link + thumbnail ek hi jagah */}
      <section className="panel vids-panel">
        <div className="sec-head wrap">
          <h2>🎬 Videos</h2>
          {canWork && (
            <button className="btn primary sm" onClick={() => setVOpen({ create: true })}>
              + Nai video
            </button>
          )}
        </div>
        <div className="chips scroll">
          <button className={'chip ' + (stage === 'all' ? 'on' : '')} onClick={() => setStage('all')}>
            Sab<span className="c">{vids.length}</span>
          </button>
          {STAGES.map((s) => (
            <button key={s.key} className={'chip ' + (stage === s.key ? 'on' : '')} onClick={() => setStage(s.key)}>
              {s.label}
              <span className="c">{counts[s.key] || 0}</span>
            </button>
          ))}
        </div>
        <div className="hist-filters">
          <DateFilter value={vday} onChange={setVday} label="Kis din ki" />
          <input type="search" value={vq} onChange={(e) => setVq(e.target.value)} placeholder="Title dhoondein…" aria-label="Video dhoondein" />
        </div>
        {shown.length ? (
          <VideoList videos={shown} onOpen={(v) => setVOpen({ focus: v.id })} foldPrefix={'cv-' + channel.id} openDays={vday ? 1 : 2} />
        ) : (
          <div className="empty">
            <b>{vids.length ? 'Is filter mein koi video nahi' : 'Abhi koi video nahi'}</b>
            {canWork && !vids.length && 'Script Writer "+ Nai video" se title aur script ka link lagaye; baad mein Graphic Designer usi video mein thumbnail laga de.'}
          </div>
        )}
        <ChannelTools channelId={channel.id} showToday={false} />
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2>Aaj ke tasks</h2>
          <span className="eyebrow">{scheduleText(channel)}</span>
        </div>
        <TaskBoard tasks={todayTasks} now={now} showName groupByChannel={false} foldId={'ch-' + channel.id} emptyAll={members.length ? 'Aaj is channel ka kaam ka din nahi.' : 'Is channel mein abhi team add nahi.'} />
      </section>

      {members.length > 0 && (
        <Fold id={'tl-' + channel.id} className="panel" title={<h2>Roz ki timeline</h2>} defaultOpen extra={d.isOwner ? <button className="btn sm" onClick={onEdit}>Waqt badlein</button> : undefined}>
          <div className="tl">
            <div className="tl-scale" aria-hidden="true">
              {[0, 6, 12, 18, 24].map((h) => (
                <span key={h} style={{ left: (h / 24) * 100 + '%' }}>{h === 24 ? '' : fmtTime(String(h).padStart(2, '0') + ':00').replace(':00', '')}</span>
              ))}
            </div>
            {channelTimeline(channel, [...new Set(members.flatMap((m) => m.roles))]).map((r) => {
              const a = toMin(r.start), b0 = toMin(r.end), b = b0 <= a ? b0 + 1440 : b0;
              const who = members.filter((m) => m.roles.includes(r.role)).map((m) => d.nameOf(m.user_id)).join(', ');
              const extra = roleTime(channel, r.role).days || 0;
              return (
                <div className="tl-row" key={r.role}>
                  <div className="tl-label">
                    <span className={'role sm ' + roleClass(r.role)}>{r.role}</span>
                    <span className="muted tiny">{who}</span>
                  </div>
                  <div className="tl-track">
                    <i className={roleClass(r.role)} style={{ left: (a / 1440) * 100 + '%', width: (Math.min(b, 1440) - a) / 14.4 + '%' }} />
                    {b > 1440 && <i className={roleClass(r.role)} style={{ left: 0, width: (b - 1440) / 14.4 + '%' }} />}
                  </div>
                  <span className="tl-time num">
                    {fmtTime(r.start)} – {fmtTime(r.end)}{extra ? ` +${extra} din` : b0 <= a ? ' +1' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </Fold>
      )}

      <Fold id={'team-' + channel.id} className="panel" title={<h2>Team, roles aur progress</h2>} defaultOpen extra={d.isOwner ? <button className="btn sm" onClick={onEdit}>Team / roles badlein</button> : undefined}>
        <Seg label="Progress muddat" value={pk} onChange={setPk} options={[{ v: 'day', label: 'Aaj' }, { v: 'week', label: 'Is hafte' }, { v: 'month', label: 'Is mahine' }]} />
        {members.length ? (
          <div className="list">
            {members.map((m) => {
              const show = d.isOwner || m.user_id === d.uid;
              return (
                <div className="li top" key={m.user_id}>
                  <UserAvatar id={m.user_id} />
                  <div className="grow stack">
                    <button className="t linklike" onClick={() => show && openProgress(m.user_id)} disabled={!show}>
                      {d.nameOf(m.user_id)}
                      {m.user_id === d.uid && <span className="muted"> (aap)</span>}
                    </button>
                    {m.roles.map((r) => {
                      const p = d.perf.latest(channel.id, m.user_id, r);
                      const hist = d.perf.history(channel.id, m.user_id, r).slice(-6);
                      const ts = scoreOf(chTasks.filter((t) => t.user_id === m.user_id && t.role === r && inPeriod(t, period)), now);
                      return (
                        <div key={r}>
                          <div className="row between">
                            <span className={'role ' + roleClass(r)}>{r}</span>
                            {show && <span className={'num strong ' + (p ? perfClass(p.pct) : 'muted')} title="Owner ki di hui performance">{p ? p.pct + '%' : '—'}</span>}
                          </div>
                          <div className="tprog">
                            <span className="muted">Task progress</span>
                            <b className={'num ' + (ts.score == null ? 'muted' : perfClass(ts.score))}>{ts.score == null ? '—' : ts.score + '%'}</b>
                            <span className="muted">{ts.done}/{ts.counted} complete</span>
                            {ts.rejected > 0 && <span className="bad">{ts.rejected} rejected</span>}
                          </div>
                          {show && p && <Bar pct={p.pct} cls={perfClass(p.pct)} />}
                          {show && hist.length > 1 && (
                            <div className="muted tiny">History: {hist.map((h) => `${h.pct}% (${fmtDate(h.rated_on)})`).join(' → ')}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="muted">Abhi koi member nahi. {d.isOwner && '"Channel edit karein" se add karein.'}</div>
        )}
      </Fold>
      {vOpen && <VideosSheet channelId={channel.id} focus={vOpen.focus} create={vOpen.create} initialTab={vOpen.focus && vids.find((v) => v.id === vOpen.focus)?.day !== todayKey() ? 'history' : 'today'} onClose={() => setVOpen(null)} />}
      {assign && <AssignTaskSheet channelId={channel.id} onClose={() => setAssign(false)} />}
    </>
  );
}
