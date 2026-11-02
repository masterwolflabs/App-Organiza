'use client';

import React, { useMemo, useState } from 'react';
import { FileText, Flame, Plus, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import { CoverPicker } from '@/components/organiza/CoverPicker';
import { FocusTimer } from '@/components/organiza/FocusTimer';
import { Modules } from '@/components/organiza/Modules';
import { useNotesBridge } from '@/components/notes/NotesBridge';
import { toTime } from '@/components/organiza/dayPlan';
import { CATEGORIES, coverCss, FLEX, iso, MODULE_CHOICES, PRIORITIES, rankOf, refOf, STAGES, streakOf, toMinutes, WEEK, weekdayOf, xpOf, type AlarmKind, type Flex, type Item, type Module } from '@/components/organiza/model';
import type { useChecks, useHorario } from '@/components/organiza/useHorario';

const field = 'w-full rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-sky-400/50';
const ALARMS: { id: AlarmKind; label: string }[] = [
  { id: 'no', label: 'Sin aviso' },
  { id: 'notificacion', label: 'Notificación' },
  { id: 'alarma', label: 'Alarma' },
];

/** La tarea abierta: sus datos, su registro y el mundo que tiene adentro. */
export const ItemPanel: React.FC<{ item: Item; h: ReturnType<typeof useHorario>; c: ReturnType<typeof useChecks>; onClose: () => void }> = ({ item, h, c, onClose }) => {
  const confirm = useConfirm();
  const [cover, setCover] = useState(false);
  const [adding, setAdding] = useState(false);
  const [focusing, setFocusing] = useState(false);
  const bridge = useNotesBridge();
  const noteId = `horario:${item.id}`;
  const note = bridge?.openLinkedNote ? { exists: !!bridge.linkedNote?.('task', noteId), open: () => bridge.openLinkedNote!('task', noteId, item.title, 'Horario', undefined, 'Horario') } : null;
  const set = (p: Partial<Item>) => h.patchItem(item.id, p);
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

            <section className="grid grid-cols-2 gap-3">
              <Field label="Día"><select value={item.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })} className={field}>{WEEK.map((w, i) => <option key={w} value={i} className="bg-zinc-900">{w}</option>)}</select></Field>
              <Field label="Hora"><input type="time" value={item.time} onChange={(e) => e.target.value && set({ time: e.target.value })} className={field} /></Field>
              <Field label="Duración (min)"><input type="number" min={5} step={5} value={item.minutes} onChange={(e) => Number(e.target.value) > 0 && set({ minutes: Number(e.target.value) })} className={field} /></Field>
              <Field label="Termina"><input type="time" value={toTime(toMinutes(item.time) + item.minutes)} onChange={(e) => e.target.value && set({ minutes: ((toMinutes(e.target.value) - toMinutes(item.time) + 1440) % 1440) || item.minutes })} className={field} /></Field>
              <Field label="Tipo de bloque"><select value={item.flex} onChange={(e) => set({ flex: e.target.value as Flex })} className={field}>{FLEX.map((f) => <option key={f.id} value={f.id} className="bg-zinc-900">{f.label}</option>)}</select></Field>
              <Field label="Categoría"><select value={item.category} onChange={(e) => set({ category: e.target.value })} className={field}><option value="" className="bg-zinc-900">Sin categoría</option>{CATEGORIES.map((x) => <option key={x.id} value={x.id} className="bg-zinc-900">{x.label}</option>)}</select></Field>
              <Field label="Prioridad"><select value={item.priority} onChange={(e) => set({ priority: Number(e.target.value) })} className={field}>{PRIORITIES.map((x) => <option key={x.id} value={x.id} className="bg-zinc-900">{x.label}</option>)}</select></Field>
              <Field label="Etapa"><select value={item.stage} onChange={(e) => set({ stage: e.target.value })} className={field}>{STAGES.map((s) => <option key={s.id} value={s.id} className="bg-zinc-900">{s.label}</option>)}</select></Field>
              <Field label="Etiqueta"><select value={item.label_id ?? ''} onChange={(e) => set({ label_id: e.target.value || null })} className={field}><option value="" className="bg-zinc-900">Sin etiqueta</option>{h.labels.map((l) => <option key={l.id} value={l.id} className="bg-zinc-900">{l.name}</option>)}</select></Field>
              <Field label={`Avance ${item.progress}%`}><input type="range" min={0} max={100} step={5} value={item.progress} onChange={(e) => set({ progress: Number(e.target.value) })} className="w-full accent-sky-500" /></Field>
              <Field label="Aviso"><select value={item.alarm} onChange={(e) => set({ alarm: e.target.value as AlarmKind })} className={field}>{ALARMS.map((a) => <option key={a.id} value={a.id} className="bg-zinc-900">{a.label}</option>)}</select></Field>
              <Field label="Minutos antes"><input type="number" min={0} step={5} disabled={item.alarm === 'no'} value={item.alarm_before} onChange={(e) => set({ alarm_before: Math.max(0, Number(e.target.value)) })} className={`${field} disabled:opacity-40`} /></Field>
            </section>
            <div>
              <span className="mb-1 block text-xs font-medium text-zinc-400">Se repite</span>
              <div className="flex flex-wrap gap-1.5">
                {WEEK.map((w, d) => (
                  <button key={w} type="button" aria-pressed={weekdays.includes(d)} disabled={weekdays.length === 1 && weekdays[0] === d} onClick={() => h.repeatOn(item, d, !weekdays.includes(d))} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${weekdays.includes(d) ? 'bg-sky-600 text-[#fff] ring-sky-500' : 'text-zinc-400 ring-white/15 hover:bg-white/[0.06]'}`}>{w.slice(0, 3)}</button>
                ))}
              </div>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/10">
              <span><b className="block text-sm font-semibold text-white">Modo focus</b><span className="text-xs text-zinc-400">Marca esta tarea como tiempo sin interrupciones</span></span>
              <input type="checkbox" checked={item.focus} onChange={(e) => set({ focus: e.target.checked })} className="h-4 w-4 accent-sky-500" />
            </label>
            {item.focus && <button type="button" onClick={() => setFocusing(true)} className="w-full rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500">Empezar {item.minutes} minutos de focus</button>}

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

