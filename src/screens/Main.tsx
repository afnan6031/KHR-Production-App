import { useState } from 'react';
import { UserAvatar } from '../components/Messaging';
import { useData } from '../lib/data';
import { FB_ROLE, type Channel } from '../lib/types';
import { visibleTask, CHANNEL_PERF_RULES, channelTimeline, fmtDate, fmtTime, toMin, inPeriod, periodOf, perfClass, roleClass, roleTime, scheduleText, scoreOf, timeLine, todayKey, type PeriodKind } from '../lib/utils';
import { CardSizePicker, MemberCard, OwnerCard, useCardSize, useChannelPerf, useMyCards } from '../components/Cards';
import { Bar, Fold, Logo, Seg, Week, useNow } from '../components/ui';
import { TaskBoard } from '../components/Tasks';
import { VideoBrowser, VideosSheet } from '../components/Videos';
import { ChatSheet } from '../components/Chat';
import { boardTasks } from './Home';
import { DayStrip, DayTasks } from '../components/DayPlan';

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
  const d = useData();
  const [size, setSize] = useCardSize();
  // v15: owner upar se kisi bhi user ko chun kar dekh sake ke us ke paas kaun se cards hain
  const [who, setWho] = useState<string>(d.uid);
  const people = d.realOwner ? d.profiles.filter((p) => p.id !== d.uid && p.status === 'approved' && !p.is_owner).sort((a, b) => a.full_name.localeCompare(b.full_name)) : [];
  const uid = people.some((p) => p.id === who) ? who : d.uid;
  const cards = useMyCards(false, uid);
  const person = d.profileOf(uid);
  const now = useNow(15000);
  const today = todayKey();
  // v15: din chun kar dekhein us din kya kaam tha / hai
  const [day, setDay] = useState(today);
  return (
    <>
      <div className="sec-head wrap">
        <div className="hello">
          <h1>{uid === d.uid ? 'Mere cards' : (person?.full_name || 'Member') + ' ke cards'}</h1>
          <p>{uid === d.uid ? 'Har channel ka ek card — us mein aap ke saare roles.' : 'Preview: is user ko yahi cards nazar aate hain.'}</p>
        </div>
        <CardSizePicker value={size} onChange={setSize} />
      </div>
      {people.length > 0 && <WhoPick value={uid} onChange={setWho} allLabel="Mere" />}
      <section className="sec day-sec">
        <div className="sec-head">
          <h2>{day === today ? 'Aaj ka kaam' : 'Is din ka kaam'}</h2>
        </div>
        <DayStrip value={day} onChange={setDay} />
        {day === today ? (
          <TaskBoard tasks={boardTasks(d.tasks, today, uid)} now={now} onOpenChannel={openChannel} foldId={'mc-' + uid} emptyAll="Aaj kisi card ka kaam ka din nahi." />
        ) : (
          <DayTasks day={day} userId={uid} now={now} onOpenChannel={openChannel} foldId={'mcd-' + uid} />
        )}
      </section>
      {cards.length ? (
        <div className={'cards size-' + size}>
          {cards.map(({ ch, roles }) => (
            <MemberCard key={ch.id} ch={ch} roles={roles} userId={uid} size={size} onOpen={() => openChannel(ch.id)} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <b>Abhi koi card nahi</b>{uid === d.uid ? 'Jab owner aap ko kisi channel mein role dega, card yahan aa jayega.' : 'Is user ko abhi kisi channel mein role nahi mila.'}
        </div>
      )}
    </>
  );
}


/** v15: owner upar se kisi bhi user ko chune — us ke cards ka preview */
export function WhoPick({ value, onChange, allLabel, allValue }: { value: string; onChange: (id: string) => void; allLabel: string; allValue?: string }) {
  const d = useData();
  const people = d.profiles.filter((p) => p.id !== d.uid && p.status === 'approved' && !p.is_owner).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const first = allValue ?? d.uid;
  return (
    <div className="who-pick" role="tablist" aria-label="Kis user ke cards">
      <button role="tab" aria-selected={value === first} className={value === first ? 'on' : ''} onClick={() => onChange(first)}>
        {allValue === undefined && <UserAvatar id={d.uid} />} <span>{allLabel}</span>
      </button>
      {people.map((p) => {
        const n = d.channels.filter((c) => d.rolesOf(c.id, p.id).length).length;
        return (
          <button key={p.id} role="tab" aria-selected={value === p.id} className={value === p.id ? 'on' : ''} onClick={() => onChange(p.id)}>
            <UserAvatar id={p.id} /> <span data-notr>{p.full_name}</span> <b className="num">{n}</b>
          </button>
        );
      })}
    </div>
  );
}

/* ================= Channels (owner) ================= */
export function ChannelsScreen({ openChannel, newChannel }: { openChannel: (id: string) => void; newChannel: () => void }) {
  const d = useData();
  const [size, setSize] = useCardSize();
  // v15: kisi user ko chunein to wahi cards jo use nazar aate hain
  const [who, setWho] = useState('all');
  const picked = who !== 'all' && d.profiles.some((p) => p.id === who) ? who : 'all';
  const userCards = useMyCards(false, picked === 'all' ? d.uid : picked);
  const list = [...d.channels].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <div className="sec-head wrap">
        <div className="hello">
          <h1>Channels</h1>
          <p>{list.length} channel cards</p>
        </div>
        <div className="row">
          <CardSizePicker value={size} onChange={setSize} />
          <button className="btn primary" onClick={newChannel}>
            + Naya
          </button>
        </div>
      </div>
      {list.length > 0 && <WhoPick value={picked} onChange={setWho} allLabel="Sab channels" allValue="all" />}
      {picked !== 'all' ? (
        userCards.length ? (
          <>
            <p className="muted small m0 who-note">Preview: <b data-notr>{d.nameOf(picked)}</b> ko yahi cards nazar aate hain.</p>
            <div className={'cards size-' + size}>
              {userCards.map(({ ch, roles }) => (
                <MemberCard key={ch.id} ch={ch} roles={roles} userId={picked} size={size} onOpen={() => openChannel(ch.id)} />
              ))}
            </div>
          </>
        ) : (
          <div className="empty"><b>Koi card nahi</b>Is user ko abhi kisi channel mein role nahi mila.</div>
        )
      ) : list.length ? (
        <div className={'cards size-' + size}>
          {list.map((c) => (
            <OwnerCard key={c.id} ch={c} size={size} onOpen={() => openChannel(c.id)} />
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
  // v16: "din pehle" wale kisi aur ke task production ke din se pehle nazar nahi aate (confusion na ho)
  const todayTasks = boardTasks(chTasks.filter((t) => visibleTask(t, d.uid, d.isOwner || d.realOwner)), todayKey());
  const [vTab, setVTab] = useState<'today' | 'upcoming' | 'history'>('today');
  const [chat, setChat] = useState(false);
  const [vOpen, setVOpen] = useState<{ focus?: string; create?: boolean } | null>(null);
  const mine = d.rolesOf(channel.id);
  const members = d.channel_members.filter((m) => m.channel_id === channel.id && m.roles.length);
  const vids = d.videos.filter((v) => v.channel_id === channel.id);
  const canWork = d.isOwner || d.realOwner || d.canEditVideos(channel.id);
  const fbPeople = members.filter((m) => m.roles.includes(FB_ROLE)).map((m) => d.nameOf(m.user_id));
  const cperf = useChannelPerf(channel, pk === 'day' ? 'week' : pk);

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
          </div>
        )}
      </div>

      {/* v11: Videos sab se upar — Aaj ki videos / Purani videos, har video ka apna card */}
      <section className="panel vids-panel">
        <div className="sec-head wrap">
          <h2>🎬 Videos</h2>
          <button className="btn sm" onClick={() => setChat(true)}>💬 Messages</button>
        </div>
        <VideoBrowser
          channelId={channel.id}
          tab={vTab}
          setTab={setVTab}
          onOpen={(v) => setVOpen({ focus: v.id })}
          onCreate={canWork ? () => setVOpen({ create: true }) : undefined}
        />
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2>Aaj ke tasks</h2>
          <span className="eyebrow">{scheduleText(channel)}</span>
        </div>
        <TaskBoard tasks={todayTasks} now={now} showName groupByChannel={false} foldId={'ch-' + channel.id} emptyAll={members.length ? 'Aaj is channel ka kaam ka din nahi.' : 'Is channel mein abhi team add nahi.'} />
      </section>

      <Fold id={'cp-' + channel.id} className="panel" title={<h2>📈 Channel performance</h2>} defaultOpen extra={<b className={'num cp-big ' + (cperf.pct == null ? 'muted' : perfClass(cperf.pct))}>{cperf.pct == null ? '—' : cperf.pct + '%'}</b>}>
        <Seg label="Progress muddat" value={pk === 'day' ? 'week' : pk} onChange={setPk} options={[{ v: 'week', label: 'Is hafte' }, { v: 'month', label: 'Is mahine' }]} />
        <div className="cp-grid">
          {cperf.roles.map((r) => (
            <div key={r.role} className="cp-role">
              <div className="row between">
                <span className={'role sm ' + roleClass(r.role)}>{r.role}</span>
                <b className={'num ' + (r.pct == null ? 'muted' : perfClass(r.pct))}>{r.pct == null ? '—' : r.pct + '%'}</b>
              </div>
              <Bar pct={r.pct ?? 0} cls={r.pct == null ? '' : perfClass(r.pct)} />
              <div className="cp-stats">
                <span title="Waqt par">✓ {r.onTime}</span>
                <span title="Deadline barha kar waqt par" className="warn">⏳ {r.extended}</span>
                <span title="Extra 24 ghante mein (delay)" className="warn">⌛ {r.late}</span>
                <span title="Expire / reh gaya" className="bad">✕ {r.missed}</span>
                {r.rejected > 0 && <span title="Reject" className="bad">⛔ {r.rejected}</span>}
              </div>
            </div>
          ))}
          {!cperf.roles.length && <p className="muted small m0">Abhi is channel mein roles nahi.</p>}
        </div>
        <p className="muted tiny m0">{CHANNEL_PERF_RULES}</p>
      </Fold>

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
              const pre = roleTime(channel, r.role).before || 0;
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
                    {pre ? `−${pre} din · ` : ''}{fmtTime(r.start)} – {fmtTime(r.end)}{extra ? ` +${extra} din` : b0 <= a ? ' +1' : ''}
                  </span>
                </div>
              );
            })}
          </div>
          {fbPeople.length > 0 && (
            <p className="muted small m0 tl-fb"><span className={'role sm ' + roleClass(FB_ROLE)}>{FB_ROLE}</span> <span data-notr>{fbPeople.join(', ')}</span> — baqi sab ka kaam mukammal hote hi 24 ghante ka task (video Facebook par, phir link).</p>
          )}
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
      {chat && <ChatSheet channelId={channel.id} onClose={() => setChat(false)} />}
      {vOpen && <VideosSheet channelId={channel.id} focus={vOpen.focus} create={vOpen.create} initialTab={(() => { const vd = vOpen.focus ? vids.find((v) => v.id === vOpen.focus)?.day : undefined; return !vd || vd === todayKey() ? 'today' : vd > todayKey() ? 'upcoming' : 'history'; })()} onClose={() => setVOpen(null)} />}
    </>
  );
}
