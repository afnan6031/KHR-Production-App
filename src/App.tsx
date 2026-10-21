import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { isConfigured, supabase } from './lib/supabase';
import { DataProvider, PersonalScope, RealScope, useData } from './lib/data';
import { AuthScreen, NotConfigured } from './screens/Auth';
import { ChannelScreen, ChannelsScreen, GateScreen, MyCardsScreen } from './screens/Main';
import { HomeScreen, TeamScreen } from './screens/Home';
import { LeaderboardScreen, ProgressScreen } from './screens/Progress';
import { ChatReviewSheet, ServerScreen, useServerBadge } from './screens/Server';
import { ChannelSheet, PerfSheet, ProfileSheet } from './components/Sheets';
import { MusicProvider, useMusic } from './components/Music';
import { applyPrefs } from './lib/appearance';
import { Avatar, Logo, ThemeButton, ToastProvider, runBackHandler } from './components/ui';
import { BellButton, NotificationsProvider } from './components/Notifications';
import { initPush, onPushOpen, stopPush, takePendingOpen, type PushOpen } from './lib/push';
import { clearSnapshot } from './lib/offline';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isConfigured) return setReady(true);
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) return <NotConfigured />;
  if (!ready) return <Splash />;
  return (
    <ToastProvider>
      {session ? (
        <DataProvider key={session.user.id} uid={session.user.id}>
          <NotificationsProvider>
            <MusicProvider>
              <ModeShell />
            </MusicProvider>
          </NotificationsProvider>
        </DataProvider>
      ) : (
        <AuthScreen />
      )}
    </ToastProvider>
  );
}

function Splash() {
  return (
    <div className="splash">
      <Logo size={72} />
    </div>
  );
}

type Tab = 'home' | 'cards' | 'channels' | 'team' | 'rank' | 'progress' | 'server';
type SheetState = { kind: 'channel'; id: string | null } | { kind: 'perf' } | { kind: 'profile' } | null;
type Mode = 'owner' | 'personal';
const MODE_KEY = 'khr-mode';

/**
 * v9: Owner ke do mode — "Owner" (poori team ki management) aur "Personal" (sirf apna kaam,
 * jaise ek member). Personal mein bhi team ke saare notifications aate rehte hain.
 * Profile ki pasand (background, rang, zabaan) bhi yahin lagti hai.
 */
function ModeShell() {
  const d = useData();
  const [mode, setModeState] = useState<Mode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'personal' ? 'personal' : 'owner';
    } catch {
      return 'owner';
    }
  });
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* storage band */
    }
    window.scrollTo(0, 0);
  };
  const prefsKey = JSON.stringify(d.me?.prefs || {});
  useEffect(() => {
    if (d.me) applyPrefs(d.me.prefs);
  }, [prefsKey, !!d.me]); // eslint-disable-line react-hooks/exhaustive-deps
  const personal = d.isOwner && mode === 'personal';
  return (
    <PersonalScope on={personal}>
      <Shell mode={d.isOwner ? mode : null} setMode={setMode} />
    </PersonalScope>
  );
}

function ModeSwitch({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="mode-switch" role="group" aria-label="Mode">
      <button className={mode === 'owner' ? 'on' : ''} onClick={() => setMode('owner')} title="Poori team ki management">👑 <span>Owner</span></button>
      <button className={mode === 'personal' ? 'on' : ''} onClick={() => setMode('personal')} title="Sirf mera kaam">👤 <span>Personal</span></button>
    </div>
  );
}

function MusicButton() {
  const m = useMusic();
  if (!m) return null;
  return (
    <button className={'theme-btn' + (m.current ? ' playing' : '')} onClick={m.openLibrary} aria-label="Music" title="Music">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>
    </button>
  );
}

const ICON = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  cards: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
    </svg>
  ),
  server: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-6l-4 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
      <path d="M8 11h.01M12 11h.01M16 11h.01" strokeLinecap="round" strokeWidth="3" />
    </svg>
  ),
  rank: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
    </svg>
  ),
  progress: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.4 3.5 5.2" />
    </svg>
  )
};

function Shell({ mode, setMode }: { mode: Mode | null; setMode: (m: Mode) => void }) {
  const d = useData();
  const music = useMusic();
  const serverBadge = useServerBadge();
  const [records, setRecords] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [openId, setOpenId] = useState<string | null>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  // v15: har tab ki apni yaad — jo channel / progress khula tha, wapas aane par wahi (app dobara khule to dashboard)
  const mem = useRef<Partial<Record<Tab, { openId: string | null; openUser: string | null; y: number }>>>({});
  const [srvVisited, setSrvVisited] = useState(false);
  useEffect(() => { if (tab === 'server') setSrvVisited(true); }, [tab]);
  // mode badla to dashboard se shuru
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) { firstMode.current = false; return; }
    setTab('home');
    setOpenId(null);
    setOpenUser(null);
    mem.current = {};
  }, [mode]);

  // Android back button: sheet band -> progress/channel se wapas -> home -> app band
  const nav = useRef({ sheet, openId, openUser, tab });
  nav.current = { sheet, openId, openUser, tab };
  // PC/phone par install ki hui web app (PWA): browser ka back bhi pehle sheet/chat band kare
  useEffect(() => {
    if (Capacitor.isNativePlatform() || !window.matchMedia('(display-mode: standalone)').matches) return;
    history.pushState({ khr: 1 }, '');
    const onPop = () => {
      if (runBackHandler()) history.pushState({ khr: 1 }, '');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const h = CapApp.addListener('backButton', () => {
      if (runBackHandler()) return; // sheet / image / server chat pehle band
      const n = nav.current;
      if (n.sheet) setSheet(null);
      else if (n.openUser) setOpenUser(null);
      else if (n.openId) setOpenId(null);
      else if (n.tab !== 'home') setTab('home');
      else CapApp.exitApp();
    });
    return () => {
      h.then((x) => x.remove());
    };
  }, []);

  // header aur neeche wali patti ki asli unchai (server ko poori window mein fit karne ke liye)
  useEffect(() => {
    // v15: sirf badalne par likho — har 1.5 second root par likhna poori app ka style dobara banwata tha (jhatka / flicker)
    const last: Record<string, string> = {};
    const put = (k: string, v: string) => { if (last[k] !== v) { last[k] = v; document.documentElement.style.setProperty(k, v); } };
    const set = () => {
      const h = document.querySelector('.top')?.getBoundingClientRect().height || 56;
      const n = document.querySelector('nav.tabs')?.getBoundingClientRect().height || 60;
      put('--hdr', Math.round(h) + 'px');
      put('--navh', Math.round(n) + 'px');
      const o = document.querySelector('.offline-bar')?.getBoundingClientRect().height || 0;
      put('--offh', Math.round(o) + 'px');
    };
    set();
    window.addEventListener('resize', set);
    const id = window.setInterval(set, 1500);
    return () => { window.removeEventListener('resize', set); window.clearInterval(id); };
  }, []);

  // offline patti aaye / jaye to server ki jagah foran theek
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      const o = Math.round(document.querySelector('.offline-bar')?.getBoundingClientRect().height || 0) + 'px';
      if (document.documentElement.style.getPropertyValue('--offh') !== o) document.documentElement.style.setProperty('--offh', o);
    });
    return () => window.cancelAnimationFrame(id);
  }, [d.offline, d.pendingCount]);

  const signOut = async () => {
    setSheet(null);
    await stopPush();
    await clearSnapshot(d.uid);
    await supabase.auth.signOut();
  };

  // App band ho tab bhi notifications: login + approve ke baad phone register
  const canUse = !d.loading && !!d.me && (d.isOwner || d.me.status === 'approved');
  useEffect(() => {
    if (canUse) initPush();
  }, [canUse]);
  // notification par tap -> sahi jagah kholo
  const channelsRef = useRef(d.channels);
  channelsRef.current = d.channels;
  useEffect(() => {
    const handle = (p: PushOpen) => {
      setSheet(null);
      setOpenUser(null);
      if (p.type === 'dm' || p.type === 'srv' || p.type === 'friend') {
        setOpenId(null);
        setTab('server'); // Server screen khud DM / channel kholti hai
        return;
      }
      takePendingOpen();
      if (p.channel && channelsRef.current.some((c) => c.id === p.channel)) setOpenId(p.channel);
      else { setOpenId(null); setTab('home'); }
    };
    return onPushOpen(handle);
  }, []);

  if (d.loading)
    return (
      <div className="splash">
        <Logo size={72} />
        <p className="muted">Production room khul raha hai…</p>
      </div>
    );

  if (!d.me && d.offline)
    return (
      <div className="splash offline-screen">
        <Logo size={72} />
        <h2>Internet nahi mila</h2>
        <p className="muted">Is phone par abhi koi save kiya hua data nahi. Pehli dafa (ya logout ke baad) app kholne ke liye internet chahiye — uske baad app internet ke baghair bhi khulegi.</p>
        <button className="btn primary" onClick={() => d.reload().catch(() => {})}>Dobara try karein</button>
      </div>
    );

  if (!d.me)
    return (
      <div className="auth">
        <div className="alert">Aap ka profile nahi mila. Owner se check karwayein ke database setup (schema.sql) chal chuka hai.</div>
        <button className="btn primary" onClick={() => d.reload().catch(() => {})}>Dobara try karein</button>
        <button className="btn" onClick={signOut}>
          Logout
        </button>
      </div>
    );

  if (!d.isOwner && d.me.status !== 'approved') return <GateScreen onSignOut={signOut} />;

  const open = (id: string) => {
    setOpenUser(null);
    setOpenId(id);
    window.scrollTo(0, 0);
  };
  const openProgress = (uid: string) => {
    if (!d.isOwner && uid !== d.uid) return;
    setOpenUser(uid);
    window.scrollTo(0, 0);
  };
  const go = (t: Tab) => {
    if (t === tab) {
      // usi tab par dobara tap: us tab ka dashboard (shuru)
      setOpenId(null);
      setOpenUser(null);
      delete mem.current[t];
      window.scrollTo(0, 0);
      return;
    }
    mem.current[tab] = { openId, openUser, y: window.scrollY };
    const back = mem.current[t];
    const okCh = back?.openId && d.channels.some((c) => c.id === back.openId) ? back.openId : null;
    setTab(t);
    setOpenId(okCh);
    setOpenUser(back?.openUser || null);
    const y = back ? back.y : 0;
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  };
  const channel = openId ? d.channels.find((c) => c.id === openId) : null;
  const pending = d.profiles.filter((p) => p.status === 'pending').length;
  const tabs: { k: Tab; label: string; icon: JSX.Element; badge?: number }[] = d.isOwner
    ? [
        { k: 'home', label: 'Aaj', icon: ICON.home },
        { k: 'channels', label: 'Channels', icon: ICON.cards },
        { k: 'team', label: 'Team', icon: ICON.team, badge: pending },
        { k: 'rank', label: 'Ranking', icon: ICON.rank },
        { k: 'server', label: 'Server', icon: ICON.server, badge: serverBadge }
      ]
    : [
        { k: 'home', label: 'Aaj', icon: ICON.home },
        { k: 'cards', label: 'Mere cards', icon: ICON.cards },
        { k: 'rank', label: 'Ranking', icon: ICON.rank },
        { k: 'progress', label: 'Progress', icon: ICON.progress },
        { k: 'server', label: 'Server', icon: ICON.server, badge: serverBadge }
      ];

  const serverOn = tab === 'server' && !channel && !openUser;
  let body: JSX.Element;
  if (openUser) body = <ProgressScreen key={openUser} userId={openUser} onBack={() => setOpenUser(null)} openChannel={open} />;
  else if (channel)
    body = (
      <ChannelScreen
        channel={channel}
        onBack={() => setOpenId(null)}
        onEdit={() => setSheet({ kind: 'channel', id: channel.id })}
        onPerf={() => setSheet({ kind: 'perf' })}
        openProgress={openProgress}
      />
    );
  else if (tab === 'channels' && d.isOwner) body = <ChannelsScreen openChannel={open} newChannel={() => setSheet({ kind: 'channel', id: null })} />;
  else if (tab === 'team' && d.isOwner) body = <TeamScreen openProgress={openProgress} />;
  else if (tab === 'cards') body = <MyCardsScreen openChannel={open} />;
  else if (tab === 'rank') body = <LeaderboardScreen openProgress={openProgress} />;
  else if (tab === 'server') body = <></>;
  else if (tab === 'progress') body = <ProgressScreen userId={d.uid} openChannel={open} />;
  else body = <HomeScreen openChannel={open} openProgress={openProgress} goTeam={() => go('team')} newChannel={() => setSheet({ kind: 'channel', id: null })} />;

  return (
    <div className="shell">
      <header className="top">
        <div className="top-in">
          <div className="brand">
            <Logo />
            <div>
              <b>KHR Production</b>
              <small>{d.isOwner ? 'Owner dashboard' : mode === 'personal' ? 'Personal mode' : 'Team dashboard'}</small>
            </div>
          </div>
          {mode && <ModeSwitch mode={mode} setMode={setMode} />}
          <MusicButton />
          <ThemeButton />
          <BellButton />
          <button className="who" onClick={() => setSheet({ kind: 'profile' })} aria-label="Mera profile">
            <Avatar name={d.me.full_name || 'Owner'} url={d.me.avatar_url || undefined} />
          </button>
        </div>
      </header>

      {d.offline && (
        <div className="offline-bar" role="status">
          📴 Internet nahi — aakhri save kiya hua data dikh raha hai.{' '}
          {d.pendingCount > 0 ? <b>{d.pendingCount} message internet ka intezar kar rahe hain.</b> : 'Message bhejein, internet aate hi chale jayenge.'}
        </div>
      )}
      <main className={serverOn ? 'server-main' : ''}>
        {!serverOn && body}
        {/* v15: Server hamesha zinda rehta hai (chhupa) — tab badlein to likha hua text, khuli chat, scroll sab wahi */}
        {(srvVisited || serverOn) && (
          <div className="srv-keep" style={{ display: serverOn ? 'contents' : 'none' }}>
            <RealScope><ServerScreen active={serverOn} /></RealScope>
          </div>
        )}
      </main>

      <nav className="tabs">
        <div className="in">
          {tabs.map((t) => (
            <button key={t.k} className={tab === t.k ? 'on' : ''} onClick={() => go(t.k)}>
              {t.icon}
              {t.label}
              {!!t.badge && <span className="badge">{t.badge}</span>}
            </button>
          ))}
        </div>
      </nav>

      {sheet?.kind === 'channel' && (
        <ChannelSheet
          channel={sheet.id ? d.channels.find((c) => c.id === sheet.id) || null : null}
          onClose={() => setSheet(null)}
          onSaved={(id) => {
            setSheet(null);
            setOpenId(id || null);
          }}
        />
      )}
      {sheet?.kind === 'perf' && channel && <PerfSheet channel={channel} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'profile' && (
        <ProfileSheet
          onClose={() => setSheet(null)}
          onSignOut={signOut}
          onProgress={() => {
            setSheet(null);
            openProgress(d.uid);
          }}
          onRecords={() => {
            setSheet(null);
            setRecords(true);
          }}
          onMusic={music ? () => { setSheet(null); music.openLibrary(); } : undefined}
        />
      )}
      {records && d.realOwner && <RealScope><ChatReviewSheet onClose={() => setRecords(false)} /></RealScope>}
    </div>
  );
}
