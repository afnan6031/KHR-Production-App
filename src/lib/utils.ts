import { FB_ROLE, ROLES, STAGES, type Channel, type Perf, type RoleTime, type Task, type TaskState, type ViewRow } from './types';

export const DAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAYS_UR = ['Itwaar', 'Peer', 'Mangal', 'Budh', 'Jumeraat', 'Jumma', 'Hafta'];

/** Poori team ek hi time zone mein chalti hai (database bhi yahi use karta hai) */
export const APP_TZ = 'Asia/Karachi';

/** Aaj ki date (Pakistan time) YYYY-MM-DD */
export function todayKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** 0 = Sunday ... 6 = Saturday, Pakistan time */
export function weekdayOf(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function fmtClock(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: APP_TZ, hour: 'numeric', minute: '2-digit' });
}

/** waqt; agar aaj ka din nahi to date bhi ("22 Oct, 4:50 PM") — kai din ki deadline ke liye */
export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(new Date(iso));
  if (day === todayKey()) return fmtClock(iso);
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: APP_TZ, day: 'numeric', month: 'short' }) + ', ' + fmtClock(iso);
}

/** "2g 15m" style duration */
export function fmtDur(ms: number): string {
  const m = Math.max(0, Math.round(Math.abs(ms) / 60000));
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 48) return h + 'g ' + (m % 60) + 'm';
  return Math.floor(h / 24) + ' din';
}

/* ---------------- Tasks & scoring ---------------- */
/** v15: deadline guzarne ke baad 24 ghante ki "extra deadline" */
export const GRACE_MS = 24 * 3600 * 1000;
export const graceEnd = (t: Task) => new Date(t.due_at).getTime() + GRACE_MS;

/**
 * pending  = deadline abhi nahi aayi
 * expired  = deadline guzar gayi, 24 ghante ki extra deadline chal rahi hai (ab bhi complete ho sakta hai, 0 point)
 * ended    = extra deadline bhi khatam (−5 point)
 */
export function taskState(t: Task, now = Date.now()): TaskState {
  if (t.status === 'done') return 'done';
  if (t.status === 'rejected') return 'rejected';
  const due = new Date(t.due_at).getTime();
  if (due > now) return 'pending';
  return due + GRACE_MS > now ? 'expired' : 'ended';
}

export function isLate(t: Task): boolean {
  return !!t.completed_at && new Date(t.completed_at).getTime() > new Date(t.due_at).getTime();
}

/** v15 points: waqt par 10 · extra deadline mein 0 · extra deadline bhi guzar gayi −5 · reject: kul score se −10% */
export const PTS_ON_TIME = 10;
export const PTS_LATE = 0;
export const PTS_MISSED = -5;
export const REJECT_PENALTY = 10;

export interface Score {
  score: number | null;   // null = abhi koi task count nahi hua
  points: number;         // waqt par 10, late 0, missed −5
  total: number;          // period ke saare tasks
  counted: number;        // jo count hue (done + rejected + ended)
  done: number;           // saare complete (waqt par + late)
  onTime: number;
  late: number;           // extra 24 ghante mein complete
  rejected: number;
  missed: number;         // extra deadline bhi guzar gayi, kaam nahi hua
  grace: number;          // abhi extra deadline chal rahi hai
  pending: number;        // abhi waqt baqi hai
  extended: number;       // jin ki deadline owner ne barhayi
  /** waqt par kaam deadline se ausatan kitne minute pehle hua (barabari mein jaldi wala aage) */
  earlyMin: number;
}

/**
 * Progress % = points ÷ (count hue tasks × 10) × 100 − 10% har rejected task (0 se kam nahi).
 * Jin tasks ki deadline (ya extra 24 ghante) abhi chal rahi hai wo count nahi hote, taake beech mein kisi ka % na gire.
 */
export function scoreOf(tasks: Task[], now = Date.now()): Score {
  const s: Score = { score: null, points: 0, total: tasks.length, counted: 0, done: 0, onTime: 0, late: 0, rejected: 0, missed: 0, grace: 0, pending: 0, extended: 0, earlyMin: 0 };
  let early = 0;
  for (const t of tasks) {
    const st = taskState(t, now);
    if ((t.extended_minutes || 0) > 0) s.extended++;
    if (st === 'pending') { s.pending++; continue; }
    if (st === 'expired') { s.grace++; continue; }
    s.counted++;
    if (st === 'done') {
      s.done++;
      if (isLate(t)) { s.late++; s.points += PTS_LATE; }
      else {
        s.onTime++;
        s.points += PTS_ON_TIME;
        early += Math.max(0, (new Date(t.due_at).getTime() - new Date(t.completed_at!).getTime()) / 60000);
      }
    } else if (st === 'rejected') s.rejected++;
    else { s.missed++; s.points += PTS_MISSED; }
  }
  if (s.onTime) s.earlyMin = Math.round(early / s.onTime);
  if (s.counted > 0) s.score = Math.max(0, Math.min(100, Math.round((Math.max(0, s.points) / (s.counted * PTS_ON_TIME)) * 100 - REJECT_PENALTY * s.rejected)));
  return s;
}

/* ---------------- v15: channel ki auto performance ---------------- */
/** ek task ki channel performance (100 mein se) */
function taskPerf(t: Task, now: number): number | null {
  const st = taskState(t, now);
  if (st === 'pending' || st === 'expired') return null;
  if (st === 'done') {
    if (isLate(t)) return 40;
    return (t.extended_minutes || 0) > 0 ? 75 : 100;
  }
  return 0; // rejected ya missed
}
export interface RolePerf { role: string; pct: number | null; counted: number; onTime: number; extended: number; late: number; missed: number; rejected: number; pending: number }
export interface ChannelPerf { pct: number | null; roles: RolePerf[]; counted: number }
export const CHANNEL_PERF_RULES = 'Har task: waqt par 100 · deadline barhwa kar waqt par 75 · extra 24 ghante mein (delay) 40 · expire / reject 0. Pehle har role ka ausat, phir sab roles barabar wazan se — 4 role wala aur 6 role wala channel ek hi paimane par.';
/** channel ke saare roles ka ausat — har role barabar (jitne bhi log hon) */
export function channelPerf(tasks: Task[], roles: string[], now = Date.now()): ChannelPerf {
  const list = [...new Set([...roles, ...tasks.map((t) => t.role)])];
  const out: RolePerf[] = list.map((role) => {
    const r: RolePerf = { role, pct: null, counted: 0, onTime: 0, extended: 0, late: 0, missed: 0, rejected: 0, pending: 0 };
    let sum = 0;
    tasks.filter((t) => t.role === role).forEach((t) => {
      const v = taskPerf(t, now);
      if (v == null) { r.pending++; return; }
      r.counted++;
      sum += v;
      const st = taskState(t, now);
      if (st === 'done') { if (isLate(t)) r.late++; else if ((t.extended_minutes || 0) > 0) r.extended++; else r.onTime++; }
      else if (st === 'rejected') r.rejected++;
      else r.missed++;
    });
    if (r.counted) r.pct = Math.round(sum / r.counted);
    return r;
  });
  const rated = out.filter((r) => r.pct != null);
  return { pct: rated.length ? Math.round(rated.reduce((a, r) => a + r.pct!, 0) / rated.length) : null, roles: out, counted: rated.reduce((a, r) => a + r.counted, 0) };
}

/* ---------------- Periods (daily / weekly / monthly) ---------------- */
export type PeriodKind = 'day' | 'week' | 'month';
export interface Period { kind: PeriodKind; from: string; to: string; label: string }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function periodOf(kind: PeriodKind, offset = 0, today = todayKey()): Period {
  if (kind === 'day') {
    const d = addDays(today, offset);
    const label = offset === 0 ? 'Aaj · ' + fmtDate(d) : offset === -1 ? 'Kal · ' + fmtDate(d) : DAYS_LONG[weekdayOf(d)].slice(0, 3) + ' · ' + fmtDate(d);
    return { kind, from: d, to: d, label };
  }
  if (kind === 'week') {
    const wd = (weekdayOf(today) + 6) % 7; // Monday = 0
    const from = addDays(today, -wd + offset * 7);
    const to = addDays(from, 6);
    const label = (offset === 0 ? 'Is hafte · ' : offset === -1 ? 'Pichla hafta · ' : '') + fmtDate(from) + ' – ' + fmtDate(to);
    return { kind, from, to, label };
  }
  const [y, m] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + offset, 1));
  const from = dt.toISOString().slice(0, 10);
  const to = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { kind, from, to, label: MONTHS[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear() };
}

export function inPeriod(t: Task, p: Period): boolean {
  return t.day >= p.from && t.day <= p.to;
}

export interface RankRow extends Score { user_id: string; rank: number; prod: number }

/**
 * v15 Leaderboard: score → points → zyada complete → kam late (extra deadline) → kam expire → kam extension → kam reject
 * → us ke channels ki production (auto performance) → deadline se kitna pehle kaam kiya (2PM wala 4:38PM wale se aage).
 */
export function rankUsers(tasks: Task[], p: Period, now = Date.now()): RankRow[] {
  const inP = tasks.filter((t) => inPeriod(t, p));
  const by = new Map<string, Task[]>();
  inP.forEach((t) => by.set(t.user_id, [...(by.get(t.user_id) || []), t]));
  const chPct = new Map<string, number>();
  const chOf = (id: string) => {
    if (!chPct.has(id)) chPct.set(id, channelPerf(inP.filter((t) => t.channel_id === id), [], now).pct ?? 0);
    return chPct.get(id)!;
  };
  const rows: RankRow[] = [...by.entries()]
    .map(([user_id, ts]) => {
      const chans = [...new Set(ts.map((t) => t.channel_id))];
      const prod = chans.length ? Math.round(chans.reduce((a, c) => a + chOf(c), 0) / chans.length) : 0;
      return { user_id, ...scoreOf(ts, now), rank: 0, prod };
    })
    .filter((r) => r.score !== null);
  const cmp = (a: RankRow, b: RankRow) =>
    b.score! - a.score! || b.points - a.points || b.done - a.done || a.late - b.late || a.missed - b.missed ||
    a.extended - b.extended || a.rejected - b.rejected || b.prod - a.prod || b.earlyMin - a.earlyMin;
  rows.sort(cmp);
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && cmp(prev, r) === 0 ? prev.rank : i + 1;
  });
  return rows;
}

export function fmtN(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function fmtFull(n: number): string {
  return Number(n).toLocaleString('en');
}

export function fmtDate(k: string | null | undefined): string {
  if (!k) return '';
  const [y, m, d] = k.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function fmtTime(t: string | null | undefined): string {
  if (!t) return '';
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

export function roleClass(r: string): string {
  const i = (ROLES as readonly string[]).indexOf(r);
  return 'r' + (i >= 0 ? i + 1 : 1);
}

export function perfClass(p: number): string {
  return p >= 85 ? 'good' : p >= 65 ? 'warn' : 'bad';
}

export function stageLabel(k: string): string {
  return STAGES.find((s) => s.key === k)?.label ?? k;
}

export function isToday(ch: Channel, key = todayKey()): boolean {
  return ch.schedule_type === 'daily' || (ch.work_days || []).includes(weekdayOf(key));
}

export function scheduleText(ch: Channel): string {
  if (ch.schedule_type === 'daily') return 'Roz';
  const ds = [...(ch.work_days || [])].sort();
  return ds.length ? ds.map((d) => DAYS_LONG[d].slice(0, 3)).join(', ') : 'Din set nahi';
}

export function timeLine(ch: Channel): string {
  const t = ch.time_from || ch.time_to ? fmtTime(ch.time_from) + (ch.time_to ? ' – ' + fmtTime(ch.time_to) : '') : '';
  const dl = ch.deadline ? 'Deadline ' + fmtDate(ch.deadline) : '';
  return [t, dl].filter(Boolean).join(' · ') || 'Time set nahi';
}

/* ---------------- v3: role timeline ---------------- */
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

/** Is channel mein is role ka start/deadline (na ho to channel ka time, phir 10:00–18:00) */
export function roleTime(ch: Channel, role: string): RoleTime {
  const r = ch.role_times?.[role];
  return {
    start: hhmm(r?.start) || hhmm(ch.time_from) || '10:00',
    end: hhmm(r?.end) || hhmm(ch.time_to) || '18:00',
    days: Math.max(0, Number(r?.days) || 0),
    before: Math.max(0, Math.min(14, Number(r?.before) || 0))
  };
}

/** v16: "din pehle" wala task (misal Script Writer kal ke EP ka kaam aaj) — production ke din se pehle doosron ko nazar nahi aata */
export const isEarly = (t: Task) => !!t.for_day && t.for_day > t.day && t.role !== FB_ROLE;
export function visibleTask(t: Task, viewer: string, owner: boolean, today = todayKey()): boolean {
  return owner || t.user_id === viewer || !(isEarly(t) && today < t.for_day!);
}

export function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** "9:00 AM – 12:00 PM" (+ "agle din" jab deadline raat 12 ke baad ho) */
export function roleTimeText(ch: Channel, role: string): string {
  if (role === FB_ROLE) return 'Baqi sab ka kaam mukammal hote hi · 24 ghante';
  const t = roleTime(ch, role);
  const pre = t.before ? `${t.before} din pehle · ` : '';
  return `${pre}${fmtTime(t.start)} – ${fmtTime(t.end)}${t.days ? ` (${t.days} din baad)` : toMin(t.end) <= toMin(t.start) ? ' (agle din)' : ''}`;
}

/** Channel ke roles, start time ke hisaab se tarteeb mein */
export function channelTimeline(ch: Channel, roles: string[]) {
  return roles
    .filter((role) => role !== FB_ROLE)
    .map((role) => ({ role, ...roleTime(ch, role) }))
    .sort((a, b) => (b.before || 0) - (a.before || 0) || toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end));
}

export function notStarted(t: Task, now = Date.now()): boolean {
  return t.status === 'pending' && !!t.start_at && new Date(t.start_at).getTime() > now;
}

/** latest perf row per channel|user|role, plus short history */
export function perfIndex(rows: Perf[]) {
  const map = new Map<string, Perf[]>();
  for (const r of rows) {
    const k = `${r.channel_id}|${r.user_id}|${r.role}`;
    const arr = map.get(k) || [];
    arr.push(r);
    map.set(k, arr);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.rated_on.localeCompare(b.rated_on));
  return {
    latest(ch: string, user: string, role: string): Perf | null {
      const a = map.get(`${ch}|${user}|${role}`);
      return a ? a[a.length - 1] : null;
    },
    history(ch: string, user: string, role: string): Perf[] {
      return map.get(`${ch}|${user}|${role}`) || [];
    }
  };
}
export type PerfIndex = ReturnType<typeof perfIndex>;

export function viewsFor(rows: ViewRow[], channelId: string) {
  const r = rows.filter((v) => v.channel_id === channelId).sort((a, b) => a.day.localeCompare(b.day));
  if (!r.length) return null;
  const last = r[r.length - 1];
  const prev = r[r.length - 2];
  return { rows: r, last, delta: prev ? Number(last.views) - Number(prev.views) : null };
}

export function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message || String(e);
  if (/Invalid login credentials/i.test(msg)) return 'Email ya password ghalat hai.';
  if (/already registered|already been registered/i.test(msg)) return 'Is email se account pehle se bana hua hai. Login karein.';
  if (/Password should be at least/i.test(msg)) return 'Password kam az kam 6 characters ka rakhein.';
  if (/Email not confirmed/i.test(msg)) return 'Email confirm nahi hui. Apni email mein link dabayein, ya owner Supabase mein "Confirm email" band kare.';
  if (/row-level security|permission denied/i.test(msg)) return 'Aap ko ye kaam karne ki ijazat nahi.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Internet connection check karein aur dobara try karein.';
  if (/Could not find the function|schema cache/i.test(msg)) return 'Database purana hai. Supabase SQL Editor mein nayi schema.sql dobara Run karein.';
  return msg;
}

/** "Aaj · 19 Oct", "Kal · 18 Oct", ya poori date */
export function dayLabel(day: string): string {
  const t = todayKey();
  if (day === t) return 'Aaj · ' + fmtDate(day);
  if (day === addDays(t, -1)) return 'Kal · ' + fmtDate(day);
  return new Date(day + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
