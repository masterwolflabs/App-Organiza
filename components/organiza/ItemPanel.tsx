'use client';

import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Compass, FileText, Flame, Play, Plus, Settings2, Trash2, X } from 'lucide-react';
import { FocusSetup } from '@/components/organiza/FocusSetup';
import { PanelSections } from '@/components/organiza/PanelSections';
import { GuidedTour } from '@/components/tour/GuidedTour';
import { HABIT_TOUR } from '@/utils/tourScript';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import { CoverPicker } from '@/components/organiza/CoverPicker';
import { FocusTimer } from '@/components/organiza/FocusTimer';
import { Modules } from '@/components/organiza/Modules';
import { useNotesBridge } from '@/components/notes/NotesBridge';
import { freeTime, overlaps, toTime } from '@/components/organiza/dayPlan';
import { coverCss, emojiFor, honesty, iso, MODULE_CHOICES, rankOf, refOf, scheduleLabel, streakOf, toMinutes, WEEK, weekdayOf, xpOf, type AlarmKind, type Flex, type Item, type Module } from '@/components/organiza/model';
import { AlarmPicker, Categories, DurationWheel, EmojiPicker, Importance, LEVELS, SoundList, TimeWheel } from '@/components/organiza/PanelControls';
import type { useChecks, useHorario } from '@/components/organiza/useHorario';

const field = 'w-full rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-sky-400/50';
const BEFORE = [0, 1, 5, 10, 15, 30];

/** La tarea abierta: sus datos, su registro y el mundo que tiene adentro. */
export const ItemPanel: React.FC<{ item: Item; h: ReturnType<typeof useHorario>; c: ReturnType<typeof useChecks>; onClose: () => void; onOpen?: (id: string) => void }> = ({ item, h, c, onClose, onOpen }) => {
  const confirm = useConfirm();
  const [cover, setCover] = useState(false);
  const [adding, setAdding] = useState(false);
  const [focusing, setFocusing] = useState(false);
  const [tour, setTour] = useState(false);
  const [setup, setSetup] = useState(false);
  const [notice, setNotice] = useState('');
  // Cambiar la hora: si choca con otra acción en alguno de sus días, rebota a la siguiente hora libre y avisa.
  const setTime = (wanted: string) => {
    const busy = h.activeItems.filter((i) => i.schedule_id === item.schedule_id && weekdays.includes(i.weekday) && refOf(i.title) !== ref);
    const time = freeTime(busy, wanted, item.minutes);
    if (time !== wanted) {
      const who = [...new Set(overlaps(busy, wanted, item.minutes).map((i) => i.title))].join(', ');
      setNotice(`⏰ Quedó a las ${time} para no chocar con ${who}.`);
    } else setNotice('');
    set({ time });
  };
  const bridge = useNotesBridge();
  const noteId = `horario:${item.id}`;
  const note = bridge?.openLinkedNote ? { exists: !!bridge.linkedNote?.('task', noteId), open: () => bridge.openLinkedNote!('task', noteId, item.title, 'Horario', undefined, 'Horario') } : null;
  // Una acción con varios días es una sola: lo que cambias aquí cambia en todos sus días.
  // El bloque abierto cambia al tiro; sus otros días se guardan a la vez.
  const set = async (p: Partial<Item>) => {
    const others = h.activeItems.filter((i) => i.id !== item.id && i.schedule_id === item.schedule_id && refOf(i.title) === refOf(item.title));
    await Promise.all([h.patchItem(item.id, p), ...others.map((i) => h.patchItem(i.id, p))]);
  };
  const setModules = (modules: Module[]) => set({ modules });
  const today = iso(new Date());
  const ref = refOf(item.title);
  const weekdays = useMemo(() => [...new Set(h.activeItems.filter((i) => refOf(i.title) === ref).map((i) => i.weekday))], [h.activeItems, ref]);
  const mine = c.checks.filter((x) => x.ref === ref);
  const streak = streakOf(ref, weekdays, c.checks);
  const todayCheck = mine.find((x) => x.day === today);
  // Empezado (focus abierto o pasos marcados) pero sin cerrar: «En eso hoy».
  const inProgress = !!todayCheck && !todayCheck.done && !!(todayCheck.value.started || todayCheck.value.habits?.length || todayCheck.value.rules?.length);
  // Deshacer «lo hice»: si ya ibas en eso, vuelve a «en curso»; si no, queda sin marcar.
  const undoToday = () => (todayCheck && (todayCheck.value.started || todayCheck.value.habits?.length) ? c.mark(item.title, today, false, todayCheck.value) : c.unmark(item.title, today));
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
            <div className="absolute right-3 top-3 flex gap-1.5">
              <button type="button" onClick={() => setTour(true)} data-help="Te explica cada parte de esta acción, paso a paso" className="inline-flex items-center gap-1 rounded-lg bg-black/45 px-2.5 py-1.5 text-xs font-semibold text-[#fff] hover:bg-black/60"><Compass className="h-3.5 w-3.5" /> Tour</button>
              <button type="button" onClick={() => setCover((v) => !v)} className="rounded-lg bg-black/45 px-2.5 py-1.5 text-xs font-semibold text-[#fff] hover:bg-black/60">Portada</button>
            </div>
          </div>
          <div className="space-y-6 p-5">
            {cover && <CoverPicker value={item.cover_url} rank={rank} title={item.title} onPick={(v) => { set({ cover_url: v }); setCover(false); }} />}
            <div className="flex items-center gap-2">
              <EmojiPicker value={item.icon || emojiFor(item.title)} onChange={(icon) => set({ icon })} />
              <input defaultValue={item.title} key={`t${item.id}`} aria-label="Título" onBlur={(e) => {
                const title = e.target.value.trim();
                if (!title || title === item.title) return;
                // Si el emoji era el automático, cambia con el nombre; si lo elegiste tú, se queda.
                const auto = !item.icon || item.icon === emojiFor(item.title);
                set(auto ? { title, icon: emojiFor(title) } : { title });
              }} className="min-w-0 flex-1 rounded-lg bg-transparent font-display text-2xl font-semibold text-white outline-none focus:bg-white/[0.04]" />
            </div>

            <PanelSections storage="organiza-panel" sections={[
              { id: 'registro', tour: 'registro', title: '✅ ¿Lo hiciste hoy?', extra: <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-300"><Flame className="h-4 w-4" /> {streak} {streak === 1 ? 'día' : 'días'}</span>, body: (<>
              <div className="flex gap-2">
                <button type="button" aria-pressed={todayCheck?.done === true} onClick={async () => {
                  if (todayCheck?.done) {
                    if (await confirm({ title: '¿Quieres deshacer esto?', message: 'Se quita el «lo hice» de hoy.', confirmLabel: 'Sí, deshacer', tone: 'danger' })) undoToday();
                  } else if (await confirm({ title: '¿Seguro que lo hiciste?', message: honesty(), confirmLabel: 'Sí, lo hice' })) c.mark(item.title, today, true);
                }} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${todayCheck?.done ? 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40' : 'bg-white/[0.04] text-zinc-200 ring-white/10'}`}>Sí, lo hice</button>
                <button type="button" aria-pressed={todayCheck?.done === false && !inProgress} onClick={async () => {
                  if (todayCheck?.done === false && !inProgress) {
                    if (await confirm({ title: '¿Quieres deshacer esto?', message: 'Se quita el «no lo hice» de hoy.', confirmLabel: 'Sí, deshacer', tone: 'danger' })) c.unmark(item.title, today);
                  } else c.mark(item.title, today, false, {});
                }} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${todayCheck?.done === false && !inProgress ? 'bg-rose-500/20 text-rose-200 ring-rose-400/40' : 'bg-white/[0.04] text-zinc-200 ring-white/10'}`}>No lo hice</button>
              </div>
              {inProgress && !todayCheck?.done && <p className="mt-2 text-xs text-amber-300">⏳ En eso hoy: empezaste y no lo has terminado.</p>}
              <div className="mt-4 grid grid-cols-14 gap-1" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }} aria-label="Últimos 28 días">
                {last.map((d) => {
                  const x = mine.find((k) => k.day === iso(d));
                  return <span key={iso(d)} title={d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} className={`aspect-square rounded ${x?.done ? 'bg-emerald-400' : x ? 'bg-rose-400/70' : weekdays.includes(weekdayOf(d)) ? 'bg-white/10' : 'bg-white/[0.03]'}`} />;
                })}
              </div>
              <p className="mt-2 text-xs text-zinc-500">{scheduled ? `Cumpliste ${done} de ${scheduled} (${rate}%)` : 'Tu récord empieza con el primer día que marques.'}</p>
              </>) },
              { id: 'cuando', tour: 'hab-cuando', title: '📅 Cuándo', body: (<>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="mb-1 block text-xs font-medium text-zinc-400">📆 Elige tus días</span><DaysPicker days={weekdays} onToggle={async (d) => {
                  const on = !weekdays.includes(d);
                  // Quitar el día de este mismo bloque: el panel sigue en otro día que queda.
                  if (!on && d === item.weekday) {
                    const other = h.activeItems.find((i) => i.id !== item.id && i.schedule_id === item.schedule_id && refOf(i.title) === ref);
                    if (other) onOpen?.(other.id);
                  }
                  await h.repeatOn(item, d, on);
                }} /></div>
                <div><span className="mb-1 block text-xs font-medium text-zinc-400">⏰ ¿A qué hora empiezas?</span><TimeWheel value={item.time} onChange={setTime} /></div>
                <div><span className="mb-1 block text-xs font-medium text-zinc-400">⏳ ¿Cuánto dura?</span><DurationWheel value={item.minutes} onChange={(minutes) => set({ minutes })} /></div>
                <div><span className="mb-1 block text-xs font-medium text-zinc-400">🏁 ¿A qué hora termina?</span><TimeWheel value={toTime(toMinutes(item.time) + item.minutes)} onChange={(end) => set({ minutes: ((toMinutes(end) - toMinutes(item.time) + 1440) % 1440) || item.minutes })} /></div>
              </div>
              {notice && <p className="rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-200 ring-1 ring-sky-400/25">{notice}</p>}
</>) },
              { id: 'importancia', tour: 'hab-importancia', title: '⚖️ Importancia', body: (<>
              <Importance value={item.flex} onChange={(flex) => set({ flex, priority: LEVELS.findIndex((l) => l.id === flex) + 1 })} />
</>) },
              { id: 'categoria', tour: 'hab-categoria', title: '🏷️ Categoría', body: (<>
              <Categories h={h} value={item.label_id} onChange={(label_id) => set({ label_id })} />
              {h.schedules.length > 1 && (
                <Field label="Horario">
                  <select value={item.schedule_id} onChange={(e) => set({ schedule_id: e.target.value })} className={field}>
                    {h.schedules.map((x) => <option key={x.id} value={x.id} className="bg-zinc-900">{scheduleLabel(x)}</option>)}
                  </select>
                </Field>
              )}
</>) },
              { id: 'aviso', tour: 'hab-aviso', title: '🔔 Aviso y sonido', body: (<>
              <AlarmPicker value={item.alarm} onChange={(alarm) => set({ alarm })} />
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
                  <SoundList kind={item.alarm === 'alarma' ? 'alarma' : 'notificacion'} />
                </>
              )}
</>) },
              { id: 'focus', tour: 'hab-focus', title: '🎯 Modo focus', body: (<>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/10">
                <span><b className="block text-sm font-semibold text-white">Modo focus</b><span className="text-xs text-zinc-400">Tiempo sin interrupciones: la tarea a pantalla completa con su cuenta regresiva</span></span>
                <input type="checkbox" checked={item.focus} onChange={(e) => set({ focus: e.target.checked })} className="h-4 w-4 accent-sky-500" />
              </label>
              {item.focus && (
                <>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/10">
                    <span><b className="block text-sm font-semibold text-white">⏰ Abrirse solo a las {item.time}</b><span className="text-xs text-zinc-400">Con Organiza abierta, el focus se abre a esa hora (la de tu dispositivo, donde estés). Lo puedes cerrar cuando quieras.</span></span>
                    <input type="checkbox" checked={!!item.auto_focus} onChange={(e) => set({ auto_focus: e.target.checked })} className="h-4 w-4 accent-sky-500" />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setFocusing(true)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500"><Play className="h-4 w-4" /> Empezar {item.minutes} min de focus</button>
                    <button type="button" onClick={() => setSetup(true)} data-help="Música, crossfade y bucle del focus" className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-2 text-sm font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.1]"><Settings2 className="h-4 w-4" /> Configurar{(item.modules.find((m) => m.type === 'youtube')?.videos?.length ?? 0) ? <span className="rounded-full bg-sky-500/25 px-1.5 text-[11px] text-sky-200">🎵 {item.modules.find((m) => m.type === 'youtube')?.videos?.length ?? 0}</span> : null}</button>
                  </div>
                  {!item.phone_focus && (
                    <div className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 px-3 py-2 ring-1 ring-amber-400/25">
                      <span className="mt-0.5 text-base">📱</span>
                      <p className="min-w-0 flex-1 text-xs leading-relaxed text-zinc-300"><b className="font-semibold text-amber-200">Pendiente:</b> configura Concentración en tu teléfono a las {item.time}. iPhone: Ajustes → Concentración → <b>+</b>. Android: Ajustes → Bienestar digital → Modo concentración.</p>
                      <button type="button" onClick={() => set({ phone_focus: true })} className="shrink-0 rounded-lg bg-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/30">Ya lo hice</button>
                    </div>
                  )}
                </>
              )}
</>) },
              { id: 'nota', tour: 'hab-nota', title: '📝 Descripción y nota', body: (<>
            <Field label="Descripción"><textarea key={`d${item.id}`} defaultValue={item.description} rows={3} onBlur={(e) => e.target.value !== item.description && set({ description: e.target.value })} className={field} /></Field>
            {note && <button type="button" onClick={note.open} className="inline-flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2 text-sm font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.09]"><FileText className="h-4 w-4" /> {note.exists ? 'Abrir su nota' : 'Crear su nota'}</button>}
</>) },
              { id: 'dentro', tour: 'mundo', title: '🧩 Dentro de esta tarea', extra: <button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1 text-sm font-semibold text-sky-300 hover:text-sky-200"><Plus className="h-4 w-4" /> Agregar</button>, body: (<>
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
              <Modules item={item} modules={item.modules} checks={c} onChange={setModules} weekdays={weekdays} />
              {!item.modules.length && !adding && <p className="mt-2 text-sm text-zinc-500">Agrega microhábitos, tu sueño, un plan de entrenamiento, de comidas o una base de datos.</p>}
</>) },
            ]} />

            <div className="flex justify-end">
              <button type="button" onClick={async () => { if (await confirm({ title: `¿Borrar “${item.title}”?`, message: 'Tu récord de esta actividad queda guardado.', confirmLabel: 'Borrar', tone: 'danger' })) { await h.removeItem(item.id); onClose(); } }} className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /> Borrar tarea</button>
            </div>
          </div>
        </aside>
      </div>
      <GuidedTour open={tour} steps={HABIT_TOUR} onEnterStep={() => {}} onClose={() => setTour(false)} />
      {setup && <FocusSetup item={item} onSave={setModules} onStart={() => { setSetup(false); setFocusing(true); }} onClose={() => setSetup(false)} />}
      {focusing && <FocusTimer item={item} checks={c} onClose={() => setFocusing(false)} onDone={() => setFocusing(false)} />}
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
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 rounded-xl bg-white/[0.05] px-3 py-2 text-left text-[15px] font-semibold text-white ring-1 ring-white/10 transition hover:bg-white/[0.08]">
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

const Group: React.FC<{ title: string; tour?: string; children: React.ReactNode }> = ({ title, tour, children }) => (
  <section data-tour={tour} className="space-y-3">
    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
    {children}
  </section>
);

