import { ROLES, STAGES, type Channel, type Perf, type RoleTime, type Task, type TaskState, type ViewRow } from './types';

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
export function taskState(t: Task, now = Date.now()): TaskState {
  if (t.status === 'done') return 'done';
  if (t.status === 'rejected') return 'rejected';
  return new Date(t.due_at).getTime() <= now ? 'expired' : 'pending';
}

export function isLate(t: Task): boolean {
  return !!t.completed_at && new Date(t.completed_at).getTime() > new Date(t.due_at).getTime();
}

export const REJECT_PENALTY = 5;

export interface Score {
  score: number | null;   // null = abhi koi task count nahi hua
  total: number;          // period ke saare tasks
  counted: number;        // jo count hue (done + rejected + expired)
  done: number;
  late: number;
  rejected: number;
  missed: number;         // deadline nikal gayi, kaam nahi hua
  pending: number;        // abhi waqt baqi hai
}

/**
 * Progress % = (complete tasks / count hone wale tasks) x 100  −  5% har rejected task.
 * Rejected task complete mein count nahi hota (0 milta hai) aur upar se 5% minus.
 * Jin tasks ki deadline abhi nahi aayi wo count nahi hote, taake din ke beech mein kisi ka % na gire.
 */
export function scoreOf(tasks: Task[], now = Date.now()): Score {
  const s: Score = { score: null, total: tasks.length, counted: 0, done: 0, late: 0, rejected: 0, missed: 0, pending: 0 };
  for (const t of tasks) {
    const st = taskState(t, now);
    if (st === 'pending') { s.pending++; continue; }
    s.counted++;
    if (st === 'done') { s.done++; if (isLate(t)) s.late++; }
    else if (st === 'rejected') s.rejected++;
    else s.missed++;
  }
  if (s.counted > 0) s.score = Math.max(0, Math.round((s.done / s.counted) * 100 - REJECT_PENALTY * s.rejected));
  return s;
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

export interface RankRow extends Score { user_id: string; rank: number }

/** Leaderboard: score, phir zyada complete, phir kam rejected */
export function rankUsers(tasks: Task[], p: Period, now = Date.now()): RankRow[] {
  const by = new Map<string, Task[]>();
  tasks.filter((t) => inPeriod(t, p)).forEach((t) => by.set(t.user_id, [...(by.get(t.user_id) || []), t]));
  const rows = [...by.entries()]
    .map(([user_id, ts]) => ({ user_id, ...scoreOf(ts, now), rank: 0 }))
    .filter((r) => r.score !== null)
    .sort((a, b) => (b.score! - a.score!) || (b.done - a.done) || (a.rejected - b.rejected));
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.score === r.score && prev.done === r.done && prev.rejected === r.rejected ? prev.rank : i + 1;
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
    days: Math.max(0, Number(r?.days) || 0)
  };
}

export function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** "9:00 AM – 12:00 PM" (+ "agle din" jab deadline raat 12 ke baad ho) */
export function roleTimeText(ch: Channel, role: string): string {
  const t = roleTime(ch, role);
  return `${fmtTime(t.start)} – ${fmtTime(t.end)}${t.days ? ` (${t.days} din baad)` : toMin(t.end) <= toMin(t.start) ? ' (agle din)' : ''}`;
}

/** Channel ke roles, start time ke hisaab se tarteeb mein */
export function channelTimeline(ch: Channel, roles: string[]) {
  return roles
    .map((role) => ({ role, ...roleTime(ch, role) }))
    .sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end));
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
