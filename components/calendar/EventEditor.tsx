'use client';

import { supabase } from '@/lib/supabaseClient';
import { useNotesBridge } from '@/components/notes/NotesBridge';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Lock, MapPin, Trash2, Users, Video, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { EntityChip, EntityMenu, type Entity } from '@/components/calendar/EntityPicker';
import {
  BYDAY, COLORS, fromInputs, KINDS, logistics, presetToRrule, REPEATS, rruleDays, rruleToPreset, toDateInput, toTimeInput,
  type CalEvent, type EventKind, type EventMode, type Occurrence, type RepeatPreset,
} from './model';
import type { Area } from './organiza';
import type { Directory } from './useCalendar';
import { useDb } from '@/components/organiza/db';
import { useSpace } from '@/components/organiza/space';
import { DEFAULT_PREP, TRAVEL, dayKey, loadPrep, mapsUrl, prepBlocks, prepSummary, savePrep, type Prep } from './eventPrep';

export type Draft = Partial<CalEvent> & { start: Date; end: Date };

type Props = {
  draft: Draft;
  /** Dentro de una app: el evento queda en esa app y no se ofrece cambiarla. */
  lockApp?: string;
  /** Organiza: áreas de vida. Sin áreas (falta el SQL 24) se ofrecen los tipos. */
  areas?: Area[];
  dir: Directory;
  userId: string;
  isMw: boolean;
  readOnly: boolean;
  /** Occurrences around the event's day (for the logistics warnings). */
  around: (start: Date, end: Date) => Occurrence[];
  /** true / the saved event (with its id, needed for the «antes y después» of a new one) = saved. */
  onSave: (patch: Partial<CalEvent> & { id?: string }) => Promise<boolean | { id: string } | null>;
  onDelete: (id: string) => void;
  onClose: () => void;
};

const WEEK = [['MO', 'L'], ['TU', 'Ma'], ['WE', 'Mi'], ['TH', 'J'], ['FR', 'V'], ['SA', 'S'], ['SU', 'D']] as const;
const field = 'w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-sky-400/50 focus:outline-none [color-scheme:dark]';
const label = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-white/40';

/** Side panel to create / edit one event (a recurring one edits its whole series). */
const REMINDERS = [
  { minutes: 7200, label: '5 días' },
  { minutes: 4320, label: '3 días' },
  { minutes: 1440, label: '1 día' },
];
const EVENT_PLAN = '<h2>📝 Notas</h2><p></p><h2>✅ Preparación</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul><h2>🔗 Enlaces y archivos</h2><p></p>';

export function EventEditor({ draft, lockApp, areas = [], dir, userId, isMw, readOnly, around, onSave, onDelete, onClose }: Props) {
  const isNew = !draft.id;
  const [title, setTitle] = useState(draft.title ?? '');
  const [kind, setKind] = useState<EventKind>(draft.kind ?? (areas.length ? 'personal' : 'evento'));
  const [areaId, setAreaId] = useState<string | null>(draft.area_id ?? null);
  const [app, setApp] = useState(draft.app ?? 'nube');
  const [allDay, setAllDay] = useState(draft.all_day ?? false);
  const [date, setDate] = useState(toDateInput(draft.start));
  const [t1, setT1] = useState(toTimeInput(draft.start));
  const [endDate, setEndDate] = useState(toDateInput(draft.end));
  const [t2, setT2] = useState(toTimeInput(draft.end));
  // Días (Daily «MODIFICACIÓN 01», 2026-11-16): one row of 7 day buttons replaces «Día» + «Se repite».
  // None = only that date · some = every week on those days · all 7 = every day. «Más opciones»: each month / year.
  const [repeat, setRepeat] = useState<RepeatPreset>(rruleToPreset(draft.rrule ?? null));
  const [days, setDays] = useState<string[]>(() => {
    const p = rruleToPreset(draft.rrule ?? null);
    const all = WEEK.map(([id]) => id as string);
    return p === 'daily' ? all : p === 'weekdays' ? all.slice(0, 5) : p === 'weekly' ? rruleDays(draft.rrule) : [];
  });
  // An existing rule (e.g. from Google, every 2 weeks) stays exactly as it was until the days are touched.
  const [touched, setTouched] = useState(false);
  const [moreRepeat, setMoreRepeat] = useState(repeat === 'monthly' || repeat === 'yearly');
  const [mode, setMode] = useState<EventMode | null>(draft.mode ?? null);
  const [location, setLocation] = useState(draft.location ?? '');
  const [meetingUrl, setMeetingUrl] = useState(draft.meeting_url ?? '');
  const [description, setDescription] = useState(draft.description ?? '');
  const [shared, setShared] = useState(draft.owner_scope === 'mw');
  const [color, setColor] = useState<string | null>(draft.color ?? null);
  const [reminders, setReminders] = useState<number[]>(draft.reminders ?? []);
  const [customHours, setCustomHours] = useState('');
  const bridge = useNotesBridge();
  const [tentative, setTentative] = useState(draft.status === 'tentativo');
  const [users, setUsers] = useState<string[]>(draft.attendee_users ?? []);
  const [people, setPeople] = useState<string[]>(draft.attendee_people ?? []);
  const [clients, setClients] = useState<string[]>(draft.attendee_clients ?? []);
  const [emails, setEmails] = useState((draft.attendee_emails ?? []).join(', '));
  const [menu, setMenu] = useState<{ which: 'users' | 'people' | 'clients'; anchor: DOMRect } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  // «Antes y después» (Emanuel, 2026-11-16): bloques de preparación y viaje, solo en Organiza.
  const db = useDb();
  const { space } = useSpace();
  const [prepOn, setPrepOn] = useState(false);
  const [prep, setPrep] = useState<Prep>(DEFAULT_PREP);
  const hadPrep = useRef(false);
  const oldDays = [dayKey(new Date(draft.start.getTime() - 86400000)), dayKey(draft.start), dayKey(draft.end)];
  useEffect(() => {
    if (!draft.id || draft.id.startsWith('new:')) return;
    loadPrep(db, space, draft.id, oldDays).then((p) => {
      if (!p) return;
      hadPrep.current = true;
      setPrep(p);
      setPrepOn(true);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isNew) titleRef.current?.focus();
  }, [isNew]);

  const start = allDay ? fromInputs(date, '00:00') : fromInputs(date, t1);
  const end = allDay ? fromInputs(endDate, '23:59') : fromInputs(endDate, t2);
  const valid = end >= start;
  const byMonthYear = repeat === 'monthly' || repeat === 'yearly';
  const pickDays = (next: string[]) => {
    setTouched(true);
    if (byMonthYear) setRepeat('');
    setDays(WEEK.map(([id]) => id as string).filter((id) => next.includes(id)));
  };
  const toggleDay = (d: string) => pickDays(days.includes(d) && !byMonthYear ? days.filter((x) => x !== d) : [...(byMonthYear ? [] : days), d]);
  const rrule = !touched && draft.rrule ? draft.rrule : byMonthYear ? presetToRrule(repeat, start) : days.length === 7 ? 'FREQ=DAILY' : days.length ? `FREQ=WEEKLY;BYDAY=${days.join(',')}` : null;

  const warnings = useMemo(
    () => (valid ? logistics({ id: draft.id, start, end, mode, location, all_day: allDay }, around(start, end)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date, t1, endDate, t2, allDay, mode, location, valid],
  );

  // Moving the start keeps the length (like Google / Notion Calendar).
  const len = draft.end.getTime() - draft.start.getTime();
  const moveStart = (d: string, t: string) => {
    const s = fromInputs(d, t);
    const prevLen = Math.max(0, fromInputs(endDate, t2).getTime() - fromInputs(date, t1).getTime()) || len;
    const e = new Date(s.getTime() + prevLen);
    setDate(d); setT1(t); setEndDate(toDateInput(e)); setT2(toTimeInput(e));
  };

  const lists: Record<'users' | 'people' | 'clients', { items: Entity[]; values: string[]; set: (v: string[]) => void; title: string }> = {
    users: { items: dir.users.filter((u) => u.id !== userId), values: users, set: setUsers, title: 'Equipo (con cuenta)' },
    people: { items: dir.people, values: people, set: setPeople, title: 'Personas' },
    clients: { items: dir.clients, values: clients, set: setClients, title: 'Clientes' },
  };

  const submit = async () => {
    if (readOnly || busy) return;
    if (!valid) return setError('El término es antes del inicio.');
    setBusy(true);
    setError(null);
    const ok = await onSave({
      id: draft.id,
      title: title.trim() || 'Sin título',
      kind,
      app,
      all_day: allDay,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      rrule,
      mode,
      location: mode === 'presencial' ? location.trim() || null : null,
      meeting_url: mode === 'online' ? meetingUrl.trim() || null : null,
      description: description.trim() || null,
      owner_scope: shared ? 'mw' : (draft.owner_id ?? userId),
      color,
      status: tentative ? 'tentativo' : 'confirmado',
      reminders,
      attendee_users: users,
      attendee_people: people,
      attendee_clients: clients,
      attendee_emails: emails.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => /.+@.+\..+/.test(e)),
      ...(areas.length ? { area_id: areaId } : {}),
      ...(draft.goal_id ? { goal_id: draft.goal_id } : {}),
      ...(draft.series_id ? { series_id: draft.series_id } : {}),
      ...(isNew ? { source: draft.source ?? 'manual', time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone } : {}),
    });
    if (ok) {
      const id = typeof ok === 'object' ? ok.id : draft.id;
      const want = prepOn && mode === 'presencial' && !allDay;
      if (id && !id.startsWith('new:') && (want || hadPrep.current))
        await savePrep(db, space, id, want ? prepBlocks(id, title, start, end, prep) : [], [...oldDays, dayKey(new Date(start.getTime() - 86400000)), dayKey(start), dayKey(end)]).catch(() => {});
    }
    setBusy(false);
    if (!ok) setError('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
    else onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (menu) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const who = (which: 'users' | 'people' | 'clients') => {
    const l = lists[which];
    return (
      <div key={which}>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-white/50">{l.title}</span>
          {!readOnly && (
            <button
              type="button"
              onClick={(e) => setMenu({ which, anchor: e.currentTarget.getBoundingClientRect() })}
              className="rounded-md px-1.5 py-0.5 text-xs text-sky-300 hover:bg-sky-400/10"
            >
              + Agregar
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {l.values.map((id) => {
            const ent = l.items.find((x) => x.id === id);
            return (
              <span key={id} className="flex items-center gap-1 rounded-full bg-white/5 py-0.5 pl-0.5 pr-1.5 text-xs">
                <EntityChip entity={ent ?? { id, name: '…' }} size={20} />
                {!readOnly && (
                  <button type="button" onClick={() => l.set(l.values.filter((v) => v !== id))} className="text-white/40 hover:text-white">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] bg-black/30" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-[91] flex w-full max-w-[440px] flex-col border-l border-white/10 bg-[#101218] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="text-sm font-semibold text-white/80">{draft.series_id && isNew ? 'Solo este día' : isNew ? 'Nuevo evento' : readOnly ? 'Evento' : 'Editar evento'}</span>
          {readOnly && <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/50"><Lock className="h-3 w-3" /> Te invitaron · solo lectura</span>}
          <button onClick={onClose} className="ml-auto rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        <fieldset disabled={readOnly} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.metaKey && !e.ctrlKey && submit()}
            placeholder="Título del evento"
            className="w-full bg-transparent text-xl font-semibold text-white placeholder:text-white/25 focus:outline-none"
          />

          <div className="flex flex-wrap gap-1.5">
            {areas.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAreaId(areaId === a.id ? null : a.id)}
                aria-pressed={areaId === a.id}
                className={`rounded-full px-2.5 py-1 text-xs transition ${areaId === a.id ? 'text-white ring-1' : 'bg-white/[0.04] text-white/55 hover:bg-white/10'}`}
                style={areaId === a.id ? { background: `${a.color}30`, ['--tw-ring-color' as string]: `${a.color}90` } : undefined}
              >
                {a.emoji} {a.name}
              </button>
            ))}
            {!areas.length && KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={`rounded-full px-2.5 py-1 text-xs transition ${kind === k.id ? 'text-white ring-1' : 'bg-white/[0.04] text-white/55 hover:bg-white/10'}`}
                style={kind === k.id ? { background: `${k.color}30`, ['--tw-ring-color' as string]: `${k.color}90` } : undefined}
              >
                {k.emoji} {k.label}
              </button>
            ))}
          </div>

          <div className="space-y-2 rounded-xl bg-white/[0.03] p-3">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input type="date" value={date} onChange={(e) => moveStart(e.target.value, t1)} className={field} />
              {!allDay && <input type="time" step={300} value={t1} onChange={(e) => moveStart(date, e.target.value)} className={field} />}
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={field} />
              {!allDay && <input type="time" step={300} value={t2} onChange={(e) => setT2(e.target.value)} className={field} />}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/70">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Todo el día</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={tentative} onChange={(e) => setTentative(e.target.checked)} /> Por confirmar</label>
            </div>
            {!draft.series_id && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-white/50">{byMonthYear ? 'Se repite ' + (repeat === 'monthly' ? `cada mes el día ${start.getDate()}` : 'cada año') : days.length === 7 ? 'Todos los días' : days.length ? 'Se repite esos días, cada semana' : 'Días · sin marcar = solo esta fecha'}</span>
                  <button type="button" onClick={() => pickDays(days.length === 7 && !byMonthYear ? [] : WEEK.map(([id]) => id as string))} className="rounded-md px-1.5 py-0.5 text-xs text-sky-300 hover:bg-sky-400/10">
                    {days.length === 7 && !byMonthYear ? 'Ninguno' : 'Todos'}
                  </button>
                </div>
                <div className="flex gap-1.5">
                  {WEEK.map(([id, l]) => {
                    const on = !byMonthYear && days.includes(id);
                    return (
                      <button key={id} type="button" onClick={() => toggleDay(id)} aria-pressed={on} aria-label={`Repetir ${id}`} className={`h-8 w-8 rounded-full text-xs font-medium transition ${on ? 'bg-sky-500 text-black' : 'bg-white/[0.06] text-white/55 hover:bg-white/10'}`}>
                        {l}
                      </button>
                    );
                  })}
                </div>
                {moreRepeat ? (
                  <select value={byMonthYear ? repeat : ''} onChange={(e) => { setTouched(true); setRepeat(e.target.value as RepeatPreset); }} aria-label="Más opciones de repetición" className={`${field} w-auto`}>
                    <option value="">Los días de arriba</option>
                    {REPEATS.filter((r) => r.id === 'monthly' || r.id === 'yearly').map((r) => <option key={r.id} value={r.id}>{r.label(start)}</option>)}
                  </select>
                ) : (
                  <button type="button" onClick={() => setMoreRepeat(true)} className="text-[11px] text-white/40 hover:text-white/70">Más opciones (cada mes, cada año)</button>
                )}
              </div>
            )}
            {draft.rrule && !isNew && <p className="text-[11px] text-white/40">Se repite: los cambios aplican a toda la serie.</p>}
          </div>

          {warnings.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3">
              {warnings.map((w, i) => (
                <p key={i} className="flex gap-2 text-sm text-amber-100/90">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /> {w.text}
                </p>
              ))}
            </div>
          )}

          <div>
            <span className={label}>Dónde</span>
            <div className="mb-2 flex gap-1.5">
              {([[null, 'Sin lugar'], ['presencial', 'Presencial'], ['online', 'Online']] as const).map(([m, l]) => (
                <button key={l} type="button" onClick={() => setMode(m)} className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs ${mode === m ? 'bg-sky-400/15 text-sky-200 ring-1 ring-sky-400/40' : 'bg-white/[0.04] text-white/55 hover:bg-white/10'}`}>
                  {m === 'presencial' && <MapPin className="h-3 w-3" />}
                  {m === 'online' && <Video className="h-3 w-3" />}
                  {l}
                </button>
              ))}
            </div>
            {mode === 'presencial' && <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Dirección o lugar" className={field} />}
            {mode === 'online' && (
              <div className="flex gap-2">
                <input value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="Link de Meet / Zoom" className={field} />
                {/^https?:\/\//.test(meetingUrl) && (
                  <a href={meetingUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg bg-sky-500/20 px-3 py-1.5 text-sm text-sky-100 hover:bg-sky-500/30">Unirse</a>
                )}
              </div>
            )}
          </div>

          {mode === 'presencial' && !allDay && (() => {
            const chip = (on: boolean) => `rounded-lg px-2 py-1 text-xs ${on ? 'bg-sky-400/15 text-sky-200 ring-1 ring-sky-400/40' : 'bg-white/[0.04] text-white/55 hover:bg-white/10'}`;
            const row = (lbl: string, values: [number, string][], key: 'arreglarse' | 'ducha' | 'margen') => (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="w-24 shrink-0 text-xs text-white/60">{lbl}</span>
                {values.map(([v, l]) => (
                  <button key={v} type="button" disabled={readOnly} onClick={() => setPrep({ ...prep, [key]: v })} className={chip(prep[key] === v)}>
                    {l}
                  </button>
                ))}
              </div>
            );
            const summary = prepSummary(start, prep);
            return (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <label className="flex cursor-pointer items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">🧭 Antes y después</span>
                  <input type="checkbox" checked={prepOn} disabled={readOnly} onChange={(e) => setPrepOn(e.target.checked)} className="h-4 w-4 accent-sky-500" data-help="Arma en tu Horario la ducha, el arreglarte y el trayecto (ida y vuelta). Solo en Organiza: no se mandan a Google." />
                </label>
                {!prepOn && <p className="mt-1 text-xs text-white/40">¿Te arreglas, te duchas, cuánto te demoras en llegar? Actívalo y lo agendo en tu Horario.</p>}
                {prepOn && (
                  <div className="mt-3 space-y-2">
                    {row('💄 Arreglarme', [[0, 'No'], [15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 h']], 'arreglarse')}
                    {row('🚿 Ducha', [[0, 'Ya me duché'], [10, '10 min'], [15, '15 min'], [20, '20 min']], 'ducha')}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="w-24 shrink-0 text-xs text-white/60">Cómo voy</span>
                      {TRAVEL.map((t) => (
                        <button key={t.id} type="button" disabled={readOnly} onClick={() => setPrep({ ...prep, medio: t.id })} className={chip(prep.medio === t.id)}>
                          {t.emoji} {t.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="w-24 shrink-0 text-xs text-white/60">🗺️ Trayecto</span>
                      <input type="number" min={0} max={600} inputMode="numeric" disabled={readOnly} value={prep.trayecto || ''} onChange={(e) => setPrep({ ...prep, trayecto: Math.max(0, Math.min(600, Math.round(Number(e.target.value) || 0))) })} placeholder="0" className={`${field.replace('w-full', 'w-20')}`} />
                      <span className="text-xs text-white/50">min</span>
                      {location.trim() ? (
                        <a href={mapsUrl(location.trim(), prep.medio)} target="_blank" rel="noreferrer" className="rounded-lg bg-sky-500/20 px-2.5 py-1 text-xs font-semibold text-sky-100 hover:bg-sky-500/30" data-help="Abre Google Maps con la ruta desde donde estás; mira los minutos y escríbelos aquí">
                          Ver en Google Maps ↗
                        </a>
                      ) : (
                        <span className="text-[11px] text-white/35">Escribe la dirección arriba para ver la ruta en Google Maps.</span>
                      )}
                    </div>
                    {row('⏱️ Margen', [[0, 'Sin margen'], [10, '10 min'], [15, '15 min'], [30, '30 min']], 'margen')}
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
                      <input type="checkbox" checked={prep.vuelta} disabled={readOnly} onChange={(e) => setPrep({ ...prep, vuelta: e.target.checked })} className="h-3.5 w-3.5 accent-sky-500" />
                      🏠 Agendar también la vuelta (mismo trayecto, al terminar)
                    </label>
                    {summary && <p className="rounded-lg bg-sky-500/10 px-2.5 py-1.5 text-xs text-sky-100">{summary}</p>}
                    <p className="text-[11px] text-white/35">Se agenda en tu Horario solo para el día de este evento{rrule ? ' (no en cada repetición)' : ''}. No se manda a Google.</p>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="space-y-3">
            <span className={`${label} flex items-center gap-1`}><Users className="h-3 w-3" /> Invitados</span>
            {who('users')}
            {who('clients')}
            {who('people')}
            <input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="Otros por correo (separados por coma)" className={field} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!lockApp && (
              <div>
                <span className={label}>App</span>
                <select value={app} onChange={(e) => setApp(e.target.value)} className={field}>
                  {dir.apps.map((a) => <option key={a.slug} value={a.slug}>{a.icon} {a.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <span className={label}>Quién lo ve</span>
              <select value={shared ? 'mw' : 'me'} onChange={(e) => setShared(e.target.value === 'mw')} className={field}>
                <option value="me">🔒 Solo yo y los invitados</option>
                {(isMw || shared) && <option value="mw">🐺 Master Wolf (todo el equipo)</option>}
              </select>
            </div>
          </div>

          <div>
            <span className={label}>Recordatorios</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {REMINDERS.map((r) => (
                <button key={r.minutes} type="button" aria-pressed={reminders.includes(r.minutes)} onClick={() => setReminders((l) => (l.includes(r.minutes) ? l.filter((x) => x !== r.minutes) : [...l, r.minutes]))} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${reminders.includes(r.minutes) ? 'bg-sky-600 text-[#fff]' : 'bg-white/5 text-white/60'}`}>{r.label}</button>
              ))}
              {reminders.filter((m) => !REMINDERS.some((r) => r.minutes === m)).map((m) => (
                <button key={m} type="button" onClick={() => setReminders((l) => l.filter((x) => x !== m))} className="rounded-full bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-[#fff]">{m / 60} h ×</button>
              ))}
              <input value={customHours} onChange={(e) => setCustomHours(e.target.value)} onBlur={() => { const h = Number(customHours.replace(',', '.')); if (h > 0) setReminders((l) => [...new Set([...l, Math.round(h * 60)])]); setCustomHours(''); }} inputMode="decimal" placeholder="Otras horas" aria-label="Horas antes" className="w-24 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white outline-none" />
            </div>
          </div>

          <div>
            <span className={label}>Color</span>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setColor(null)} className={`h-6 rounded-full px-2 text-[11px] ${color === null ? 'bg-white/15 text-white' : 'bg-white/5 text-white/50'}`}>{areas.length ? 'Según área' : 'Según tipo'}</button>
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`h-6 w-6 rounded-full ${color === c ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-[#101218]' : ''}`} style={{ background: c }} aria-label={c} />
              ))}
            </div>
          </div>

          <div>
            <span className={label}>Notas</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Agenda, qué llevar, contexto…" className={`${field} resize-y`} />
          </div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
        </fieldset>
        {!isNew && draft.id && (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-4 py-3">
            {bridge?.openLinkedNote && (
              <button type="button" onClick={() => bridge.openLinkedNote!('task', `evento:${draft.id}`, draft.title ?? 'Evento', 'Calendario', undefined, 'Calendario', { html: EVENT_PLAN })} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10">Planificar: notas, checklist y archivos</button>
            )}
            {readOnly && draft.owner_id !== userId && (['aceptada', 'rechazada'] as const).map((s) => (
              <button key={s} type="button" onClick={async () => { await supabase.from('organiza_invites').update({ status: s, responded_at: new Date().toISOString() }).eq('event_id', draft.id!).eq('user_id', userId ?? ''); onClose(); }} className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10">{s === 'aceptada' ? 'Aceptar' : 'Rechazar'}</button>
            ))}
          </div>
        )}

        {!readOnly && (
          <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
            {!isNew && (
              <button onClick={() => onDelete(draft.id!)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10">
                <Trash2 className="h-4 w-4" /> Eliminar
              </button>
            )}
            <span className="ml-auto hidden text-[11px] text-white/30 sm:inline">⌘↵ guardar · Esc cerrar</span>
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-white/60 hover:bg-white/5">Cancelar</button>
            <button onClick={submit} disabled={busy || !valid} className="rounded-lg bg-sky-500 px-4 py-1.5 text-sm font-semibold text-black hover:bg-sky-400 disabled:opacity-40">
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}
      </aside>

      {menu && (
        <EntityMenu
          anchor={menu.anchor}
          items={lists[menu.which].items}
          value={null}
          values={lists[menu.which].values}
          newLabel={menu.which === 'clients' ? 'Nuevo cliente' : menu.which === 'people' ? 'Nueva persona' : undefined}
          directory={menu.which === 'users' ? null : undefined}
          onPick={(id) => {
            if (!id) return;
            const l = lists[menu.which];
            l.set(l.values.includes(id) ? l.values.filter((v) => v !== id) : [...l.values, id]);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </BodyPortal>
  );
}
