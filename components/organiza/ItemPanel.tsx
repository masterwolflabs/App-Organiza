'use client';

import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, FileText, Flame, Plus, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import { CoverPicker } from '@/components/organiza/CoverPicker';
import { FocusTimer } from '@/components/organiza/FocusTimer';
import { Modules } from '@/components/organiza/Modules';
import { useNotesBridge } from '@/components/notes/NotesBridge';
import { toTime } from '@/components/organiza/dayPlan';
import { coverCss, iso, MODULE_CHOICES, rankOf, refOf, scheduleLabel, streakOf, toMinutes, WEEK, weekdayOf, xpOf, type AlarmKind, type Flex, type Item, type Module } from '@/components/organiza/model';
import { getSound, playSound, setSound, SOUNDS, type SoundId } from '@/components/organiza/sounds';
import type { useChecks, useHorario } from '@/components/organiza/useHorario';

const field = 'w-full rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-sky-400/50';
const ALARMS: { id: AlarmKind; label: string; hint: string }[] = [
  { id: 'no', label: 'Sin aviso', hint: 'No te avisa' },
  { id: 'notificacion', label: 'Notificación', hint: 'Un aviso suave y dos sonidos' },
  { id: 'alarma', label: 'Alarma', hint: 'Suena más y deja un cartel hasta que lo cierras' },
];
const BEFORE = [0, 1, 5, 10, 15, 30];

/** Cuánto se protege una acción (antes «Tipo de bloque» + «Prioridad»). */
const LEVELS: { id: Flex; label: string; hint: string }[] = [
  { id: 'obligatorio', label: 'No negociable', hint: 'Se bloquea en tu horario: no se mueve ni se salta. Si lo corres o lo saltas, la app te lo hace notar. Ej.: dormir, levantarte, entrenar, desayunar bien.' },
  { id: 'flexible', label: 'Modificable', hint: 'Se hace sí o sí, pero puede cambiar de hora si el día lo pide. Ej.: almuerzo, estudiar, revisar correos.' },
  { id: 'secundario', label: 'Flexible', hint: 'Suma si alcanza. Si el día se complica, es lo primero que se suelta. Ej.: ver una serie, ordenar el clóset.' },
];
const COLORS = ['#f59e0b', '#22c55e', '#38bdf8', '#a78bfa', '#f472b6', '#ef4444', '#94a3b8'];
const SUGGESTED = [
  { icon: '🧘', name: 'Personal', color: '#22c55e' },
  { icon: '❤️', name: 'Salud', color: '#ef4444' },
  { icon: '💼', name: 'Trabajo', color: '#38bdf8' },
  { icon: '🏠', name: 'Hogar', color: '#f59e0b' },
  { icon: '📚', name: 'Aprender', color: '#a78bfa' },
  { icon: '👨‍👩‍👧', name: 'Familia y amigos', color: '#f472b6' },
];

/** La tarea abierta: sus datos, su registro y el mundo que tiene adentro. */
export const ItemPanel: React.FC<{ item: Item; h: ReturnType<typeof useHorario>; c: ReturnType<typeof useChecks>; onClose: () => void; onOpen?: (id: string) => void }> = ({ item, h, c, onClose, onOpen }) => {
  const confirm = useConfirm();
  const [cover, setCover] = useState(false);
  const [adding, setAdding] = useState(false);
  const [focusing, setFocusing] = useState(false);
  const bridge = useNotesBridge();
  const noteId = `horario:${item.id}`;
  const note = bridge?.openLinkedNote ? { exists: !!bridge.linkedNote?.('task', noteId), open: () => bridge.openLinkedNote!('task', noteId, item.title, 'Horario', undefined, 'Horario') } : null;
  // Una acción con varios días es una sola: lo que cambias aquí cambia en todos sus días.
  const set = async (p: Partial<Item>) => {
    const same = h.activeItems.filter((i) => i.schedule_id === item.schedule_id && refOf(i.title) === refOf(item.title));
    for (const i of same.length ? same : [item]) await h.patchItem(i.id, p);
  };
  const setModules = (modules: Module[]) => set({ modules });
  const today = iso(new Date());
  const ref = refOf(item.title);
  const weekdays = useMemo(() => [...new Set(h.activeItems.filter((i) => refOf(i.title) === ref).map((i) => i.weekday))], [h.activeItems, ref]);
  const mine = c.checks.filter((x) => x.ref === ref);
  const streak = streakOf(ref, weekdays, c.checks);
  const todayCheck = mine.find((x) => x.day === today);
  const scheduled = mine.length;
  const done = mine.filter((x) => x.done).length;
  const rate = scheduled ? Math.round((done / scheduled) * 100) : 0;
  const rank = rankOf(xpOf(c.checks, c.days));
  const last = Array.from({ length: 28 }, (_, i) => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() - 27 + i);
  });

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[85] bg-black/50" onClick={onClose}>
        <aside role="dialog" aria-label={item.title} onClick={(e) => e.stopPropagation()} className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto bg-[#14161b] ring-1 ring-white/10">
          <div className="relative h-28 bg-white/[0.04]" style={coverCss(item.cover_url)}>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute left-3 top-3 rounded-lg bg-black/45 p-1.5 text-[#fff] hover:bg-black/60"><X className="h-4 w-4" /></button>
            <button type="button" onClick={() => setCover((v) => !v)} className="absolute right-3 top-3 rounded-lg bg-black/45 px-2.5 py-1.5 text-xs font-semibold text-[#fff] hover:bg-black/60">Portada</button>
          </div>
          <div className="space-y-6 p-5">
            {cover && <CoverPicker value={item.cover_url} rank={rank} onPick={(v) => { set({ cover_url: v }); setCover(false); }} />}
            <div className="flex items-center gap-2">
              <input defaultValue={item.icon} key={`i${item.id}`} aria-label="Ícono" maxLength={4} placeholder="🙂" onBlur={(e) => e.target.value !== item.icon && set({ icon: e.target.value })} className="w-12 rounded-lg bg-white/[0.05] py-1.5 text-center text-xl outline-none ring-1 ring-white/10" />
              <input defaultValue={item.title} key={`t${item.id}`} aria-label="Título" onBlur={(e) => e.target.value.trim() && e.target.value !== item.title && set({ title: e.target.value.trim() })} className="min-w-0 flex-1 rounded-lg bg-transparent font-display text-2xl font-semibold text-white outline-none focus:bg-white/[0.04]" />
            </div>

            <section className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10" data-tour="registro">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-white">¿Lo hiciste hoy?</h3>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-300"><Flame className="h-4 w-4" /> {streak} {streak === 1 ? 'día' : 'días'}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" aria-pressed={todayCheck?.done === true} onClick={() => todayCheck?.done ? c.unmark(item.title, today) : c.mark(item.title, today, true)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${todayCheck?.done ? 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40' : 'bg-white/[0.04] text-zinc-200 ring-white/10'}`}>Sí, lo hice</button>
                <button type="button" aria-pressed={todayCheck?.done === false} onClick={() => todayCheck?.done === false ? c.unmark(item.title, today) : c.mark(item.title, today, false)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${todayCheck?.done === false ? 'bg-rose-500/20 text-rose-200 ring-rose-400/40' : 'bg-white/[0.04] text-zinc-200 ring-white/10'}`}>No lo hice</button>
              </div>
              <div className="mt-4 grid grid-cols-14 gap-1" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }} aria-label="Últimos 28 días">
                {last.map((d) => {
                  const x = mine.find((k) => k.day === iso(d));
                  return <span key={iso(d)} title={d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} className={`aspect-square rounded ${x?.done ? 'bg-emerald-400' : x ? 'bg-rose-400/70' : weekdays.includes(weekdayOf(d)) ? 'bg-white/10' : 'bg-white/[0.03]'}`} />;
                })}
              </div>
              <p className="mt-2 text-xs text-zinc-500">{scheduled ? `Cumpliste ${done} de ${scheduled} (${rate}%)` : 'Tu récord empieza con el primer día que marques.'}</p>
            </section>

            <Group title="📅 Cuándo">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="mb-1 block text-xs font-medium text-zinc-400">Días</span><DaysPicker days={weekdays} onToggle={async (d) => {
                  const on = !weekdays.includes(d);
                  // Quitar el día de este mismo bloque: el panel sigue en otro día que queda.
                  if (!on && d === item.weekday) {
                    const other = h.activeItems.find((i) => i.id !== item.id && i.schedule_id === item.schedule_id && refOf(i.title) === ref);
                    if (other) onOpen?.(other.id);
                  }
                  await h.repeatOn(item, d, on);
                }} /></div>
                <Field label="Hora"><input type="time" value={item.time} onChange={(e) => e.target.value && set({ time: e.target.value })} className={field} /></Field>
                <Field label="Duración (min)"><input type="number" min={1} step={1} value={item.minutes} onChange={(e) => Number(e.target.value) > 0 && set({ minutes: Number(e.target.value) })} className={field} /></Field>
                <Field label="Termina"><input type="time" value={toTime(toMinutes(item.time) + item.minutes)} onChange={(e) => e.target.value && set({ minutes: ((toMinutes(e.target.value) - toMinutes(item.time) + 1440) % 1440) || item.minutes })} className={field} /></Field>
              </div>
            </Group>

            <Group title="⚖️ Importancia">
              <Importance value={item.flex} onChange={(flex) => set({ flex, priority: LEVELS.findIndex((l) => l.id === flex) + 1 })} />
            </Group>

            <Group title="🏷️ Categoría">
              <Categories h={h} value={item.label_id} onChange={(label_id) => set({ label_id })} />
              {h.schedules.length > 1 && (
                <Field label="Horario">
                  <select value={item.schedule_id} onChange={(e) => set({ schedule_id: e.target.value })} className={field}>
                    {h.schedules.map((x) => <option key={x.id} value={x.id} className="bg-zinc-900">{scheduleLabel(x)}</option>)}
                  </select>
                </Field>
              )}
            </Group>

            <Group title="🔔 Aviso y concentración">
              <Segmented value={item.alarm} options={ALARMS} onChange={(alarm) => set({ alarm })} />
              {item.alarm !== 'no' && (
                <>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-zinc-400">¿Cuánto antes?</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {BEFORE.map((m) => (
                        <button key={m} type="button" onClick={() => set({ alarm_before: m })} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${item.alarm_before === m ? 'bg-sky-600 text-[#fff] ring-sky-500' : 'text-zinc-300 ring-white/15 hover:bg-white/[0.06]'}`}>{m ? `${m} min` : 'A la hora'}</button>
                      ))}
                      <label className="inline-flex items-center gap-1 text-xs text-zinc-400">
                        <input type="number" min={0} step={1} value={item.alarm_before} onChange={(e) => set({ alarm_before: Math.max(0, Math.round(Number(e.target.value))) })} aria-label="Minutos antes" className="w-16 rounded-lg bg-white/[0.05] px-2 py-1 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-sky-400/50" /> min
                      </label>
                    </div>
                  </div>
                  <SoundPicker />
                </>
              )}
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/10">
                <span><b className="block text-sm font-semibold text-white">Modo focus</b><span className="text-xs text-zinc-400">Tiempo sin interrupciones: la tarea a pantalla completa con su cuenta regresiva</span></span>
                <input type="checkbox" checked={item.focus} onChange={(e) => set({ focus: e.target.checked })} className="h-4 w-4 accent-sky-500" />
              </label>
              {item.focus && (
                <>
                  <button type="button" onClick={() => setFocusing(true)} className="w-full rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500">Empezar {item.minutes} minutos de focus</button>
                  <p className="text-xs leading-relaxed text-zinc-400">📱 <b className="font-semibold text-zinc-300">Para que el teléfono tampoco te distraiga:</b> en iPhone ve a Ajustes → Concentración → <b className="font-semibold text-zinc-300">+</b> → crea uno para «{item.title}» y prográmalo a las {item.time}. En Android: Ajustes → Bienestar digital → Modo concentración.</p>
                </>
              )}
            </Group>

            <Field label="Descripción"><textarea key={`d${item.id}`} defaultValue={item.description} rows={3} onBlur={(e) => e.target.value !== item.description && set({ description: e.target.value })} className={field} /></Field>
            {note && <button type="button" onClick={note.open} className="inline-flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 text-sm font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.09]"><FileText className="h-4 w-4" /> {note.exists ? 'Abrir su nota' : 'Crear su nota'}</button>}

            <section data-tour="mundo">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-white">Dentro de esta tarea</h3>
                <button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1 text-sm font-semibold text-sky-300 hover:text-sky-200"><Plus className="h-4 w-4" /> Agregar</button>
              </div>
              {adding && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {MODULE_CHOICES.map((m) => (
                    <button key={m.key} type="button" onClick={() => { setModules([...item.modules, m.make()]); setAdding(false); }} className="rounded-xl bg-white/[0.04] p-3 text-left ring-1 ring-white/10 hover:bg-white/[0.08]">
                      <b className="block text-sm font-semibold text-white">{m.emoji} {m.label}</b>
                      <span className="text-xs text-zinc-400">{m.hint}</span>
                    </button>
                  ))}
                </div>
              )}
              <Modules item={item} modules={item.modules} checks={c} onChange={setModules} />
              {!item.modules.length && !adding && <p className="mt-2 text-sm text-zinc-500">Agrega microhábitos, tu sueño, un plan de entrenamiento, de comidas o una base de datos.</p>}
            </section>

            <div className="flex justify-end">
              <button type="button" onClick={async () => { if (await confirm({ title: `¿Borrar “${item.title}”?`, message: 'Tu récord de esta actividad queda guardado.', confirmLabel: 'Borrar', tone: 'danger' })) { await h.removeItem(item.id); onClose(); } }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /> Borrar tarea</button>
            </div>
          </div>
        </aside>
      </div>
      {focusing && <FocusTimer item={item} onClose={() => setFocusing(false)} onDone={() => { c.mark(item.title, today, true); setFocusing(false); }} />}
    </BodyPortal>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
    {children}
  </label>
);


const SHORT = WEEK.map((w) => w.slice(0, 3));

/** «Lun, Mié, Vie» · «Lunes a viernes» · «Todos los días». */
function daysText(days: number[]) {
  const d = [...days].sort((a, b) => a - b).join();
  if (d === '0,1,2,3,4,5,6') return 'Todos los días';
  if (d === '0,1,2,3,4') return 'Lunes a viernes';
  if (d === '5,6') return 'Fin de semana';
  if (days.length === 1) return WEEK[days[0]];
  return [...days].sort((a, b) => a - b).map((x) => SHORT[x]).join(', ');
}

/** Los días del bloque en un solo campo: se marcan y desmarcan en el menú (siempre queda uno). */
const DaysPicker: React.FC<{ days: number[]; onToggle: (d: number) => void }> = ({ days, onToggle }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`${field} flex items-center justify-between gap-2 text-left`}>
        <span className="truncate">{daysText(days)}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl bg-[#1b1e24] p-1 shadow-2xl ring-1 ring-white/10">
            {WEEK.map((w, d) => {
              const on = days.includes(d);
              const last = on && days.length === 1;
              return (
                <button key={w} type="button" role="menuitemcheckbox" aria-checked={on} disabled={last} onClick={() => onToggle(d)} data-help={last ? 'Un bloque necesita al menos un día' : undefined} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 hover:bg-white/[0.06] disabled:opacity-60">
                  <span className={`flex h-4 w-4 items-center justify-center rounded ring-1 ${on ? 'bg-sky-600 ring-sky-500' : 'ring-white/25'}`}>{on && <Check className="h-3 w-3 text-[#fff]" />}</span>
                  {w}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-3">
    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
    {children}
  </section>
);

/** Perilla de tres puntos con su explicación debajo. */
const Importance: React.FC<{ value: Flex; onChange: (f: Flex) => void }> = ({ value, onChange }) => {
  const at = Math.max(0, LEVELS.findIndex((l) => l.id === value));
  return (
    <div>
      <div className="relative grid grid-cols-3 rounded-xl bg-white/[0.05] p-1 ring-1 ring-white/10">
        <span aria-hidden className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-sky-600 shadow transition-transform duration-300 ease-out" style={{ transform: `translateX(${at * 100}%)` }} />
        {LEVELS.map((l, i) => (
          <button key={l.id} type="button" aria-pressed={i === at} onClick={() => onChange(l.id)} className={`relative z-10 rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors ${i === at ? 'text-[#fff]' : 'text-zinc-400 hover:text-zinc-200'}`}>{l.label}</button>
        ))}
      </div>
      <p key={value} className="mt-2 text-xs leading-relaxed text-zinc-400">{LEVELS[at].hint}</p>
    </div>
  );
};

/** Botones de una sola opción, con la explicación de la elegida. */
function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; hint: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <div className="flex gap-1 rounded-xl bg-white/[0.05] p-1 ring-1 ring-white/10">
        {options.map((o) => (
          <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)} className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors ${o.id === value ? 'bg-white/[0.12] text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>{o.label}</button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-zinc-500">{options.find((o) => o.id === value)?.hint}</p>
    </div>
  );
}

/** Sonido de los avisos en este dispositivo, con botón para escucharlo. */
const SoundPicker: React.FC = () => {
  const [sound, set] = useState<SoundId>(() => getSound());
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-zinc-400">Sonido (en este dispositivo)</span>
      <div className="flex flex-wrap gap-1.5">
        {SOUNDS.map((x) => (
          <button key={x.id} type="button" onClick={() => { set(x.id); setSound(x.id); playSound(3, x.id); }} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${sound === x.id ? 'bg-sky-600 text-[#fff] ring-sky-500' : 'text-zinc-300 ring-white/15 hover:bg-white/[0.06]'}`}>🔊 {x.label}</button>
        ))}
      </div>
    </div>
  );
};

/** Categorías propias con emoji y color (son las etiquetas del Horario: también filtran y pintan la semana). */
const Categories: React.FC<{ h: ReturnType<typeof useHorario>; value: string | null; onChange: (id: string | null) => void }> = ({ h, value, onChange }) => {
  const [adding, setAdding] = useState(false);
  const [icon, setIcon] = useState('✨');
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const create = async (n: string, c: string, i: string) => {
    const made = await h.ensureLabel(n, c, i);
    if (made) onChange(made.id);
  };
  const missing = SUGGESTED.filter((x) => !h.labels.some((l) => l.name === x.name));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {h.labels.map((l) => {
          const on = l.id === value;
          return (
            <button key={l.id} type="button" aria-pressed={on} onClick={() => onChange(on ? null : l.id)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition" style={{ background: on ? `${l.color}33` : `${l.color}12`, color: on ? '#fff' : undefined, boxShadow: on ? `inset 0 0 0 1.5px ${l.color}` : undefined }}>
              <span aria-hidden>{l.icon || '•'}</span>
              <span className={on ? 'text-white' : 'text-zinc-300'}>{l.name}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-sky-300 border border-dashed border-white/20 hover:bg-white/[0.05]"><Plus className="h-3.5 w-3.5" /> Nueva</button>
      </div>
      {missing.length > 0 && h.labels.length < 4 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-500">Ideas:</span>
          {missing.map((x) => (
            <button key={x.name} type="button" onClick={() => create(x.name, x.color, x.icon)} className="rounded-full px-2 py-0.5 text-xs text-zinc-400 ring-1 ring-white/10 hover:bg-white/[0.05] hover:text-zinc-200">{x.icon} {x.name}</button>
          ))}
        </div>
      )}
      {adding && (
        <form className="flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/10" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await create(name.trim(), color, icon); setName(''); setAdding(false); }}>
          <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} aria-label="Emoji" className="w-11 rounded-lg bg-white/[0.05] py-1 text-center text-lg outline-none ring-1 ring-white/10" />
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Nombre de la categoría" className="min-w-0 flex-1 rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none ring-1 ring-white/10" />
          <div className="flex gap-1">{COLORS.map((c) => <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => setColor(c)} className={`h-5 w-5 rounded-full ${color === c ? 'ring-2 ring-white' : ''}`} style={{ background: c }} />)}</div>
          <button type="submit" className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-[#fff] hover:bg-sky-500">Crear</button>
        </form>
      )}
    </div>
  );
};
