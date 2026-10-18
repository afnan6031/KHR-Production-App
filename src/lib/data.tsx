import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Channel, Member, Perf, Profile, Status, Task, Video, ViewRow } from './types';
import { addDays, perfIndex, todayKey, type PerfIndex } from './utils';

type Tables = {
  profiles: Profile[];
  channels: Channel[];
  channel_members: Member[];
  performance: Perf[];
  channel_views: ViewRow[];
  videos: Video[];
  tasks: Task[];
};
type TableName = keyof Tables;
const TABLES: TableName[] = ['profiles', 'channels', 'channel_members', 'performance', 'channel_views', 'videos', 'tasks'];

export interface ChannelInput {
  id?: string;
  name: string;
  about: string;
  schedule_type: 'daily' | 'days';
  work_days: number[];
  time_from: string | null;
  time_to: string | null;
  deadline: string | null;
  members: Record<string, string[]>;
}

export interface VideoInput {
  id?: string;
  channel_id: string;
  title: string;
  stage: Video['stage'];
  due: string | null;
  script: string;
  notes: string;
}

interface DataCtx extends Tables {
  loading: boolean;
  me: Profile | null;
  uid: string;
  isOwner: boolean;
  perf: PerfIndex;
  nameOf: (id: string | null | undefined) => string;
  rolesOf: (channelId: string, userId?: string) => string[];
  reload: () => Promise<void>;
  saveChannel: (c: ChannelInput) => Promise<string>;
  deleteChannel: (id: string) => Promise<void>;
  savePerf: (channelId: string, entries: { user_id: string; role: string; pct: number }[]) => Promise<void>;
  saveViews: (channelId: string, day: string, views: number) => Promise<void>;
  deleteViews: (channelId: string, day: string) => Promise<void>;
  saveVideo: (v: VideoInput) => Promise<void>;
  deleteVideo: (id: string) => Promise<void>;
  setStatus: (userId: string, status: Status) => Promise<void>;
  removeUser: (userId: string) => Promise<void>;
  updateMyProfile: (p: { full_name: string; contact: string; note: string }) => Promise<void>;
  setTaskDone: (taskId: string, done: boolean) => Promise<void>;
  reviewTask: (taskId: string, reject: boolean, reason?: string) => Promise<void>;
}

const Ctx = createContext<DataCtx | null>(null);

export function useData(): DataCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useData outside provider');
  return c;
}

function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

export function DataProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const [t, setT] = useState<Tables>({ profiles: [], channels: [], channel_members: [], performance: [], channel_views: [], videos: [], tasks: [] });
  const [loading, setLoading] = useState(true);
  const timers = useRef<Partial<Record<TableName, number>>>({});

  const fetchTable = useCallback(async (name: TableName) => {
    let q = supabase.from(name).select('*');
    if (name === 'performance') q = q.order('rated_on', { ascending: true }).limit(5000);
    if (name === 'channel_views') q = q.order('day', { ascending: true }).limit(5000);
    // pichle ~4 mahine ke tasks: is mahine + pichle mahine ki progress aur leaderboard ke liye kaafi
    if (name === 'tasks') q = q.gte('day', addDays(todayKey(), -125)).order('day', { ascending: true }).limit(20000);
    const { data, error } = await q;
    if (error) throw error;
    setT((prev) => ({ ...prev, [name]: data || [] }));
  }, []);

  /** Aaj (aur chhoote hue dinon) ke tasks server par bana do — dobara chalana safe hai */
  const ensureTasks = useCallback(async () => {
    const { error } = await supabase.rpc('ensure_tasks_upto');
    if (error) console.warn('ensure_tasks_upto', error.message);
  }, []);

  const reload = useCallback(async () => {
    await ensureTasks();
    await Promise.all(TABLES.map((n) => fetchTable(n)));
  }, [fetchTable, ensureTasks]);

  useEffect(() => {
    let alive = true;
    reload().catch(console.error).finally(() => alive && setLoading(false));
    // Realtime: koi bhi table badle to wahi table dobara load ho (RLS ke mutabiq)
    const ch = supabase.channel('khr-live');
    TABLES.forEach((name) => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: name }, () => {
        window.clearTimeout(timers.current[name]);
        timers.current[name] = window.setTimeout(() => fetchTable(name).catch(console.error), 250);
      });
    });
    ch.subscribe();
    // App wapas khulne par fresh data
    const onVis = () => document.visibilityState === 'visible' && reload().catch(console.error);
    document.addEventListener('visibilitychange', onVis);
    // Raat 12 baje naya din: naye tasks bana kar load karo
    let day = todayKey();
    const tick = window.setInterval(() => {
      if (todayKey() !== day) {
        day = todayKey();
        reload().catch(console.error);
      }
    }, 60000);
    return () => {
      alive = false;
      window.clearInterval(tick);
      supabase.removeChannel(ch);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [uid, reload, fetchTable]);

  const me = useMemo(() => t.profiles.find((p) => p.id === uid) || null, [t.profiles, uid]);
  const isOwner = !!me?.is_owner;
  const perf = useMemo(() => perfIndex(t.performance), [t.performance]);

  const nameOf = useCallback(
    (id: string | null | undefined) => {
      if (!id) return 'Member';
      const p = t.profiles.find((x) => x.id === id);
      return p?.full_name || (p?.is_owner ? 'Owner' : 'Member');
    },
    [t.profiles]
  );

  const rolesOf = useCallback(
    (channelId: string, userId: string = uid) => t.channel_members.find((m) => m.channel_id === channelId && m.user_id === userId)?.roles || [],
    [t.channel_members, uid]
  );

  const saveChannel = useCallback(
    async (c: ChannelInput) => {
      const row = {
        name: c.name,
        about: c.about,
        schedule_type: c.schedule_type,
        work_days: c.schedule_type === 'daily' ? [] : c.work_days,
        time_from: c.time_from || null,
        time_to: c.time_to || null,
        deadline: c.deadline || null
      };
      let id = c.id;
      if (id) {
        must(await supabase.from('channels').update(row).eq('id', id));
      } else {
        const created = must(await supabase.from('channels').insert(row).select('id').single()) as { id: string };
        id = created.id;
      }
      const keep = Object.entries(c.members).filter(([, roles]) => roles.length);
      const keepIds = keep.map(([u]) => u);
      let del = supabase.from('channel_members').delete().eq('channel_id', id);
      if (keepIds.length) del = del.not('user_id', 'in', `(${keepIds.join(',')})`);
      must(await del);
      if (keep.length) {
        must(await supabase.from('channel_members').upsert(keep.map(([user_id, roles]) => ({ channel_id: id, user_id, roles }))));
      }
      await ensureTasks();
      await Promise.all([fetchTable('channels'), fetchTable('channel_members'), fetchTable('tasks')]);
      return id!;
    },
    [fetchTable, ensureTasks]
  );

  const value: DataCtx = {
    ...t,
    loading,
    me,
    uid,
    isOwner,
    perf,
    nameOf,
    rolesOf,
    reload,
    saveChannel,
    async deleteChannel(id) {
      must(await supabase.from('channels').delete().eq('id', id));
      await reload();
    },
    async savePerf(channelId, entries) {
      const day = todayKey();
      must(await supabase.from('performance').upsert(entries.map((e) => ({ ...e, channel_id: channelId, rated_on: day }))));
      await fetchTable('performance');
    },
    async saveViews(channelId, day, views) {
      must(await supabase.from('channel_views').upsert({ channel_id: channelId, day, views }));
      await fetchTable('channel_views');
    },
    async deleteViews(channelId, day) {
      must(await supabase.from('channel_views').delete().eq('channel_id', channelId).eq('day', day));
      await fetchTable('channel_views');
    },
    async saveVideo(v) {
      const row = { channel_id: v.channel_id, title: v.title, stage: v.stage, due: v.due || null, script: v.script, notes: v.notes };
      if (v.id) must(await supabase.from('videos').update(row).eq('id', v.id));
      else must(await supabase.from('videos').insert(row));
      await fetchTable('videos');
    },
    async deleteVideo(id) {
      must(await supabase.from('videos').delete().eq('id', id));
      await fetchTable('videos');
    },
    async setStatus(userId, status) {
      must(await supabase.from('profiles').update({ status }).eq('id', userId));
      await ensureTasks();
      await Promise.all([fetchTable('profiles'), fetchTable('tasks')]);
    },
    async removeUser(userId) {
      must(await supabase.from('channel_members').delete().eq('user_id', userId));
      must(await supabase.from('profiles').update({ status: 'rejected' }).eq('id', userId));
      await ensureTasks();
      await Promise.all([fetchTable('profiles'), fetchTable('channel_members'), fetchTable('tasks')]);
    },
    async setTaskDone(taskId, done) {
      const row = must(await supabase.rpc('set_task_done', { p_task: taskId, p_done: done })) as Task;
      setT((prev) => ({ ...prev, tasks: prev.tasks.map((x) => (x.id === taskId ? { ...x, ...row } : x)) }));
    },
    async reviewTask(taskId, reject, reason = '') {
      const row = must(await supabase.rpc('review_task', { p_task: taskId, p_reject: reject, p_reason: reason })) as Task;
      setT((prev) => ({ ...prev, tasks: prev.tasks.map((x) => (x.id === taskId ? { ...x, ...row } : x)) }));
    },
    async updateMyProfile(p) {
      must(await supabase.from('profiles').update(p).eq('id', uid));
      await fetchTable('profiles');
    }
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
