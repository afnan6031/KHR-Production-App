import { useState } from 'react';
import { useData } from '../lib/data';
import { STAGES, type Channel, type Stage, type Video } from '../lib/types';
import { addDays, channelTimeline, errorText, fmtDate, fmtTime, toMin, fmtFull, inPeriod, periodOf, perfClass, roleClass, scheduleText, scoreOf, stageLabel, timeLine, todayKey, viewsFor, type PeriodKind } from '../lib/utils';
import { MemberCard, OwnerCard, useMyCards } from '../components/Cards';
import { Avatar, Bar, Delta, Logo, Seg, Week, useNow, useToast } from '../components/ui';
import { TaskBoard } from '../components/Tasks';
import { ChannelTools } from '../components/Attachments';

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
        <p>Har channel aur har role ka alag card.</p>
      </div>
      {cards.length ? (
        <div className="cards">
          {cards.map(({ ch, role }) => (
            <MemberCard key={ch.id + role} ch={ch} role={role} onOpen={() => openChannel(ch.id)} />
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
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 300, H = 70, pad = 6;
  const mx = Math.max(...values), mn = Math.min(...values), rg = mx - mn || 1;
  const pts = values.map((v, i) => [pad + (i * (W - 2 * pad)) / (values.length - 1), H - pad - ((v - mn) / rg) * (H - 2 * pad)]);
  const line = pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Views trend">
      <polygon points={`${pad},${H - pad} ${line} ${last[0].toFixed(1)},${H - pad}`} fill="var(--accent-soft)" />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="var(--accent)" />
    </svg>
  );
}

export function ChannelScreen({ channel, onBack, onEdit, onPerf, onVideo, openProgress }: { channel: Channel; onBack: () => void; onEdit: () => void; onPerf: () => void; onVideo: (v: Video | null) => void; openProgress: (uid: string) => void }) {
  const d = useData();
  const toast = useToast();
  const now = useNow();
  const [pk, setPk] = useState<PeriodKind>('week');
  const period = periodOf(pk);
  const chTasks = d.tasks.filter((t) => t.channel_id === channel.id);
  const todayTasks = chTasks.filter((t) => t.day === todayKey() || (t.status === 'pending' && t.day < todayKey() && t.day >= addDays(todayKey(), -7)));
  const [stage, setStage] = useState<Stage | 'all'>('all');
  const [vDate, setVDate] = useState(todayKey());
  const [vNum, setVNum] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = d.rolesOf(channel.id);
  const vi = viewsFor(d.channel_views, channel.id);
  const members = d.channel_members.filter((m) => m.channel_id === channel.id && m.roles.length);
  const vids = d.videos.filter((v) => v.channel_id === channel.id).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const counts: Record<string, number> = {};
  vids.forEach((v) => (counts[v.stage] = (counts[v.stage] || 0) + 1));
  const shown = stage === 'all' ? vids : vids.filter((v) => v.stage === stage);
  const canWork = d.isOwner || mine.length > 0;

  async function saveViews() {
    const n = Number(vNum);
    if (!vDate || vNum === '' || isNaN(n) || n < 0) return toast('Date aur views dono likhein');
    setBusy(true);
    try {
      await d.saveViews(channel.id, vDate, Math.round(n));
      setVNum('');
      toast(fmtDate(vDate) + ' ke views save ho gaye');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  }

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
        <div className="panel tools-panel">
          <ChannelTools channelId={channel.id} />
        </div>
        {d.isOwner && (
          <div className="row">
            <button className="btn sm" onClick={onEdit}>
              Channel edit karein
            </button>
            <button className="btn sm" onClick={onPerf}>
              Performance dein
            </button>
          </div>
        )}
      </div>

      {members.length > 0 && (
        <section className="panel">
          <div className="sec-head wrap">
            <h2>Roz ki timeline</h2>
            {d.isOwner && (
              <button className="btn sm" onClick={onEdit}>
                Waqt badlein
              </button>
            )}
          </div>
          <div className="tl">
            <div className="tl-scale" aria-hidden="true">
              {[0, 6, 12, 18, 24].map((h) => (
                <span key={h} style={{ left: (h / 24) * 100 + '%' }}>{h === 24 ? '' : fmtTime(String(h).padStart(2, '0') + ':00').replace(':00', '')}</span>
              ))}
            </div>
            {channelTimeline(channel, [...new Set(members.flatMap((m) => m.roles))]).map((r) => {
              const a = toMin(r.start), b0 = toMin(r.end), b = b0 <= a ? b0 + 1440 : b0;
              const who = members.filter((m) => m.roles.includes(r.role)).map((m) => d.nameOf(m.user_id)).join(', ');
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
                    {fmtTime(r.start)} – {fmtTime(r.end)}{b0 <= a ? ' +1' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="sec">
        <div className="sec-head">
          <h2>Aaj ke tasks</h2>
          <span className="eyebrow">{scheduleText(channel)}</span>
        </div>
        <TaskBoard tasks={todayTasks} now={now} showName groupByChannel={false} emptyAll={members.length ? 'Aaj is channel ka kaam ka din nahi.' : 'Is channel mein abhi team add nahi.'} />
      </section>

      <section className="panel">
        <div className="sec-head">
          <h2>Daily views</h2>
          <span className="eyebrow">{vi ? 'Last: ' + fmtDate(vi.last.day) : ''}</span>
        </div>
        {vi ? (
          <>
            <div className="row baseline">
              <span className="num big">{fmtFull(Number(vi.last.views))}</span>
              {vi.delta != null && (
                <span>
                  <Delta d={vi.delta} /> pichli entry se
                </span>
              )}
            </div>
            <Spark values={vi.rows.slice(-14).map((r) => Number(r.views))} />
            <table className="vtable">
              <tbody>
                {vi.rows
                  .slice(-7)
                  .reverse()
                  .map((r) => (
                    <tr key={r.day}>
                      <td>{fmtDate(r.day)}</td>
                      <td className="num">{fmtFull(Number(r.views))}</td>
                      {d.isOwner && (
                        <td className="w1">
                          <button className="linkbtn" onClick={() => d.deleteViews(channel.id, r.day).catch((e) => toast(errorText(e)))} aria-label={'Delete ' + r.day}>
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="muted">Abhi views nahi likhe gaye.</div>
        )}
        {d.isOwner && (
          <>
            <div className="two">
              <label className="f">
                Date
                <input id="vw-date" type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} />
              </label>
              <label className="f">
                Views
                <input id="vw-num" type="number" inputMode="numeric" min={0} value={vNum} onChange={(e) => setVNum(e.target.value)} placeholder="e.g. 12500" />
              </label>
            </div>
            <button className="btn primary" disabled={busy} onClick={saveViews}>
              Views save karein
            </button>
          </>
        )}
      </section>

      <section className="panel">
        <div className="sec-head wrap">
          <h2>Team, roles aur progress</h2>
          {d.isOwner && (
            <button className="btn sm" onClick={onEdit}>
              Team / roles badlein
            </button>
          )}
        </div>
        <Seg label="Progress muddat" value={pk} onChange={setPk} options={[{ v: 'day', label: 'Aaj' }, { v: 'week', label: 'Is hafte' }, { v: 'month', label: 'Is mahine' }]} />
        {members.length ? (
          <div className="list">
            {members.map((m) => {
              const show = d.isOwner || m.user_id === d.uid;
              return (
                <div className="li top" key={m.user_id}>
                  <Avatar name={d.nameOf(m.user_id)} />
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
                            <span className="muted">{ts.done}/{ts.counted} complete{ts.rejected ? '' : ''}</span>
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
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2>Videos</h2>
          {canWork && (
            <button className="btn primary sm" onClick={() => onVideo(null)}>
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
        {shown.length ? (
          <div className="panel">
            <div className="list">
              {shown.map((v) => {
                const wc = v.script.trim() ? v.script.trim().split(/\s+/).length + ' words' : 'Script khaali';
                return (
                  <button className="li" key={v.id} onClick={() => onVideo(v)}>
                    <div className="grow">
                      <div className="t">{v.title}</div>
                      <div className="d">
                        {wc}
                        {v.due ? ' · Due ' + fmtDate(v.due) : ''}
                        {v.updated_by ? ' · ' + d.nameOf(v.updated_by) : ''}
                      </div>
                    </div>
                    <span className={'stage ' + v.stage}>{stageLabel(v.stage)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="empty">
            <b>{vids.length ? 'Is stage mein koi video nahi' : 'Abhi koi video nahi'}</b>
            {canWork && 'Nai video add karein. Script Writer us mein script likhega, Editor aur Manager stage aage barhayenge.'}
          </div>
        )}
      </section>
    </>
  );
}
