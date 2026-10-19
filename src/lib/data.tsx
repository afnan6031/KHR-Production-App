import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Channel, DeadlineRequest, DirectMessage, FriendRequest, Member, Message, MusicTrack, Perf, Prefs, Profile, ServerChannel, ServerChannelMember, ServerMessage, Status, Task, Video } from './types';
import { addDays, perfIndex, todayKey, type PerfIndex } from './utils';

type Tables = {
  profiles: Profile[];
  channels: Channel[];
  channel_members: Member[];
  performance: Perf[];
  videos: Video[];
  tasks: Task[];
  messages: Message[];
  deadline_requests: DeadlineRequest[];
  music_tracks: MusicTrack[];
  server_channels: ServerChannel[];
  server_channel_members: ServerChannelMember[];
  server_messages: ServerMessage[];
  friend_requests: FriendRequest[];
  direct_messages: DirectMessage[];
};
type TableName = keyof Tables;
const TABLES: TableName[] = ['profiles', 'channels', 'channel_members', 'performance', 'videos', 'tasks', 'messages', 'deadline_requests', 'music_tracks',
  'server_channels', 'server_channel_members', 'server_messages', 'friend_requests', 'direct_messages'];
/** Chat wale tables: naya message aaye to poora table dobara load karne ke bajaye bas wahi row jod do */
const INCREMENTAL: TableName[] = ['messages', 'server_messages', 'direct_messages'];
const EMPTY: Tables = { profiles: [], channels: [], channel_members: [], performance: [], videos: [], tasks: [], messages: [], deadline_requests: [], music_tracks: [],
  server_channels: [], server_channel_members: [], server_messages: [], friend_requests: [], direct_messages: [] };

export interface ServerChannelInput {
  id?: string;
  name: string;
  topic: string;
  category: string;
  position: number;
  is_private: boolean;
  read_only: boolean;
  members: string[];
}

export interface ChannelInput {
  id?: string;
  name: string;
  about: string;
  schedule_type: 'daily' | 'days';
  work_days: number[];
  time_from: string | null;
  time_to: string | null;
  deadline: string | null;
  role_times: Record<string, { start: string; end: string; days?: number }>;
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
  script_url: string;
  thumbnail_url: string;
  thumbnail_delete_url: string;
  video_url: string;
  task_id?: string | null;
}

export type ChatTarget = { kind: 'srv'; channel: string } | { kind: 'dm'; peer: string };
export interface ProfilePatch {
  full_name?: string;
  contact?: string;
  note?: string;
  about?: string;
  banner_url?: string;
  prefs?: Prefs;
}

interface DataCtx extends Tables {
  loading: boolean;
  me: Profile | null;
  uid: string;
  isOwner: boolean;
  /** asal owner (personal mode mein bhi true) */
  realOwner: boolean;
  perf: PerfIndex;
  nameOf: (id: string | null | undefined) => string;
  rolesOf: (channelId: string, userId?: string) => string[];
  reload: () => Promise<void>;
  saveChannel: (c: ChannelInput) => Promise<string>;
  deleteChannel: (id: string) => Promise<void>;
  savePerf: (channelId: string, entries: { user_id: string; role: string; pct: number }[]) => Promise<void>;
  saveVideo: (v: VideoInput) => Promise<string>;
  deleteVideo: (id: string) => Promise<void>;
  setStatus: (userId: string, status: Status) => Promise<void>;
  removeUser: (userId: string) => Promise<void>;
  updateMyProfile: (p: ProfilePatch) => Promise<void>;
  setTitle: (userId: string, title: string) => Promise<void>;
  assignTask: (a: { channel_id: string; user_id: string; role: string; title: string; start: string; due: string }) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  requestExtension: (taskId: string, minutes: number, reason: string) => Promise<void>;
  reviewExtension: (id: string, approve: boolean) => Promise<void>;
  editChat: (kind: 'srv' | 'dm', id: string, body: string) => Promise<void>;
  pinChat: (kind: 'srv' | 'dm', id: string, pin: boolean) => Promise<void>;
  forwardChat: (to: ChatTarget, m: { body: string; image_url?: string; user_id: string | null }) => Promise<void>;
  addTrack: (title: string, url: string) => Promise<void>;
  updateTrack: (id: string, patch: { title?: string; position?: number }) => Promise<void>;
  deleteTrack: (id: string) => Promise<void>;
  setTaskDone: (taskId: string, done: boolean) => Promise<void>;
  reviewTask: (taskId: string, reject: boolean, reason?: string) => Promise<void>;
  sendMessage: (channelId: string, body: string, replyTo: string | null) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  // v5: KHR Server
  online: Set<string>;
  profileOf: (id: string | null | undefined) => Profile | undefined;
  saveServerChannel: (c: ServerChannelInput) => Promise<string>;
  deleteServerChannel: (id: string) => Promise<void>;
  sendServerMessage: (channelId: string, body: string, imageUrl: string, replyTo: string | null) => Promise<void>;
  deleteServerMessage: (id: string) => Promise<void>;
  setServerRole: (userId: string, role: string) => Promise<void>;
  setMyAvatar: (url: string) => Promise<void>;
  sendFriendRequest: (to: string) => Promise<void>;
  respondFriendRequest: (id: string, accept: boolean) => Promise<void>;
  removeFriend: (requestId: string) => Promise<void>;
  sendDM: (to: string, body: string, imageUrl: string) => Promise<void>;
  deleteDM: (id: string) => Promise<void>;
  markDMRead: (peer: string) => Promise<void>;
  friendState: (other: string) => { state: 'none' | 'sent' | 'received' | 'friends'; req?: FriendRequest };
  canDM: (other: string) => boolean;
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
  const [t, setT] = useState<Tables>(EMPTY);
  const [online, setOnline] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const timers = useRef<Partial<Record<TableName, number>>>({});

  const fetchTable = useCallback(async (name: TableName) => {
    let q = supabase.from(name).select('*');
    if (name === 'performance') q = q.order('rated_on', { ascending: true }).limit(5000);
    // pichle ~4 mahine ke tasks: is mahine + pichle mahine ki progress aur leaderboard ke liye kaafi
    if (name === 'tasks') q = q.gte('day', addDays(todayKey(), -125)).order('day', { ascending: true }).limit(20000);
    // videos ki poori history (sab se nayi 10,000)
    if (name === 'videos') q = q.order('created_at', { ascending: false }).limit(10000);
    if (name === 'deadline_requests') q = q.order('created_at', { ascending: false }).limit(2000);
    if (name === 'music_tracks') q = q.order('position', { ascending: true }).order('created_at', { ascending: true });
    // pichle 90 din ke messages
    if (name === 'messages') q = q.gte('created_at', new Date(Date.now() - 90 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(5000);
    if (name === 'server_messages' || name === 'direct_messages') q = q.gte('created_at', new Date(Date.now() - 90 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(8000);
    if (name === 'server_channels') q = q.order('position', { ascending: true });
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
    const refetch = (name: TableName) => {
      window.clearTimeout(timers.current[name]);
      timers.current[name] = window.setTimeout(() => fetchTable(name).catch(console.error), 250);
    };
    TABLES.forEach((name) => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: name }, (payload) => {
        if (INCREMENTAL.includes(name)) {
          const row = payload.new as { id?: string };
          const old = payload.old as { id?: string };
          setT((prev) => {
            const list = prev[name] as { id: string }[];
            if (payload.eventType === 'DELETE') return { ...prev, [name]: list.filter((x) => x.id !== old.id) };
            if (!row?.id) return prev;
            const i = list.findIndex((x) => x.id === row.id);
            if (i >= 0) return { ...prev, [name]: list.map((x) => (x.id === row.id ? row : x)) };
            return { ...prev, [name]: [row, ...list] };
          });
          return;
        }
        refetch(name);
        // private channel mein add/remove: channel list aur us ke messages bhi dobara
        if (name === 'server_channel_members' || name === 'server_channels') {
          refetch('server_channels');
          refetch('server_messages');
        }
        if (name === 'friend_requests') refetch('direct_messages');
      });
    });
    ch.subscribe();

    // Kaun online hai (Discord jaisa hara nishan)
    const pres = supabase.channel('khr-presence', { config: { presence: { key: uid } } });
    pres.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(pres.presenceState()))));
    pres.subscribe((status) => {
      if (status === 'SUBSCRIBED') pres.track({ at: new Date().toISOString() }).catch(() => {});
    });
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
      supabase.removeChannel(pres);
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

  const profileOf = useCallback((id: string | null | undefined) => (id ? t.profiles.find((x) => x.id === id) : undefined), [t.profiles]);

  const friendState = useCallback(
    (other: string) => {
      const req = t.friend_requests.find((f) => (f.from_user === uid && f.to_user === other) || (f.from_user === other && f.to_user === uid));
      if (!req) return { state: 'none' as const };
      if (req.status === 'accepted') return { state: 'friends' as const, req };
      return { state: req.from_user === uid ? ('sent' as const) : ('received' as const), req };
    },
    [t.friend_requests, uid]
  );

  const canDM = useCallback(
    (other: string) => {
      if (other === uid) return false;
      const o = t.profiles.find((p) => p.id === other);
      if (!o) return false;
      return isOwner || o.is_owner || friendState(other).state === 'friends';
    },
    [t.profiles, uid, isOwner, friendState]
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
        deadline: c.deadline || null,
        role_times: c.role_times
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
    realOwner: isOwner,
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
    async saveVideo(v) {
      const row = {
        channel_id: v.channel_id, title: v.title, stage: v.stage, due: v.due || null, script: v.script, notes: v.notes,
        script_url: v.script_url, thumbnail_url: v.thumbnail_url, thumbnail_delete_url: v.thumbnail_delete_url, video_url: v.video_url
      };
      let id = v.id;
      if (id) must(await supabase.from('videos').update(row).eq('id', id));
      else id = (must(await supabase.from('videos').insert({ ...row, task_id: v.task_id || null }).select('id').single()) as { id: string }).id;
      await fetchTable('videos');
      return id!;
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
    async sendMessage(channelId, body, replyTo) {
      const row = must(await supabase.from('messages').insert({ channel_id: channelId, body, reply_to: replyTo }).select('*').single()) as Message;
      setT((prev) => (prev.messages.some((x) => x.id === row.id) ? prev : { ...prev, messages: [row, ...prev.messages] }));
    },
    async deleteMessage(id) {
      must(await supabase.from('messages').delete().eq('id', id));
      setT((prev) => ({ ...prev, messages: prev.messages.filter((x) => x.id !== id) }));
    },
    online,
    profileOf,
    friendState,
    canDM,
    async saveServerChannel(c) {
      const row = { name: c.name, topic: c.topic, category: c.category || 'Text Channels', position: c.position, is_private: c.is_private, read_only: c.read_only };
      let id = c.id;
      if (id) must(await supabase.from('server_channels').update(row).eq('id', id));
      else id = (must(await supabase.from('server_channels').insert(row).select('id').single()) as { id: string }).id;
      // private channel ke members
      let del = supabase.from('server_channel_members').delete().eq('channel_id', id);
      if (c.is_private && c.members.length) del = del.not('user_id', 'in', `(${c.members.join(',')})`);
      must(await del);
      if (c.is_private && c.members.length) must(await supabase.from('server_channel_members').upsert(c.members.map((user_id) => ({ channel_id: id, user_id }))));
      await Promise.all([fetchTable('server_channels'), fetchTable('server_channel_members')]);
      return id!;
    },
    async deleteServerChannel(id) {
      must(await supabase.from('server_channels').delete().eq('id', id));
      await Promise.all([fetchTable('server_channels'), fetchTable('server_messages')]);
    },
    async sendServerMessage(channelId, body, imageUrl, replyTo) {
      const row = must(await supabase.from('server_messages').insert({ channel_id: channelId, body, image_url: imageUrl, reply_to: replyTo }).select('*').single()) as ServerMessage;
      setT((prev) => (prev.server_messages.some((x) => x.id === row.id) ? prev : { ...prev, server_messages: [row, ...prev.server_messages] }));
    },
    async deleteServerMessage(id) {
      must(await supabase.from('server_messages').delete().eq('id', id));
      setT((prev) => ({ ...prev, server_messages: prev.server_messages.filter((x) => x.id !== id) }));
    },
    async setServerRole(userId, role) {
      must(await supabase.from('profiles').update({ server_role: role }).eq('id', userId));
      await fetchTable('profiles');
    },
    async setMyAvatar(url) {
      must(await supabase.from('profiles').update({ avatar_url: url }).eq('id', uid));
      await fetchTable('profiles');
    },
    async sendFriendRequest(to) {
      must(await supabase.rpc('send_friend_request', { p_to: to }));
      await fetchTable('friend_requests');
    },
    async respondFriendRequest(id, accept) {
      must(await supabase.rpc('respond_friend_request', { p_id: id, p_accept: accept }));
      await fetchTable('friend_requests');
    },
    async removeFriend(requestId) {
      must(await supabase.from('friend_requests').delete().eq('id', requestId));
      await fetchTable('friend_requests');
    },
    async sendDM(to, body, imageUrl) {
      const row = must(await supabase.from('direct_messages').insert({ to_user: to, body, image_url: imageUrl }).select('*').single()) as DirectMessage;
      setT((prev) => (prev.direct_messages.some((x) => x.id === row.id) ? prev : { ...prev, direct_messages: [row, ...prev.direct_messages] }));
    },
    async deleteDM(id) {
      must(await supabase.from('direct_messages').delete().eq('id', id));
      setT((prev) => ({ ...prev, direct_messages: prev.direct_messages.filter((x) => x.id !== id) }));
    },
    async markDMRead(peer) {
      const unread = t.direct_messages.some((m) => m.from_user === peer && m.to_user === uid && !m.read_at);
      if (!unread) return;
      await supabase.rpc('mark_dm_read', { p_peer: peer });
      const now = new Date().toISOString();
      setT((prev) => ({ ...prev, direct_messages: prev.direct_messages.map((m) => (m.from_user === peer && m.to_user === uid && !m.read_at ? { ...m, read_at: now } : m)) }));
    },
    async reviewTask(taskId, reject, reason = '') {
      const row = must(await supabase.rpc('review_task', { p_task: taskId, p_reject: reject, p_reason: reason })) as Task;
      setT((prev) => ({ ...prev, tasks: prev.tasks.map((x) => (x.id === taskId ? { ...x, ...row } : x)) }));
    },
    async updateMyProfile(p) {
      // foran screen par (theme / language turant badle), phir server
      setT((prev) => ({ ...prev, profiles: prev.profiles.map((x) => (x.id === uid ? { ...x, ...p } as Profile : x)) }));
      must(await supabase.from('profiles').update(p).eq('id', uid));
      await fetchTable('profiles');
    },
    async setTitle(userId, title) {
      must(await supabase.from('profiles').update({ title }).eq('id', userId));
      await fetchTable('profiles');
    },
    async assignTask(a) {
      must(await supabase.rpc('assign_task', { p_channel: a.channel_id, p_user: a.user_id, p_role: a.role, p_title: a.title, p_start: a.start, p_due: a.due }));
      await fetchTable('tasks');
    },
    async deleteTask(id) {
      must(await supabase.from('tasks').delete().eq('id', id));
      setT((prev) => ({ ...prev, tasks: prev.tasks.filter((x) => x.id !== id) }));
    },
    async requestExtension(taskId, minutes, reason) {
      must(await supabase.rpc('request_extension', { p_task: taskId, p_minutes: minutes, p_reason: reason }));
      await fetchTable('deadline_requests');
    },
    async reviewExtension(id, approve) {
      must(await supabase.rpc('review_extension', { p_id: id, p_approve: approve }));
      await Promise.all([fetchTable('deadline_requests'), fetchTable('tasks')]);
    },
    async editChat(kind, id, body) {
      must(await supabase.rpc('edit_chat_message', { p_kind: kind, p_id: id, p_body: body }));
      const name = kind === 'srv' ? 'server_messages' : 'direct_messages';
      const now = new Date().toISOString();
      setT((prev) => ({ ...prev, [name]: (prev[name] as { id: string }[]).map((m) => (m.id === id ? { ...m, body: body.trim(), edited_at: now } : m)) }));
    },
    async pinChat(kind, id, pin) {
      must(await supabase.rpc('pin_chat_message', { p_kind: kind, p_id: id, p_pin: pin }));
      const name = kind === 'srv' ? 'server_messages' : 'direct_messages';
      const now = new Date().toISOString();
      setT((prev) => ({ ...prev, [name]: (prev[name] as { id: string }[]).map((m) => (m.id === id ? { ...m, pinned_at: pin ? now : null, pinned_by: pin ? uid : null } : m)) }));
    },
    async forwardChat(to, m) {
      const fwd = m.user_id || null;
      if (to.kind === 'srv') {
        const row = must(await supabase.from('server_messages').insert({ channel_id: to.channel, body: m.body, image_url: m.image_url || '', fwd_from: fwd }).select('*').single()) as ServerMessage;
        setT((prev) => (prev.server_messages.some((x) => x.id === row.id) ? prev : { ...prev, server_messages: [row, ...prev.server_messages] }));
      } else {
        const row = must(await supabase.from('direct_messages').insert({ to_user: to.peer, body: m.body, image_url: m.image_url || '', fwd_from: fwd }).select('*').single()) as DirectMessage;
        setT((prev) => (prev.direct_messages.some((x) => x.id === row.id) ? prev : { ...prev, direct_messages: [row, ...prev.direct_messages] }));
      }
    },
    async addTrack(title, url) {
      const pos = t.music_tracks.reduce((a, x) => Math.max(a, x.position), 0) + 1;
      must(await supabase.from('music_tracks').insert({ title, url, position: pos }));
      await fetchTable('music_tracks');
    },
    async updateTrack(id, patch) {
      must(await supabase.from('music_tracks').update(patch).eq('id', id));
      await fetchTable('music_tracks');
    },
    async deleteTrack(id) {
      must(await supabase.from('music_tracks').delete().eq('id', id));
      setT((prev) => ({ ...prev, music_tracks: prev.music_tracks.filter((x) => x.id !== id) }));
    }
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Owner ka "Personal mode": andar sab kuch member ki tarah (sirf apna kaam), notifications waise hi aate rahein */
const RealCtx = createContext<DataCtx | null>(null);
export function PersonalScope({ on, children }: { on: boolean; children: ReactNode }) {
  const d = useData();
  const v = useMemo(() => (on ? { ...d, isOwner: false } : d), [d, on]);
  return (
    <RealCtx.Provider value={d}>
      <Ctx.Provider value={v}>{children}</Ctx.Provider>
    </RealCtx.Provider>
  );
}
/** Personal mode ke andar bhi asal owner wali taaqat (Server, company records) */
export function RealScope({ children }: { children: ReactNode }) {
  const real = useContext(RealCtx);
  if (!real) return <>{children}</>;
  return <Ctx.Provider value={real}>{children}</Ctx.Provider>;
}
