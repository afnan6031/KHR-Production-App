import { useMemo, useState, type FormEvent } from 'react';
import { useData } from '../lib/data';
import { ROLES } from '../lib/types';
import { addDays, errorText, fmtDur, todayKey } from '../lib/utils';
import { Sheet, useToast } from './ui';

/** "2026-10-19T14:30" (Pakistan time) -> ISO */
export function pkLocalToIso(v: string): string {
  return new Date(v + ':00+05:00').toISOString();
}
function pkNowLocal(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value || '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

/**
 * v9: Owner kisi member ko khaas kaam de — kis date/waqt se kis date/waqt tak.
 * Misal: Editor ko script di, deadline 3 din: 19 Oct 10:00 AM → 22 Oct 6:00 PM.
 */
export function AssignTaskSheet({ onClose, channelId, userId }: { onClose: () => void; channelId?: string; userId?: string }) {
  const d = useData();
  const toast = useToast();
  const [ch, setCh] = useState(channelId || [...d.channels].sort((a, b) => a.name.localeCompare(b.name))[0]?.id || '');
  const [user, setUser] = useState(userId || '');
  const [role, setRole] = useState('');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(pkNowLocal());
  const [end, setEnd] = useState(addDays(todayKey(), 3) + 'T18:00');
  const [busy, setBusy] = useState(false);

  const team = useMemo(() => {
    const inCh = new Set(d.channel_members.filter((m) => m.channel_id === ch && m.roles.length).map((m) => m.user_id));
    return d.profiles
      .filter((p) => p.status === 'approved' || p.is_owner)
      .sort((a, b) => Number(inCh.has(b.id)) - Number(inCh.has(a.id)) || a.full_name.localeCompare(b.full_name))
      .map((p) => ({ p, inCh: inCh.has(p.id) }));
  }, [d.profiles, d.channel_members, ch]);
  const theirRoles = user ? d.rolesOf(ch, user) : [];
  const roleOptions = [...theirRoles, ...ROLES.filter((r) => !theirRoles.includes(r))];
  const dur = start && end ? new Date(pkLocalToIso(end)).getTime() - new Date(pkLocalToIso(start)).getTime() : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ch || !user) return toast('Channel aur member chunein');
    if (title.trim().length < 2) return toast('Kaam ka title likhein');
    if (dur <= 0) return toast('Deadline start ke baad honi chahiye');
    setBusy(true);
    try {
      await d.assignTask({ channel_id: ch, user_id: user, role: role || theirRoles[0] || 'Editor', title: title.trim(), start: pkLocalToIso(start), due: pkLocalToIso(end) });
      toast('Kaam assign ho gaya — ' + d.nameOf(user) + ' ko notification chala gaya');
      onClose();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Kaam assign karein" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted small m0">Roz ke tasks ke ilawa khaas kaam: start aur deadline ki <b>date aur waqt</b> dono chunein (kai din ka kaam bhi).</p>
        <label className="f">
          Channel
          <select value={ch} onChange={(e) => { setCh(e.target.value); setRole(''); }}>
            {[...d.channels].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="f">
          Kis ko
          <select value={user} onChange={(e) => { setUser(e.target.value); setRole(''); }}>
            <option value="">— Member chunein —</option>
            {team.map(({ p, inCh }) => <option key={p.id} value={p.id}>{p.full_name || 'Owner'}{inCh ? ' ✓' : ''}</option>)}
          </select>
          <span className="h">✓ = is channel ki team mein hai</span>
        </label>
        <label className="f">
          Role
          <select value={role || theirRoles[0] || ''} onChange={(e) => setRole(e.target.value)}>
            {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="f">
          Kaam <span className="h">Jaise: "EP 088 ki editing", "Script likhni hai"</span>
          <input type="text" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. EP 088 | Brush Fire — editing" required />
        </label>
        <div className="two">
          <label className="f">
            Start (date + waqt)
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label className="f">
            Deadline (date + waqt)
            <input type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
          </label>
        </div>
        <div className="chips">
          {[1, 2, 3, 5, 7].map((n) => (
            <button type="button" key={n} className="chip" onClick={() => {
              const s = new Date(pkLocalToIso(start)).getTime() + n * 864e5;
              const k = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(s));
              setEnd(k + 'T' + end.slice(11, 16));
            }}>+{n} din</button>
          ))}
        </div>
        <p className={'small m0 ' + (dur > 0 ? 'muted' : 'bad')}>{dur > 0 ? 'Kul waqt: ' + fmtDur(dur) : 'Deadline start ke baad rakhein'}</p>
        <button className="btn primary block" type="submit" disabled={busy}>{busy ? 'Assign ho raha hai…' : 'Assign karein'}</button>
      </form>
    </Sheet>
  );
}
