import { useEffect, useMemo, useRef, useState } from 'react';
import { onPushOpen, takePendingOpen, type PushOpen } from '../lib/push';
import { useData, type ServerChannelInput } from '../lib/data';
import type { DirectMessage, Profile, ServerChannel } from '../lib/types';
import { errorText, fmtClock, fmtDate } from '../lib/utils';
import { Avatar, ConfirmButton, Logo, Seg, Sheet, useBackHandler, useToast } from '../components/ui';
import { Composer, ImageViewer, MessageFeed, UserAvatar, roleTone, type FeedItem } from '../components/Messaging';

/* ---------- server channel "naye message" (har device par yaad) ---------- */
const SEEN_EVENT = 'khr-sseen';
const seenKey = (id: string) => 'khr-sseen-' + id;
const getSeen = (id: string) => {
  try { return localStorage.getItem(seenKey(id)) || ''; } catch { return ''; }
};
const markSeen = (id: string) => {
  try { localStorage.setItem(seenKey(id), new Date().toISOString()); } catch { /* storage band */ }
  window.dispatchEvent(new Event(SEEN_EVENT));
};
function useSeenTick() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((x) => x + 1);
    window.addEventListener(SEEN_EVENT, f);
    return () => window.removeEventListener(SEEN_EVENT, f);
  }, []);
}

/** Server tab par badge: naye DMs + aayi hui friend requests */
export function useServerBadge(): number {
  const d = useData();
  const dms = d.direct_messages.filter((m) => m.to_user === d.uid && !m.read_at).length;
  const reqs = d.friend_requests.filter((f) => f.to_user === d.uid && f.status === 'pending').length;
  return dms + reqs;
}

const DM_NOTICE = 'Company chat: sirf kaam ki baat karein. Company policy ke mutabiq owner ye chat review kar sakta hai.';

type View = { kind: 'home' } | { kind: 'channel'; id: string } | { kind: 'dm'; peer: string };
type Pane = 'channels' | 'friends';

/* pichli dafa kya khula tha (har device par yaad) */
type Last = { pane: Pane; channel?: string; dm?: string };
const LAST_KEY = 'khr-srv-last';
function readLast(): Last {
  try { return { pane: 'channels', ...(JSON.parse(localStorage.getItem(LAST_KEY) || '{}') as Partial<Last>) }; } catch { return { pane: 'channels' }; }
}
function saveLast(l: Last) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(l)); } catch { /* storage band */ }
}

export function ServerScreen() {
  const d = useData();
  const [last, setLast] = useState<Last>(readLast);
  const [pane, setPaneState] = useState<Pane>(last.pane);
  const [view, setView] = useState<View>({ kind: 'home' });
  const [profile, setProfile] = useState<string | null>(null);
  const [editing, setEditing] = useState<ServerChannel | 'new' | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  useSeenTick();

  const remember = (patch: Partial<Last>) => setLast((l) => { const n = { ...l, ...patch }; saveLast(n); return n; });
  const validChannel = (id?: string) => !!id && d.server_channels.some((c) => c.id === id);
  const fallbackChannel = () => (d.server_channels.find((c) => c.name === 'general') || d.server_channels[0])?.id;

  // PC (badi screen): server kholte hi pichla channel / pichli DM khul jaye (list saath nazar aati hai).
  // Phone: pehle list — # Channels ya 👥 Friends — phir jis par tap karein wahi chat khule.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || d.loading) return;
    if (!window.matchMedia('(min-width: 980px)').matches) { restored.current = true; return; }
    if (last.pane === 'friends' && last.dm && d.profileOf(last.dm)) {
      setView({ kind: 'dm', peer: last.dm });
      restored.current = true;
    } else if (d.server_channels.length) {
      const id = validChannel(last.channel) ? last.channel! : fallbackChannel();
      if (id) setView({ kind: 'channel', id });
      restored.current = true;
    }
  }, [d.loading, d.server_channels.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const openChannel = (id: string) => { setView({ kind: 'channel', id }); remember({ pane: 'channels', channel: id }); };
  const openDM = (peer: string) => { setProfile(null); setPaneState('friends'); setView({ kind: 'dm', peer }); remember({ pane: 'friends', dm: peer }); };
  const setPane = (p: Pane) => {
    setPaneState(p);
    remember({ pane: p });
    // phone par sirf list badlo (chat khud na khule)
    if (!window.matchMedia('(min-width: 980px)').matches) { setView({ kind: 'home' }); return; }
    // PC par tab badalte hi us tab ki pichli chat khol do
    if (p === 'channels') { const id = validChannel(last.channel) ? last.channel : fallbackChannel(); if (id) setView({ kind: 'channel', id }); }
    if (p === 'friends') { if (last.dm && d.profileOf(last.dm)) setView({ kind: 'dm', peer: last.dm }); else setView({ kind: 'home' }); }
  };

  // notification par tap: seedha wahi DM / channel
  const openRef = useRef({ openDM, openChannel, setPane });
  openRef.current = { openDM, openChannel, setPane };
  useEffect(() => {
    const go = (p: PushOpen | null) => {
      if (!p) return;
      if (p.type === 'dm' && p.peer) { restored.current = true; openRef.current.openDM(p.peer); }
      else if (p.type === 'srv' && p.channel) { restored.current = true; setPaneState('channels'); openRef.current.openChannel(p.channel); }
      else if (p.type === 'friend') { restored.current = true; setPaneState('friends'); remember({ pane: 'friends' }); setView({ kind: 'home' }); }
    };
    go(takePendingOpen());
    return onPushOpen(() => go(takePendingOpen()));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const channelId = view.kind === 'channel' ? view.id : '';
  // phone par chat khuli ho to back = server ki list (dashboard nahi)
  const narrow = typeof window !== 'undefined' && !window.matchMedia('(min-width: 980px)').matches;
  useBackHandler(narrow && view.kind !== 'home', () => setView({ kind: 'home' }));

  return (
    <div className={'srv ' + (view.kind === 'home' ? 'at-home' : 'at-chat') + (view.kind === 'channel' ? ' with-members' : '')}>
      <aside className="srv-side">
        <div className="srv-head">
          <Logo size={40} variant="circle" />
          <div className="grow">
            <b>KHR Server</b>
            <small className="muted">{d.profiles.filter((p) => p.status === 'approved' || p.is_owner).length} members · {d.online.size} online</small>
          </div>
          {d.isOwner && <button className="btn sm" onClick={() => setEditing('new')}>+ Channel</button>}
        </div>
        <Seg label="Server" value={pane} onChange={setPane} options={[{ v: 'channels', label: '# Channels' }, { v: 'friends', label: '👥 Friends' }]} />
        <div className="srv-side-scroll">
          {pane === 'channels' && <ChannelList current={channelId} onOpen={openChannel} onEdit={(c) => setEditing(c)} />}
          {pane === 'friends' && <FriendsPane current={view.kind === 'dm' ? view.peer : ''} onOpenDM={openDM} onOpenUser={setProfile} />}
        </div>
      </aside>

      <section className="srv-main">
        {view.kind === 'channel' && <ChannelChat key={view.id} channelId={view.id} onBack={() => setView({ kind: 'home' })} onOpenUser={setProfile} onEdit={(c) => setEditing(c)} onMembers={() => setShowMembers(true)} />}
        {view.kind === 'dm' && <DMChat key={view.peer} peer={view.peer} onBack={() => setView({ kind: 'home' })} onOpenUser={setProfile} />}
        {view.kind === 'home' && <div className="srv-placeholder muted">{pane === 'friends' ? 'Kisi friend ki chat chunein' : 'Koi channel chunein'}</div>}
      </section>

      {view.kind === 'channel' && (
        <aside className="srv-members" aria-label="Is channel ke log">
          <ChannelMembers channelId={view.id} onOpenUser={setProfile} />
        </aside>
      )}

      {showMembers && channelId && (
        <Sheet title="Is channel ke log" onClose={() => setShowMembers(false)}>
          <ChannelMembers channelId={channelId} onOpenUser={(id) => { setShowMembers(false); setProfile(id); }} />
        </Sheet>
      )}
      {profile && <ProfileCard userId={profile} onClose={() => setProfile(null)} onMessage={openDM} />}
      {editing && <ChannelSettings channel={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(id) => { setEditing(null); if (id) openChannel(id); else setView({ kind: 'home' }); }} />}
    </div>
  );
}

/* ================= Channel list (category ke hisaab se) ================= */
function ChannelList({ current, onOpen, onEdit }: { current: string; onOpen: (id: string) => void; onEdit: (c: ServerChannel) => void }) {
  const d = useData();
  const cats = [...new Set(d.server_channels.map((c) => c.category || 'Text Channels'))];
  if (!d.server_channels.length)
    return <div className="empty"><b>Abhi koi channel nahi</b>{d.isOwner ? 'Upar "+ Channel" se pehla channel banayein.' : 'Owner jald channel banayega.'}</div>;
  return (
    <nav className="clist" aria-label="Server channels">
      {cats.map((cat) => (
        <div key={cat} className="ccat">
          <div className="ccat-h">{cat}</div>
          {d.server_channels
            .filter((c) => (c.category || 'Text Channels') === cat)
            .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
            .map((c) => {
              const seen = getSeen(c.id);
              const unread = d.server_messages.filter((m) => m.channel_id === c.id && m.user_id !== d.uid && m.created_at > seen).length;
              return (
                <div key={c.id} className={'citem' + (current === c.id ? ' on' : '') + (unread ? ' unread' : '')}>
                  <button className="citem-main" onClick={() => onOpen(c.id)}>
                    <span className="chash" aria-hidden="true">{c.read_only ? '📢' : '#'}</span>
                    <span className="cname">{c.name}</span>
                    {c.is_private && <span className="cbadge" title="Private channel">🔒</span>}
                    {unread > 0 && <span className="ccount num">{unread}</span>}
                  </button>
                  {d.isOwner && <button className="cgear" onClick={() => onEdit(c)} aria-label={'Settings: ' + c.name}>⚙</button>}
                </div>
              );
            })}
        </div>
      ))}
    </nav>
  );
}

/* ================= Channel chat ================= */
function ChannelChat({ channelId, onBack, onOpenUser, onEdit, onMembers }: { channelId: string; onBack: () => void; onOpenUser: (id: string) => void; onEdit: (c: ServerChannel) => void; onMembers: () => void }) {
  const d = useData();
  const [reply, setReply] = useState<FeedItem | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const ch = d.server_channels.find((c) => c.id === channelId);
  const items = useMemo(() => d.server_messages.filter((m) => m.channel_id === channelId).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-400), [d.server_messages, channelId]);
  const byId = useMemo(() => new Map(d.server_messages.map((m) => [m.id, m as FeedItem])), [d.server_messages]);
  useEffect(() => { markSeen(channelId); }, [channelId, items.length]);
  if (!ch) return <div className="srv-placeholder muted">Ye channel ab maujood nahi ya aap is mein nahi.</div>;
  const canPost = d.isOwner || !ch.read_only;
  const memberCount = ch.is_private ? d.server_channel_members.filter((m) => m.channel_id === ch.id).length : null;

  return (
    <div className="chat-pane">
      <header className="chat-head">
        <button className="back-icon" onClick={onBack} aria-label="Wapas">‹</button>
        <span className="chash big" aria-hidden="true">{ch.read_only ? '📢' : '#'}</span>
        <div className="grow">
          <b>{ch.name}</b>
          <small className="muted block">
            {ch.topic || (ch.read_only ? 'Sirf owner likh sakta hai' : 'Kaam ki baat-cheet')}
            {ch.is_private ? ` · 🔒 Private · ${memberCount} log` : ''}
          </small>
        </div>
        <button className="btn sm members-btn" onClick={onMembers} aria-label="Is channel ke log">👥 {channelPeople(d, ch).length}</button>
        {d.isOwner && <button className="btn sm" onClick={() => onEdit(ch)}>Settings</button>}
      </header>
      <MessageFeed
        items={items}
        byId={byId}
        onReply={canPost ? setReply : undefined}
        canDelete={(m) => d.isOwner || m.user_id === d.uid}
        onDelete={(m) => d.deleteServerMessage(m.id)}
        onOpenUser={onOpenUser}
        onImage={setImg}
        empty={<><b>#{ch.name} mein khush aamdeed</b>{canPost ? 'Pehla message likhein.' : 'Yahan owner ke announcements aayenge.'}</>}
      />
      <Composer
        placeholder={'#' + ch.name}
        disabledNote={canPost ? undefined : 'Is channel mein sirf owner message kar sakta hai.'}
        replyTo={reply}
        onCancelReply={() => setReply(null)}
        onSend={async (body, url) => {
          await d.sendServerMessage(ch.id, body, url, reply?.id || null);
          setReply(null);
        }}
      />
      {img && <ImageViewer url={img} onClose={() => setImg(null)} />}
    </div>
  );
}

/* ================= Is channel ke log (role ke hisaab se, online pehle) ================= */
type DataApi = ReturnType<typeof useData>;
/** public channel: poori team; private channel: sirf add kiye gaye log + owner */
function channelPeople(d: DataApi, ch: ServerChannel): Profile[] {
  const team = d.profiles.filter((p) => p.status === 'approved' || p.is_owner);
  if (!ch.is_private) return team;
  const ids = new Set(d.server_channel_members.filter((m) => m.channel_id === ch.id).map((m) => m.user_id));
  return team.filter((p) => p.is_owner || ids.has(p.id));
}

function ChannelMembers({ channelId, onOpenUser }: { channelId: string; onOpenUser: (id: string) => void }) {
  const d = useData();
  const ch = d.server_channels.find((c) => c.id === channelId);
  if (!ch) return null;
  const people = channelPeople(d, ch);
  const groups = new Map<string, Profile[]>();
  const offline: Profile[] = [];
  people.forEach((p) => {
    if (!d.online.has(p.id)) return offline.push(p);
    const key = p.server_role || (p.is_owner ? 'Owner' : 'Online');
    groups.set(key, [...(groups.get(key) || []), p]);
  });
  const keys = [...groups.keys()].sort((a, b) => {
    const ao = groups.get(a)!.some((p) => p.is_owner), bo = groups.get(b)!.some((p) => p.is_owner);
    if (ao !== bo) return ao ? -1 : 1;
    if (a === 'Online') return 1;
    if (b === 'Online') return -1;
    return a.localeCompare(b);
  });
  const row = (p: Profile, off?: boolean) => (
    <button key={p.id} className={'mrow-btn' + (off ? ' off' : '')} onClick={() => onOpenUser(p.id)}>
      <UserAvatar id={p.id} status />
      <span className="grow">
        <span className={'mname ' + roleTone(p.server_role, p.is_owner)}>{p.full_name || 'Member'}{p.is_owner && ' 👑'}</span>
        {p.server_role && <small className="muted block one-line">{p.server_role}</small>}
      </span>
    </button>
  );
  return (
    <div className="mlist">
      <div className="mlist-title">{ch.is_private ? '🔒 ' : '#'}{ch.name} · {people.length} log</div>
      {keys.map((k) => (
        <div key={k}>
          <div className="ccat-h">{k} — {groups.get(k)!.length}</div>
          {groups.get(k)!.map((p) => row(p))}
        </div>
      ))}
      {offline.length > 0 && (
        <div>
          <div className="ccat-h">Offline — {offline.length}</div>
          {offline.sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || a.full_name.localeCompare(b.full_name)).map((p) => row(p, true))}
        </div>
      )}
    </div>
  );
}

/* ================= Friends + DMs ================= */
function FriendsPane({ current, onOpenDM, onOpenUser }: { current: string; onOpenDM: (peer: string) => void; onOpenUser: (id: string) => void }) {
  const d = useData();
  const toast = useToast();
  const incoming = d.friend_requests.filter((f) => f.to_user === d.uid && f.status === 'pending');
  const outgoing = d.friend_requests.filter((f) => f.from_user === d.uid && f.status === 'pending');
  // baat karne wale log: friends + owner + jin se pehle baat hui
  const peers = new Set<string>();
  d.friend_requests.filter((f) => f.status === 'accepted' && (f.from_user === d.uid || f.to_user === d.uid)).forEach((f) => peers.add(f.from_user === d.uid ? f.to_user : f.from_user));
  d.profiles.filter((p) => p.is_owner && p.id !== d.uid).forEach((p) => peers.add(p.id));
  d.direct_messages.filter((m) => m.from_user === d.uid || m.to_user === d.uid).forEach((m) => peers.add(m.from_user === d.uid ? m.to_user : m.from_user!));
  peers.delete(d.uid);
  const last = (peer: string) =>
    d.direct_messages.filter((m) => (m.from_user === peer && m.to_user === d.uid) || (m.from_user === d.uid && m.to_user === peer)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const others = d.profiles.filter((p) => (p.status === 'approved' || p.is_owner) && p.id !== d.uid && !peers.has(p.id) && !p.is_owner && !d.isOwner && d.friendState(p.id).state !== 'received');
  const list = [...peers].filter((p) => d.profileOf(p)).sort((a, b) => (last(b)?.created_at || '').localeCompare(last(a)?.created_at || ''));
  const act = (fn: () => Promise<void>, ok: string) => fn().then(() => toast(ok), (e) => toast(errorText(e)));

  return (
    <div className="fpane">
      {incoming.length > 0 && (
        <div>
          <div className="ccat-h">Friend requests — {incoming.length}</div>
          {incoming.map((f) => (
            <div key={f.id} className="mrow-btn static">
              <UserAvatar id={f.from_user} status />
              <span className="grow"><span className="mname">{d.nameOf(f.from_user)}</span><small className="muted block">ne friend request bheji</small></span>
              <button className="btn sm primary" onClick={() => act(() => d.respondFriendRequest(f.id, true), 'Ab aap friends hain')}>Accept</button>
              <button className="btn sm" onClick={() => act(() => d.respondFriendRequest(f.id, false), 'Request hata di')}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div className="ccat-h">Direct messages</div>
      {list.length ? (
        list.map((p) => {
          const l = last(p);
          const unread = d.direct_messages.filter((m) => m.from_user === p && m.to_user === d.uid && !m.read_at).length;
          return (
            <button key={p} className={'mrow-btn' + (current === p ? ' on' : '') + (unread ? ' unread' : '')} onClick={() => onOpenDM(p)}>
              <UserAvatar id={p} status />
              <span className="grow">
                <span className="mname">{d.nameOf(p)}</span>
                <small className="muted block one-line">{l ? (l.from_user === d.uid ? 'Aap: ' : '') + (l.body || '📷 Image') : 'Abhi baat nahi hui'}</small>
              </span>
              {unread > 0 && <span className="ccount num">{unread}</span>}
            </button>
          );
        })
      ) : (
        <p className="muted small m0 pad">Abhi koi friend nahi. "Members" mein kisi par tap kar ke friend request bhejein.</p>
      )}
      {others.length > 0 && (
        <div>
          <div className="ccat-h">Team · friend banayein</div>
          {others.map((p) => {
            const st = d.friendState(p.id).state;
            return (
              <div key={p.id} className="mrow-btn static">
                <button className="avbtn" onClick={() => onOpenUser(p.id)}><UserAvatar id={p.id} status /></button>
                <span className="grow"><span className={'mname ' + roleTone(p.server_role, p.is_owner)}>{p.full_name}</span><small className="muted block">{p.server_role || 'Team member'}</small></span>
                {st === 'none' && <button className="btn sm" onClick={() => act(() => d.sendFriendRequest(p.id), 'Friend request bhej di')}>+ Request</button>}
                {st === 'sent' && <span className="muted tiny">Request bheji</span>}
              </div>
            );
          })}
        </div>
      )}
      {outgoing.length > 0 && (
        <div>
          <div className="ccat-h">Bheji hui requests — {outgoing.length}</div>
          {outgoing.map((f) => (
            <div key={f.id} className="mrow-btn static">
              <button className="avbtn" onClick={() => onOpenUser(f.to_user)}><UserAvatar id={f.to_user} status /></button>
              <span className="grow"><span className="mname">{d.nameOf(f.to_user)}</span><small className="muted block">jawab ka intezar</small></span>
              <button className="btn sm" onClick={() => act(() => d.removeFriend(f.id), 'Request wapas le li')}>Wapas lein</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DMChat({ peer, onBack, onOpenUser }: { peer: string; onBack: () => void; onOpenUser: (id: string) => void }) {
  const d = useData();
  const [img, setImg] = useState<string | null>(null);
  const p = d.profileOf(peer);
  const items = useMemo(
    () =>
      d.direct_messages
        .filter((m) => (m.from_user === peer && m.to_user === d.uid) || (m.from_user === d.uid && m.to_user === peer))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .slice(-400)
        .map((m) => ({ ...m, user_id: m.from_user })),
    [d.direct_messages, peer, d.uid]
  );
  useEffect(() => { d.markDMRead(peer).catch(() => {}); }, [peer, items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const allowed = d.canDM(peer);
  const fs = d.friendState(peer);

  return (
    <div className="chat-pane">
      <header className="chat-head">
        <button className="back-icon" onClick={onBack} aria-label="Wapas">‹</button>
        <button className="avbtn" onClick={() => onOpenUser(peer)}><UserAvatar id={peer} status /></button>
        <div className="grow">
          <b>{p?.full_name || 'Member'}</b>
          <small className="muted block">{d.online.has(peer) ? 'Online' : 'Offline'}{p?.server_role ? ' · ' + p.server_role : ''}</small>
        </div>
      </header>
      <div className="policy-note"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>{DM_NOTICE}</div>
      <MessageFeed
        items={items}
        canDelete={(m) => m.user_id === d.uid}
        onDelete={(m) => d.deleteDM(m.id)}
        onOpenUser={onOpenUser}
        onImage={setImg}
        showRead
        empty={<><b>{p?.full_name} ke saath baat shuru karein</b>Kaam ki update, sawal, link ya image bhejein.</>}
      />
      <Composer
        placeholder="Message likhein…"
        disabledNote={allowed ? undefined : fs.state === 'sent' ? 'Friend request bheji hui hai. Accept hone ke baad message kar sakenge.' : 'Message karne ke liye pehle friend banein (profile se request bhejein).'}
        onSend={(body, url) => d.sendDM(peer, body, url)}
      />
      {img && <ImageViewer url={img} onClose={() => setImg(null)} />}
    </div>
  );
}

/* ================= Profile card (friend request, role, message) ================= */
function ProfileCard({ userId, onClose, onMessage }: { userId: string; onClose: () => void; onMessage: (peer: string) => void }) {
  const d = useData();
  const toast = useToast();
  const p = d.profileOf(userId);
  const [role, setRole] = useState(p?.server_role || '');
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  const me = userId === d.uid;
  const fs = d.friendState(userId);
  const roles = [...new Set(d.profiles.map((x) => x.server_role).filter(Boolean))];
  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok); } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  };
  const channels = d.channels.filter((c) => d.rolesOf(c.id, userId).length).map((c) => c.name + ': ' + d.rolesOf(c.id, userId).join(', '));

  return (
    <Sheet title="Profile" onClose={onClose}>
      <div className="pcard">
        <div className="pcard-banner" />
        <div className="pcard-av"><UserAvatar id={userId} status /></div>
        <div className="pcard-body">
          <h2>{p.full_name || 'Member'}{p.is_owner && ' 👑'}</h2>
          <div className="row">
            {p.server_role && <span className={'rtag ' + roleTone(p.server_role, p.is_owner)}>{p.server_role}</span>}
            <span className="muted small">{d.online.has(userId) ? '🟢 Online' : 'Offline'}</span>
          </div>
          {channels.length > 0 && <p className="muted small m0">{channels.join(' · ')}</p>}
        </div>
      </div>

      {!me && (
        <div className="row">
          {d.canDM(userId) && <button className="btn primary" onClick={() => onMessage(userId)}>Message</button>}
          {!p.is_owner && !d.isOwner && fs.state === 'none' && <button className="btn primary" disabled={busy} onClick={() => act(() => d.sendFriendRequest(userId), 'Friend request bhej di')}>+ Friend request</button>}
          {fs.state === 'sent' && <button className="btn" disabled={busy} onClick={() => act(() => d.removeFriend(fs.req!.id), 'Request wapas le li')}>Request bheji hui (wapas lein)</button>}
          {fs.state === 'received' && <button className="btn primary" disabled={busy} onClick={() => act(() => d.respondFriendRequest(fs.req!.id, true), 'Ab aap friends hain')}>Request accept karein</button>}
          {fs.state === 'friends' && <ConfirmButton className="btn" label="Unfriend" confirmLabel="Pakka unfriend?" onConfirm={() => act(() => d.removeFriend(fs.req!.id), 'Unfriend kar diya')} />}
          {d.isOwner && fs.state === 'none' && <span className="muted tiny">Owner ko friend request ki zaroorat nahi.</span>}
        </div>
      )}

      {d.isOwner && (
        <div className="f panel">
          Server role
          <span className="h">Jaise Co-Founder, GM, Script Writer. Member list mein log isi role ke neeche nazar aate hain.</span>
          <div className="att-row">
            <input id="srv-role" type="text" list="srv-roles" maxLength={40} value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Co-Founder" />
            <datalist id="srv-roles">{roles.map((r) => <option key={r} value={r} />)}</datalist>
            <button className="btn primary sm" disabled={busy || role === p.server_role} onClick={() => act(() => d.setServerRole(userId, role.trim()), 'Role save ho gaya')}>Save</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ================= Owner: channel banana / settings ================= */
function ChannelSettings({ channel, onClose, onSaved }: { channel: ServerChannel | null; onClose: () => void; onSaved: (id: string) => void }) {
  const d = useData();
  const toast = useToast();
  const [f, setF] = useState<ServerChannelInput>(() => ({
    id: channel?.id,
    name: channel?.name || '',
    topic: channel?.topic || '',
    category: channel?.category || 'Text Channels',
    position: channel?.position ?? d.server_channels.length,
    is_private: channel?.is_private || false,
    read_only: channel?.read_only || false,
    members: channel ? d.server_channel_members.filter((m) => m.channel_id === channel.id).map((m) => m.user_id) : []
  }));
  const [busy, setBusy] = useState(false);
  const cats = [...new Set(d.server_channels.map((c) => c.category))];
  const team = d.profiles.filter((p) => (p.status === 'approved' || p.is_owner) && !p.is_owner);
  const set = <K extends keyof ServerChannelInput>(k: K, v: ServerChannelInput[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <Sheet title={channel ? '#' + channel.name + ' settings' : 'Naya server channel'} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const name = f.name.trim().toLowerCase().replace(/\s+/g, '-');
          if (!name) return toast('Channel ka naam likhein');
          setBusy(true);
          try {
            const id = await d.saveServerChannel({ ...f, name });
            toast(channel ? 'Channel update ho gaya' : 'Channel ban gaya');
            onSaved(id);
          } catch (err) {
            toast(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="f">
          Channel ka naam
          <div className="hash-input"><span>#</span><input id="sc-name" type="text" maxLength={60} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. afnan-scripts" /></div>
        </label>
        <label className="f">
          Maqsad / topic <span className="h">Is channel mein kya hota hai</span>
          <input id="sc-topic" type="text" maxLength={200} value={f.topic} onChange={(e) => set('topic', e.target.value)} placeholder="e.g. Afnan ki daily scripts yahan" />
        </label>
        <div className="two">
          <label className="f">
            Category
            <input id="sc-cat" type="text" list="sc-cats" maxLength={40} value={f.category} onChange={(e) => set('category', e.target.value)} />
            <datalist id="sc-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="f">
            Tarteeb
            <input id="sc-pos" type="number" min={0} value={f.position} onChange={(e) => set('position', Number(e.target.value) || 0)} />
          </label>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={f.read_only} onChange={(e) => set('read_only', e.target.checked)} />
          <span><b>Sirf owner message kare</b><small className="muted block">Baaqi sab parh sakte hain, likh nahi sakte (announcement jaisa)</small></span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={f.is_private} onChange={(e) => set('is_private', e.target.checked)} />
          <span><b>Private channel</b><small className="muted block">Sirf neeche chune hue log aur owner ise dekh sakte hain</small></span>
        </label>
        {f.is_private && (
          <div className="f">
            Kaun dekh sakta hai ({f.members.length})
            <div className="pick-list">
              {team.map((p) => {
                const on = f.members.includes(p.id);
                return (
                  <button type="button" key={p.id} className={'pick' + (on ? ' on' : '')} onClick={() => set('members', on ? f.members.filter((x) => x !== p.id) : [...f.members, p.id])} aria-pressed={on}>
                    <Avatar name={p.full_name} url={p.avatar_url || undefined} />
                    <span className="grow">{p.full_name}<small className="muted block">{p.server_role || '—'}</small></span>
                    <span className="pick-box">{on ? '✓' : ''}</span>
                  </button>
                );
              })}
              {!team.length && <p className="muted small">Abhi team mein koi approved member nahi.</p>}
            </div>
          </div>
        )}
        <button className="btn primary block" type="submit" disabled={busy}>{busy ? 'Save ho raha hai…' : channel ? 'Save karein' : 'Channel banayein'}</button>
        {channel && (
          <ConfirmButton
            label="Channel delete karein"
            confirmLabel="Pakka? Saare messages bhi delete honge"
            onConfirm={async () => {
              try { await d.deleteServerChannel(channel.id); toast('Channel delete ho gaya'); onSaved(''); } catch (err) { toast(errorText(err)); }
            }}
          />
        )}
      </form>
    </Sheet>
  );
}

/* ================= Owner: Company chat review (sirf owner ko nazar aata hai) ================= */
export function ChatReviewSheet({ onClose }: { onClose: () => void }) {
  const d = useData();
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const key = (m: DirectMessage) => [m.from_user || '', m.to_user].sort().join('|');
  const pairs = new Map<string, DirectMessage[]>();
  d.direct_messages.forEach((m) => pairs.set(key(m), [...(pairs.get(key(m)) || []), m]));
  const rows = [...pairs.entries()]
    .map(([k, ms]) => ({ k, ids: k.split('|') as [string, string], ms: ms.sort((a, b) => a.created_at.localeCompare(b.created_at)) }))
    .filter((r) => !q || r.ids.some((id) => d.nameOf(id).toLowerCase().includes(q.toLowerCase())) || r.ms.some((m) => m.body.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.ms[b.ms.length - 1].created_at.localeCompare(a.ms[a.ms.length - 1].created_at));
  const cur = pair ? pairs.get([...pair].sort().join('|')) || [] : [];

  return (
    <Sheet title="Company chat review" onClose={onClose}>
      <div className="note">Ye hissa sirf owner ko nazar aata hai. Team ko DM screen par bataya gaya hai ke company chat review ho sakti hai.</div>
      {!pair ? (
        <>
          <input id="rv-q" type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Naam ya baat dhoondein…" />
          <div className="list">
            {rows.map((r) => {
              const lastM = r.ms[r.ms.length - 1];
              return (
                <button className="li" key={r.k} onClick={() => setPair(r.ids)}>
                  <span className="pair-av"><UserAvatar id={r.ids[0]} /><UserAvatar id={r.ids[1]} /></span>
                  <span className="grow">
                    <span className="t block">{d.nameOf(r.ids[0])} ↔ {d.nameOf(r.ids[1])}</span>
                    <span className="d block one-line">{lastM.body || '📷 Image'}</span>
                  </span>
                  <span className="muted tiny right">{r.ms.length} msg<br />{fmtDate(lastM.created_at.slice(0, 10))} {fmtClock(lastM.created_at)}</span>
                </button>
              );
            })}
            {!rows.length && <div className="empty">Koi direct message nahi mila.</div>}
          </div>
        </>
      ) : (
        <>
          <button className="back" onClick={() => setPair(null)}>‹ Saari chats</button>
          <b>{d.nameOf(pair[0])} ↔ {d.nameOf(pair[1])}</b>
          <MessageFeed items={cur.map((m) => ({ ...m, user_id: m.from_user }))} onImage={setImg} empty="Koi message nahi" />
        </>
      )}
      {img && <ImageViewer url={img} onClose={() => setImg(null)} />}
    </Sheet>
  );
}
