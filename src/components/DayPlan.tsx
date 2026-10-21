import { useMemo, useRef } from 'react';
import { useData } from '../lib/data';
import type { Task } from '../lib/types';
import { DAYS_LONG, DAYS_UR, addDays, fmtDate, isToday, roleClass, roleTimeText, todayKey, weekdayOf } from '../lib/utils';
import { TaskBoard } from './Tasks';
import { ROLE_WORK, hasWork } from './TaskWork';
import { channelHue } from './Cards';

/**
 * v15: kisi bhi din ka kaam dekhein — kal, parson, agla hafta, pichla hafta.
 * Guzre din: asal tasks (kya hua, kab hua). Aane wale din: channel ke schedule se banne wala kaam
 * + jo EP (title / script / voiceover…) advance mein lag chuka hai.
 */

const SHORT = ['Itw', 'Pir', 'Mng', 'Bdh', 'Jmrt', 'Jum', 'Hfta'];

export function DayStrip({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  const today = todayKey();
  const inp = useRef<HTMLInputElement>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(value, i - 3));
  const rel = (k: string) => (k === today ? 'Aaj' : k === addDays(today, 1) ? 'Aane wala kal' : k === addDays(today, -1) ? 'Guzra kal' : '');
  return (
    <div className="daystrip" role="group" aria-label="Din chunein">
      <button type="button" className="ds-arrow" onClick={() => onChange(addDays(value, -7))} aria-label="Pichla hafta">‹</button>
      <div className="ds-days">
        {days.map((k) => (
          <button
            type="button"
            key={k}
            className={'ds-day' + (k === value ? ' on' : '') + (k === today ? ' today' : '') + (k < today ? ' past' : '')}
            onClick={() => onChange(k)}
            aria-pressed={k === value}
            aria-label={DAYS_LONG[weekdayOf(k)] + ' ' + fmtDate(k)}
          >
            <small>{SHORT[weekdayOf(k)]}</small>
            <b className="num">{Number(k.slice(8))}</b>
          </button>
        ))}
      </div>
      <button type="button" className="ds-arrow r" onClick={() => onChange(addDays(value, 7))} aria-label="Agla hafta">›</button>
      <span className="ds-tools">
        {value !== today && (
          <button type="button" className="btn sm" onClick={() => onChange(today)}>Aaj</button>
        )}
        <button type="button" className="btn sm icon-btn" onClick={() => { try { inp.current?.showPicker?.(); } catch { inp.current?.click(); } }} aria-label="Calendar se date chunein" title="Calendar">
          📅
        </button>
        <input ref={inp} type="date" className="ds-native" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} tabIndex={-1} aria-hidden="true" />
      </span>
      <div className="ds-label">
        <b>{(rel(value) ? rel(value) + ' · ' : '') + DAYS_UR[weekdayOf(value)]}</b>
        <span className="muted">{fmtDate(value)}</span>
      </div>
    </div>
  );
}

interface Planned { key: string; channel_id: string; user_id: string; role: string }

/** Aane wale din ka kaam (schedule se) — abhi task bana nahi, sirf plan */
function usePlanned(day: string, userId?: string): Planned[] {
  const d = useData();
  return useMemo(() => {
    const out: Planned[] = [];
    d.channels.forEach((c) => {
      if (!isToday(c, day)) return;
      d.channel_members
        .filter((m) => m.channel_id === c.id && (!userId || m.user_id === userId))
        .forEach((m) => {
          const p = d.profileOf(m.user_id);
          if (!p || (p.status !== 'approved' && !p.is_owner)) return;
          (m.roles || []).forEach((role) => out.push({ key: c.id + m.user_id + role, channel_id: c.id, user_id: m.user_id, role }));
        });
    });
    return out;
  }, [d.channels, d.channel_members, day, userId]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function DayTasks({ day, userId, showName, now, onOpenChannel, foldId }: { day: string; userId?: string; showName?: boolean; now: number; onOpenChannel?: (id: string) => void; foldId: string }) {
  const d = useData();
  const today = todayKey();
  const real: Task[] = useMemo(() => d.tasks.filter((t) => t.day === day && (!userId || t.user_id === userId)), [d.tasks, day, userId]);
  const planned = usePlanned(day, userId);

  if (day <= today) {
    const tooOld = day < addDays(today, -125);
    return (
      <TaskBoard
        tasks={real}
        now={now}
        showName={showName}
        onOpenChannel={onOpenChannel}
        foldId={foldId}
        emptyTitle={'Is din (' + fmtDate(day) + ') koi task nahi'}
        emptyAll={tooOld ? 'App mein pichle ~4 mahine ka record hota hai.' : 'Is din kisi channel ka kaam ka din nahi tha.'}
      />
    );
  }

  // ---- aane wala din ----
  const custom = real.filter((t) => t.kind === 'custom');
  const daily = planned.filter((p) => !real.some((t) => t.kind === 'daily' && t.channel_id === p.channel_id && t.user_id === p.user_id && t.role === p.role));
  const order: string[] = [];
  daily.forEach((p) => !order.includes(p.channel_id) && order.push(p.channel_id));
  if (!daily.length && !custom.length) {
    return <div className="empty"><b>{`${DAYS_UR[weekdayOf(day)]} (${fmtDate(day)}) koi kaam nahi`}</b>Is din kisi channel ka kaam ka din nahi.</div>;
  }
  return (
    <div className="plan">
      <p className="muted tiny m0">📅 Aane wala din — tasks us din khud ban jayenge. Kaam pehle se karna ho to channel kholein → "Nai video" → yahi din chunein.</p>
      {order.map((cid) => {
        const ch = d.channels.find((c) => c.id === cid)!;
        const ep = d.videos.find((v) => v.channel_id === cid && v.day === day);
        const rows = daily.filter((p) => p.channel_id === cid);
        return (
          <div key={cid} className="plan-ch" style={{ ['--hue' as string]: channelHue(cid) }}>
            <button type="button" className="plan-ch-h" onClick={onOpenChannel ? () => onOpenChannel(cid) : undefined}>
              <span className="plan-dot" aria-hidden="true" />
              <b data-notr>{ch.name}</b>
              {ep ? <span className="chip good sm" data-notr>EP: {ep.title}</span> : <span className="chip sm muted">EP abhi nahi bana</span>}
            </button>
            <div className="plan-rows">
              {rows.map((p) => {
                const w = ROLE_WORK[p.role];
                const ready = w && hasWork(w.kind, ep);
                return (
                  <div className="plan-row" key={p.key}>
                    <span className={'role ' + roleClass(p.role)}>{p.role}</span>
                    {showName && <span className="plan-who" data-notr>{d.nameOf(p.user_id)}</span>}
                    <span className="muted small grow">{roleTimeText(ch, p.role)}</span>
                    {w && <span className={'chip sm ' + (ready ? 'good' : '')}>{ready ? '✓ ' + w.done : w.icon + ' baqi'}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {custom.length > 0 && (
        <TaskBoard tasks={custom} now={now} showName={showName} onOpenChannel={onOpenChannel} foldId={foldId + '-c'} emptyAll="" />
      )}
    </div>
  );
}
