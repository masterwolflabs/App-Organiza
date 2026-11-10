'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Check, Volume2, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { addDays, expand, fmtTime, startOfDay, type CalEvent } from '@/components/calendar/model';
import { useSpace } from '@/components/organiza/space';
import { playSound, SOUNDS, useAvisos, type Prefs } from '@/components/organiza/useAvisos';

const card = 'rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5';
const when = (iso: string) => new Date(iso).toLocaleString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
type Person = { id: string; name: string };

/** Avisos: invitaciones por responder, notificaciones, disponibilidad compartida y preferencias. */
export const AvisosView: React.FC = () => {
  const a = useAvisos();
  useEffect(() => {
    const t = setTimeout(() => a.readAll(), 1500);
    return () => clearTimeout(t);
  }, [a.readAll]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggles: [keyof Prefs, string, string][] = [
    ['notifications', 'Notificaciones', 'Invitaciones y respuestas'],
    ['reminders', 'Recordatorios', 'Los avisos antes de cada evento'],
    ['sounds', 'Sonidos', 'Suena cuando llega un aviso'],
  ];
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="font-display text-4xl font-semibold text-white sm:text-5xl">Avisos</h1>
        <p className="mt-2 text-zinc-400">Tus invitaciones, notificaciones y a quién le muestras tu disponibilidad.</p>
      </header>
      {a.invites.length > 0 && (
        <section className={card}>
          <h2 className="text-lg font-semibold text-white">Invitaciones</h2>
          <ul className="mt-2 divide-y divide-white/5">
            {a.invites.map((i) => (
              <li key={i.event_id} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="min-w-0 flex-1"><b className="block truncate font-semibold text-white">{i.title}</b><span className="text-sm text-zinc-400">{i.who} · {when(i.starts_at)}</span></span>
                <button type="button" onClick={() => a.answer(i.event_id, 'aceptada')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-[#fff] hover:bg-emerald-500"><Check className="h-4 w-4" /> Aceptar</button>
                <button type="button" onClick={() => a.answer(i.event_id, 'rechazada')} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-300 ring-1 ring-white/15 hover:bg-white/[0.06]"><X className="h-4 w-4" /> Rechazar</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className={card}>
        <h2 className="text-lg font-semibold text-white">Notificaciones</h2>
        {!a.notices.length ? <p className="mt-2 text-sm text-zinc-400"><Bell className="mr-1 inline h-4 w-4" /> Todavía no tienes avisos.</p> : (
          <ul className="mt-2 divide-y divide-white/5">
            {a.notices.map((n) => (
              <li key={n.id} className="py-2.5">
                <a href={n.link ?? '#avisos'} className="block">
                  <b className={`block text-sm font-semibold ${n.read_at ? 'text-zinc-300' : 'text-white'}`}>{!n.read_at && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sky-400" />}{n.title}</b>
                  <span className="text-sm text-zinc-400">{n.body}</span>
                  <span className="block text-xs text-zinc-500">{when(n.created_at)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Availability />
      <section className={card}>
        <h2 className="text-lg font-semibold text-white">Preferencias</h2>
        <div className="mt-2 space-y-1">
          {toggles.map(([k, title, hint]) => (
            <label key={k} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-2">
              <span><b className="block text-sm font-semibold text-white">{title}</b><span className="text-xs text-zinc-400">{hint}</span></span>
              <input type="checkbox" checked={!!a.prefs[k]} onChange={(e) => a.setPrefs({ [k]: e.target.checked })} className="h-4 w-4 accent-sky-500" />
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-2 px-1 py-2">
            <span className="mr-auto text-sm font-semibold text-white">Sonido</span>
            {SOUNDS.map((s) => (
              <button key={s.id} type="button" aria-pressed={a.prefs.sound === s.id} onClick={() => { a.setPrefs({ sound: s.id }); playSound(s.id); }} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${a.prefs.sound === s.id ? 'bg-sky-600 text-[#fff] ring-sky-500' : 'text-zinc-300 ring-white/15'}`}><Volume2 className="h-3 w-3" /> {s.label}</button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

/** Solo libre u ocupado: nadie ve títulos, y cada persona decide quién puede mirar. */
const Availability: React.FC = () => {
  const { userId } = useSpace();
  const [people, setPeople] = useState<Person[]>([]);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [shared, setShared] = useState<string[]>([]);
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState<CalEvent[]>([]);
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [p, mine, theirs] = await Promise.all([
        supabase.from('profiles').select('id, "displayName"'),
        supabase.from('organiza_availability').select('viewer_id').eq('owner_id', userId),
        supabase.from('organiza_availability').select('owner_id').eq('viewer_id', userId),
      ]);
      setPeople(((p.data ?? []) as { id: string; displayName: string | null }[]).filter((x) => x.id !== userId && x.displayName).map((x) => ({ id: x.id, name: x.displayName! })).sort((x, y) => x.name.localeCompare(y.name)));
      setAllowed(((mine.data ?? []) as { viewer_id: string }[]).map((x) => x.viewer_id));
      setShared(((theirs.data ?? []) as { owner_id: string }[]).map((x) => x.owner_id));
    })();
  }, [userId]);
  const today = useMemo(() => startOfDay(new Date()), []);
  useEffect(() => {
    if (!who) return setBusy([]);
    supabase.rpc('organiza_busy', { p_owner: who, p_from: today.toISOString(), p_to: addDays(today, 7).toISOString() }).then(({ data }) => setBusy(((data ?? []) as Partial<CalEvent>[]).map((x, i) => ({ ...x, id: String(i), status: 'confirmado' }) as CalEvent)));
  }, [who, today]);
  const toggle = async (id: string) => {
    const on = allowed.includes(id);
    setAllowed((l) => (on ? l.filter((x) => x !== id) : [...l, id]));
    if (on) await supabase.from('organiza_availability').delete().eq('owner_id', userId ?? '').eq('viewer_id', id);
    else await supabase.from('organiza_availability').insert({ owner_id: userId, viewer_id: id });
  };
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const occ = expand(busy, today, addDays(today, 7));
  const field = 'w-full rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none ring-1 ring-white/10';
  return (
    <section className={card}>
      <h2 className="text-lg font-semibold text-white">Disponibilidad</h2>
      <p className="mt-1 text-sm text-zinc-400">Solo se ve libre u ocupado, nunca los títulos.</p>
      <label className="mt-3 block text-xs font-semibold text-zinc-400">Ver la de
        <select value={who} onChange={(e) => setWho(e.target.value)} className={`${field} mt-1`}>
          <option value="" className="bg-zinc-900">{shared.length ? 'Elige una persona' : 'Nadie te ha compartido la suya'}</option>
          {people.filter((p) => shared.includes(p.id)).map((p) => <option key={p.id} value={p.id} className="bg-zinc-900">{p.name}</option>)}
        </select>
      </label>
      {who && (
        <ul className="mt-3 space-y-1 text-sm">
          {week.map((d) => {
            const list = occ.filter((o) => o.start < addDays(d, 1) && o.end > d).sort((x, y) => +x.start - +y.start);
            return <li key={+d} className="flex gap-3"><span className="w-24 shrink-0 capitalize text-zinc-400">{d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' })}</span><span className="text-zinc-200">{list.length ? list.map((o) => `${fmtTime(o.start)}–${fmtTime(o.end)}`).join(' · ') : 'Libre'}</span></li>;
          })}
        </ul>
      )}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-300">Quién puede ver la mía ({allowed.length})</summary>
        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {people.map((p) => <label key={p.id} className="flex items-center gap-2 text-sm text-zinc-200"><input type="checkbox" checked={allowed.includes(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-sky-500" /> {p.name}</label>)}
        </div>
      </details>
    </section>
  );
};
