import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { FB_ROLE } from './types';
import type { Channel, DeadlineRequest, DirectMessage, FriendRequest, Member, Message, MusicPlaylist, MusicPlaylistItem, MusicTrack, Perf, Prefs, Profile, ServerChannel, ServerChannelMember, ServerMessage, Status, Task, Video } from './types';
import { addDays, perfIndex, todayKey, type PerfIndex } from './utils';
import { isLocalId, isNetErr, loadOutbox, loadSnapshot, newLocalId, saveOutbox, saveSnapshot, type OutItem, type OutKind } from './offline';

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
  music_playlists: MusicPlaylist[];
  music_playlist_items: MusicPlaylistItem[];
  server_channels: ServerChannel[];
  server_channel_members: ServerChannelMember[];
  server_messages: ServerMessage[];
  friend_requests: FriendRequest[];
  direct_messages: DirectMessage[];
};
type TableName = keyof Tables;
const TABLES: TableName[] = ['profiles', 'channels', 'channel_members', 'performance', 'videos', 'tasks', 'messages', 'deadline_requests', 'music_tracks', 'music_playlists', 'music_playlist_items',
  'server_channels', 'server_channel_members', 'server_messages', 'friend_requests', 'direct_messages'];
/** Chat wale tables: naya message aaye to poora table dobara load karne ke bajaye bas wahi row jod do */
const INCREMENTAL: TableName[] = ['messages', 'server_messages', 'direct_messages'];
const EMPTY: Tables = { profiles: [], channels: [], channel_members: [], performance: [], videos: [], tasks: [], messages: [], deadline_requests: [], music_tracks: [], music_playlists: [], music_playlist_items: [],
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
  voiceover_url?: string;
  youtube_url?: string;
  task_id?: string | null;
  /** v15: kis din ki video (aage ki date bhi) */
  day?: string;
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
  /** v10: internet nahi (purana save kiya hua data dikh raha hai) */
  offline: boolean;
  /** kitne messages internet ka intezar kar rahe hain */
  pendingCount: number;
  retryPending: () => void;
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
  addTrack: (title: string, url: string) => Promise<string>;
  updateTrack: (id: string, patch: { title?: string; position?: number }) => Promise<void>;
  deleteTrack: (id: string) => Promise<void>;
  createPlaylist: (name: string) => Promise<string>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  setInPlaylist: (playlistId: string, trackId: string, on: boolean) => Promise<void>;
  submitTaskWork: (taskId: string, videoId: string) => Promise<void>;
  /** v16: Facebook Manager — sirf EP ka Facebook link */
  setFacebookLink: (videoId: string, url: string) => Promise<void>;
  /** v16: kisi bhi channel mein Facebook Manager (saare channels dekh sakta hai) */
  isFbManager: boolean;
  /** v16: is channel mein EP bana / badal sakta hai (sirf Facebook Manager nahi) */
  canEditVideos: (channelId: string) => boolean;
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
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false);
  const timers = useRef<Partial<Record<TableName, number>>>({});
  /** v15: har chat table ka sab se naya (server wala) message — catch-up ke liye */
  const latestRef = useRef<Partial<Record<TableName, string>>>({});
  // v10: outbox — internet ke intezar wale messages
  const outbox = useRef<OutItem[]>(loadOutbox(uid));
  const [outVer, setOutVer] = useState(0);
  const flushing = useRef(false);
  const TABLE_OF: Record<OutKind, 'server_messages' | 'direct_messages' | 'messages'> = { srv: 'server_messages', dm: 'direct_messages', msg: 'messages' };
  const localRow = (o: OutItem) => ({
    ...o.payload, id: o.lid, created_at: o.created_at, pending: !o.failed, failed: o.failed,
    ...(o.kind === 'dm' ? { from_user: uid, read_at: null } : { user_id: uid }),
    edited_at: null, pinned_at: null, pinned_by: null
  });
  /** server ki list + abhi tak na gaye local messages */
  const withPending = (name: TableName, rows: unknown[]) => {
    const mine = outbox.current.filter((o) => TABLE_OF[o.kind] === name).map(localRow);
    return mine.length ? [...mine.reverse(), ...rows] : rows;
  };
  const setOutbox = (items: OutItem[]) => {
    outbox.current = items;
    saveOutbox(uid, items);
    setOutVer((v) => v + 1);
  };

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
    setT((prev) => ({ ...prev, [name]: INCREMENTAL.includes(name) ? withPending(name, data || []) : data || [] }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Aaj (aur chhoote hue dinon) ke tasks server par bana do — dobara chalana safe hai */
  const ensureTasks = useCallback(async () => {
    const { error } = await supabase.rpc('ensure_tasks_upto');
    if (error) console.warn('ensure_tasks_upto', error.message);
  }, []);

  const reload = useCallback(async () => {
    try {
      await ensureTasks();
      await Promise.all(TABLES.map((n) => fetchTable(n)));
      setOffline(false);
    } catch (e) {
      if (isNetErr(e)) setOffline(true);
      throw e;
    }
  }, [fetchTable, ensureTasks]);

  /** outbox ke messages ek ek kar ke bhejo (purane pehle) */
  const flush = useCallback(async () => {
    if (flushing.current || !outbox.current.some((o) => !o.failed)) return;
    flushing.current = true;
    try {
      for (const o of [...outbox.current]) {
        if (o.failed) continue;
        const table = TABLE_OF[o.kind];
        const { data, error } = await supabase.from(table).insert(o.payload).select('*').single();
        if (error) {
          if (isNetErr(error)) { setOffline(true); break; }
          // internet theek hai magar server ne mana kiya (misal ijazat nahi) -> nakaam dikhao
          setOutbox(outbox.current.map((x) => (x.lid === o.lid ? { ...x, failed: error.message } : x)));
          setT((prev) => ({ ...prev, [table]: (prev[table] as { id: string }[]).map((m) => (m.id === o.lid ? { ...m, pending: false, failed: error.message } : m)) }));
          continue;
        }
        setOffline(false);
        setOutbox(outbox.current.filter((x) => x.lid !== o.lid));
        const row = data as { id: string };
        setT((prev) => {
          const list = (prev[table] as { id: string }[]).filter((m) => m.id !== o.lid && m.id !== row.id);
          return { ...prev, [table]: [row, ...list] };
        });
      }
    } finally {
      flushing.current = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** message bhejo; internet na ho to outbox mein (🕓) aur baad mein khud */
  const sendOrQueue = useCallback(async (kind: OutKind, payload: Record<string, unknown>) => {
    const table = TABLE_OF[kind];
    const queue = () => {
      const o: OutItem = { lid: newLocalId(), kind, created_at: new Date().toISOString(), payload };
      setOutbox([...outbox.current, o]);
      setT((prev) => ({ ...prev, [table]: [localRow(o), ...(prev[table] as unknown[])] }));
      setOffline(true);
    };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return queue();
    const { data, error } = await supabase.from(table).insert(payload).select('*').single();
    if (error) {
      if (isNetErr(error)) return queue();
      throw error;
    }
    const row = data as { id: string };
    setT((prev) => ((prev[table] as { id: string }[]).some((x) => x.id === row.id) ? prev : { ...prev, [table]: [row, ...(prev[table] as unknown[])] }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** local (abhi na gaya) message hatao */
  const dropLocal = (table: TableName, id: string) => {
    setOutbox(outbox.current.filter((o) => o.lid !== id));
    setT((prev) => ({ ...prev, [table]: (prev[table] as { id: string }[]).filter((x) => x.id !== id) }));
  };

  useEffect(() => {
    let alive = true;
    let gotFresh = false;
    // pehle phone mein save kiya hua data (internet na ho to bhi app foran khule)
    loadSnapshot<Tables>(uid).then((snap) => {
      if (!alive || gotFresh || !snap?.profiles?.length) return;
      const fixed = { ...EMPTY, ...snap } as Tables;
      INCREMENTAL.forEach((n) => { (fixed as Record<string, unknown[]>)[n] = withPending(n, (fixed[n] as { id: string }[]).filter((x) => !isLocalId(x.id))); });
      setT(fixed);
      setLoading(false);
    });
    reload()
      .then(() => { gotFresh = true; flush(); })
      .catch(console.error)
      .finally(() => alive && setLoading(false));
    // internet wapas aaye: pending messages bhejo + fresh data
    const onOnline = () => { setOffline(false); flush().then(() => reload().catch(console.error)); window.setTimeout(() => rebuild(), 500); };
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const retry = window.setInterval(() => { if (outbox.current.some((o) => !o.failed)) flush(); }, 15000);
    // Realtime: koi bhi table badle to wahi table dobara load ho (RLS ke mutabiq)
    const refetch = (name: TableName) => {
      window.clearTimeout(timers.current[name]);
      timers.current[name] = window.setTimeout(() => fetchTable(name).catch(console.error), 250);
    };
    const upsertRow = (name: TableName, row: { id: string }) =>
      setT((prev) => {
        const list = prev[name] as { id: string }[];
        const i = list.findIndex((x) => x.id === row.id);
        if (i >= 0) return { ...prev, [name]: list.map((x) => (x.id === row.id ? row : x)) };
        return { ...prev, [name]: [row, ...list] };
      });
    /**
     * v15: jo messages realtime se reh gaye (PC so gaya, internet gaya, token purana) wo khud le aao —
     * sirf aakhri message ke baad wale (bohot kam data).
     */
    const catchUp = async () => {
      if (!alive || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
      await Promise.all(INCREMENTAL.map(async (name) => {
        const cur = (latestRef.current[name] || '');
        if (!cur) return;
        const since = new Date(new Date(cur).getTime() - 5000).toISOString();
        const { data, error } = await supabase.from(name).select('*').gt('created_at', since).order('created_at', { ascending: true }).limit(500);
        if (error || !data?.length) return;
        setT((prev) => {
          const list = prev[name] as { id: string }[];
          const have = new Set(list.map((x) => x.id));
          const fresh = (data as { id: string }[]).filter((x) => !have.has(x.id));
          if (!fresh.length) return prev;
          return { ...prev, [name]: [...fresh.reverse(), ...list] };
        });
      })).catch(() => {});
    };
    let ch: ReturnType<typeof supabase.channel> | null = null;
    let healthy = false;
    let rebuilding = false;
    const subscribe = () => {
      const c = supabase.channel('khr-live-' + Date.now());
      TABLES.forEach((name) => {
        c.on('postgres_changes', { event: '*', schema: 'public', table: name }, (payload) => {
          if (INCREMENTAL.includes(name)) {
            const row = payload.new as { id?: string; body?: string };
            const old = payload.old as { id?: string };
            if (payload.eventType === 'DELETE') {
              setT((prev) => ({ ...prev, [name]: (prev[name] as { id: string }[]).filter((x) => x.id !== old.id) }));
              return;
            }
            if (!row?.id) return;
            // bara message: realtime kabhi adhoora bhejta hai -> poori row database se
            const errs = (payload as unknown as { errors?: unknown[] }).errors;
            if ((errs && errs.length) || row.body === undefined || row.body === null) {
              supabase.from(name).select('*').eq('id', row.id).maybeSingle().then(({ data }) => { if (data) upsertRow(name, data as { id: string }); });
              return;
            }
            upsertRow(name, row as { id: string });
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
      c.subscribe((status) => {
        if (c !== ch) return;
        if (status === 'SUBSCRIBED') {
          const wasDown = !healthy;
          healthy = true;
          if (wasDown) catchUp();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          healthy = false;
          window.setTimeout(rebuild, 3000);
        }
      });
      ch = c;
    };
    /** realtime toot gaya: naya token le kar dobara jodo, aur beech ke messages le aao */
    const rebuild = async () => {
      if (!alive || rebuilding) return;
      rebuilding = true;
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
        const old = ch;
        ch = null;
        if (old) await supabase.removeChannel(old).catch(() => {});
        if (!alive) return;
        subscribe();
        catchUp();
      } finally {
        rebuilding = false;
      }
    };
    subscribe();
    // token naya hua (har ghante) -> realtime ko bhi naya token
    const { data: authSub } = supabase.auth.onAuthStateChange((ev, sess) => {
      if ((ev === 'TOKEN_REFRESHED' || ev === 'SIGNED_IN') && sess?.access_token) supabase.realtime.setAuth(sess.access_token);
    });
    // nigrani: har 20 second — jura nahi to dobara jodo; jura hai to bhi har 2 minute halka sa catch-up
    let beat = 0;
    const watch = window.setInterval(() => {
      beat++;
      const st = (ch as unknown as { state?: string } | null)?.state;
      if (!healthy || (st && st !== 'joined' && st !== 'joining')) { healthy = false; rebuild(); }
      else if (beat % 6 === 0) catchUp();
    }, 20000);
    const onFocus = () => { catchUp(); if (!healthy) rebuild(); };
    window.addEventListener('focus', onFocus);

    // Kaun online hai (Discord jaisa hara nishan)
    const pres = supabase.channel('khr-presence', { config: { presence: { key: uid } } });
    pres.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(pres.presenceState()))));
    pres.subscribe((status) => {
      if (status === 'SUBSCRIBED') pres.track({ at: new Date().toISOString() }).catch(() => {});
    });
    // App wapas khulne par fresh data
    const onVis = () => document.visibilityState === 'visible' && reload().then(() => flush()).catch(console.error);
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
      window.clearInterval(retry);
      window.clearInterval(watch);
      window.removeEventListener('focus', onFocus);
      authSub.subscription.unsubscribe();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (ch) supabase.removeChannel(ch);
      ch = null;
      supabase.removeChannel(pres);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [uid, reload, fetchTable]);

  // har tabdeeli ke 2 second baad phone mein save (local / pending messages ke baghair)
  useEffect(() => {
    if (loading || !t.profiles.length) return;
    const id = window.setTimeout(() => {
      const clean = { ...t } as Record<string, unknown[]>;
      INCREMENTAL.forEach((n) => { clean[n] = (t[n] as { id: string }[]).filter((x) => !isLocalId(x.id)); });
      saveSnapshot(uid, clean);
    }, 2000);
    return () => window.clearTimeout(id);
  }, [t, loading, uid]);

  useEffect(() => {
    INCREMENTAL.forEach((n) => {
      let max = '';
      for (const x of t[n] as { id: string; created_at: string }[]) if (!isLocalId(x.id) && x.created_at > max) max = x.created_at;
      latestRef.current[n] = max || new Date(Date.now() - 864e5).toISOString();
    });
  }, [t.messages, t.server_messages, t.direct_messages]); // eslint-disable-line react-hooks/exhaustive-deps

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
    offline,
    pendingCount: outVer >= 0 ? outbox.current.filter((o) => !o.failed).length : 0,
    retryPending() {
      setOutbox(outbox.current.map((o) => ({ ...o, failed: undefined })));
      setT((prev) => {
        const n = { ...prev } as Record<string, unknown[]>;
        INCREMENTAL.forEach((k) => { n[k] = (prev[k] as { id: string; failed?: string }[]).map((m) => (isLocalId(m.id) ? { ...m, failed: undefined, pending: true } : m)); });
        return n as Tables;
      });
      window.setTimeout(() => flush(), 50);
    },
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
        script_url: v.script_url, thumbnail_url: v.thumbnail_url, thumbnail_delete_url: v.thumbnail_delete_url, video_url: v.video_url,
        ...(v.voiceover_url !== undefined ? { voiceover_url: v.voiceover_url } : {}),
        ...(v.youtube_url !== undefined ? { youtube_url: v.youtube_url } : {}),
        ...(v.day ? { day: v.day } : {})
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
      await sendOrQueue('msg', { channel_id: channelId, body, reply_to: isLocalId(replyTo) ? null : replyTo });
    },
    async deleteMessage(id) {
      if (isLocalId(id)) return dropLocal('messages', id);
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
      await sendOrQueue('srv', { channel_id: channelId, body, image_url: imageUrl, reply_to: isLocalId(replyTo) ? null : replyTo });
    },
    async deleteServerMessage(id) {
      if (isLocalId(id)) return dropLocal('server_messages', id);
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
      await sendOrQueue('dm', { to_user: to, body, image_url: imageUrl });
    },
    async deleteDM(id) {
      if (isLocalId(id)) return dropLocal('direct_messages', id);
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
      if (to.kind === 'srv') await sendOrQueue('srv', { channel_id: to.channel, body: m.body, image_url: m.image_url || '', fwd_from: fwd });
      else await sendOrQueue('dm', { to_user: to.peer, body: m.body, image_url: m.image_url || '', fwd_from: fwd });
    },
    async addTrack(title, url) {
      const pos = t.music_tracks.reduce((a, x) => Math.max(a, x.position), 0) + 1;
      const row = must(await supabase.from('music_tracks').insert({ title, url, position: pos }).select('id').single()) as { id: string };
      await fetchTable('music_tracks');
      return row.id;
    },
    async updateTrack(id, patch) {
      must(await supabase.from('music_tracks').update(patch).eq('id', id));
      await fetchTable('music_tracks');
    },
    async createPlaylist(name) {
      const pos = t.music_playlists.reduce((a, x) => Math.max(a, x.position), 0) + 1;
      const row = must(await supabase.from('music_playlists').insert({ name: name.trim(), position: pos }).select('id').single()) as { id: string };
      await fetchTable('music_playlists');
      return row.id;
    },
    async renamePlaylist(id, name) {
      must(await supabase.from('music_playlists').update({ name: name.trim() }).eq('id', id));
      await fetchTable('music_playlists');
    },
    async deletePlaylist(id) {
      must(await supabase.from('music_playlists').delete().eq('id', id));
      await Promise.all([fetchTable('music_playlists'), fetchTable('music_playlist_items')]);
    },
    async setInPlaylist(playlistId, trackId, on) {
      if (on) {
        const pos = t.music_playlist_items.filter((x) => x.playlist_id === playlistId).reduce((a, x) => Math.max(a, x.position), 0) + 1;
        must(await supabase.from('music_playlist_items').upsert({ playlist_id: playlistId, track_id: trackId, position: pos }));
      } else {
        must(await supabase.from('music_playlist_items').delete().eq('playlist_id', playlistId).eq('track_id', trackId));
      }
      await fetchTable('music_playlist_items');
    },
    async setFacebookLink(videoId, url) {
      const row = must(await supabase.rpc('set_facebook_link', { p_video: videoId, p_url: url.trim() })) as Video;
      setT((prev) => ({ ...prev, videos: prev.videos.map((v) => (v.id === videoId ? { ...v, ...row } : v)) }));
    },
    isFbManager: t.channel_members.some((m) => m.user_id === uid && m.roles.includes(FB_ROLE)),
    canEditVideos: (channelId) => isOwner || t.channel_members.some((m) => m.channel_id === channelId && m.user_id === uid && m.roles.some((r) => r !== FB_ROLE)),
    async submitTaskWork(taskId, videoId) {
      const row = must(await supabase.rpc('submit_task_work', { p_task: taskId, p_video: videoId })) as Task;
      setT((prev) => ({ ...prev, tasks: prev.tasks.map((x) => (x.id === taskId ? { ...x, ...row } : x)) }));
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
