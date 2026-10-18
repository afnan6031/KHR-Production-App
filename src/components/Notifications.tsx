import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useData } from '../lib/data';
import type { Task } from '../lib/types';
import { fmtClock, fmtDate, todayKey } from '../lib/utils';
import { Sheet, useToast } from './ui';
import { onPushChange, pushActive, pushBuilt, retryPush } from '../lib/push';
import { desktop } from '../lib/theme';

/* =========================================================================
   Notifications
   - App ke andar ghanti (bell) mein saare alerts
   - Phone / PC par system notification (ijazat milne par)
   - Deadline alerts (shuru, 10 minute pehle, khatam) phone par pehle se schedule
     ho jate hain, is liye app band ho tab bhi aate hain (Android app mein).
   ========================================================================= */

export interface Alert {
  id: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
  kind: 'message' | 'dm' | 'task' | 'assign' | 'deadline' | 'friend' | 'file';
}

interface NotifCtx {
  alerts: Alert[];
  unread: number;
  markAllRead: () => void;
  clear: () => void;
  permission: 'granted' | 'denied' | 'default' | 'unsupported';
  requestPermission: () => Promise<void>;
  /** app band ho tab bhi alerts aate hain? */
  closedApp: 'push' | 'tray' | 'local' | 'none';
}
const Ctx = createContext<NotifCtx | null>(null);
export const useNotifications = () => useContext(Ctx);

const native = Capacitor.isNativePlatform();
const MINUTE = 60000;

/** string se chhota number (native notification id ke liye) */
function hashId(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 2000000000;
}

async function systemNotify(id: string, title: string, body: string) {
  try {
    // server (Firebase) khud bhej raha ho to app background mein dobara na bheje (double alert nahi)
    if (native && pushActive() && document.visibilityState !== 'visible') return;
    if (native) {
      await LocalNotifications.schedule({ notifications: [{ id: hashId(id), title, body, schedule: { at: new Date(Date.now() + 500) } }] });
    } else if ('Notification' in window && Notification.permission === 'granted' && (document.visibilityState !== 'visible' || !document.hasFocus())) {
      // PC: app tray mein ho / doosri window upar ho tab bhi Windows notification
      const n = new Notification(title, { body, icon: './icons/icon-192.png', tag: id });
      n.onclick = () => { desktop()?.show(); window.focus(); n.close(); };
      desktop()?.attention();
    }
  } catch {
    /* notification na dikhe to bhi app chalti rahe */
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const d = useData();
  const toast = useToast();
  const storeKey = 'khr-alerts-' + d.uid;
  const [alerts, setAlerts] = useState<Alert[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storeKey) || '[]') as Alert[];
    } catch {
      return [];
    }
  });
  const [permission, setPermission] = useState<NotifCtx['permission']>('default');
  const [serverPush, setServerPush] = useState(pushActive());
  useEffect(() => onPushChange(() => setServerPush(pushActive())), []);

  useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(alerts.slice(0, 100)));
    } catch {
      /* storage band */
    }
  }, [alerts, storeKey]);

  // ijazat ki halat
  useEffect(() => {
    (async () => {
      if (native) {
        const p = await LocalNotifications.checkPermissions().catch(() => null);
        setPermission(p?.display === 'granted' ? 'granted' : p?.display === 'denied' ? 'denied' : 'default');
      } else if ('Notification' in window) setPermission(Notification.permission);
      else setPermission('unsupported');
    })();
  }, []);

  const requestPermission = useCallback(async () => {
    if (native) {
      const p = await LocalNotifications.requestPermissions().catch(() => null);
      setPermission(p?.display === 'granted' ? 'granted' : 'denied');
      if (pushBuilt) await retryPush();
    } else if ('Notification' in window) {
      setPermission(await Notification.requestPermission());
    }
  }, []);

  const push = useCallback(
    (a: Omit<Alert, 'at' | 'read'>, system = true) => {
      setAlerts((prev) => (prev.some((x) => x.id === a.id) ? prev : [{ ...a, at: new Date().toISOString(), read: false }, ...prev].slice(0, 100)));
      if (document.visibilityState === 'visible') toast(a.title + (a.body ? ': ' + a.body.slice(0, 60) : ''));
      if (system) systemNotify(a.id, a.title, a.body);
    },
    [toast]
  );

  /* ---------- naye events pehchanna (pehli load ko chhor kar) ---------- */
  const primed = useRef(false);
  const seen = useRef<Record<string, Set<string>>>({});
  const taskStatus = useRef<Map<string, string>>(new Map());
  const myRoles = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (d.loading) return;
    const ids = (k: string, list: { id: string }[]) => {
      const prev = seen.current[k];
      const now = new Set(list.map((x) => x.id));
      seen.current[k] = now;
      if (!prev) return [] as string[];
      return [...now].filter((x) => !prev.has(x));
    };
    const chName = (id: string) => d.channels.find((c) => c.id === id)?.name || 'Channel';
    const sName = (id: string) => d.server_channels.find((c) => c.id === id)?.name || 'channel';

    const newSrv = ids('srv', d.server_messages);
    const newDm = ids('dm', d.direct_messages);
    const newMsg = ids('msg', d.messages);
    const newAtt = ids('att', d.attachments);
    const newFr = ids('fr', d.friend_requests.map((f) => ({ id: f.id + ':' + f.status })));

    // tasks: kisi ka status badla?
    const statusChanges: Task[] = [];
    d.tasks.forEach((t) => {
      const old = taskStatus.current.get(t.id);
      if (old !== undefined && old !== t.status) statusChanges.push(t);
      taskStatus.current.set(t.id, t.status);
    });
    // mere roles
    const roleChanges: { ch: string; roles: string }[] = [];
    d.channel_members.filter((m) => m.user_id === d.uid).forEach((m) => {
      const v = m.roles.join(', ');
      const old = myRoles.current.get(m.channel_id);
      if (primed.current && old !== v && v) roleChanges.push({ ch: m.channel_id, roles: v });
      myRoles.current.set(m.channel_id, v);
    });

    if (!primed.current) {
      primed.current = true;
      return;
    }

    newSrv.forEach((id) => {
      const m = d.server_messages.find((x) => x.id === id);
      if (m && m.user_id !== d.uid) push({ id: 'srv-' + id, kind: 'message', title: `#${sName(m.channel_id)} · ${d.nameOf(m.user_id)}`, body: m.body || '📷 Image' });
    });
    newDm.forEach((id) => {
      const m = d.direct_messages.find((x) => x.id === id);
      if (m && m.to_user === d.uid) push({ id: 'dm-' + id, kind: 'dm', title: `${d.nameOf(m.from_user)} ka message`, body: m.body || '📷 Image' });
    });
    newMsg.forEach((id) => {
      const m = d.messages.find((x) => x.id === id);
      if (m && m.user_id !== d.uid) push({ id: 'msg-' + id, kind: 'message', title: `${chName(m.channel_id)} chat · ${d.nameOf(m.user_id)}`, body: m.body });
    });
    newAtt.forEach((id) => {
      const a = d.attachments.find((x) => x.id === id);
      if (a && a.created_by !== d.uid) push({ id: 'att-' + id, kind: 'file', title: `${chName(a.channel_id)}: nayi ${a.kind === 'script' ? 'script' : 'thumbnail'}`, body: `${a.title} · ${d.nameOf(a.created_by)}` });
    });
    newFr.forEach((key) => {
      const [fid, status] = key.split(':');
      const f = d.friend_requests.find((x) => x.id === fid);
      if (!f) return;
      if (status === 'pending' && f.to_user === d.uid) push({ id: 'fr-' + key, kind: 'friend', title: 'Friend request', body: `${d.nameOf(f.from_user)} ne aap ko friend request bheji` });
      if (status === 'accepted' && f.from_user === d.uid) push({ id: 'fr-' + key, kind: 'friend', title: 'Request accept', body: `${d.nameOf(f.to_user)} ne aap ki friend request accept kar li` });
    });
    statusChanges.forEach((t) => {
      if (t.status === 'done' && t.user_id !== d.uid && d.isOwner)
        push({ id: 'tdone-' + t.id + t.completed_at, kind: 'task', title: '✓ Task complete', body: `${d.nameOf(t.user_id)} ne ${chName(t.channel_id)} (${t.role}) complete kiya` });
      if (t.status === 'rejected' && t.user_id === d.uid)
        push({ id: 'trej-' + t.id + t.rejected_at, kind: 'task', title: '✕ Task reject hua', body: `${chName(t.channel_id)} (${t.role})${t.rejected_reason ? ': ' + t.rejected_reason : ''}` });
    });
    roleChanges.forEach((r) => push({ id: 'role-' + r.ch + r.roles, kind: 'assign', title: 'Naya kaam assign hua', body: `${chName(r.ch)} mein aap ka role: ${r.roles}` }));
  }, [d.loading, d.server_messages, d.direct_messages, d.messages, d.attachments, d.friend_requests, d.tasks, d.channel_members]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- deadline alerts: shuru, 10 minute pehle, khatam ---------- */
  useEffect(() => {
    if (d.loading) return;
    const today = todayKey();
    const mine = d.tasks.filter((t) => t.user_id === d.uid && t.status === 'pending' && t.day >= today);
    const now = Date.now();
    type Plan = { key: string; at: number; title: string; body: string };
    const plans: Plan[] = [];
    mine.forEach((t) => {
      const ch = d.channels.find((c) => c.id === t.channel_id)?.name || 'Channel';
      const due = new Date(t.due_at).getTime();
      const start = t.start_at ? new Date(t.start_at).getTime() : null;
      if (start && start > now) plans.push({ key: t.id + '-start', at: start, title: '▶ Kaam ka waqt shuru', body: `${ch} · ${t.role} · deadline ${fmtClock(t.due_at)}` });
      if (due - 10 * MINUTE > now) plans.push({ key: t.id + '-10m', at: due - 10 * MINUTE, title: '⏰ 10 minute baqi', body: `${ch} · ${t.role} ki deadline ${fmtClock(t.due_at)} par khatam` });
      if (due > now) plans.push({ key: t.id + '-end', at: due, title: '⛔ Deadline khatam', body: `${ch} · ${t.role} — abhi tak complete nahi hua` });
    });

    // app khuli ho to timers
    const timers = plans
      .filter((p) => p.at - now < 24 * 60 * MINUTE)
      .map((p) => window.setTimeout(() => push({ id: 'dl-' + p.key, kind: 'deadline', title: p.title, body: p.body }, !native), p.at - now));

    // Android: phone par pehle se schedule (app band ho tab bhi aaye).
    // Server push chalu ho to server har minute khud bhejta hai -> local wale hata do (double na aayein)
    if (native && permission === 'granted') {
      (async () => {
        try {
          const pending = await LocalNotifications.getPending();
          const ours = pending.notifications.filter((n) => (n.extra as { khr?: boolean } | undefined)?.khr);
          if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
          if (plans.length && !serverPush)
            await LocalNotifications.schedule({
              notifications: plans.slice(0, 60).map((p) => ({ id: hashId('dl-' + p.key), title: p.title, body: p.body, schedule: { at: new Date(p.at), allowWhileIdle: true }, extra: { khr: true } }))
            });
        } catch {
          /* schedule na ho saka */
        }
      })();
    }
    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [d.loading, d.tasks, d.channels, d.uid, permission, push, serverPush]);

  const value: NotifCtx = {
    alerts,
    unread: alerts.filter((a) => !a.read).length,
    markAllRead: () => setAlerts((p) => p.map((a) => ({ ...a, read: true }))),
    clear: () => setAlerts([]),
    permission,
    requestPermission,
    closedApp: serverPush ? 'push' : desktop() ? 'tray' : native ? 'local' : 'none'
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const ICON: Record<Alert['kind'], string> = { message: '💬', dm: '✉️', task: '✅', assign: '📌', deadline: '⏰', friend: '🤝', file: '📄' };

/** Header ki ghanti + alerts ki list */
export function BellButton() {
  const n = useNotifications();
  const [open, setOpen] = useState(false);
  if (!n) return null;
  return (
    <>
      <button className="theme-btn bell" onClick={() => setOpen(true)} aria-label={`Notifications${n.unread ? `: ${n.unread} naye` : ''}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
        {n.unread > 0 && <span className="badge">{n.unread > 99 ? '99+' : n.unread}</span>}
      </button>
      {open && (
        <Sheet
          title="Notifications"
          onClose={() => {
            setOpen(false);
            n.markAllRead();
          }}
        >
          {n.permission !== 'granted' && n.permission !== 'unsupported' && (
            <div className="note row between">
              <span>Phone/PC par bhi alerts paane ke liye notifications on karein (deadline shuru, 10 minute pehle, aur khatam hone par).</span>
              <button className="btn primary sm" onClick={n.requestPermission}>On karein</button>
            </div>
          )}
          {n.permission === 'granted' && n.closedApp === 'push' && <p className="muted tiny m0">✓ App band ho tab bhi messages, kaam aur deadlines ke alerts is phone par aayenge.</p>}
          {n.permission === 'granted' && n.closedApp === 'local' && <p className="muted tiny m0">Deadline alerts app band hone par bhi aate hain. Messages ke alerts ke liye owner ko server notifications (Firebase) on karni hain.</p>}
          {n.closedApp === 'tray' && <p className="muted tiny m0">✓ Window band karne par bhi KHR Production tray (ghadi ke paas) mein chalti rehti hai aur alerts dikhati hai.</p>}
          {n.permission === 'denied' && <p className="muted tiny m0">Notifications band hain. Phone ki Settings → Apps → KHR Production → Notifications se on karein.</p>}
          {n.alerts.length ? (
            <>
              <div className="row between">
                <span className="muted small">{n.unread} naye</span>
                <button className="linkbtn" onClick={n.clear}>Sab saaf karein</button>
              </div>
              <div className="alerts">
                {n.alerts.map((a) => (
                  <div key={a.id} className={'alert-row' + (a.read ? '' : ' new')}>
                    <span className="alert-ico" aria-hidden="true">{ICON[a.kind]}</span>
                    <div className="grow">
                      <b>{a.title}</b>
                      {a.body && <div className="small">{a.body}</div>}
                      <span className="muted tiny">{fmtDate(a.at.slice(0, 10))} · {fmtClock(a.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty"><b>Abhi koi notification nahi</b>Messages, tasks, naye kaam aur deadlines ke alerts yahan aayenge.</div>
          )}
        </Sheet>
      )}
    </>
  );
}
