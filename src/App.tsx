import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { isConfigured, supabase } from './lib/supabase';
import { DataProvider, useData } from './lib/data';
import type { Video } from './lib/types';
import { AuthScreen, NotConfigured } from './screens/Auth';
import { ChannelScreen, ChannelsScreen, GateScreen, MyCardsScreen } from './screens/Main';
import { HomeScreen, TeamScreen } from './screens/Home';
import { LeaderboardScreen, ProgressScreen } from './screens/Progress';
import { ChatReviewSheet, ServerScreen, useServerBadge } from './screens/Server';
import { ChannelSheet, PerfSheet, ProfileSheet, VideoSheet } from './components/Sheets';
import { Avatar, Logo, ThemeButton, ToastProvider } from './components/ui';
import { BellButton, NotificationsProvider } from './components/Notifications';

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
            <Shell />
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
type SheetState = { kind: 'channel'; id: string | null } | { kind: 'perf' } | { kind: 'video'; video: Video | null } | { kind: 'profile' } | null;

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

function Shell() {
  const d = useData();
  const serverBadge = useServerBadge();
  const [records, setRecords] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [openId, setOpenId] = useState<string | null>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);

  // Android back button: sheet band -> progress/channel se wapas -> home -> app band
  const nav = useRef({ sheet, openId, openUser, tab });
  nav.current = { sheet, openId, openUser, tab };
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const h = CapApp.addListener('backButton', () => {
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
    const set = () => {
      const h = document.querySelector('.top')?.getBoundingClientRect().height || 56;
      const n = document.querySelector('nav.tabs')?.getBoundingClientRect().height || 60;
      document.documentElement.style.setProperty('--hdr', h + 'px');
      document.documentElement.style.setProperty('--navh', n + 'px');
    };
    set();
    window.addEventListener('resize', set);
    const id = window.setInterval(set, 1500);
    return () => { window.removeEventListener('resize', set); window.clearInterval(id); };
  }, []);

  const signOut = async () => {
    setSheet(null);
    await supabase.auth.signOut();
  };

  if (d.loading)
    return (
      <div className="splash">
        <Logo size={72} />
        <p className="muted">Production room khul raha hai…</p>
      </div>
    );

  if (!d.me)
    return (
      <div className="auth">
        <div className="alert">Aap ka profile nahi mila. Owner se check karwayein ke database setup (schema.sql) chal chuka hai.</div>
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
    setTab(t);
    setOpenId(null);
    setOpenUser(null);
    window.scrollTo(0, 0);
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

  let body: JSX.Element;
  if (openUser) body = <ProgressScreen key={openUser} userId={openUser} onBack={() => setOpenUser(null)} openChannel={open} />;
  else if (channel)
    body = (
      <ChannelScreen
        channel={channel}
        onBack={() => setOpenId(null)}
        onEdit={() => setSheet({ kind: 'channel', id: channel.id })}
        onPerf={() => setSheet({ kind: 'perf' })}
        onVideo={(video) => setSheet({ kind: 'video', video })}
        openProgress={openProgress}
      />
    );
  else if (tab === 'channels' && d.isOwner) body = <ChannelsScreen openChannel={open} newChannel={() => setSheet({ kind: 'channel', id: null })} />;
  else if (tab === 'team' && d.isOwner) body = <TeamScreen openProgress={openProgress} />;
  else if (tab === 'cards') body = <MyCardsScreen openChannel={open} />;
  else if (tab === 'rank') body = <LeaderboardScreen openProgress={openProgress} />;
  else if (tab === 'server') body = <ServerScreen />;
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
              <small>{d.isOwner ? 'Owner dashboard' : 'Team dashboard'}</small>
            </div>
          </div>
          <ThemeButton />
          <BellButton />
          <button className="who" onClick={() => setSheet({ kind: 'profile' })} aria-label="Mera profile">
            {d.isOwner && <span className="tag-owner">Owner</span>}
            <Avatar name={d.me.full_name || 'Owner'} url={d.me.avatar_url || undefined} />
          </button>
        </div>
      </header>

      <main className={tab === 'server' && !channel && !openUser ? 'server-main' : ''}>{body}</main>

      <nav className="tabs">
        <div className="in">
          {tabs.map((t) => (
            <button key={t.k} className={tab === t.k && !channel && !openUser ? 'on' : ''} onClick={() => go(t.k)}>
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
      {sheet?.kind === 'video' && channel && <VideoSheet channelId={channel.id} video={sheet.video} onClose={() => setSheet(null)} />}
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
        />
      )}
      {records && d.isOwner && <ChatReviewSheet onClose={() => setRecords(false)} />}
    </div>
  );
}
