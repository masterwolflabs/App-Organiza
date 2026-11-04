'use client';

import { MARK_COLORS, setMarks, useAIMarks, type AIChange, type AIMarks } from '@/components/organiza/aiMarks';
import { IconPicker, ItemIcon, iconText } from '@/components/organiza/IconPicker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCalendar } from '@/components/calendar/useCalendar';
import { addDays, colorOf, expand, fmtTime, KINDS, minutesOf, sameDay, startOfWeek, type Occurrence } from '@/components/calendar/model';
import { AlarmClock, Bell, BellRing, CalendarClock, ChevronLeft, ChevronRight, Sparkles, Target, TriangleAlert, Zap, Undo2, Redo2, CalendarDays, PauseCircle, Check as CheckIcon, ChevronDown, Copy, FileUp, Focus, ImagePlus, Moon, LayoutGrid, List, Plus, Rows3, Send, Tags, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import { ImportHorario } from '@/components/organiza/ImportHorario';
import { ItemPanel } from '@/components/organiza/ItemPanel';
import { UnsavedScope, useGuardedClose, useUnsaved } from '@/components/organiza/UnsavedGuard';
import { morningConflict, overlaps, proposeDay, toTime, type DayPlan, type Extra, type Moves } from '@/components/organiza/dayPlan';
import { AdjustBox, adjustDayAI, type Line } from '@/components/organiza/DayAdjust';
import { byTime, coverCss, daysOf, LABEL_COLORS, scheduleLabel, type Sleep, stageOf, TEMPLATES, toMinutes, WEEK, weekdayOf, xpOf, rankOf, type Item, type Label, type Schedule, emojiFor, iso, refOf, streakOf } from '@/components/organiza/model';
import { useChecks, useHorario } from '@/components/organiza/useHorario';

type ViewId = 'tablero' | 'semana' | 'mi-semana' | 'galeria' | 'lista';
const VIEWS: { id: ViewId; label: string; icon: typeof Rows3 }[] = [
  { id: 'tablero', label: 'Tablero', icon: Rows3 },
  { id: 'semana', label: 'Semana', icon: LayoutGrid },
  { id: 'mi-semana', label: 'Mi semana', icon: CalendarDays },
  { id: 'galeria', label: 'Galería', icon: ImagePlus },
  { id: 'lista', label: 'Lista', icon: List },
];
const VIEW_KEY = 'organiza-horario-view';

/**
 * Horario: varias formas de ver la misma semana. Todo nace en vista previa; al
 * publicar se eligen las alarmas y recién ahí llega al calendario y a los avisos.
 */
export const HorarioView: React.FC = () => {
  const h = useHorario();
  const c = useChecks();
  // Esta semana con sus fechas, y lo que tienes en el calendario cada día (sin los bloques del propio horario).
  const [weekShift, setWeekShift] = useState(0);
  const weekStart = useMemo(() => addDays(startOfWeek(new Date()), weekShift * 7), [weekShift]);
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const cal = useCalendar(weekStart, weekEnd);
  const occ = useMemo(() => expand(cal.events.filter((e) => e.source !== 'horario'), weekStart, weekEnd), [cal.events, weekStart, weekEnd]);
  // Lo que marcaste hoy en «¿Lo hiciste hoy?» se ve en la tarjeta de hoy.
  // Racha de cada acción (la misma cuenta que «¿Lo hiciste hoy?» del panel).
  // En el tablero cada día muestra su racha: los pasados la que tuviste, hoy la de ahora y los que vienen
  // (en gris) la que alcanzarías si cumples hasta ahí.
  const streakFor = (i: Item, date?: Date): Streak => {
    const ref = refOf(i.title);
    const days = [...new Set(h.activeItems.filter((x) => x.schedule_id === i.schedule_id && refOf(x.title) === ref).map((x) => x.weekday))];
    const now = new Date();
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const d0 = date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : t0;
    if (+d0 < +t0) {
      // Un día que ya pasó sin cumplir: ✕ (la racha vuelve a partir).
      const n = streakOf(ref, days, c.checks, d0, true);
      const k = c.checks.find((x) => x.ref === ref && x.day === iso(d0));
      return { n, ghost: false, missed: !k?.done && !k?.value?.state };
    }
    const base = streakOf(ref, days, c.checks);
    if (+d0 === +t0) return { n: base, ghost: false };
    let n = base + (days.includes(weekdayOf(now)) && !c.checks.some((x) => x.ref === ref && x.day === iso(now)) ? 1 : 0);
    for (let x = addDays(t0, 1); +x <= +d0; x = addDays(x, 1)) if (days.includes(weekdayOf(x))) n++;
    return { n, ghost: true };
  };
  const todayStatus = (i: Item): Status => {
    const now = new Date();
    if (i.weekday !== weekdayOf(now)) return null;
    const k = c.checks.find((x) => x.ref === refOf(i.title) && x.day === iso(now));
    // Marcar pasos sin cerrar la acción no es «No lo hice»: es que vas en eso.
    return k?.done ? 'hecho' : k && (k.value.started || k.value.habits?.length || k.value.rules?.length) ? 'curso' : k ? 'no' : 'pendiente';
  };
  // Desde dónde parte el día en el Tablero: 'h:HH:MM' (una hora) o 'a:<acción>' (ej. Levantarse). En este dispositivo.
  const [dayStart, setDayStartState] = useState<string>(() => {
    try {
      return localStorage.getItem('organiza-day-start') || 'h:00:00';
    } catch {
      return 'h:00:00';
    }
  });
  const setDayStart = (v: string) => {
    setDayStartState(v);
    try {
      localStorage.setItem('organiza-day-start', v);
    } catch {
      /* modo privado */
    }
  };
  const [parts, setPartsState] = useState<Parts>(() => {
    try {
      return { ...PARTS_DEFAULT, ...JSON.parse(localStorage.getItem('organiza-day-parts') || '{}') };
    } catch {
      return PARTS_DEFAULT;
    }
  });
  const [editParts, setEditParts] = useState(false);
  const setParts = (v: Parts) => {
    setPartsState(v);
    try {
      localStorage.setItem('organiza-day-parts', JSON.stringify(v));
    } catch {
      /* modo privado */
    }
  };
  const [focusToday, setFocusTodayState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('organiza-focus-today') !== '0';
    } catch {
      return true;
    }
  });
  const setFocusToday = (v: boolean) => {
    setFocusTodayState(v);
    try {
      localStorage.setItem('organiza-focus-today', v ? '1' : '0');
    } catch {
      /* modo privado */
    }
  };
  // Acciones que pueden abrir el día: las de la mañana (por nombre) del horario activo.
  const startChoices = [...new Map(h.activeItems.filter((i) => /levant|despert|ducha|desayun|orar|medit/i.test(i.title)).map((i) => [refOf(i.title), i])).values()].sort(byTime).slice(0, 5);
  // Lo que marcó o propuso la IA (chat de Organiza): bordes que titilan y barra con «Aplicar».
  const aiMarks = useAIMarks();
  const markOf = (id: string) => (aiMarks?.ids.includes(id) ? MARK_COLORS[aiMarks.color] ?? '#facc15' : undefined);
  const applyAI = async () => {
    const PRIORITY: Record<string, number> = { obligatorio: 1, flexible: 2, secundario: 3 };
    let n = 0;
    // Una categoría nueva se crea una sola vez aunque la pidan varias acciones.
    const made = new Map<string, string>();
    for (const c of aiMarks?.changes ?? []) {
      if (!h.activeItems.some((i) => i.id === c.id)) continue;
      const patch: Partial<Item> = {};
      if (c.patch.label) {
        const key = c.patch.label.toLowerCase();
        let id = made.get(key) ?? h.labels.find((x) => x.name.toLowerCase() === key)?.id;
        if (!id) {
          const l = await h.ensureLabel(c.patch.label, LABEL_COLORS[(h.labels.length + made.size) % LABEL_COLORS.length]);
          if (l) id = l.id;
        }
        if (id) {
          made.set(key, id);
          patch.label_id = id;
        }
      }
      if (c.patch.icon) patch.icon = c.patch.icon;
      if (c.patch.time) patch.time = c.patch.time;
      if (c.patch.minutes) patch.minutes = c.patch.minutes;
      if (c.patch.flex) Object.assign(patch, { flex: c.patch.flex, priority: PRIORITY[c.patch.flex] ?? 2 });
      if (c.patch.alarm) patch.alarm = c.patch.alarm;
      if (typeof c.patch.alarm_before === 'number') patch.alarm_before = c.patch.alarm_before;
      if (typeof c.patch.focus === 'boolean') patch.focus = c.patch.focus;
      if (typeof c.patch.description === 'string') patch.description = c.patch.description;
      if (Object.keys(patch).length) {
        await h.patchItem(c.id, patch);
        n++;
      }
    }
    setMarks(null);
    setUndone(`✨ Apliqué ${n} ${n === 1 ? 'cambio' : 'cambios'} de la IA (↶ para deshacer)`);
  };
  // Deshacer / Rehacer: botones ↶ ↷ y Cmd+Z / Cmd+Shift+Z (fuera de los campos de texto, que tienen el suyo).
  const [undone, setUndone] = useState<string | null>(null);
  const step = async (kind: 'undo' | 'redo') => {
    const label = await (kind === 'undo' ? h.undo() : h.redo());
    if (label) setUndone(`${kind === 'undo' ? 'Deshecho' : 'Rehecho'}: ${label}`);
  };
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' && e.key.toLowerCase() !== 'y') return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      stepRef.current(e.key.toLowerCase() === 'y' || e.shiftKey ? 'redo' : 'undo');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!undone) return;
    const t = setTimeout(() => setUndone(null), 2500);
    return () => clearTimeout(t);
  }, [undone]);
  const confirm = useConfirm();
  const [view, setViewState] = useState<ViewId>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as ViewId) || 'tablero';
    } catch {
      return 'tablero';
    }
  });
  const setView = (v: ViewId) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* modo privado */
    }
  };
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [panel, setPanel] = useState<'publicar' | 'nuevo' | 'etiquetas' | 'nueva-etiqueta' | null>(null);

  const s = h.active;
  const labelUse = (id: string) => h.activeItems.filter((i) => i.label_id === id).length;
  const topLabels = [...h.labels].sort((a, b) => labelUse(b.id) - labelUse(a.id)).filter((l, k) => k < 2 || l.id === filter);
  const shown = useMemo(() => h.activeItems.filter((i) => !filter || i.label_id === filter).sort(byTime), [h.activeItems, filter]);
  const open = h.activeItems.find((i) => i.id === openId) ?? h.publishedItems.find((i) => i.id === openId) ?? null;

  if (!h.ready) return <p className="text-sm text-zinc-500">Leyendo tu horario…</p>;
  if (!s)
    return (
      <>
        <Start onPick={h.createFrom} onImport={() => setImporting(true)} />
        {importing && <ImportHorario onClose={() => setImporting(false)} onCreate={h.createImported} />}
      </>
    );

  const add = async (weekday: number) => {
    const made = await h.addItem(s.id, weekday);
    if (made) setOpenId(made.id);
  };

  return (
    <div className="mx-auto max-w-[1640px]" data-tour="horario">
      <div className="flex flex-wrap items-center gap-3">
        <input
          key={s.id}
          defaultValue={s.name}
          aria-label="Nombre del horario"
          onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && h.patchSchedule(s.id, { name: e.target.value.trim() })}
          className="w-full min-w-0 rounded-lg bg-transparent font-display sm:w-auto sm:flex-1 text-3xl font-semibold text-white outline-none focus:bg-white/[0.04] sm:text-4xl"
        />
        <span className={`inline-flex items-center rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${s.status === 'publicado' ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30' : 'bg-amber-500/15 text-amber-200 ring-amber-400/30'}`}>
          {s.status === 'publicado' ? '● Activo' : 'Borrador'}
        </span>
        {h.schedules.length > 1 && (
          <div className="relative">
            <select aria-label="Elegir horario" value={s.id} onChange={(e) => h.choose(e.target.value)} className="appearance-none rounded-xl bg-white/[0.05] py-2 pl-3 pr-8 text-sm text-zinc-200 ring-1 ring-white/10">
              {h.schedules.map((x) => <option key={x.id} value={x.id} className="bg-zinc-900">{x.name}{x.status === 'publicado' ? ' ●' : ''}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          </div>
        )}
        <button type="button" onClick={() => setPanel('nuevo')} className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-2 text-sm font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.09]">
          <Plus className="h-4 w-4" /> Nuevo horario
        </button>
      </div>

      <ModeBar key={s.id} s={s} h={h} />

      {/* Borrador: no rige tu semana hasta publicarlo. Activo: cada cambio queda al tiro (Emanuel, 2026-11-04). */}
      {s.status !== 'publicado' ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-500/10 px-4 py-3 ring-1 ring-amber-400/30">
          <p className="min-w-0 flex-1 text-sm text-amber-100">Este horario es un <b>borrador</b>: todavía no sale en Hoy ni en el Calendario, ni te avisa.</p>
          <button type="button" data-tour="publicar" onClick={() => setPanel('publicar')} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500">
            <Send className="h-4 w-4" /> Publicar
          </button>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-white/[0.04] p-0.5 ring-1 ring-white/10" data-tour="vistas">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" onClick={() => setView(v.id)} aria-pressed={view === v.id} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === v.id ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-200'}`}>
              <v.icon className="h-4 w-4" /> <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>
        <div className="flex rounded-xl bg-white/[0.04] p-0.5 ring-1 ring-white/10">
          <button type="button" onClick={() => step('undo')} disabled={!h.canUndo} aria-label="Deshacer" data-help={h.undoLabel ? `Deshacer: ${h.undoLabel} (⌘Z)` : 'Nada que deshacer'} className="rounded-lg p-1.5 text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => step('redo')} disabled={!h.canRedo} aria-label="Rehacer" data-help={h.redoLabel ? `Rehacer: ${h.redoLabel} (⌘⇧Z)` : 'Nada que rehacer'} className="rounded-lg p-1.5 text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"><Redo2 className="h-4 w-4" /></button>
        </div>
        {undone && <span role="status" className="rounded-lg bg-sky-500/15 px-2.5 py-1 text-xs font-semibold text-sky-200 ring-1 ring-sky-400/30">{undone}</span>}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {/* Categorías (Emanuel, 2026-11-04): a la vista solo las 2 que más usas (y la que estés filtrando). */}
          {topLabels.map((l) => (
            <button key={l.id} type="button" onClick={() => setFilter(filter === l.id ? null : l.id)} aria-pressed={filter === l.id} data-help={filter === l.id ? 'Ver todo' : `Ver solo ${l.name}`} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition ${filter && filter !== l.id ? 'opacity-40' : ''} ${filter === l.id ? 'ring-1 ring-current' : ''}`} style={{ background: `${l.color}26`, color: l.color }}>
              {l.icon && <ItemIcon value={l.icon} />}{l.name}
            </button>
          ))}
          <button type="button" onClick={() => setPanel('nueva-etiqueta')} className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/20 px-2.5 py-1 text-xs font-semibold text-sky-300 hover:bg-white/[0.05]">
            <Plus className="h-3 w-3" /> Nueva
          </button>
          <button type="button" onClick={() => setPanel('etiquetas')} data-tour="etiquetas" className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-zinc-400 hover:text-white">
            <Tags className="h-3.5 w-3.5" /> Categorías{h.labels.length > topLabels.length ? ` (${h.labels.length})` : ''}
          </button>
        </div>
      </div>

      <div className="mt-5">
        {aiMarks && (
          <AIMarksBar marks={aiMarks} present={h.activeItems.filter((i) => aiMarks.ids.includes(i.id)).length} onApply={applyAI} />
        )}
        {(
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" aria-label="Semana anterior" onClick={() => setWeekShift((w) => w - 1)} className="rounded-lg p-1.5 text-zinc-400 ring-1 ring-white/10 hover:bg-white/[0.06] hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-36 text-center text-sm font-semibold text-zinc-200">{weekStart.getDate()} {MONTHS_SHORT[weekStart.getMonth()]} – {addDays(weekStart, 6).getDate()} {MONTHS_SHORT[addDays(weekStart, 6).getMonth()]}</span>
            <button type="button" aria-label="Semana siguiente" onClick={() => setWeekShift((w) => w + 1)} className="rounded-lg p-1.5 text-zinc-400 ring-1 ring-white/10 hover:bg-white/[0.06] hover:text-white"><ChevronRight className="h-4 w-4" /></button>
            <button type="button" onClick={() => setFocusToday(!focusToday)} aria-pressed={focusToday} data-help="Lo que ya pasó en gris, hoy a todo color y lo que viene a media luz" className={`ml-auto rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${focusToday ? 'bg-amber-500/15 text-amber-200 ring-amber-400/40' : 'text-zinc-400 ring-white/10 hover:bg-white/[0.06]'}`}>🎯 Enfocar hoy</button>
            <label className="flex items-center gap-1.5 text-xs text-zinc-400" data-help="Desde dónde parte cada día; lo de madrugada va al final">
              <span className="hidden sm:inline">☀️ Comenzar desde</span>
              <select value={dayStart} onChange={(e) => setDayStart(e.target.value)} className="rounded-lg bg-white/[0.05] px-2 py-1 text-xs font-semibold text-zinc-200 ring-1 ring-white/10 outline-none">
                <option value="h:00:00">Medianoche</option>
                {startChoices.map((i) => <option key={i.id} value={`a:${refOf(i.title)}`}>{iconText(i.icon) || emojiFor(i.title)} {i.title}</option>)}
                {['04:00', '05:00', '06:00', '07:00', '08:00'].map((t) => <option key={t} value={`h:${t}`}>Las {t}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => setEditParts(true)} data-help="A qué hora parte la mañana, la tarde y la noche" className="rounded-lg px-2.5 py-1 text-xs font-semibold text-zinc-400 ring-1 ring-white/10 hover:bg-white/[0.06] hover:text-white">🌗 Partes del día</button>
            {editParts && <Dialog title="Partes del día" onClose={() => setEditParts(false)}><PartsForm value={parts} onSave={(v) => { setParts(v); setEditParts(false); }} /></Dialog>}
            {weekShift !== 0 && <button type="button" onClick={() => setWeekShift(0)} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-sky-300 ring-1 ring-white/10 hover:bg-white/[0.06]">Esta semana</button>}
          </div>
        )}
        {view === 'tablero' && <Board items={shown} labels={h.labels} streak={streakFor} status={weekShift === 0 ? todayStatus : undefined} weekStart={weekStart} occ={occ} planOf={h.planOf} onApply={(date, p) => h.setPlan(iso(date), p)} onUndo={() => step('undo')} markOf={markOf} dayStart={dayStart} focusToday={focusToday} parts={parts} onOpen={setOpenId} onAdd={add} onMove={(id, weekday) => h.patchItem(id, { weekday })} />}
        {view === 'semana' && <WeekGrid items={shown} labels={h.labels} ctx={{ weekStart, dayStart, focusToday, parts }} onOpen={setOpenId} onMove={(id, time) => h.patchItem(id, { time })} />}
        {view === 'mi-semana' && <WeekGrid items={[...h.publishedItems].filter((i) => !filter || i.label_id === filter).sort(byTime)} labels={h.labels} ctx={{ weekStart, dayStart, focusToday, parts }} onOpen={setOpenId} onMove={(id, time) => h.patchItem(id, { time })} schedules={h.schedules} />}
        {view === 'galeria' && <Gallery items={shown} labels={h.labels} ctx={{ weekStart, dayStart, focusToday, parts }} streak={streakFor} onOpen={setOpenId} />}
        {view === 'lista' && <ListView items={shown} labels={h.labels} ctx={{ weekStart, dayStart, focusToday, parts }} streak={streakFor} onOpen={setOpenId} />}
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {s.status === 'publicado' && (
          <button type="button" onClick={async () => { if (await confirm({ title: `¿Pasar «${s.name}» a borrador?`, message: 'Deja de salir en Hoy y en el Calendario, y no te avisa. No se borra nada: lo vuelves a publicar cuando quieras.', confirmLabel: 'Pasar a borrador' })) h.unpublish(s.id); }} className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-2 text-sm font-semibold text-zinc-300 ring-1 ring-white/10 hover:bg-white/[0.09] hover:text-white">
            <PauseCircle className="h-4 w-4" /> Pasar a borrador
          </button>
        )}
        <button type="button" onClick={async () => { if (await confirm({ title: `¿Borrar “${s.name}”?`, message: 'Se borran sus tareas. Tu registro de lo cumplido queda guardado.', confirmLabel: 'Borrar', tone: 'danger' })) h.removeSchedule(s.id); }} className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-2 text-sm font-semibold text-zinc-300 ring-1 ring-white/10 hover:bg-rose-500/15 hover:text-rose-300 hover:ring-rose-400/30">
          <Trash2 className="h-4 w-4" /> Borrar este horario
        </button>
      </div>

      {open && <ItemPanel item={open} h={h} c={c} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
      {panel === 'publicar' && <PublishDialog schedule={s} items={h.activeItems} onClose={() => setPanel(null)} onPublish={(a, days) => h.publish(s.id, a, days)} onSetAllAlarms={async () => { for (const i of h.activeItems.filter((x) => x.alarm === 'no')) await h.patchItem(i.id, { alarm: 'notificacion' }); }} onUnpublish={() => h.unpublish(s.id)} />}
      {importing && <ImportHorario onClose={() => setImporting(false)} onCreate={h.createImported} />}
      {panel === 'nuevo' && (
        <Dialog title="Nuevo horario" onClose={() => setPanel(null)}>
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={async () => { setPanel(null); await h.duplicate(s.id, { status: 'borrador' }); }} className="flex items-start gap-3 rounded-2xl bg-white/[0.04] p-4 text-left ring-1 ring-white/10 hover:bg-white/[0.08]">
              <Copy className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
              <span><b className="block font-semibold text-white">Copiar «{s.name}»</b><span className="text-sm text-zinc-400">Parte de este y cámbialo (ej: tu horario de viaje).</span></span>
            </button>
            <button type="button" onClick={() => { setPanel(null); setImporting(true); }} className="flex items-start gap-3 rounded-2xl bg-white/[0.04] p-4 text-left ring-1 ring-white/10 hover:bg-white/[0.08]">
              <FileUp className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
              <span><b className="block font-semibold text-white">Importar</b><span className="text-sm text-zinc-400">Desde una foto, un PDF o un texto.</span></span>
            </button>
          </div>
          <p className="mb-2 text-xs font-semibold text-zinc-400">O parte de una plantilla</p>
          <TemplateGrid onPick={async (id) => { await h.createFrom(id); setPanel(null); }} />
        </Dialog>
      )}
      {(panel === 'etiquetas' || panel === 'nueva-etiqueta') && <LabelsDialog h={h} adding={panel === 'nueva-etiqueta'} uses={labelUse} filter={filter} onFilter={(id) => { setFilter(id); setPanel(null); }} onClose={() => setPanel(null)} />}
    </div>
  );
};

/* ── Modalidad, fases y semana ──────────────────────────────────────── */

type HorarioApi = ReturnType<typeof useHorario>;

/** Sueño y color del horario. (Modalidad y fases quedaron guardadas en Conceptos, 2026-11-04.) */
const ModeBar: React.FC<{ s: Schedule; h: HorarioApi }> = ({ s, h }) => {
  const [sleeping, setSleeping] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-400">
      <button type="button" onClick={() => setSleeping(true)} className="rounded-full px-2.5 py-1 font-semibold ring-1 ring-white/10 hover:text-white"><Moon className="mr-1 inline h-3 w-3" />Sueño</button>
      {sleeping && <Dialog title="Tu sueño" onClose={() => setSleeping(false)}><SleepForm s={s} onSave={async (v) => { await h.setSleep(s.id, v); setSleeping(false); }} /></Dialog>}
      <div className="flex items-center gap-1" role="group" aria-label="Color del horario">
        {LABEL_COLORS.map((c) => <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={s.color === c} onClick={() => h.patchSchedule(s.id, { color: c })} className={`h-4 w-4 rounded-full ${s.color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-[#14161b]' : ''}`} style={{ background: c }} />)}
      </div>
    </div>
  );
};

/** El bloque de sueño sigue a esto en todos los días del horario. */
const SleepForm: React.FC<{ s: Schedule; onSave: (v: Sleep) => Promise<void> }> = ({ s, onSave }) => {
  const [bed, setBed] = useState(s.sleep?.bed ?? '23:00');
  const [wake, setWake] = useState(s.sleep?.wake ?? '07:00');
  const [goal, setGoal] = useState(s.sleep?.goal ?? 8);
  const hours = (((toMinutes(wake) - toMinutes(bed) + 1440) % 1440) || 1440) / 60;
  useUnsaved(bed !== (s.sleep?.bed ?? '23:00') || wake !== (s.sleep?.wake ?? '07:00') || goal !== (s.sleep?.goal ?? 8), () => onSave({ bed, wake, goal }));
  const field = 'w-full rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none ring-1 ring-white/10';
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 text-xs text-zinc-400">
        <label>Acostarse<input type="time" value={bed} onChange={(e) => e.target.value && setBed(e.target.value)} className={`${field} mt-1`} /></label>
        <label>Levantarse<input type="time" value={wake} onChange={(e) => e.target.value && setWake(e.target.value)} className={`${field} mt-1`} /></label>
        <label>Horas objetivo<input type="number" min={1} max={14} step={0.5} value={goal} onChange={(e) => setGoal(Number(e.target.value) || goal)} className={`${field} mt-1`} /></label>
      </div>
      <p className={`mt-3 text-sm ${hours < goal ? 'text-amber-300' : 'text-zinc-400'}`}>Son {hours} horas{hours < goal ? `: te faltan ${goal - hours} para tu objetivo` : ''}.</p>
      <button type="button" onClick={() => onSave({ bed, wake, goal })} className="mt-4 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500">Guardar</button>
    </div>
  );
};

/* ── Primer uso ─────────────────────────────────────────────────────── */

const Start: React.FC<{ onPick: (id: string) => Promise<unknown>; onImport: () => void }> = ({ onPick, onImport }) => (
  <div className="mx-auto max-w-2xl py-10 text-center" data-tour="horario">
    <h1 className="font-display text-4xl font-semibold text-white">Arma tu horario</h1>
    <p className="mt-2 text-zinc-400">Parte desde una plantilla. Queda en vista previa hasta que lo publiques.</p>
    <div className="mt-8 text-left"><TemplateGrid onPick={onPick} /></div>
    <button type="button" onClick={onImport} className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-3.5 py-2 text-sm font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.09]">
      <FileUp className="h-4 w-4" /> Ya tengo un horario: importarlo
    </button>
  </div>
);

const TemplateGrid: React.FC<{ onPick: (id: string) => Promise<unknown> }> = ({ onPick }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {TEMPLATES.map((t) => (
        <button key={t.id} type="button" disabled={busy} onClick={async () => { setBusy(true); await onPick(t.id); setBusy(false); }} className="overflow-hidden rounded-2xl bg-white/[0.04] text-left ring-1 ring-white/10 transition hover:bg-white/[0.08] disabled:opacity-50">
          <div className="h-20 bg-white/[0.05]" style={coverCss(t.cover)} />
          <div className="p-4">
            <p className="font-semibold text-white">{t.emoji} {t.name}</p>
            <p className="mt-1 text-sm text-zinc-400">{t.hint}</p>
          </div>
        </button>
      ))}
    </div>
  );
};

/* ── Tarjeta ────────────────────────────────────────────────────────── */

const labelOf = (labels: Label[], id: string | null) => labels.find((l) => l.id === id) ?? null;

const Pill: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: `${color}26`, color }}>
    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} /> {children}
  </span>
);

type Status = 'hecho' | 'curso' | 'no' | 'pendiente' | null;
const STATUS = { hecho: { label: '✅ Hecho hoy', color: '#22c55e' }, curso: { label: '⏳ En eso hoy', color: '#f59e0b' }, no: { label: '✖️ No lo hice hoy', color: '#f43f5e' }, pendiente: { label: 'Pendiente hoy', color: '#94a3b8' } };
const Chip: React.FC<{ color: string; icon: React.ElementType; children: React.ReactNode; help: string }> = ({ color, icon: I, children, help }) => (
  <span data-help={help} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: `${color}22`, color }}><I className="h-3.5 w-3.5" />{children}</span>
);

type Streak = { n: number; ghost: boolean; missed?: boolean };

/** Racha (Emanuel, 2026-11-04): el fueguito y el número. ✕ si ese día no se cumplió; en gris lo que viene. */
const StreakChip: React.FC<{ streak: Streak }> = ({ streak }) => {
  if (streak.missed) return <span data-help="Este día no se cumplió: la racha vuelve a partir" className="inline-flex items-center rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-bold text-rose-300">✕</span>;
  const lit = !streak.ghost && streak.n > 0;
  return (
    <span data-help={streak.ghost ? 'La racha que alcanzas si cumples hasta este día' : 'Días seguidos cumplidos'} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${lit ? 'bg-amber-500/15 text-amber-300' : 'bg-white/[0.06] text-zinc-400'}`}>
      <span aria-hidden className={lit ? '' : 'grayscale opacity-60'}>🔥</span>{streak.n}
    </span>
  );
};

const Card: React.FC<{ item: Item; labels: Label[]; crossed?: string[]; streak?: Streak; status?: Status; clash?: Occurrence[]; warn?: string; late?: string; ownTime?: boolean; mark?: string; move?: { time?: string; off?: boolean }; onOpen: (id: string) => void; draggable?: boolean }> = ({ item, labels, crossed = [], streak, status = null, clash = [], warn, late, ownTime, mark, move, onOpen, draggable }) => {
  const label = labelOf(labels, item.label_id);
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
      onClick={() => onOpen(item.id)}
      className={`relative z-10 block w-full overflow-hidden rounded-xl bg-[#17191f]/90 text-left ring-1 backdrop-blur-sm transition hover:bg-[#1d2027] ${clash.length || crossed.length || warn ? 'ring-rose-400/60' : 'ring-white/10'} ${mark ? 'ai-mark' : ''}`}
      style={mark ? ({ ['--mark' as string]: mark } as React.CSSProperties) : undefined}
    >
      {item.cover_url && <div className="h-16" style={coverCss(item.cover_url)} />}
      <div className="space-y-2 p-3">
        <p className="flex items-center gap-2 font-semibold text-white">
          <ItemIcon value={item.icon || emojiFor(item.title)} />
          <span className="min-w-0 flex-1 truncate">{item.title || 'Sin título'}</span>
        </p>
        <div className="flex flex-col items-start gap-1.5">
          {(status || streak) && (
            <span className="flex flex-wrap items-center gap-1.5">
              {status && <Pill color={STATUS[status].color}>{STATUS[status].label}</Pill>}
              {streak && <StreakChip streak={streak} />}
            </span>
          )}
          {clash.map((o) => <Pill key={o.key} color="#f43f5e">⚠️ Choca con {o.ev.title} ({fmtTime(o.start)})</Pill>)}
          {ownTime && <span data-help="Esta acción tiene otra hora este día (misma racha)"><Pill color="#a1a1aa">🕐 Hora propia de este día</Pill></span>}
          {warn && <Pill color="#f43f5e">⏰ {warn}</Pill>}
          {late && <span data-help="Esta parte del día ya pasó y no la marcaste"><Pill color="#fb7185">⌛ {late}</Pill></span>}
          {crossed.length > 0 && <Pill color="#f43f5e">⚠️ Se cruza con {crossed.join(', ')}</Pill>}
          {move?.off && <Pill color="#94a3b8">⏸️ Aplazado este día</Pill>}
          {!move?.off && move?.time && move.time !== item.time && <Pill color="#38bdf8">↪ Solo este día</Pill>}
          {label && <Pill color={label.color}>{label.icon} {label.name}</Pill>}
        </div>
        <div className="flex items-center gap-2 text-sm tabular-nums text-zinc-400">
          {/* Si ese día se reacomodó, la hora que vale es la nueva (la de siempre queda tachada). */}
          {!move?.off && move?.time && move.time !== item.time ? <span><span className="font-semibold text-sky-200">{move.time}</span> <span className="text-xs text-zinc-500 line-through">{item.time}</span></span> : <span>{item.time}</span>}
          <span className="ml-auto flex items-center gap-1.5">
            {item.focus && <Chip color="#a78bfa" icon={Zap} help="Tiene modo focus">Focus</Chip>}
            {item.alarm === 'alarma' && <Chip color="#f59e0b" icon={AlarmClock} help="Suena una alarma">Alarma</Chip>}
            {item.alarm === 'notificacion' && <Chip color="#38bdf8" icon={Bell} help="Te llega una notificación">Aviso</Chip>}
          </span>
        </div>
      </div>
    </button>
  );
};

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* ── Vistas ─────────────────────────────────────────────────────────── */

type ViewProps = { items: Item[]; labels: Label[]; onOpen: (id: string) => void };

/** Eventos del calendario que se cruzan con un bloque de ese día. */
const clashes = (i: Item, day: Occurrence[]) => {
  const a = toMinutes(i.time);
  const b = a + i.minutes;
  return day.filter((o) => !o.ev.all_day && minutesOf(o.start) < b && (sameDay(o.start, o.end) ? minutesOf(o.end) : 1440) > a);
};

/** Un evento del calendario dentro del tablero (borde punteado con su color). */
/**
 * Un evento del calendario es una tarjeta más del día (Emanuel, 2026-11-04): mismo tamaño que las
 * acciones, con el color del evento, su hora de inicio a fin y el sello «Calendario» en vez de racha/focus.
 */
const evChip = (o: Occurrence) => {
  const color = colorOf(o.ev);
  const kind = KINDS.find((k) => k.id === o.ev.kind);
  const google = o.ev.source === 'google';
  return (
    <div key={o.key} data-help="Está en tu calendario: se respeta al reacomodar" className="relative z-10 overflow-hidden rounded-xl border text-left backdrop-blur-sm" style={{ background: `linear-gradient(135deg, ${color}2e, ${color}10 60%), #17191fe6`, borderColor: `${color}66`, borderLeft: `3px solid ${color}` }}>
      <div className="space-y-2 p-3">
        <p className="flex items-center gap-2 font-semibold text-white">
          <span aria-hidden>{kind?.emoji ?? '📅'}</span>
          <span className="min-w-0 flex-1 truncate">{o.ev.title}</span>
        </p>
        <span className="flex flex-wrap items-center gap-1.5">
          <Pill color={color}>📅 Calendario{google ? ' · Google' : ''}</Pill>
          {kind && kind.id !== 'evento' && <Pill color={color}>{kind.label}</Pill>}
        </span>
        <div className="flex items-center gap-2 text-sm tabular-nums text-zinc-300">
          <span>{o.ev.all_day ? 'Todo el día' : `${fmtTime(o.start)} – ${fmtTime(o.end)}`}</span>
          <span className="ml-auto"><Chip color={color} icon={CalendarClock} help="Evento fijo de tu calendario">Evento</Chip></span>
        </div>
      </div>
    </div>
  );
};

/** Una actividad agregada solo para ese día (al reacomodar, ej. «Elegir la ropa»). */
const ExtraCard: React.FC<{ x: Extra }> = ({ x }) => (
  <div data-help="Agregada solo para este día" className="relative z-10 rounded-xl border border-dashed border-emerald-400/50 bg-emerald-500/[0.07] p-3 text-left backdrop-blur-sm">
    <p className="flex items-center gap-2 font-semibold text-white"><span aria-hidden>{emojiFor(x.title)}</span><span className="min-w-0 flex-1 truncate">{x.title}</span></p>
    <div className="mt-2 flex items-center gap-2 text-sm tabular-nums text-zinc-300">
      <span>{x.time} – {toTime(toMinutes(x.time) + x.minutes)}</span>
      <span className="ml-auto"><Pill color="#34d399">✨ Solo este día</Pill></span>
    </div>
  </div>
);

/** Barra de la IA: qué marcó, por qué y (si propuso cambios) la lista con «Aplicar». */
const AIMarksBar: React.FC<{ marks: AIMarks; present: number; onApply: () => Promise<void> }> = ({ marks, present, onApply }) => {
  const color = MARK_COLORS[marks.color] ?? '#facc15';
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const changes = marks.changes ?? [];
  const describe = (c: AIChange) => [c.patch.label && `categoría ${c.patch.label}`, c.patch.icon && `ícono ${c.patch.icon}`, c.patch.time && `a las ${c.patch.time}`, c.patch.minutes && `${c.patch.minutes} min`, c.patch.flex && ({ obligatorio: 'no negociable', flexible: 'modificable', secundario: 'flexible' } as Record<string, string>)[c.patch.flex], c.patch.alarm && ({ no: 'sin aviso', notificacion: '🔔 notificación', alarma: '⏰ alarma' } as Record<string, string>)[c.patch.alarm], typeof c.patch.alarm_before === 'number' && (c.patch.alarm_before ? `${c.patch.alarm_before} min antes` : 'a la hora'), typeof c.patch.focus === 'boolean' && (c.patch.focus ? 'con focus' : 'sin focus'), c.patch.description !== undefined && 'descripción nueva'].filter(Boolean).join(', ');
  return (
    <div className="mb-3 space-y-2 rounded-xl px-3 py-2.5 text-sm ring-1" style={{ background: `${color}14`, ['--tw-ring-color' as string]: `${color}55` }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1 font-semibold text-white">✨ La IA marcó {present} {present === 1 ? 'acción' : 'acciones'}{marks.reason ? `: ${marks.reason}` : ''}</span>
        <button type="button" onClick={() => setMarks(null)} className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-white/10">Quitar marcas</button>
      </div>
      {changes.length > 0 && (
        <div className="space-y-1.5">
          {marks.summary && <p className="text-zinc-300">{marks.summary}</p>}
          <ul className="space-y-0.5 text-xs text-zinc-300">
            {(all ? changes : changes.slice(0, 6)).map((c, k) => <li key={k}>↪ <b className="text-white">{c.title}</b> ({c.day}): {describe(c)}</li>)}
          </ul>
          {changes.length > 6 && <button type="button" onClick={() => setAll((v) => !v)} className="text-xs font-semibold text-sky-300">{all ? 'Ver menos' : `Ver los ${changes.length}`}</button>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onApply(); } finally { setBusy(false); } }} className="rounded-lg px-3 py-1.5 text-xs font-bold text-[#09090b] disabled:opacity-60" style={{ background: color }}>{busy ? 'Aplicando…' : `Aplicar ${changes.length} ${changes.length === 1 ? 'cambio' : 'cambios'}`}</button>
            <button type="button" onClick={() => setMarks(null)} className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.1]">Descartar</button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Partes del día (Emanuel, 2026-11-04, como en su Notion): Madrugada, Mañana, Tarde y Noche, cada una
 * desde la hora que elija. Hoy, lo que ya pasó se pliega; lo que no hiciste en esa parte, se pasó.
 */
export type Parts = { manana: string; tarde: string; noche: string };
const PARTS_DEFAULT: Parts = { manana: '06:00', tarde: '12:00', noche: '19:00' };
const PART_INFO = {
  madrugada: { name: 'Madrugada', emoji: '🌙', cls: 'text-indigo-300' },
  manana: { name: 'Mañana', emoji: '☀️', cls: 'text-amber-300' },
  tarde: { name: 'Tarde', emoji: '🌤️', cls: 'text-orange-300' },
  noche: { name: 'Noche', emoji: '🌆', cls: 'text-violet-300' },
} as const;
type PartKey = keyof typeof PART_INFO;
const partOf = (m: number, p: Parts): PartKey => (m < toMinutes(p.manana) ? 'madrugada' : m < toMinutes(p.tarde) ? 'manana' : m < toMinutes(p.noche) ? 'tarde' : 'noche');
const partRange = (k: PartKey, p: Parts): [number, number] =>
  k === 'madrugada' ? [0, toMinutes(p.manana)] : k === 'manana' ? [toMinutes(p.manana), toMinutes(p.tarde)] : k === 'tarde' ? [toMinutes(p.tarde), toMinutes(p.noche)] : [toMinutes(p.noche), 1440];

const PartsForm: React.FC<{ value: Parts; onSave: (p: Parts) => void }> = ({ value, onSave }) => {
  const [v, setV] = useState(value);
  const ok = toMinutes(v.manana) < toMinutes(v.tarde) && toMinutes(v.tarde) < toMinutes(v.noche);
  const field = 'mt-1 w-full rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none ring-1 ring-white/10';
  return (
    <div>
      <p className="text-sm text-zinc-400">¿A qué hora parte cada parte de tu día? Antes de la mañana es madrugada.</p>
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-zinc-400">
        {(['manana', 'tarde', 'noche'] as const).map((k) => (
          <label key={k}>{PART_INFO[k].emoji} {PART_INFO[k].name}<input type="time" value={v[k]} onChange={(e) => e.target.value && setV({ ...v, [k]: e.target.value })} className={field} /></label>
        ))}
      </div>
      {!ok && <p className="mt-2 text-sm text-amber-300">Tienen que ir en orden: mañana, tarde y noche.</p>}
      <div className="mt-4 flex justify-between">
        <button type="button" onClick={() => setV(PARTS_DEFAULT)} className="text-sm font-semibold text-zinc-400 hover:text-white">Volver a 6 · 12 · 19</button>
        <button type="button" disabled={!ok} onClick={() => onSave(v)} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500 disabled:opacity-50">Guardar</button>
      </div>
    </div>
  );
};

const Board: React.FC<ViewProps & { streak?: (i: Item, date?: Date) => Streak; status?: (i: Item) => Status; weekStart?: Date; occ?: Occurrence[]; planOf?: (d: Date) => DayPlan | null; onApply?: (date: Date, p: { moves: Moves; extras?: Extra[] }) => void; onUndo?: () => void; markOf?: (id: string) => string | undefined; dayStart?: string; focusToday?: boolean; parts?: Parts; onAdd: (d: number) => void; onMove: (id: string, d: number) => void }> = ({ items, labels, streak, status, weekStart, occ = [], planOf, onApply, onUndo, markOf, dayStart = 'h:00:00', focusToday = false, parts = PARTS_DEFAULT, onOpen, onAdd, onMove }) => {
  // Partes plegadas o abiertas a mano (por día). Sin tocar: hoy se pliega lo que ya pasó.
  const [fold, setFold] = useState<Record<string, boolean>>({});
  // Una acción con hora distinta algunos días: esos días llevan «🕐 Hora propia» (la hora más común es la normal).
  const usual = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const i of items) {
      const k = `${i.schedule_id}|${refOf(i.title)}`;
      const c = m.get(k) ?? new Map<string, number>();
      c.set(`${i.time}|${i.minutes}`, (c.get(`${i.time}|${i.minutes}`) ?? 0) + 1);
      m.set(k, c);
    }
    return (i: Item) => {
      const c = m.get(`${i.schedule_id}|${refOf(i.title)}`);
      if (!c || c.size < 2) return false;
      const top = [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return `${i.time}|${i.minutes}` !== top;
    };
  }, [items]);
  // Después de reacomodar: «¿Te gustó el cambio?» con lo que se movió (y lo que dijo la IA).
  const [review, setReview] = useState<{ d: number; lines: Line[]; summary?: string } | null>(null);
  const today = weekdayOf(new Date());
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <div ref={scroller} className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0" data-tour="tablero">
      {WEEK.map((name, d) => {
        const date = weekStart ? addDays(weekStart, d) : null;
        const dayOcc = date ? occ.filter((o) => sameDay(o.start, date)).sort((a, b) => +a.start - +b.start) : [];
        const plan = date ? planOf?.(date) ?? null : null;
        // Ordenadas por la hora que valen ESE día (si reacomodaste, con la hora nueva).
        const eff = (i: Item) => toMinutes(plan?.moves?.[i.id]?.time ?? i.time);
        const dayItems = items.filter((i) => i.weekday === d).sort((a, b) => eff(a) - eff(b));
        // Los eventos del calendario van entre las acciones, según su hora (los de todo el día, arriba).
        const timed = dayOcc.filter((o) => !o.ev.all_day);
        // La rutina de la mañana después de un evento temprano (ej. carrera 7:00, levantarse 9:00) también es choque.
        const morning = morningConflict(dayItems, dayOcc, plan);
        // Todo el día en una sola fila por hora: acciones, eventos del calendario y lo agregado solo ese día.
        type Entry = { key: string; start: number; end: number } & ({ kind: 'item'; i: Item } | { kind: 'ev'; o: Occurrence } | { kind: 'extra'; x: Extra });
        const entries: Entry[] = [
          ...dayItems.map((i): Entry => ({ kind: 'item', i, key: i.id, start: eff(i), end: plan?.moves?.[i.id]?.off ? eff(i) : eff(i) + i.minutes })),
          ...timed.map((o): Entry => ({ kind: 'ev', o, key: o.key, start: minutesOf(o.start), end: sameDay(o.start, o.end) ? minutesOf(o.end) : 1440 })),
          ...(plan?.extras ?? []).map((x): Entry => ({ kind: 'extra', x, key: x.id, start: toMinutes(x.time), end: toMinutes(x.time) + x.minutes })),
        ];
        // «Comenzar desde» (Emanuel, 2026-11-04): el día parte a esa hora (o en esa acción, ej. Levantarse);
        // lo que cae antes (madrugada) va al final.
        const s0 = dayStart.startsWith('a:') ? (() => { const a = dayItems.find((i) => refOf(i.title) === dayStart.slice(2)); return a ? eff(a) : 0; })() : toMinutes(dayStart.slice(2) || '00:00');
        const rel = (m: number) => (m - s0 + 1440) % 1440;
        entries.sort((a, b) => rel(a.start) - rel(b.start) || (a.kind === 'ev' ? -1 : b.kind === 'ev' ? 1 : 0));
        // «Enfocar hoy» (Emanuel, 2026-11-04): lo que pasó en gris, hoy a todo color, lo que viene a media luz.
        const now = new Date();
        const when = date ? Math.sign(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) : 0;
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const tone = (e: Entry) => {
          if (!focusToday || !date) return '';
          if (when < 0) return 'tone-past';
          if (when > 0) return 'tone-next';
          const madrugada = s0 > 0 && e.start < s0;
          return !madrugada && e.end <= nowMin ? 'tone-past' : '';
        };
        const hasClash = !!morning || dayItems.some((i) => !plan?.moves?.[i.id]?.off && clashes({ ...i, time: plan?.moves?.[i.id]?.time ?? i.time }, dayOcc).length > 0);
        return (
        <section
          key={name}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const id = e.dataTransfer.getData('text/plain');
            if (id) onMove(id, d);
          }}
          className="relative w-64 shrink-0 overflow-hidden rounded-2xl bg-white/[0.025] p-2 ring-1 ring-white/5"
        >
          {date && <span aria-hidden className="pointer-events-none absolute -right-1 -top-4 select-none font-display text-[104px] font-black leading-none tracking-tighter text-white/[0.07]">{date.getDate()}</span>}
          <h2 className="relative px-2 py-1.5"><span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${(date ? sameDay(date, new Date()) : d === today) ? 'bg-sky-500/20 text-sky-200' : 'bg-white/[0.06] text-zinc-300'}`}>{name}{date && <span className="ml-1 font-normal opacity-70">{date.getDate()} {MONTHS_SHORT[date.getMonth()]}</span>}</span></h2>
          <div className="relative mt-1 space-y-2">
            {dayOcc.filter((o) => o.ev.all_day).map(evChip)}
            {hasClash && date && onApply && review?.d !== d && (
              <button
                type="button"
                onClick={() => {
                  const p = proposeDay(dayItems, dayOcc, plan);
                  onApply(date, { moves: p.moves });
                  setReview({ d, lines: p.lines });
                }}
                className="neon-red flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-2 py-2 text-xs font-bold text-[#fff] hover:bg-rose-500"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#fff]" /> Reacomodar este día
              </button>
            )}
            {!hasClash && date && onApply && review?.d !== d && (Object.keys(plan?.moves ?? {}).length > 0 || (plan?.extras?.length ?? 0) > 0) && (
              <button type="button" onClick={() => setReview({ d, lines: [] })} className="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-sky-300 ring-1 ring-sky-400/20 hover:bg-sky-500/10"><Sparkles className="h-3.5 w-3.5" /> Día reacomodado · ajustar</button>
            )}
            {review?.d === d && date && (
              <AdjustBox
                title={`Reacomodé el ${name.toLowerCase()} ${date.getDate()}`}
                lines={review.lines}
                summary={review.summary}
                onLike={() => setReview(null)}
                onUndo={() => {
                  onUndo?.();
                  setReview(null);
                }}
                onSend={async (text) => {
                  const r = await adjustDayAI({ dayLabel: `${name} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`, items: dayItems, events: dayOcc, plan, request: text });
                  onApply?.(date, { moves: r.moves, extras: r.extras });
                  setReview({ d, lines: r.lines, summary: r.summary });
                }}
              />
            )}
            {entries.map((e, n) => {
              const part = partOf(e.start, parts);
              const head = n === 0 || partOf(entries[n - 1].start, parts) !== part;
              const [, partEnd] = partRange(part, parts);
              // Hoy: una parte ya pasó cuando terminó (la madrugada del final es la de esta noche, esa no).
              const passed = when === 0 && !!date && partEnd <= nowMin && !(part === 'madrugada' && s0 > 0);
              const fk = `${d}:${part}`;
              const folded = fold[fk] ?? passed;
              const mine = entries.filter((x) => partOf(x.start, parts) === part);
              const acts = mine.filter((x): x is Extract<Entry, { kind: 'item' }> => x.kind === 'item' && !plan?.moves?.[x.i.id]?.off);
              const done = status ? acts.filter((x) => status(x.i) === 'hecho').length : 0;
              const info = PART_INFO[part];
              const prevEnd = n ? Math.max(...entries.slice(0, n).map((x) => rel(x.start) + (x.end - x.start))) : null;
              const free = prevEnd !== null && rel(e.start) - prevEnd >= 15 ? rel(e.start) - prevEnd : 0;
              const st = e.kind === 'item' ? status?.(e.i) : null;
              const late = passed && e.kind === 'item' && (st === 'pendiente' || st === 'curso') ? `Se pasó la ${info.name.toLowerCase()}` : undefined;
              return (
                <React.Fragment key={e.key}>
                  {head && (
                    <button type="button" onClick={() => setFold((f) => ({ ...f, [fk]: !folded }))} aria-expanded={!folded} className={`flex w-full items-center gap-2 rounded-lg px-2 pb-0.5 pt-2 text-left text-xs font-semibold hover:bg-white/[0.03] ${info.cls}`}>
                      <span aria-hidden>{info.emoji}</span> {info.name}
                      {folded && acts.length > 0 && <span className="font-normal text-zinc-400">· {status ? `${done} de ${acts.length} hechas` : `${acts.length} ${acts.length === 1 ? 'tarea' : 'tareas'}`}{status && acts.length - done > 0 && passed ? <span className="text-rose-300"> · {acts.length - done} se pasaron</span> : null}</span>}
                      <span className="ml-auto h-px flex-1 bg-current opacity-20" />
                      <ChevronDown className={`h-3.5 w-3.5 opacity-60 transition-transform ${folded ? '-rotate-90' : ''}`} />
                    </button>
                  )}
                  {!folded && free > 0 && !head && <p className="px-2 text-xs text-zinc-500">{free} min libres</p>}
                  {!folded && <div className={tone(e)}>
                  {e.kind === 'ev' ? evChip(e.o) : e.kind === 'extra' ? <ExtraCard x={e.x} /> : (() => {
                    const i = e.i;
                    return <Card item={i} labels={labels} crossed={[...new Set(overlaps(dayItems.filter((x) => x.id !== i.id && !plan?.moves?.[x.id]?.off).map((x) => ({ ...x, time: plan?.moves?.[x.id]?.time ?? x.time })), plan?.moves?.[i.id]?.time ?? i.time, i.minutes).map((x) => x.title))]} streak={streak?.(i, date ?? undefined)} status={status?.(i)} clash={plan?.moves?.[i.id]?.off ? [] : clashes({ ...i, time: plan?.moves?.[i.id]?.time ?? i.time }, dayOcc)} move={plan?.moves?.[i.id]} ownTime={usual(i)} mark={markOf?.(i.id)} warn={morning?.items.some((x) => x.id === i.id) ? `Levántate antes: ${morning.event.ev.title} es a las ${fmtTime(morning.event.start)}` : undefined} late={late} onOpen={onOpen} draggable />;
                  })()}
                  </div>}
                </React.Fragment>
              );
            })}
            <button type="button" onClick={() => onAdd(d)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-sm text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200">
              <Plus className="h-4 w-4" /> Nueva tarea
            </button>
          </div>
        </section>
        );
      })}
    </div>
  );
};

const HOUR = 44;
const SNAP = 15;
/** Arrastrar un bloque hacia arriba o abajo cambia su hora. Sin moverlo, lo abre. */
const useTimeDrag = (onMove: (id: string, time: string) => void, onOpen: (id: string) => void) => {
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null);
  const start = (e: React.PointerEvent, i: Item) => {
    const from = e.clientY;
    let dy = 0;
    const box = e.currentTarget as HTMLElement;
    box.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      dy = Math.round(((ev.clientY - from) / HOUR) * (60 / SNAP)) * (SNAP / 60) * HOUR;
      setDrag({ id: i.id, dy });
    };
    const up = () => {
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      setDrag(null);
      if (!dy) return onOpen(i.id);
      onMove(i.id, toTime(Math.max(0, Math.min(1425, toMinutes(i.time) + Math.round((dy / HOUR) * 60)))));
    };
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
  };
  return { drag, start };
};

/* ── Lo mismo en todas las vistas (Emanuel, 2026-11-04): semana, Comenzar desde, partes y Enfocar hoy ── */

type DayCtx = { weekStart: Date; dayStart: string; focusToday: boolean; parts: Parts };
/** Minuto en que parte el día según «Comenzar desde» (una hora, o la hora de una acción ese día). */
const startOfDay = (dayStart: string, dayItems: Item[]) => {
  if (!dayStart.startsWith('a:')) return toMinutes(dayStart.slice(2) || '00:00');
  const a = dayItems.find((i) => refOf(i.title) === dayStart.slice(2));
  return a ? toMinutes(a.time) : 0;
};
const dayDiff = (date: Date) => {
  const n = new Date();
  return Math.sign(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime());
};
/** Clase de «Enfocar hoy»: lo que pasó en gris, hoy a todo color (lo terminado en gris), lo que viene a media luz. */
const toneOf = (ctx: DayCtx, date: Date, s0: number, start: number, end: number) => {
  if (!ctx.focusToday) return '';
  const w = dayDiff(date);
  if (w < 0) return 'tone-past';
  if (w > 0) return 'tone-next';
  const now = new Date();
  return !(s0 > 0 && start < s0) && end <= now.getHours() * 60 + now.getMinutes() ? 'tone-past' : '';
};
/** Los días de la semana con sus acciones en el orden de «Comenzar desde». */
const daysOfWeek = (items: Item[], ctx: DayCtx) =>
  WEEK.map((name, d) => {
    const date = addDays(ctx.weekStart, d);
    const list = items.filter((i) => i.weekday === d);
    const s0 = startOfDay(ctx.dayStart, list);
    const rel = (m: number) => (m - s0 + 1440) % 1440;
    return { name, d, date, s0, list: [...list].sort((a, b) => rel(toMinutes(a.time)) - rel(toMinutes(b.time))) };
  });
const PartTag: React.FC<{ k: PartKey }> = ({ k }) => <span className={`text-xs font-semibold ${PART_INFO[k].cls}`}>{PART_INFO[k].emoji} {PART_INFO[k].name}</span>;
const DayTitle: React.FC<{ name: string; date: Date }> = ({ name, date }) => (
  <span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${sameDay(date, new Date()) ? 'bg-sky-500/20 text-sky-200' : 'bg-white/[0.06] text-zinc-300'}`}>{name}<span className="ml-1 font-normal opacity-70">{date.getDate()} {MONTHS_SHORT[date.getMonth()]}</span></span>
);

const WeekGrid: React.FC<ViewProps & { ctx: DayCtx; onMove: (id: string, time: string) => void; schedules?: Schedule[] }> = ({ items, labels, ctx, onOpen, onMove, schedules }) => {
  const { drag, start } = useTimeDrag(onMove, onOpen);
  // Una sola regla de horas para toda la semana: parte en la hora de «Comenzar desde» (lo de antes va al final).
  const base = Math.floor(startOfDay(ctx.dayStart, items) / 60) * 60;
  const rel = (m: number) => (m - base + 1440) % 1440;
  const rels = items.map((i) => rel(toMinutes(i.time)));
  const from = Math.floor((rels.length ? Math.min(...rels) : 360) / 60);
  const to = Math.min(24, Math.ceil(Math.max(rels.length ? Math.max(...items.map((i) => rel(toMinutes(i.time)) + i.minutes)) : 1320, from * 60 + 240) / 60));
  const y = (m: number) => ((rel(m) - from * 60) / 60) * HOUR;
  const lines = (['madrugada', 'manana', 'tarde', 'noche'] as const).map((k) => ({ k, top: y(partRange(k, ctx.parts)[0]) })).filter((l) => l.top >= 0 && l.top < (to - from) * HOUR);
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="grid min-w-[880px] grid-cols-[3rem_repeat(7,1fr)] gap-x-1.5">
        <span />
        {WEEK.map((n, d) => {
          const s = schedules?.find((x) => x.status === 'publicado' && daysOf(x).includes(d));
          return (
            <div key={n} className="pb-2 text-center">
              <DayTitle name={n} date={addDays(ctx.weekStart, d)} />
              {schedules && <p className="mt-1 truncate text-[11px] font-semibold" style={{ color: s?.color ?? '#a1a1aa' }}>{s ? scheduleLabel(s) : 'Libre'}</p>}
            </div>
          );
        })}
        <div className="relative" style={{ height: (to - from) * HOUR }}>
          {Array.from({ length: to - from }, (_, i) => <span key={i} className="absolute right-1 text-[11px] tabular-nums text-zinc-500" style={{ top: i * HOUR }}>{(base / 60 + from + i) % 24}:00</span>)}
        </div>
        {WEEK.map((n, d) => {
          const date = addDays(ctx.weekStart, d);
          return (
            <div key={n} className={`relative rounded-lg bg-white/[0.025] ${ctx.focusToday && dayDiff(date) !== 0 ? (dayDiff(date) < 0 ? 'tone-past' : 'tone-next') : ''}`} style={{ height: (to - from) * HOUR }}>
              {lines.map((l) => (
                <div key={l.k} className={`pointer-events-none absolute inset-x-0 border-t border-dashed border-current opacity-40 ${PART_INFO[l.k].cls}`} style={{ top: l.top }}>
                  {d === 0 && <span className="absolute left-1 top-0.5 text-[10px] font-semibold">{PART_INFO[l.k].emoji} {PART_INFO[l.k].name}</span>}
                </div>
              ))}
              {items.filter((i) => i.weekday === d).map((i) => {
                const color = schedules?.find((x) => x.id === i.schedule_id)?.color ?? labelOf(labels, i.label_id)?.color ?? '#94a3b8';
                const m = toMinutes(i.time);
                return (
                  <button key={i.id} type="button" aria-label={`${i.title}, ${i.time}`} onPointerDown={(e) => start(e, i)} className={`absolute inset-x-0.5 cursor-grab touch-none overflow-hidden rounded-md px-1.5 py-0.5 text-left text-xs font-medium text-white active:cursor-grabbing ${dayDiff(date) === 0 ? toneOf(ctx, date, base, m, m + i.minutes) : ''}`} style={{ top: y(m) + (drag?.id === i.id ? drag.dy : 0), height: Math.max(20, (i.minutes / 60) * HOUR - 2), background: `${color}40`, borderLeft: `3px solid ${color}` }}>
                    <span className="block truncate"><ItemIcon value={i.icon || emojiFor(i.title)} /> {i.title}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Galería: cada día con sus portadas, en el orden del día y con sus partes. */
const Gallery: React.FC<ViewProps & { ctx: DayCtx; streak?: (i: Item, date?: Date) => Streak }> = ({ items, labels, ctx, streak, onOpen }) => (
  <div className="space-y-6">
    {daysOfWeek(items, ctx).filter((g) => g.list.length).map((g) => (
      <section key={g.d}>
        <h2 className="mb-2"><DayTitle name={g.name} date={g.date} /></h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {g.list.map((i) => {
            const m = toMinutes(i.time);
            const l = labelOf(labels, i.label_id);
            return (
              <button key={i.id} type="button" onClick={() => onOpen(i.id)} className={`overflow-hidden rounded-2xl bg-white/[0.04] text-left ring-1 ring-white/10 hover:bg-white/[0.08] ${toneOf(ctx, g.date, g.s0, m, m + i.minutes)}`}>
                <div className="flex h-24 items-center justify-center bg-white/[0.04] text-3xl" style={coverCss(i.cover_url)}>{!i.cover_url && <ItemIcon value={i.icon || emojiFor(i.title)} />}</div>
                <div className="space-y-1.5 p-3">
                  <p className="truncate font-semibold text-white">{i.title || 'Sin título'}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm tabular-nums text-zinc-400">{i.time}</span>
                    <PartTag k={partOf(m, ctx.parts)} />
                    {streak && <StreakChip streak={streak(i, g.date)} />}
                    {l && <Pill color={l.color}>{l.name}</Pill>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    ))}
  </div>
);

/** Lista: un bloque por día, separado por partes del día. */
const ListView: React.FC<ViewProps & { ctx: DayCtx; streak?: (i: Item, date?: Date) => Streak }> = ({ items, labels, ctx, streak, onOpen }) => (
  <div className="space-y-4">
    {daysOfWeek(items, ctx).filter((g) => g.list.length).map((g) => (
      <section key={g.d} className="rounded-2xl bg-white/[0.025] ring-1 ring-white/5">
        <h2 className="px-4 pb-1 pt-3"><DayTitle name={g.name} date={g.date} /></h2>
        <ul>
          {g.list.map((i, n) => {
            const m = toMinutes(i.time);
            const part = partOf(m, ctx.parts);
            const head = n === 0 || partOf(toMinutes(g.list[n - 1].time), ctx.parts) !== part;
            const l = labelOf(labels, i.label_id);
            return (
              <li key={i.id} className="border-b border-white/5 last:border-0">
                {head && <p className="px-4 pb-0.5 pt-2"><PartTag k={part} /></p>}
                <button type="button" onClick={() => onOpen(i.id)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04] ${toneOf(ctx, g.date, g.s0, m, m + i.minutes)}`}>
                  <span className="w-12 shrink-0 text-sm tabular-nums text-zinc-400">{i.time}</span>
                  <span className="min-w-0 flex-1 truncate text-white"><ItemIcon value={i.icon || emojiFor(i.title)} /> {i.title}</span>
                  {streak && <StreakChip streak={streak(i, g.date)} />}
                  {l && <span className="hidden sm:inline"><Pill color={l.color}>{l.name}</Pill></span>}
                  {i.alarm !== 'no' && <Bell className="h-3.5 w-3.5 shrink-0 text-sky-300" />}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    ))}
  </div>
);

/* ── Ventanas ───────────────────────────────────────────────────────── */

/** Ventana del Horario. Si lo de adentro usa useUnsaved, al cerrar pregunta si guardar. */
export const Dialog: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  const guard = useGuardedClose(onClose);
  return (
  <BodyPortal>
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={guard.close}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-[#14161b] p-5 ring-1 ring-white/10 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button type="button" onClick={guard.close} aria-label="Cerrar" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <UnsavedScope register={guard.register}>{children}</UnsavedScope>
        {guard.bar}
      </div>
    </div>
  </BodyPortal>
  );
};

const PublishDialog: React.FC<{ schedule: Schedule; items: Item[]; onClose: () => void; onPublish: (a: Schedule['alarms'], days: number[]) => Promise<boolean>; onSetAllAlarms: () => Promise<void>; onUnpublish: () => Promise<void> }> = ({ schedule, items, onClose, onPublish, onSetAllAlarms, onUnpublish }) => {
  const [alarms, setAlarms] = useState<Schedule['alarms']>(schedule.alarms);
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle');
  const [days, setDays] = useState(daysOf(schedule));
  const marked = items.filter((i) => i.alarm !== 'no').length;
  const options: { id: Schedule['alarms']; title: string; hint: string }[] = [
    { id: 'todas', title: 'Avisar en todas las tareas', hint: `Las ${items.length} tareas tendrán aviso` },
    { id: 'elegidas', title: 'Solo en las que marqué', hint: `${marked} de ${items.length} tienen aviso` },
    { id: 'ninguna', title: 'Sin avisos', hint: 'Publico el horario en silencio' },
  ];
  return (
    <Dialog title={schedule.status === 'publicado' ? 'Publicar cambios' : 'Publicar horario'} onClose={onClose}>
      {state === 'ok' ? (
        <div className="py-6 text-center">
          <CheckIcon className="mx-auto h-8 w-8 text-emerald-300" />
          <p className="mt-3 font-semibold text-white">Tu horario está publicado</p>
          <p className="mt-1 text-sm text-zinc-400">Ya aparece en Hoy y en tu Calendario.</p>
          <button type="button" onClick={onClose} className="mt-5 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-[#fff]">Listo</button>
        </div>
      ) : (
        <>
          <p className="text-sm text-zinc-400">¿Qué días usa este horario? Esos días dejan de usar el que tenían.</p>
          <div className="mb-4 mt-2 flex flex-wrap gap-1.5">
            {WEEK.map((name, d) => (
              <button key={name} type="button" aria-pressed={days.includes(d)} onClick={() => setDays((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d].sort()))} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${days.includes(d) ? 'bg-sky-600 text-[#fff] ring-sky-500' : 'text-zinc-400 ring-white/15 hover:bg-white/[0.06]'}`}>{name.slice(0, 3)}</button>
            ))}
          </div>
          <p className="text-sm text-zinc-400">¿Quieres alarmas para este horario?</p>
          <div className="mt-3 space-y-2">
            {options.map((o) => (
              <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ${alarms === o.id ? 'bg-sky-500/10 ring-sky-400/40' : 'bg-white/[0.03] ring-white/10'}`}>
                <input type="radio" name="alarmas" checked={alarms === o.id} onChange={() => setAlarms(o.id)} className="mt-1" />
                <span><b className="block text-sm font-semibold text-white">{o.title}</b><span className="text-sm text-zinc-400">{o.hint}</span></span>
              </label>
            ))}
          </div>
          {state === 'error' && <p className="mt-3 text-sm text-rose-300">No se pudo publicar. Revisa tu conexión e inténtalo otra vez.</p>}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            {schedule.status === 'publicado' && (
              <button type="button" onClick={async () => { await onUnpublish(); onClose(); }} className="mr-auto text-sm font-semibold text-zinc-400 hover:text-white">Volver a vista previa</button>
            )}
            <button
              type="button"
              disabled={state === 'busy' || !days.length}
              onClick={async () => {
                setState('busy');
                if (alarms === 'todas') await onSetAllAlarms();
                setState((await onPublish(alarms, days)) ? 'ok' : 'error');
              }}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500 disabled:opacity-50"
            >
              {state === 'busy' ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
};

/** Todas tus categorías: emoji, nombre, color, cuántas tareas tiene y «Ver solo esta». */
const LabelsDialog: React.FC<{ h: ReturnType<typeof useHorario>; adding?: boolean; uses: (id: string) => number; filter: string | null; onFilter: (id: string | null) => void; onClose: () => void }> = ({ h, adding, uses, filter, onFilter, onClose }) => {
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('✨');
  const labels = [...h.labels].sort((a, b) => uses(b.id) - uses(a.id));
  const form = (
    <form className="flex items-center gap-2" onSubmit={async (e) => { e.preventDefault(); if (name.trim()) { await h.ensureLabel(name.trim(), LABEL_COLORS[h.labels.length % LABEL_COLORS.length], icon); setName(''); setIcon('✨'); if (adding) onClose(); } }}>
      <IconPicker value={icon} title={name || 'Categoría'} onChange={setIcon} />
      <input autoFocus={adding} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva categoría" className="min-w-0 flex-1 rounded-xl bg-white/[0.05] px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10" />
      <button type="submit" disabled={!name.trim()} className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-[#fff] hover:bg-sky-500 disabled:opacity-50">Agregar</button>
    </form>
  );
  if (adding) return <Dialog title="Nueva categoría" onClose={onClose}>{form}</Dialog>;
  return (
    <Dialog title="Categorías" onClose={onClose}>
      <ul className="space-y-3">
        {labels.map((l) => (
          <li key={l.id} className="space-y-2.5 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-2">
              <IconPicker value={l.icon || '✨'} title={l.name} onChange={(v) => h.patchLabel(l.id, { icon: v })} />
              <div className="min-w-0 flex-1">
                <input defaultValue={l.name} aria-label="Nombre de la categoría" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== l.name && h.patchLabel(l.id, { name: e.target.value.trim() })} className="w-full rounded-md bg-transparent px-1 text-sm font-semibold text-white outline-none focus:bg-white/[0.06]" />
                <p className="px-1 text-xs text-zinc-500">{uses(l.id)} {uses(l.id) === 1 ? 'tarea' : 'tareas'}</p>
              </div>
              <button type="button" onClick={() => onFilter(filter === l.id ? null : l.id)} className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 ${filter === l.id ? 'bg-sky-500/15 text-sky-200 ring-sky-400/40' : 'text-zinc-300 ring-white/10 hover:bg-white/[0.06]'}`}>{filter === l.id ? 'Ver todo' : 'Ver solo esta'}</button>
              <button type="button" aria-label={`Borrar ${l.name}`} onClick={async () => { if (await confirm({ title: `¿Borrar la categoría «${l.name}»?`, message: 'Las tareas que la tenían quedan sin categoría.', confirmLabel: 'Borrar', tone: 'danger' })) h.removeLabel(l.id); }} className="rounded p-1 text-zinc-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {LABEL_COLORS.map((c) => <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => h.patchLabel(l.id, { color: c })} className={`h-6 w-6 rounded-full ${l.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#14161b]' : ''}`} style={{ background: c }} />)}
              <label data-help="Cualquier color" className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full ring-1 ring-white/20" style={{ background: 'conic-gradient(#f43f5e,#f59e0b,#22c55e,#38bdf8,#a78bfa,#f43f5e)' }}>
                <input type="color" aria-label="Elegir cualquier color" value={l.color} onChange={(e) => h.patchLabel(l.id, { color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3">{form}</div>
    </Dialog>
  );
};
