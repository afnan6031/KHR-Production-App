import { useRef, useState, type FormEvent } from 'react';
import { imgbbReady, uploadToImgBB } from '../lib/imgbb';
import { useData } from '../lib/data';
import { ROLES, STAGES, type Channel, type RoleTime, type Video } from '../lib/types';
import { DAYS_LONG, channelTimeline, errorText, fmtDate, fmtTime, roleClass, roleTime, toMin } from '../lib/utils';
import { Avatar, ConfirmButton, Sheet, useToast } from './ui';

/* ================= Channel create / edit ================= */
export function ChannelSheet({ channel, onClose, onSaved }: { channel: Channel | null; onClose: () => void; onSaved: (id: string) => void }) {
  const d = useData();
  const toast = useToast();
  const [name, setName] = useState(channel?.name || '');
  const [about, setAbout] = useState(channel?.about || '');
  const [type, setType] = useState<'daily' | 'days'>(channel?.schedule_type || 'days');
  const [days, setDays] = useState<number[]>(channel?.work_days?.length ? channel.work_days : [1, 4]);
  // v3: har role ka apna start aur deadline
  const [times, setTimes] = useState<Record<string, RoleTime>>(() => {
    const t: Record<string, RoleTime> = {};
    if (channel) ROLES.forEach((r) => (t[r] = roleTime(channel, r)));
    return t;
  });
  const [deadline, setDeadline] = useState(channel?.deadline || '');
  const [members, setMembers] = useState<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {};
    if (channel) d.channel_members.filter((x) => x.channel_id === channel.id).forEach((x) => (m[x.user_id] = [...x.roles]));
    return m;
  });
  const [busy, setBusy] = useState(false);

  const people = d.profiles
    .filter((p) => p.is_owner || p.status === 'approved')
    .sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || a.full_name.localeCompare(b.full_name));

  const assigned = people.map((p) => [p.id, ROLES.filter((r) => (members[p.id] || []).includes(r))] as [string, string[]]).filter(([, rs]) => rs.length);

  const usedSet = ROLES.filter((r) => assigned.some(([, rs]) => rs.includes(r)));
  // timeline ki tarteeb: khulte waqt start time ke hisaab se, naye roles neeche (likhte waqt jagah na badle)
  const [order] = useState<string[]>(() =>
    channel ? channelTimeline(channel, [...new Set(d.channel_members.filter((m) => m.channel_id === channel.id).flatMap((m) => m.roles))]).map((r) => r.role) : []
  );
  const usedRoles: string[] = [...order.filter((r) => (usedSet as readonly string[]).includes(r)), ...usedSet.filter((r) => !order.includes(r))];
  /** naye role ka default waqt: pichle role ki deadline se 3 ghante */
  const timeOf = (role: string): RoleTime => {
    if (times[role]) return times[role];
    const before = usedRoles.slice(0, usedRoles.indexOf(role)).map((r) => times[r]).filter(Boolean);
    const start = before.length ? before[before.length - 1].end : '10:00';
    const h = (Math.floor(toMin(start) / 60) + 3) % 24;
    return { start, end: String(h).padStart(2, '0') + ':' + start.slice(3, 5) };
  };
  const setTime = (role: string, key: 'start' | 'end', v: string) => setTimes((t) => ({ ...t, [role]: { ...timeOf(role), [key]: v } }));

  const toggleRole = (uid: string, role: string) =>
    setMembers((m) => {
      const cur = m[uid] || [];
      return { ...m, [uid]: cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role] };
    });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast('Channel ka naam likhein');
    if (type === 'days' && !days.length) return toast('Kam az kam ek din chunein');
    setBusy(true);
    try {
      const ordered: Record<string, string[]> = {};
      Object.entries(members).forEach(([u, rs]) => (ordered[u] = ROLES.filter((r) => rs.includes(r))));
      const role_times: Record<string, RoleTime> = {};
      usedRoles.forEach((r) => (role_times[r] = timeOf(r)));
      for (const r of usedRoles) if (!role_times[r].start || !role_times[r].end) throw new Error(`${r} ka start aur deadline dono likhein`);
      // card par dikhane ke liye poore din ka waqt: sab se pehla start aur sab se aakhri deadline
      const list = usedRoles.map((r) => role_times[r]);
      const from = list.length ? list.reduce((a, b) => (toMin(b.start) < toMin(a.start) ? b : a)).start : null;
      const to = list.length ? list.reduce((a, b) => (toMin(b.end) > toMin(a.end) ? b : a)).end : null;
      const id = await d.saveChannel({
        id: channel?.id,
        name: name.trim(),
        about: about.trim(),
        schedule_type: type,
        work_days: [...days].sort(),
        time_from: from,
        time_to: to,
        deadline: deadline || null,
        role_times,
        members: ordered
      });
      toast(channel ? 'Channel update ho gaya' : 'Channel card ban gaya');
      onSaved(id);
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={channel ? 'Channel edit' : 'Naya channel card'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="f">
          Channel ka naam
          <input id="c-name" type="text" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tech Urdu" />
        </label>
        <label className="f">
          About <span className="h">Channel kis baare mein hai, team ke liye notes</span>
          <textarea id="c-about" rows={3} maxLength={600} value={about} onChange={(e) => setAbout(e.target.value)} />
        </label>
        <div className="f">
          Kaam kab hota hai
          <div className="chips">
            <button type="button" className={'chip ' + (type === 'daily' ? 'on' : '')} onClick={() => setType('daily')}>
              Roz (every day)
            </button>
            <button type="button" className={'chip ' + (type === 'days' ? 'on' : '')} onClick={() => setType('days')}>
              Khaas din
            </button>
          </div>
          {type === 'days' && (
            <div className="chips">
              {DAYS_LONG.map((dn, i) => (
                <button type="button" key={i} className={'chip ' + (days.includes(i) ? 'on' : '')} onClick={() => setDays((ds) => (ds.includes(i) ? ds.filter((x) => x !== i) : [...ds, i]))}>
                  {dn.slice(0, 3)}
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="f">
          Deadline <span className="h">Optional: agle upload ya project ki aakhri date</span>
          <input id="c-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <div className="f">
          Team aur roles
          <span className="h">Har bande ko jitne roles chahein dein. Har role ka alag card us ke dashboard par aayega.</span>
          {people.map((p) => (
            <div className="mrow" key={p.id}>
              <div className="nm">
                {p.full_name || 'Owner'}
                {p.id === d.uid && <span className="muted"> (aap)</span>}
              </div>
              <div className="chips">
                {ROLES.map((r) => (
                  <button type="button" key={r} className={'chip ' + ((members[p.id] || []).includes(r) ? 'on' : '')} onClick={() => toggleRole(p.id, r)}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {people.length < 2 && <div className="note">Abhi team mein koi approved member nahi. Team tab se pehle approve karein, phir yahan roles de sakenge.</div>}
        </div>
        <div className="team-summary" aria-live="polite">
          <div className="eyebrow">Is channel ki team</div>
          {assigned.length ? (
            <ul>
              {assigned.map(([uid, rs]) => (
                <li key={uid}>
                  <b>{d.nameOf(uid)}</b>
                  <span className="chips">
                    {rs.map((r) => (
                      <span key={r} className={'role sm ' + roleClass(r)}>{r}</span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small m0">Abhi kisi ko role nahi diya. Upar har bande ke neeche role chunein.</p>
          )}
          {channel && <p className="muted tiny m0">Team ya roles ki tabdeeli aaj se lagu hogi. Purane tasks aur progress ki history waisi hi rahegi.</p>}
        </div>
        <div className="f">
          Har role ka waqt (daily timeline)
          <span className="h">Har role ka task isi waqt shuru hoga aur isi deadline par khatam. Deadline start se pehle rakhein to wo agle din ki maani jayegi (raat ki shift).</span>
          {usedRoles.length ? (
            <div className="rt-list">
              {usedRoles.map((r, i) => {
                const t = timeOf(r);
                const overnight = toMin(t.end) <= toMin(t.start);
                const who = assigned.filter(([, rs]) => rs.includes(r)).map(([u]) => d.nameOf(u));
                return (
                  <div className="rt-row" key={r}>
                    <div className="rt-head">
                      <span className="rt-step num">{i + 1}</span>
                      <span className={'role sm ' + roleClass(r)}>{r}</span>
                      <span className="muted tiny">{who.join(", ")}</span>
                    </div>
                    <div className="two">
                      <label className="f">
                        Start
                        <input id={'rt-s-' + i} type="time" value={t.start} onChange={(e) => setTime(r, 'start', e.target.value)} />
                      </label>
                      <label className="f">
                        Deadline
                        <input id={'rt-e-' + i} type="time" value={t.end} onChange={(e) => setTime(r, 'end', e.target.value)} />
                      </label>
                    </div>
                    <span className={'tiny ' + (overnight ? 'warn' : 'muted')}>
                      {fmtTime(t.start)} se {fmtTime(t.end)}{overnight ? ' (agle din)' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted small m0">Pehle upar team ko roles dein, phir har role ka waqt yahan set hoga.</p>
          )}
        </div>
        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? 'Save ho raha hai…' : channel ? 'Changes save karein' : `Channel card launch karein${assigned.length ? ` (${assigned.length} log)` : ''}`}
        </button>
        {channel && (
          <ConfirmButton
            label="Channel delete karein"
            confirmLabel="Pakka? Is ki saari task history bhi delete hogi"
            onConfirm={async () => {
              try {
                await d.deleteChannel(channel.id);
                toast('Channel delete ho gaya');
                onSaved('');
              } catch (err) {
                toast(errorText(err));
              }
            }}
          />
        )}
      </form>
    </Sheet>
  );
}

/* ================= Performance ================= */
export function PerfSheet({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const rows = d.channel_members
    .filter((m) => m.channel_id === channel.id)
    .flatMap((m) => m.roles.map((role) => ({ user_id: m.user_id, role, prev: d.perf.latest(channel.id, m.user_id, role) })));
  const [vals, setVals] = useState<number[]>(() => rows.map((r) => r.prev?.pct ?? 75));
  const [busy, setBusy] = useState(false);

  if (!rows.length)
    return (
      <Sheet title="Performance dein" onClose={onClose}>
        <div className="note">Is channel mein abhi koi member nahi. Pehle "Channel edit karein" se team add karein.</div>
      </Sheet>
    );

  return (
    <Sheet title="Performance dein" onClose={onClose}>
      <p className="muted m0">Har role ko 0 se 100% tak number dein. Aaj ki date ke saath save hoga, aur purane number history mein rahenge. Jis ka jo role hai, use apne card par yahi number nazar aayega.</p>
      {rows.map((r, i) => (
        <div className="mrow" key={r.user_id + r.role}>
          <div className="row between">
            <span className="nm">{d.nameOf(r.user_id)}</span>
            <span className={'role ' + roleClass(r.role)}>{r.role}</span>
          </div>
          <div className="prow">
            <input
              id={'pr-' + i}
              type="range"
              min={0}
              max={100}
              value={vals[i]}
              aria-label={d.nameOf(r.user_id) + ' ' + r.role}
              onChange={(e) => setVals((v) => v.map((x, j) => (j === i ? Number(e.target.value) : x)))}
            />
            <input
              id={'pn-' + i}
              type="number"
              min={0}
              max={100}
              value={vals[i]}
              onChange={(e) => setVals((v) => v.map((x, j) => (j === i ? Math.max(0, Math.min(100, Number(e.target.value) || 0)) : x)))}
            />
          </div>
          <div className="muted tiny">{r.prev ? `Pichla number ${r.prev.pct}% · ${fmtDate(r.prev.rated_on)}` : 'Pehli dafa number'}</div>
        </div>
      ))}
      <button
        className="btn primary block"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await d.savePerf(channel.id, rows.map((r, i) => ({ user_id: r.user_id, role: r.role, pct: Math.round(vals[i]) })));
            toast('Performance save ho gayi');
            onClose();
          } catch (err) {
            toast(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Save ho raha hai…' : 'Performance save karein'}
      </button>
    </Sheet>
  );
}

/* ================= Video / Script ================= */
export function VideoSheet({ channelId, video, onClose }: { channelId: string; video: Video | null; onClose: () => void }) {
  const d = useData();
  const toast = useToast();
  const [title, setTitle] = useState(video?.title || '');
  const [stage, setStage] = useState<Video['stage']>(video?.stage || 'idea');
  const [due, setDue] = useState(video?.due || '');
  const [script, setScript] = useState(video?.script || '');
  const [notes, setNotes] = useState(video?.notes || '');
  const [busy, setBusy] = useState(false);
  const words = script.trim() ? script.trim().split(/\s+/).length : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast('Title likhein');
    setBusy(true);
    try {
      await d.saveVideo({ id: video?.id, channel_id: channelId, title: title.trim(), stage, due: due || null, script, notes });
      toast('Video save ho gayi');
      onClose();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={video ? 'Video' : 'Nai video'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="f">
          Video ka title
          <input id="v-title" type="text" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Best phones under 50k" />
        </label>
        <div className="two">
          <label className="f">
            Stage
            <select id="v-stage" value={stage} onChange={(e) => setStage(e.target.value as Video['stage'])}>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            Due date
            <input id="v-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        <label className="f">
          <span className="row between">
            <span>Script</span>
            <span className="h num">{words} words</span>
          </span>
          <span className="h">Script Writer yahan likhe. Editor aur Manager isi ko parh kar kaam karein.</span>
          <textarea id="v-script" rows={14} value={script} onChange={(e) => setScript(e.target.value)} placeholder={'Hook…\n\nIntro…\n\nMain points…\n\nOutro / CTA…'} />
        </label>
        <label className="f">
          Editing / manager notes
          <textarea id="v-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. B-roll add karo, thumbnail mein face close-up" />
        </label>
        {video && (
          <div className="muted tiny">
            Aakhri update: {d.nameOf(video.updated_by)} · {new Date(video.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? 'Save ho raha hai…' : video ? 'Save karein' : 'Video add karein'}
        </button>
        {video && d.isOwner && (
          <ConfirmButton
            label="Video delete karein"
            confirmLabel="Pakka delete? Dobara tap karein"
            onConfirm={async () => {
              try {
                await d.deleteVideo(video.id);
                toast('Video delete ho gayi');
                onClose();
              } catch (err) {
                toast(errorText(err));
              }
            }}
          />
        )}
      </form>
    </Sheet>
  );
}

/* ================= My profile ================= */
export function ProfileSheet({ onClose, onSignOut, onProgress, onRecords }: { onClose: () => void; onSignOut: () => void; onProgress: () => void; onRecords?: () => void }) {
  const d = useData();
  const toast = useToast();
  const [name, setName] = useState(d.me?.full_name || '');
  const [contact, setContact] = useState(d.me?.contact || '');
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  async function pickAvatar(f: File | undefined) {
    if (!f) return;
    setUp(true);
    try {
      const r = await uploadToImgBB(f, 'avatar-' + d.uid.slice(0, 8));
      await d.setMyAvatar(r.url);
      toast('Profile photo lag gayi');
    } catch (e) {
      toast(errorText(e));
    } finally {
      setUp(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  return (
    <Sheet title="Mera profile" onClose={onClose}>
      <div className="avatar-edit">
        <span className="avatar-big"><Avatar name={d.me?.full_name || 'Owner'} url={d.me?.avatar_url || undefined} /></span>
        <div className="grow">
          <b>{d.me?.full_name}</b>
          <small className="muted block">{d.me?.server_role || (d.isOwner ? 'Owner' : 'Server role abhi nahi')}</small>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickAvatar(e.target.files?.[0])} />
          <div className="row">
            <button type="button" className="btn sm primary" disabled={up || !imgbbReady} onClick={() => fileRef.current?.click()}>
              {up ? 'Upload ho rahi hai…' : d.me?.avatar_url ? 'Photo badlein' : 'Profile photo lagayein'}
            </button>
            {d.me?.avatar_url && <button type="button" className="btn sm" disabled={up} onClick={() => d.setMyAvatar('').then(() => toast('Photo hata di'), (e) => toast(errorText(e)))}>Hatayein</button>}
          </div>
        </div>
      </div>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await d.updateMyProfile({ full_name: name.trim(), contact: contact.trim(), note: d.me?.note || '' });
            toast('Profile save ho gaya');
            onClose();
          } catch (err) {
            toast(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="f">
          Naam
          <input id="p-name" type="text" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="f">
          ID / WhatsApp
          <input id="p-contact" type="text" maxLength={80} value={contact} onChange={(e) => setContact(e.target.value)} />
        </label>
        <button className="btn primary block" type="submit" disabled={busy}>
          Save karein
        </button>
        <button className="btn block" type="button" onClick={onProgress}>
          Meri progress dekhein
        </button>
        <button className="btn block" type="button" onClick={onSignOut}>
          Logout
        </button>
        {d.isOwner && onRecords && (
          <button type="button" className="records-link" onClick={onRecords}>
            Company records
          </button>
        )}
      </form>
    </Sheet>
  );
}
