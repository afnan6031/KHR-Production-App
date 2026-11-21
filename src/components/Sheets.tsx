import { useEffect, useRef, useState, type FormEvent } from 'react';
import type React from 'react';
import { CropSheet } from './Cropper';
import { GmailBox, SecurityPasswordBox, useAccountInfo } from './Account';
import { supabase } from '../lib/supabase';
import { APP_VERSION, checkAppUpdate, type UpdateResult } from '../lib/updater';
import { applyPrefs, reapplyTint } from '../lib/appearance';
import { imgbbReady, uploadToImgBB } from '../lib/imgbb';
import { useData } from '../lib/data';
import { FB_ROLE, ROLES, type Channel, type Prefs, type RoleTime } from '../lib/types';
import { DAYS_LONG, channelTimeline, errorText, fmtDate, fmtTime, roleClass, roleTime, toMin } from '../lib/utils';
import { Avatar, ConfirmButton, Seg, Sheet, useTheme, useToast } from './ui';
import { Select } from './Select';
import { GlassFxPick } from './GlassFxPick';

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
  const setRoleDays = (role: string, n: number) => setTimes((t) => ({ ...t, [role]: { ...timeOf(role), days: n } }));
  // v16: production ke din se kitne din pehle shuru (misal Script Writer 1 din pehle)
  const setRoleBefore = (role: string, n: number) => setTimes((t) => ({ ...t, [role]: { ...timeOf(role), before: n } }));
  const timedRoles = usedRoles.filter((r) => r !== FB_ROLE);
  const fbWho = assigned.filter(([, rs]) => rs.includes(FB_ROLE)).map(([u]) => d.nameOf(u));

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
      timedRoles.forEach((r) => (role_times[r] = timeOf(r)));
      for (const r of timedRoles) if (!role_times[r].start || !role_times[r].end) throw new Error(`${r} ka start aur deadline dono likhein`);
      // card par dikhane ke liye poore din ka waqt: sab se pehla start aur sab se aakhri deadline
      const list = timedRoles.map((r) => role_times[r]);
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
          {timedRoles.length ? (
            <div className="rt-list">
              {timedRoles.map((r, i) => {
                const t = timeOf(r);
                const extra = t.days || 0;
                const overnight = !extra && toMin(t.end) <= toMin(t.start);
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
                    <label className="f">
                      Deadline kis din
                      <Select value={extra} onChange={(e) => setRoleDays(r, Number(e.target.value))}>
                        <option value={0}>Usi din (ya raat ki shift mein agle din)</option>
                        {[1, 2, 3, 4, 5, 6, 7, 10, 14].map((n) => <option key={n} value={n}>{n} din baad</option>)}
                      </Select>
                    </label>
                    <label className="f">
                      Kab shuru <span className="h">Production ke din se pehle — sirf isi role wale ko us din task dikhta hai</span>
                      <Select value={t.before || 0} onChange={(e) => setRoleBefore(r, Number(e.target.value))}>
                        <option value={0}>Production ke din hi</option>
                        {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} din pehle</option>)}
                      </Select>
                    </label>
                    <span className={'tiny ' + (overnight || extra || t.before ? 'warn' : 'muted')}>
                      {t.before ? `${t.before} din pehle · ` : ''}{fmtTime(t.start)} se {fmtTime(t.end)}{extra ? ` (${extra} din baad)` : overnight ? ' (agle din)' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted small m0">Pehle upar team ko roles dein, phir har role ka waqt yahan set hoga.</p>
          )}
          {fbWho.length > 0 && (
            <div className="note">
              📘 <b>{FB_ROLE}</b> (<span data-notr>{fbWho.join(', ')}</span>): is ka waqt set nahi hota. Jab is din ke baqi sab roles apna kaam mukammal karte hain, foran 24 ghante ka task banta hai — video download kar ke Facebook par upload, phir link. Ye EP badal / mita nahi sakta, sirf Facebook link.
            </div>
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

/* ================= My account (v19) ================= */
const BG_PRESETS: { c1: string; c2: string }[] = [
  { c1: '#2B0B14', c2: '#10183A' },
  { c1: '#0F2027', c2: '#2C5364' },
  { c1: '#41295A', c2: '#2F0743' },
  { c1: '#134E5E', c2: '#71B280' },
  { c1: '#FF512F', c2: '#DD2476' },
  { c1: '#1D2671', c2: '#C33764' }
];
const ACCENTS = ['#E5383B', '#C8102E', '#F97316', '#EAB308', '#22C55E', '#14B8A6', '#3B82F6', '#8B5CF6', '#EC4899'];
const TEXT_COLORS = ['#FFFFFF', '#0F172A', '#F8FAFC', '#E2E8F0', '#1E3A8A', '#991B1B', '#065F46', '#FDE047'];
const GLASS_COLORS = ['#FFFFFF', '#0F172A', '#1E293B', '#38BDF8', '#A855F7', '#F43F5E', '#10B981', '#F59E0B'];
const SHADOW_COLORS = ['#000000', '#FFFFFF', '#1E293B', '#3B82F6', '#EF4444'];

type AccountView = 'menu' | 'profile' | 'security' | 'theme' | 'language';

export function ProfileSheet({ onClose, onSignOut, onProgress, onRecords }: { onClose: () => void; onSignOut: () => void; onProgress: () => void; onRecords?: () => void; onMusic?: () => void }) {
  const d = useData();
  const toast = useToast();
  const me = d.me;
  const acc = useAccountInfo();
  const [view, setView] = useState<AccountView>('menu');
  const [about, setAbout] = useState(me?.about || '');
  const [birth, setBirth] = useState('');
  const [name, setName] = useState(me?.full_name || '');
  const [contact, setContact] = useState(me?.contact || '');
  const [phone, setPhone] = useState('');

  useEffect(() => { setBirth(acc.birth); setPhone(acc.phone); }, [acc.birth, acc.phone]);

  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState<'' | 'avatar' | 'banner' | 'bg'>('');
  const [crop, setCrop] = useState<{ file: File; kind: 'avatar' | 'banner' } | null>(null);
  const [theme, setThemeChoice] = useTheme();
  const [prefs, setPrefs] = useState<Prefs>(() => me?.prefs || {});
  const [updStatus, setUpdStatus] = useState<'' | 'checking' | 'latest' | 'ready'>('');
  const [updInfo, setUpdInfo] = useState<UpdateResult | null>(null);

  const avRef = useRef<HTMLInputElement>(null);
  const bnRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);
  const bg = prefs.bg || { type: 'none' as const };

  const savePrefs = async (p: Prefs) => {
    setPrefs(p); applyPrefs(p);
    try { await d.updateMyProfile({ prefs: p }); } catch (e) { toast(errorText(e)); }
  };
  const setBg = (patch: Partial<NonNullable<Prefs['bg']>>) => savePrefs({ ...prefs, bg: { ...bg, ...patch } as Prefs['bg'] });

  async function uploadCropped(f: File, kind: 'avatar' | 'banner') {
    setUp(kind);
    try {
      const r = await uploadToImgBB(f, kind + '-' + d.uid.slice(0, 8));
      if (kind === 'avatar') await d.setMyAvatar(r.url);
      else await d.updateMyProfile({ banner_url: r.url });
      toast(kind === 'avatar' ? 'Profile photo lag gayi' : 'Banner lag gaya');
      setCrop(null);
    } catch (e) { toast(errorText(e)); }
    finally { setUp(''); }
  }
  async function pickBg(f: File | undefined) {
    if (!f) return;
    setUp('bg');
    try {
      const r = await uploadToImgBB(f, 'bg-' + d.uid.slice(0, 8));
      await savePrefs({ ...prefs, bg: { type: 'image', image: r.url, dim: bg.dim ?? 0.35, blur: bg.blur ?? 8, sync: bg.sync } });
      toast('Background lag gaya');
    } catch (e) { toast(errorText(e)); }
    finally { setUp(''); if (bgRef.current) bgRef.current.value = ''; }
  }
  const pick = (kind: 'avatar' | 'banner') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (f) setCrop({ file: f, kind });
  };

  async function saveProfile(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await d.updateMyProfile({ full_name: name.trim(), about: about.trim() });
      if (!acc.oldDb) {
        const { error } = await supabase.rpc('save_my_account', { p_birth: birth || null, p_phone: phone.trim() });
        if (error) throw error;
        await acc.reload();
      }
      toast('Profile save ho gaya');
    } catch (err) { toast(errorText(err)); }
    finally { setBusy(false); }
  }

  async function saveSecurity(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await d.updateMyProfile({ contact: contact.trim() });
      if (!acc.oldDb) {
        const { error } = await supabase.rpc('save_my_account', { p_birth: birth || null, p_phone: phone.trim() });
        if (error) throw error;
        await acc.reload();
      }
      toast('Security details save ho gayin');
    } catch (err) { toast(errorText(err)); }
    finally { setBusy(false); }
  }

  async function checkUpdates() {
    setUpdStatus('checking');
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) await reg.update().catch(() => undefined);
      }
      const res = await checkAppUpdate();
      setUpdInfo(res);
      if (res.hasUpdate) {
        setUpdStatus('ready');
        toast(`Nayi update available hai: v${res.latest}`);
      } else {
        setUpdStatus('latest');
        toast(`App latest version (v${res.current}) par hai`);
      }
    } catch (e) {
      setUpdStatus('');
      toast(errorText(e));
    }
  }

  function applyUpdate() {
    if (!updInfo) return;
    if (updInfo.platform === 'web') {
      if (typeof caches !== 'undefined') {
        caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).finally(() => window.location.reload());
      } else {
        window.location.reload();
      }
      return;
    }
    window.open(updInfo.downloadUrl || updInfo.releaseUrl, '_blank', 'noopener,noreferrer');
  }

  const sheetTitle = view === 'profile' ? 'Profile' : view === 'security' ? 'Security' : view === 'theme' ? 'Theme aur background' : view === 'language' ? 'Zabaan / Language' : 'My account';

  return (
    <Sheet title={sheetTitle} onClose={onClose}>
      {view !== 'menu' && <button type="button" className="back acct-back" onClick={() => setView('menu')}>‹ Wapas menu par</button>}
      {view === 'menu' && (
        <div className="acct-menu">
          <div className="acct-hero">
            <Avatar name={me?.full_name || 'Owner'} url={me?.avatar_url || undefined} />
            <div className="grow">
              <b className="block" data-notr>{me?.full_name || 'Member'}</b>
              {me?.title && <span className="ptitle sm block" data-notr>🏆 {me.title}</span>}
              <small className="muted block" data-notr>{acc.email || me?.server_role || (d.realOwner ? 'Owner' : '')}</small>
            </div>
          </div>
          <div className="acct-list">
            <button type="button" className="acct-item" onClick={() => setView('profile')}>
              <span className="acct-ico">👤</span>
              <span className="grow"><b>Profile</b><small className="muted block">Logo, banner, naam, about, date of birth</small></span>
              <span className="acct-arr">›</span>
            </button>
            <button type="button" className="acct-item" onClick={() => setView('security')}>
              <span className="acct-ico">🔒</span>
              <span className="grow"><b>Security</b><small className="muted block">Email, ID, password & forgot password</small></span>
              <span className="acct-arr">›</span>
            </button>
            <button type="button" className="acct-item" onClick={() => setView('theme')}>
              <span className="acct-ico">🎨</span>
              <span className="grow"><b>Theme</b><small className="muted block">Light / Dark / Glass theme, text & app color, background</small></span>
              <span className="acct-arr">›</span>
            </button>
            <button type="button" className="acct-item" onClick={() => setView('language')}>
              <span className="acct-ico">🌐</span>
              <span className="grow"><b>Language</b><small className="muted block">{prefs.lang === 'en' ? 'English' : 'Roman Urdu'}</small></span>
              <span className="acct-arr">›</span>
            </button>
            <button type="button" className="acct-item" onClick={onProgress}>
              <span className="acct-ico">📊</span>
              <span className="grow"><b>Meri progress dekhein</b><small className="muted block">Weekly / monthly performance & PDF download</small></span>
              <span className="acct-arr">›</span>
            </button>
            <button type="button" className="acct-item" disabled={updStatus === 'checking'} onClick={() => (updStatus === 'ready' ? applyUpdate() : checkUpdates())}>
              <span className="acct-ico">{updStatus === 'ready' ? '⬇️' : '🔄'}</span>
              <span className="grow">
                <b>{updStatus === 'ready' && updInfo ? `Update download karein (v${updInfo.latest})` : 'Update check karein'}</b>
                <small className="muted block">
                  {updStatus === 'checking'
                    ? 'GitHub se latest version check ho raha hai…'
                    : updStatus === 'latest'
                    ? `Up to date · v${APP_VERSION}`
                    : updStatus === 'ready' && updInfo
                    ? `Installed: v${APP_VERSION} → Latest: v${updInfo.latest}${updInfo.platform === 'web' ? ' (reload karein)' : ' (tap kar ke download karein)'}`
                    : `Current version · v${APP_VERSION}`}
                </small>
              </span>
              <span className="acct-arr">›</span>
            </button>
          </div>
          <button className="btn block" type="button" onClick={onSignOut}>Logout</button>
          {d.realOwner && onRecords && <button type="button" className="records-link" onClick={onRecords}>Company records</button>}
        </div>
      )}

      {view === 'profile' && (
        <>
          <div className="pcard mine">
            <div className="pcard-banner" style={me?.banner_url ? { backgroundImage: `url("${me.banner_url}")` } : undefined}>
              <div className="pcard-banner-btns">
                <button type="button" className="btn sm" disabled={!!up || !imgbbReady} onClick={() => bnRef.current?.click()}>{up === 'banner' ? 'Upload…' : me?.banner_url ? 'Banner badlein' : '+ Banner'}</button>
                {me?.banner_url && <button type="button" className="btn sm" onClick={() => d.updateMyProfile({ banner_url: '' }).catch((e) => toast(errorText(e)))}>✕</button>}
              </div>
            </div>
            <div className="pcard-av big"><Avatar name={me?.full_name || 'Owner'} url={me?.avatar_url || undefined} /></div>
            <div className="pcard-body">
              <h2 data-notr>{me?.full_name}</h2>
              {me?.title && <div className="ptitle" data-notr>🏆 {me.title}</div>}
              <small className="muted block" data-notr>{me?.server_role || (d.realOwner ? 'Owner' : '')}</small>
              <div className="row">
                <button type="button" className="btn sm primary" disabled={!!up || !imgbbReady} onClick={() => avRef.current?.click()}>
                  {up === 'avatar' ? 'Upload ho rahi hai…' : me?.avatar_url ? 'Photo badlein' : 'Profile photo lagayein'}
                </button>
                {me?.avatar_url && <button type="button" className="btn sm" disabled={!!up} onClick={() => d.setMyAvatar('').then(() => toast('Photo hata di'), (e) => toast(errorText(e)))}>Hatayein</button>}
              </div>
            </div>
            <input ref={avRef} type="file" accept="image/*" hidden onChange={pick('avatar')} />
            <input ref={bnRef} type="file" accept="image/*" hidden onChange={pick('banner')} />
          </div>
          <form className="form" onSubmit={saveProfile}>
            <label className="f">Naam<input id="p-name" type="text" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="f">About <span className="h">Apne baare mein kuch likhein — sab ko profile par nazar aayega</span><textarea id="p-about" rows={3} maxLength={500} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="e.g. Script writer · history aur disaster channels" /></label>
            <label className="f">Birth date<input type="date" value={birth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirth(e.target.value)} disabled={acc.oldDb} /></label>
            <button className="btn primary block" type="submit" disabled={busy}>{busy ? 'Save ho raha hai…' : 'Save karein'}</button>
          </form>
        </>
      )}

      {view === 'security' && (
        <div className="form">
          <GmailBox acc={acc} />
          <form className="form" onSubmit={saveSecurity}>
            <label className="f">ID / WhatsApp<input id="p-contact" type="text" maxLength={80} value={contact} onChange={(e) => setContact(e.target.value)} /></label>
            <label className="f">Phone number<input type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0300-1234567" disabled={acc.oldDb} /></label>
            <button className="btn primary block" type="submit" disabled={busy}>{busy ? 'Save ho raha hai…' : 'Save karein'}</button>
          </form>
          <SecurityPasswordBox acc={acc} />
        </div>
      )}

      {view === 'theme' && (
        <div className="form">
          <div className="f">App ka rang<Seg label="Theme" value={theme} onChange={(v) => { setThemeChoice(v); window.setTimeout(() => reapplyTint(), 0); }} options={[{ v: 'system', label: 'Phone jaisa' }, { v: 'light', label: '☀ Light' }, { v: 'dark', label: '☾ Dark' }, { v: 'glass', label: '🫧 Glass' }]} /></div>
          <div className="f">
            Background
            <Seg label="Background" value={bg.type} onChange={(t) => (t === 'image' && !bg.image ? bgRef.current?.click() : setBg({ type: t }))} options={[{ v: 'none', label: 'Asal' }, { v: 'color', label: 'Ek rang' }, { v: 'gradient', label: 'Gradient' }, { v: 'image', label: 'Apni pic' }]} />
            <input ref={bgRef} type="file" accept="image/*" hidden onChange={(e) => pickBg(e.target.files?.[0])} />
          </div>
          {bg.type === 'color' && <label className="f row"><input type="color" value={bg.c1 || '#101828'} onChange={(e) => setBg({ c1: e.target.value })} aria-label="Background ka rang" /><span className="muted small">Rang chunein</span></label>}
          {bg.type === 'gradient' && (
            <>
              <div className="presets">{BG_PRESETS.map((g) => <button type="button" key={g.c1 + g.c2} className="preset" style={{ background: `linear-gradient(135deg, ${g.c1}, ${g.c2})` }} onClick={() => setBg({ c1: g.c1, c2: g.c2 })} aria-label="Gradient" />)}</div>
              <div className="row">
                <input type="color" value={bg.c1 || '#2B0B14'} onChange={(e) => setBg({ c1: e.target.value })} aria-label="Pehla rang" />
                <input type="color" value={bg.c2 || '#10183A'} onChange={(e) => setBg({ c2: e.target.value })} aria-label="Doosra rang" />
                <label className="grow f"><span className="muted tiny">Angle {bg.angle ?? 135}°</span><input type="range" min={0} max={360} style={{ ['--p' as string]: `${Math.round(((bg.angle ?? 135) / 360) * 100)}%` }} value={bg.angle ?? 135} onChange={(e) => setBg({ angle: Number(e.target.value) })} /></label>
              </div>
            </>
          )}
          {bg.type === 'image' && <div className="row">{bg.image && <img className="bg-thumb" src={bg.image} alt="" />}<button type="button" className="btn sm" disabled={!!up} onClick={() => bgRef.current?.click()}>{up === 'bg' ? 'Upload…' : 'Pic badlein'}</button></div>}
          {bg.type === 'image' && <label className="f"><span className="muted tiny">Blur: {bg.blur ?? 8}px</span><input type="range" min={0} max={30} step={1} style={{ ['--p' as string]: `${Math.round(((bg.blur ?? 8) / 30) * 100)}%` }} value={bg.blur ?? 8} onChange={(e) => setBg({ blur: Number(e.target.value) })} /></label>}
          {bg.type !== 'none' && <label className="row check"><input type="checkbox" checked={bg.sync !== false} onChange={(e) => setBg({ sync: e.target.checked })} /><span>Header, neeche ki patti aur cards ka rang background ke saath milayein</span></label>}
          {bg.type !== 'none' && <label className="f"><span className="muted tiny">Andhera: {Math.round((bg.dim ?? 0) * 100)}%</span><input type="range" min={0} max={0.85} step={0.05} style={{ ['--p' as string]: `${Math.round(((bg.dim ?? 0) / 0.85) * 100)}%` }} value={bg.dim ?? 0} onChange={(e) => setBg({ dim: Number(e.target.value) })} /></label>}
          <div className="f">
            Khaas rang (buttons, links)
            <div className="presets">
              {ACCENTS.map((a) => <button type="button" key={a} className={'preset dot' + (prefs.accent === a ? ' on' : '')} style={{ background: a }} onClick={() => savePrefs({ ...prefs, accent: a })} aria-label={a} />)}
              <input type="color" value={prefs.accent || '#E5383B'} onChange={(e) => savePrefs({ ...prefs, accent: e.target.value })} aria-label="Apna rang" />
              {prefs.accent && <button type="button" className="btn sm" onClick={() => savePrefs({ ...prefs, accent: undefined })}>Asal</button>}
            </div>
          </div>
          <div className="f">
            Text ka rang <span className="h">Auto par background ke hisaab se khud adjust hota hai</span>
            <div className="presets">
              <button type="button" className={'btn sm' + (!prefs.textColor ? ' primary' : '')} onClick={() => savePrefs({ ...prefs, textColor: undefined })}>Auto</button>
              {TEXT_COLORS.map((tc) => (
                <button type="button" key={tc} className={'preset dot' + (prefs.textColor === tc ? ' on' : '')} style={{ background: tc }} onClick={() => savePrefs({ ...prefs, textColor: tc })} aria-label={tc} />
              ))}
              <input type="color" value={prefs.textColor || '#FFFFFF'} onChange={(e) => savePrefs({ ...prefs, textColor: e.target.value })} aria-label="Text ka apna rang" />
            </div>
          </div>

          <div className="f">
            Text shadow
            <div className="row wrap">
              <button type="button" className={'btn sm' + (!prefs.textShadow ? ' primary' : '')} onClick={() => savePrefs({ ...prefs, textShadow: false })}>Band (Off)</button>
              <button type="button" className={'btn sm' + (prefs.textShadow ? ' primary' : '')} onClick={() => savePrefs({ ...prefs, textShadow: true })}>Chalu (On)</button>
            </div>
            {prefs.textShadow && (
              <div className="presets" style={{ marginTop: 6 }}>
                {SHADOW_COLORS.map((sc) => (
                  <button type="button" key={sc} className={'preset dot' + ((prefs.textShadowColor || '#000000') === sc ? ' on' : '')} style={{ background: sc }} onClick={() => savePrefs({ ...prefs, textShadowColor: sc })} aria-label={sc} />
                ))}
                <input type="color" value={prefs.textShadowColor || '#000000'} onChange={(e) => savePrefs({ ...prefs, textShadowColor: e.target.value })} aria-label="Shadow ka rang" />
              </div>
            )}
          </div>

          {theme === 'glass' && (
            <>
              <div className="f">
                Glass box ka rang
                <div className="presets">
                  {GLASS_COLORS.map((gc) => (
                    <button
                      type="button"
                      key={gc}
                      className={'preset dot' + ((prefs.glass?.color || '#FFFFFF') === gc ? ' on' : '')}
                      style={{ background: gc }}
                      onClick={() => savePrefs({ ...prefs, glass: { ...prefs.glass, color: gc } })}
                      aria-label={gc}
                    />
                  ))}
                  <input type="color" value={prefs.glass?.color || '#FFFFFF'} onChange={(e) => savePrefs({ ...prefs, glass: { ...prefs.glass, color: e.target.value } })} aria-label="Glass box rang" />
                  {prefs.glass?.color && <button type="button" className="btn sm" onClick={() => savePrefs({ ...prefs, glass: { ...prefs.glass, color: undefined } })}>Asal</button>}
                </div>
              </div>
              <label className="f">
                <span className="muted tiny">Glass box andhera: {Math.round((prefs.glass?.darkness ?? 0.20) * 100)}%</span>
                <input
                  type="range"
                  min={0}
                  max={0.75}
                  step={0.02}
                  style={{ ['--p' as string]: `${Math.round(((prefs.glass?.darkness ?? 0.20) / 0.75) * 100)}%` }}
                  value={prefs.glass?.darkness ?? 0.20}
                  onChange={(e) => savePrefs({ ...prefs, glass: { ...prefs.glass, darkness: Number(e.target.value) } })}
                />
              </label>
              <label className="f">
                <span className="muted tiny">Glass box gloss / tint: {Math.round((prefs.glass?.opacity ?? 0.14) * 100)}%</span>
                <input
                  type="range"
                  min={0.04}
                  max={0.50}
                  step={0.01}
                  style={{ ['--p' as string]: `${Math.round((((prefs.glass?.opacity ?? 0.14) - 0.04) / 0.46) * 100)}%` }}
                  value={prefs.glass?.opacity ?? 0.14}
                  onChange={(e) => savePrefs({ ...prefs, glass: { ...prefs.glass, opacity: Number(e.target.value) } })}
                />
              </label>
              <label className="f">
                <span className="muted tiny">Card glass blur (kam blur = tez 90+ FPS): {prefs.glass?.blur ?? 8}px</span>
                <input
                  type="range"
                  min={0}
                  max={28}
                  step={1}
                  style={{ ['--p' as string]: `${Math.round(((prefs.glass?.blur ?? 8) / 28) * 100)}%` }}
                  value={prefs.glass?.blur ?? 8}
                  onChange={(e) => savePrefs({ ...prefs, glass: { ...prefs.glass, blur: Number(e.target.value) } })}
                />
              </label>
              <label className="f">
                <span className="muted tiny">Popup ke peechhe blur: {prefs.glass?.popupBlur ?? 8}px</span>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  style={{ ['--p' as string]: `${Math.round(((prefs.glass?.popupBlur ?? 8) / 30) * 100)}%` }}
                  value={prefs.glass?.popupBlur ?? 8}
                  onChange={(e) => savePrefs({ ...prefs, glass: { ...prefs.glass, popupBlur: Number(e.target.value) } })}
                />
              </label>
              <label className="f">
                <span className="muted tiny">Popup ke peechhe andhera (light dim): {Math.round((prefs.glass?.popupDim ?? 0.40) * 100)}%</span>
                <input
                  type="range"
                  min={0}
                  max={0.85}
                  step={0.05}
                  style={{ ['--p' as string]: `${Math.round(((prefs.glass?.popupDim ?? 0.40) / 0.85) * 100)}%` }}
                  value={prefs.glass?.popupDim ?? 0.40}
                  onChange={(e) => savePrefs({ ...prefs, glass: { ...prefs.glass, popupDim: Number(e.target.value) } })}
                />
              </label>
              <GlassFxPick />
            </>
          )}
        </div>
      )}

      {view === 'language' && (
        <div className="form">
          <div className="f">Zabaan / Language<Seg label="Language" value={prefs.lang === 'en' ? 'en' : 'ur'} onChange={(l) => savePrefs({ ...prefs, lang: l })} options={[{ v: 'ur', label: 'Roman Urdu' }, { v: 'en', label: 'English' }]} /></div>
          <p className="muted small m0">Poori app ka interface foran aap ki chuni hui zabaan mein badal jata hai.</p>
        </div>
      )}

      {crop && (
        <CropSheet file={crop.file} aspect={crop.kind === 'avatar' ? 1 : 3} outWidth={crop.kind === 'avatar' ? 768 : 2400} round={crop.kind === 'avatar'} title={crop.kind === 'avatar' ? 'Profile photo crop' : 'Banner crop'} onClose={() => setCrop(null)} onDone={(f) => uploadCropped(f, crop.kind)} />
      )}
    </Sheet>
  );
}
