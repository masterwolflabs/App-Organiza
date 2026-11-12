'use client';

import { AIPanel } from '@/components/organiza/AIPanel';
import { MARK_COLORS, setMarks, useAIMarks, type AIChange, type AIMarks } from '@/components/organiza/aiMarks';
import { IconPicker, ItemIcon, iconText } from '@/components/organiza/IconPicker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { askNotifications } from '@/components/organiza/notify';
import { useCalendar } from '@/components/calendar/useCalendar';
import { addDays, colorOf, expand, fmtTime, KINDS, minutesOf, sameDay, startOfWeek, type Occurrence } from '@/components/calendar/model';
import { AlarmClock, Bell, BellRing, ChevronLeft, ChevronRight, Sparkles, Target, TriangleAlert, Zap, Undo2, Redo2, CalendarDays, PauseCircle, Check as CheckIcon, ChevronDown, Copy, FileUp, Focus, ImagePlus, Moon, LayoutGrid, List, Plus, Rows3, Send, Tags, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { ColorMenu, tintCss } from '@/components/organiza/ColorMenu';
import { useWeather } from '@/components/organiza/useWeather';
import { hintFor, sceneOf, weatherEmoji, weatherLabel } from '@/utils/weather';
import { useConfirm } from '@/components/ui/confirm';
import { ImportHorario } from '@/components/organiza/ImportHorario';
import { ItemPanel } from '@/components/organiza/ItemPanel';
import { UnsavedScope, useGuardedClose, useUnsaved } from '@/components/organiza/UnsavedGuard';
import { morningConflict, overlaps, proposeDay, toTime, type DayPlan, type Extra, type Moves } from '@/components/organiza/dayPlan';
import { AdjustBox, adjustDayAI, type Line } from '@/components/organiza/DayAdjust';
import { byTime, coverCss, daysOf, LABEL_COLORS, scheduleLabel, type Sleep, stageOf, TEMPLATES, toMinutes, WEEK, weekdayOf, xpOf, rankOf, type Item, type Label, type Schedule, emojiFor, iso, refOf, streakOf } from '@/components/organiza/model';
import { useChecks, useHorario } from '@/components/organiza/useHorario';
import { appNow, useAppNow } from '@/utils/appClock';

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
  // Hora de la app (manual para probar o la real): todo lo que se ve depende de ella.
  const clock = useAppNow();
  const h = useHorario();
  const c = useChecks();
  // Esta semana con sus fechas, y lo que tienes en el calendario cada día (sin los bloques del propio horario).
  const [weekShift, setWeekShift] = useState(0);
  // Desplegable de acciones del horario (Emanuel, 2026-11-12).
  const [actionsOpen, setActionsOpen] = useState(false);
  // 🌤️ Clima real: pastilla con los grados junto al nombre (abre Tiempo).
  const wx = useWeather().here;
  const clockDay = iso(clock);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weekStart = useMemo(() => addDays(startOfWeek(appNow()), weekShift * 7), [weekShift, clockDay]);
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
    const now = appNow();
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const d0 = date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : t0;
    if (+d0 < +t0) {
      // Un día que ya pasó sin cumplir: ✕ (la racha vuelve a partir).
      const n = streakOf(ref, days, c.checks, d0, true);
      const k = c.checks.find((x) => x.ref === ref && x.day === iso(d0));
      return { n, ghost: false, missed: !k?.done && !k?.value?.state };
    }
    // O lo hiciste o no (Emanuel, 2026-11-04): si la parte del día de esta tarea ya terminó hoy y no la
    // marcaste, hoy es ✕ y la racha se corta; lo que viene se proyecta desde 1.
    const kToday = c.checks.find((x) => x.ref === ref && x.day === iso(now));
    const todayItem = days.includes(weekdayOf(now)) ? h.activeItems.find((x) => x.schedule_id === i.schedule_id && refOf(x.title) === ref && x.weekday === weekdayOf(now)) : undefined;
    const missedToday = (() => {
      if (!todayItem || kToday?.done || kToday?.value?.state) return false;
      const m = toMinutes(h.planOf(now)?.moves?.[todayItem.id]?.time ?? todayItem.time);
      const sameDayItems = h.activeItems.filter((x) => x.schedule_id === i.schedule_id && x.weekday === weekdayOf(now));
      const s0 = dayStart.startsWith('a:') ? (() => { const a = sameDayItems.find((x) => refOf(x.title) === dayStart.slice(2)); return a ? toMinutes(a.time) : 0; })() : toMinutes(dayStart.slice(2) || '00:00');
      if (s0 > 0 && m < s0) return false; // la madrugada del final es la de esta noche
      return partRange(partOf(m, parts), parts)[1] <= now.getHours() * 60 + now.getMinutes();
    })();
    const base = missedToday ? 0 : streakOf(ref, days, c.checks);
    if (+d0 === +t0) return { n: base, ghost: false, missed: missedToday };
    let n = base + (!missedToday && todayItem && !kToday ? 1 : 0);
    for (let x = addDays(t0, 1); +x <= +d0; x = addDays(x, 1)) if (days.includes(weekdayOf(x))) n++;
    return { n, ghost: true };
  };
  const todayStatus = (i: Item): Status => {
    const now = appNow();
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
  const [show, setShowState] = useState<Fields>(() => {
    try {
      return { ...FIELDS_ALL, ...JSON.parse(localStorage.getItem('organiza-card-fields') || '{}') };
    } catch {
      return FIELDS_ALL;
    }
  });
  const [showMenu, setShowMenu] = useState(false);
  const setShow = (v: Fields) => {
    setShowState(v);
    try {
      localStorage.setItem('organiza-card-fields', JSON.stringify(v));
    } catch {
      /* modo privado */
    }
  };
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
  const [aiOpen, setAiOpen] = useState(false);
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

  // Desde la tarjeta (Focus, Alarma, Categoría): una acción con varios días es una sola, cambia en todos.
  const patchAction = (i: Item, p: Partial<Item>) => {
    const all = h.activeItems.filter((x) => x.schedule_id === i.schedule_id && refOf(x.title) === refOf(i.title));
    void Promise.all((all.length ? all : [i]).map((x) => h.patchItem(x.id, p)));
  };
  const add = async (weekday: number, time?: string) => {
    const made = await h.addItem(s.id, weekday, time ? { time } : {});
    if (made) setOpenId(made.id);
  };

  return (
    <div className="relative isolate mx-auto max-w-[1640px]" data-tour="horario">
      <SkyDecor parts={parts} />
      <div className="flex flex-wrap items-center gap-3">
        <input
          key={s.id}
          defaultValue={s.name}
          aria-label="Nombre del horario"
          onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && h.patchSchedule(s.id, { name: e.target.value.trim() })}
          className="w-full min-w-0 rounded-lg bg-transparent font-display sm:w-auto sm:flex-1 text-3xl font-semibold text-white outline-none focus:bg-white/[0.04] sm:text-4xl"
        />
        {wx && (
          <a href="#tiempo" data-help={`${weatherLabel(wx.now.code)} en ${wx.place.name} · sensación ${Math.round(wx.now.feels)}° · toca para ver el Tiempo`} className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/[0.1]">
            <span className="text-lg leading-none">{weatherEmoji(wx.now.code, wx.now.day)}</span>
            <span className="tabular-nums">{Math.round(wx.now.temp)}°</span>
            <span className="hidden text-xs font-normal text-zinc-400 sm:inline">{wx.place.name}</span>
          </a>
        )}
        {h.schedules.length > 1 && (
          <div className="relative">
            <select aria-label="Elegir horario" value={s.id} onChange={(e) => h.choose(e.target.value)} className="appearance-none rounded-xl bg-white/[0.05] py-2 pl-3 pr-8 text-sm text-zinc-200 ring-1 ring-white/10">
              {h.schedules.map((x) => <option key={x.id} value={x.id} className="bg-zinc-900">{x.name}{x.status === 'publicado' ? ' ●' : ''}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          </div>
        )}
        {/* Estado + acciones en un desplegable que se abre al pasar el mouse (Emanuel, 2026-11-12): menos ruido arriba.
            En el celular se abre tocando el estado. */}
        <div className="relative" onMouseEnter={() => setActionsOpen(true)} onMouseLeave={() => setActionsOpen(false)}>
          <button
            type="button"
            onClick={() => setActionsOpen((o) => !o)}
            aria-expanded={actionsOpen}
            aria-label="Acciones del horario"
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${s.status === 'publicado' ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30' : 'bg-amber-500/15 text-amber-200 ring-amber-400/30'}`}
          >
            {s.status === 'publicado' ? '● Activo' : 'Borrador'}
            <ChevronDown className={`h-4 w-4 opacity-70 transition-transform ${actionsOpen ? 'rotate-180' : ''}`} />
          </button>
          {actionsOpen && (
            <div className="absolute right-0 top-full z-30 pt-1.5">
              <div className="w-56 rounded-xl bg-[#14171d]/95 p-1.5 shadow-2xl ring-1 ring-white/10 backdrop-blur">
                <button type="button" onClick={() => { setActionsOpen(false); setPanel('nuevo'); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-zinc-200 hover:bg-white/[0.08]">
                  <Plus className="h-4 w-4" /> Nuevo horario
                </button>
                {s.status === 'publicado' && (
                  <button type="button" onClick={async () => { setActionsOpen(false); if (await confirm({ title: `¿Pasar «${s.name}» a borrador?`, message: 'Deja de salir en Hoy y en el Calendario, y no te avisa. No se borra nada: lo vuelves a publicar cuando quieras.', confirmLabel: 'Pasar a borrador' })) h.unpublish(s.id); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-zinc-200 hover:bg-white/[0.08]">
                    <PauseCircle className="h-4 w-4" /> Pasar a borrador
                  </button>
                )}
                <button type="button" onClick={async () => { setActionsOpen(false); if (await confirm({ title: `¿Borrar “${s.name}”?`, message: 'Se borran sus tareas. Tu registro de lo cumplido queda guardado.', confirmLabel: 'Borrar', tone: 'danger' })) h.removeSchedule(s.id); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-zinc-200 hover:bg-white/[0.08] hover:!bg-rose-500/15 hover:text-rose-300">
                  <Trash2 className="h-4 w-4" /> Borrar este horario
                </button>
              </div>
            </div>
          )}
        </div>
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
        <button type="button" onClick={() => setAiOpen(true)} data-help="Pídele a la IA cambios en tu horario o calendario: los hace en vivo" className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-3 py-1.5 text-sm font-semibold text-[#fff] shadow-lg shadow-fuchsia-500/20 hover:brightness-110"><Sparkles className="h-4 w-4" /> IA</button>
        {aiOpen && <AIPanel h={h} cal={cal} onClose={() => setAiOpen(false)} />}
        {undone && <span role="status" className="rounded-lg bg-sky-500/15 px-2.5 py-1 text-xs font-semibold text-sky-200 ring-1 ring-sky-400/30">{undone}</span>}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {/* Categorías (Emanuel, 2026-11-04): a la vista solo las 2 que más usas (y la que estés filtrando). */}
          {topLabels.map((l) => (
            <button key={l.id} type="button" onClick={() => setFilter(filter === l.id ? null : l.id)} aria-pressed={filter === l.id} data-help={filter === l.id ? 'Ver todo' : `Ver solo ${l.name}`} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition ${filter && filter !== l.id ? 'opacity-40' : ''} ${filter === l.id ? 'ring-1 ring-current' : ''}`} style={{ background: `${l.color}26`, color: l.color }}>
              {l.icon && <ItemIcon value={l.icon} />}{l.name}
            </button>
          ))}
          <button type="button" onClick={() => setPanel('nueva-etiqueta')} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-white/20 px-2.5 py-1 text-xs font-semibold text-sky-300 hover:bg-white/[0.05]">
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
            <div className="relative">
              <button type="button" onClick={() => setShowMenu((v) => !v)} aria-expanded={showMenu} data-help="Elige qué se ve en cada tarjeta" className={`rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 hover:bg-white/[0.06] hover:text-white ${Object.values(show).every(Boolean) ? 'text-zinc-400 ring-white/10' : 'bg-sky-500/15 text-sky-200 ring-sky-400/40'}`}>👁️ Mostrar</button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 z-50 mt-1 w-56 space-y-0.5 rounded-xl bg-[#17191f] p-2 shadow-xl ring-1 ring-white/10">
                    {FIELD_NAMES.map(([k, name]) => (
                      <label key={k} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-200 hover:bg-white/[0.06]">
                        {name}
                        <input type="checkbox" checked={show[k]} onChange={() => setShow({ ...show, [k]: !show[k] })} className="accent-sky-500" />
                      </label>
                    ))}
                    <button type="button" onClick={() => setShow(FIELDS_ALL)} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-sky-300 hover:bg-white/[0.06]">Ver todo</button>
                  </div>
                </>
              )}
            </div>
            <button type="button" onClick={() => setEditParts(true)} data-help="A qué hora parte la mañana, la tarde y la noche" className="rounded-lg px-2.5 py-1 text-xs font-semibold text-zinc-400 ring-1 ring-white/10 hover:bg-white/[0.06] hover:text-white">🌗 Partes del día</button>
            {editParts && <Dialog title="Partes del día" onClose={() => setEditParts(false)}><PartsForm value={parts} onSave={(v) => { setParts(v); setEditParts(false); }} /></Dialog>}
            {weekShift !== 0 && <button type="button" onClick={() => setWeekShift(0)} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-sky-300 ring-1 ring-white/10 hover:bg-white/[0.06]">Esta semana</button>}
          </div>
        )}
        {view === 'tablero' && <Board items={shown} labels={h.labels} streak={streakFor} status={weekShift === 0 ? todayStatus : undefined} weekStart={weekStart} occ={occ} planOf={h.planOf} onApply={(date, p) => h.setPlan(iso(date), p)} onUndo={() => step('undo')} markOf={markOf} dayStart={dayStart} focusToday={focusToday} parts={parts} show={show} onLabel={(id) => setFilter(filter === id ? null : id)} onPatch={patchAction} onOpen={setOpenId} onAdd={add} onMove={(id, weekday) => h.patchItem(id, { weekday })} />}
        {view === 'semana' && <WeekGrid items={shown} labels={h.labels} ctx={{ weekStart, dayStart, focusToday, parts }} onOpen={setOpenId} onMove={(id, time) => h.patchItem(id, { time })} />}
        {view === 'mi-semana' && <WeekGrid items={[...h.publishedItems].filter((i) => !filter || i.label_id === filter).sort(byTime)} labels={h.labels} ctx={{ weekStart, dayStart, focusToday, parts }} onOpen={setOpenId} onMove={(id, time) => h.patchItem(id, { time })} schedules={h.schedules} />}
        {view === 'galeria' && <Gallery items={shown} labels={h.labels} ctx={{ weekStart, dayStart, focusToday, parts }} show={show} streak={streakFor} onOpen={setOpenId} />}
        {view === 'lista' && <ListView items={shown} labels={h.labels} ctx={{ weekStart, dayStart, focusToday, parts }} show={show} streak={streakFor} onOpen={setOpenId} />}
      </div>


      {open && <ItemPanel item={open} h={h} c={c} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
      {panel === 'publicar' && <PublishDialog schedule={s} items={h.activeItems} onClose={() => setPanel(null)} onPublish={(a, days) => { void askNotifications(); return h.publish(s.id, a, days); }} onSetAllAlarms={async () => { void askNotifications(); for (const i of h.activeItems.filter((x) => x.alarm === 'no')) await h.patchItem(i.id, { alarm: 'notificacion' }); }} onUnpublish={() => h.unpublish(s.id)} />}
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
const Chip: React.FC<{ color: string; icon: React.ElementType; children: React.ReactNode; help: string }> = ({ color, icon: I, children, help }) => (
  <span data-help={help} className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-1.5 text-[11px] font-semibold" style={{ background: `${color}22`, color }}><I className="h-3.5 w-3.5" />{children}</span>
);

type Streak = { n: number; ghost: boolean; missed?: boolean };

/** Qué se ve en cada tarjeta (menú «Mostrar», Emanuel 2026-11-04). En este dispositivo. */
type Fields = { partes: boolean; portada: boolean; estado: boolean; racha: boolean; extras: boolean; etiqueta: boolean; hora: boolean; duracion: boolean };
const FIELDS_ALL: Fields = { partes: true, portada: true, estado: true, racha: true, extras: true, etiqueta: true, hora: true, duracion: true };
const FIELD_NAMES: [keyof Fields, string][] = [['partes', '🌗 Nombres de las partes'], ['portada', '🖼️ Portada'], ['estado', '🟢 Estado'], ['racha', '🔥 Racha'], ['extras', '⚡ Focus y alarma'], ['etiqueta', '🏷️ Categoría'], ['hora', '🕘 Hora'], ['duracion', '⏱️ Hasta y duración']];

/**
 * Estado en vivo de una tarea de hoy (Emanuel, 2026-11-04): Pendiente → Por activarse (30 min antes) →
 * ¡Ejecutar ya! (a su hora) → En ejecución (si la empezaste) → Atrasada (pasó su hora) → Incumplida
 * (pasó su parte del día). Hecho y No lo hice mandan sobre todo.
 */
type Live = { label: string; color: string; pulse?: boolean; help: string };
const liveStatus = (status: Status, start: number, end: number, now: number, partPassed: boolean): Live | null => {
  if (!status) return null;
  if (status === 'hecho') return { label: '✅ Hecho', color: '#22c55e', help: 'Lo marcaste hecho hoy' };
  if (status === 'no') return { label: '✖️ No lo hice', color: '#f43f5e', help: 'Marcaste que no lo hiciste' };
  if (partPassed) return { label: '✖️ Incumplida', color: '#f43f5e', help: 'Pasó su parte del día sin hacerla' };
  if (now < start - 30) return { label: 'Pendiente', color: '#94a3b8', help: 'Todavía falta' };
  if (now < start) return { label: '⏰ Por activarse', color: '#38bdf8', help: 'Empieza en menos de media hora' };
  if (now < end) return status === 'curso' ? { label: '▶️ En ejecución', color: '#f59e0b', help: 'La estás haciendo' } : { label: '🚀 ¡Ejecutar ya!', color: '#10b981', pulse: true, help: 'Es su hora: ¡ahora!' };
  return { label: '⏳ Atrasada', color: '#fb923c', help: 'Ya pasó su hora y no la marcaste: todavía estás a tiempo en esta parte del día' };
};

/** Categoría con forma de etiqueta (distinta de los globitos de Focus y Alarma). Tocarla filtra. */
/**
 * Lo que le falta a una tarjeta se agrega ahí mismo (Emanuel, 2026-11-05): «+ Focus», «+ Alarma», «+ Categoría»
 * tenues; al tocarlos se activa o sale un menú chico para elegir.
 */
const Ghost: React.FC<{ children: React.ReactNode; help: string; onPick: (anchor: DOMRect) => void }> = ({ children, help, onPick }) => (
  <span
    role="button"
    tabIndex={0}
    data-help={help}
    onClick={(e) => { e.stopPropagation(); onPick((e.currentTarget as HTMLElement).getBoundingClientRect()); }}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onPick((e.currentTarget as HTMLElement).getBoundingClientRect()); } }}
    className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-dashed border-white/20 px-1.5 text-[11px] font-semibold text-zinc-500 transition hover:border-white/40 hover:text-zinc-200"
  >
    <Plus className="h-3 w-3" />{children}
  </span>
);

type MenuOpt = { key: string; label: React.ReactNode; onPick: () => void };
const PickMenu: React.FC<{ at: DOMRect; title: string; options: MenuOpt[]; onClose: () => void }> = ({ at, title, options, onClose }) => {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);
  const left = Math.min(at.left, window.innerWidth - 220);
  const below = at.bottom + 6 + 40 + options.length * 34 < window.innerHeight;
  return (
    <BodyPortal>
      {/* El menú vive dentro de la tarjeta (en React): que sus toques no abran el panel de la acción. */}
      <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="fixed inset-0 z-[95]" onClick={onClose} />
      <div role="menu" className="fixed z-[96] w-52 space-y-0.5 rounded-xl bg-[#17191f] p-1.5 shadow-xl ring-1 ring-white/10" style={below ? { left, top: at.bottom + 6 } : { left, bottom: window.innerHeight - at.top + 6 }}>
        <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
        {options.map((o) => (
          <button key={o.key} type="button" role="menuitem" onClick={() => { o.onPick(); onClose(); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-zinc-200 hover:bg-white/[0.08]">
            {o.label}
          </button>
        ))}
      </div>
      </div>
    </BodyPortal>
  );
};

const TagChip: React.FC<{ label: Label; onClick?: () => void }> = ({ label, onClick }) => (
  <span
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
    data-help={onClick ? `Ver solo ${label.name}` : undefined}
    className="relative inline-flex h-6 items-center gap-1 pl-3.5 pr-2 text-xs font-semibold"
    style={{ background: `${label.color}2e`, color: label.color, clipPath: 'polygon(9px 0, 100% 0, 100% 100%, 9px 100%, 0 50%)', borderRadius: '0 6px 6px 0' }}
  >
    <span aria-hidden className="absolute left-[7px] top-1/2 h-1 w-1 -translate-y-1/2 rounded-full" style={{ background: label.color }} />
    {label.icon && <ItemIcon value={label.icon} />}{label.name}
  </span>
);

/** Racha (Emanuel, 2026-11-04): el fueguito y el número. ✕ si ese día no se cumplió; en gris lo que viene. */
const StreakChip: React.FC<{ streak: Streak }> = ({ streak }) => {
  if (streak.missed) return <span data-help="Este día no se cumplió: la racha vuelve a partir" className="inline-flex h-6 min-w-[2.75rem] shrink-0 items-center justify-center rounded-full bg-rose-500/15 px-2 text-xs font-bold text-rose-300">✕</span>;
  const lit = !streak.ghost && streak.n > 0;
  return (
    <span data-help={streak.ghost ? 'La racha que alcanzas si cumples hasta este día' : 'Días seguidos cumplidos'} className={`inline-flex h-6 min-w-[2.75rem] shrink-0 items-center justify-center gap-1 rounded-full px-2 text-xs font-bold tabular-nums ${lit ? 'bg-amber-500/15 text-amber-300' : 'bg-white/[0.06] text-zinc-400'}`}>
      <span aria-hidden className={lit ? '' : 'grayscale opacity-60'}>🔥</span>{streak.n}
    </span>
  );
};

const Card: React.FC<{ item: Item; labels: Label[]; weather?: { emoji: string; text: string } | null; crossed?: string[]; streak?: Streak; live?: Live | null; clash?: Occurrence[]; warn?: string; ownTime?: boolean; mark?: string; move?: { time?: string; off?: boolean }; show?: Fields; onLabel?: (id: string) => void; onPatch?: (p: Partial<Item>) => void; onOpen: (id: string) => void; draggable?: boolean }> = ({ item, labels, weather, crossed = [], streak, live, clash = [], warn, ownTime, mark, move, show = FIELDS_ALL, onLabel, onPatch, onOpen, draggable }) => {
  const [menu, setMenu] = useState<{ kind: 'alarma' | 'categoria'; at: DOMRect } | null>(null);
  // 🎨 Pintar (Emanuel, 2026-11-12): clic derecho, o mantener 2 s en el celular.
  const [paint, setPaint] = useState<{ x: number; y: number } | null>(null);
  const hold = useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const held = useRef(false);
  const endHold = () => {
    if (hold.current) clearTimeout(hold.current.t);
    hold.current = null;
  };
  const label = labelOf(labels, item.label_id);
  const moved = !move?.off && move?.time && move.time !== item.time;
  const startT = moved ? move!.time! : item.time;
  const endT = toTime((toMinutes(startT) + item.minutes) % 1440);
  const issues = [
    ...clash.map((o) => `Choca con ${o.ev.title} (${fmtTime(o.start)})`),
    ...(warn ? [warn] : []),
    ...(crossed.length ? [`Se cruza con ${crossed.join(', ')}`] : []),
  ];
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
      onClick={() => {
        // Después de mantener presionado para pintar, soltar no abre la acción.
        if (held.current) return void (held.current = false);
        onOpen(item.id);
      }}
      onContextMenu={onPatch ? (e) => { e.preventDefault(); setPaint({ x: e.clientX, y: e.clientY }); } : undefined}
      onPointerDown={onPatch ? (e) => {
        if (e.pointerType === 'mouse') return;
        const x = e.clientX, y = e.clientY;
        endHold();
        hold.current = { x, y, t: setTimeout(() => { held.current = true; hold.current = null; navigator.vibrate?.(15); setPaint({ x, y }); }, 2000) };
      } : undefined}
      onPointerMove={(e) => { const h = hold.current; if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 10) endHold(); }}
      onPointerUp={endHold}
      onPointerCancel={endHold}
      className={`relative z-10 block w-full overflow-hidden hz-card rounded-xl text-left ring-1 transition [-webkit-touch-callout:none] ${clash.length || crossed.length || warn ? 'ring-rose-400/60' : 'ring-white/10'} ${mark ? 'ai-mark' : ''}`}
      style={{ ...tintCss(item.bg_color, item.border_color), ...(mark ? ({ ['--mark' as string]: mark } as React.CSSProperties) : {}) }}
    >
      {show.portada && item.cover_url && <div className="h-16" style={coverCss(item.cover_url)} />}
      <div className="space-y-2 p-3">
        <p className="flex items-center gap-2 font-semibold text-white">
          <ItemIcon value={item.icon || emojiFor(item.title)} />
          <span className="min-w-0 flex-1 truncate">{item.title || 'Sin título'}</span>
        </p>
        {/* Arriba como máximo 3: racha, focus y estado; la alarma o el aviso van abajo (Emanuel, 2026-11-05). */}
        {((show.estado && live) || (show.racha && streak) || (show.extras && (item.focus || onPatch))) && (
          <div className="flex items-center gap-1.5">
            {/* Lugares fijos (Emanuel, 2026-11-05): racha y Focus siempre en el mismo sitio; el estado del día va al final. */}
            {show.racha && streak && <StreakChip streak={streak} />}
            {show.extras && item.focus && <Chip color="#a78bfa" icon={Zap} help="Tiene modo focus">Focus</Chip>}
            {show.extras && !item.focus && onPatch && <Ghost help="Activar el modo focus" onPick={() => onPatch({ focus: true })}>Focus</Ghost>}
            {show.estado && live && <span data-help={live.help} className={`h-6 min-w-0 truncate rounded-full px-2 text-xs font-semibold leading-6 ${live.pulse ? 'animate-pulse' : ''}`} style={{ background: `${live.color}26`, color: live.color }}>{live.label}</span>}
          </div>
        )}
        {show.extras && (item.alarm !== 'no' || onPatch) && (
          <div className="flex items-center gap-1.5">
            {item.alarm === 'alarma' && <Chip color="#f59e0b" icon={AlarmClock} help="Suena una alarma">Alarma</Chip>}
            {item.alarm === 'notificacion' && <Chip color="#38bdf8" icon={Bell} help="Te llega una notificación">Aviso</Chip>}
            {item.alarm === 'no' && onPatch && <Ghost help="Ponerle aviso o alarma" onPick={(at) => setMenu({ kind: 'alarma', at })}>Alarma</Ghost>}
          </div>
        )}
        {weather && (
          <span className="flex" data-help={`Clima a esa hora: ${weather.text}`}>
            <Pill color="#38bdf8">
              {weather.emoji} {weather.text}
            </Pill>
          </span>
        )}
        {(issues.length > 0 || ownTime || move?.off || moved) && (
          <div className="flex flex-col items-start gap-1.5">
            {/* Todos los choques en un solo aviso de una línea (el detalle al pasar el mouse): no estira la fila. */}
            {issues.length > 0 && <span className="max-w-full" data-help={issues.join(' · ')}><Pill color="#f43f5e">⚠️ {issues.length === 1 ? issues[0] : `${issues.length} choques: ${issues[0]}`}</Pill></span>}
            {ownTime && <span data-help="Esta acción tiene otra hora este día (misma racha)"><Pill color="#a1a1aa">🕐 Hora propia de este día</Pill></span>}
            {move?.off && <Pill color="#94a3b8">⏸️ Aplazado este día</Pill>}
            {moved && <Pill color="#38bdf8">↪ Solo este día</Pill>}
          </div>
        )}
        {show.etiqueta && label && <div className="flex"><TagChip label={label} onClick={onLabel ? () => onLabel(label.id) : undefined} /></div>}
        {show.etiqueta && !label && onPatch && <div className="flex"><Ghost help="Ponerle una categoría" onPick={(at) => setMenu({ kind: 'categoria', at })}>Categoría</Ghost></div>}
        {menu && onPatch && (
          <PickMenu
            at={menu.at}
            title={menu.kind === 'alarma' ? '¿Cómo te avisa?' : 'Categoría'}
            onClose={() => setMenu(null)}
            options={menu.kind === 'alarma'
              ? [
                  { key: 'n', label: <><Bell className="h-4 w-4 text-sky-300" /> Aviso (notificación)</>, onPick: () => { void askNotifications(); onPatch({ alarm: 'notificacion' }); } },
                  { key: 'a', label: <><AlarmClock className="h-4 w-4 text-amber-300" /> Alarma (suena)</>, onPick: () => { void askNotifications(); onPatch({ alarm: 'alarma' }); } },
                ]
              : labels.length
                ? labels.map((l) => ({ key: l.id, label: <><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.color }} />{l.icon && <ItemIcon value={l.icon} />}<span className="truncate">{l.name}</span></>, onPick: () => onPatch({ label_id: l.id }) }))
                : [{ key: 'none', label: <span className="text-zinc-400">Aún no tienes categorías: créalas con «+ Nueva»</span>, onPick: () => {} }]}
          />
        )}
        {paint && onPatch && <ColorMenu x={paint.x} y={paint.y} title={item.title || 'Acción'} bg={item.bg_color} border={item.border_color} onChange={(p) => onPatch(p)} onClose={() => setPaint(null)} />}
        {(show.hora || show.duracion) && (
          <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm tabular-nums text-zinc-400">
            {/* Si ese día se reacomodó, la hora que vale es la nueva (la de siempre queda tachada). */}
            {show.hora && <span className={`font-bold ${moved ? 'text-sky-200' : 'text-white'}`}>{startT}</span>}
            {show.hora && moved && <span className="text-xs text-zinc-500 line-through">{item.time}</span>}
            {show.duracion && <span>{show.hora ? '– ' : 'Hasta '}{endT} · {item.minutes} min</span>}
          </div>
        )}
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
    // Compacto (Emanuel, 2026-11-10): una sola línea, así no estira la fila de esa hora en todos los días.
    <div key={o.key} data-help={`Está en tu calendario${google ? ' (Google)' : ''}: se respeta al reacomodar`} className="hz-card relative z-10 flex items-center gap-2 overflow-hidden rounded-xl border px-3 py-2 text-left text-sm" style={{ backgroundImage: `linear-gradient(135deg, ${color}2e, ${color}10 60%)`, borderColor: `${color}66`, borderLeft: `3px solid ${color}` }}>
      <span aria-hidden>{kind?.emoji ?? '📅'}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-white">{o.ev.title}</span>
      <span className="shrink-0 tabular-nums text-xs text-zinc-300">{o.ev.all_day ? 'Todo el día' : `${fmtTime(o.start)}–${fmtTime(o.end)}`}</span>
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
  madrugada: { name: 'Madrugada', emoji: '🌙', cls: 'text-indigo-300', grad: 'linear-gradient(180deg, rgba(30,27,75,.28), rgba(129,140,248,.10))' },
  manana: { name: 'Mañana', emoji: '☀️', cls: 'text-amber-300', grad: 'linear-gradient(180deg, rgba(125,211,252,.13), rgba(253,230,138,.15))' },
  tarde: { name: 'Tarde', emoji: '🌤️', cls: 'text-orange-300', grad: 'linear-gradient(180deg, rgba(253,186,116,.17), rgba(244,114,182,.07) 55%, rgba(165,180,252,.12))' },
  noche: { name: 'Noche', emoji: '🌆', cls: 'text-violet-300', grad: 'linear-gradient(180deg, rgba(167,139,250,.15), rgba(49,46,129,.24))' },
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

/**
 * Tablero en franjas (Emanuel, 2026-11-05, con su maqueta): Mañana, Tarde y Noche cruzan todos los días,
 * así en cada franja las columnas parten a la misma altura. Plegar una franja la pliega en toda la semana;
 * cada casilla lleva el degradado de esa hora y al fondo hay un sol, nubes o la luna según la hora.
 */
const Board: React.FC<ViewProps & { streak?: (i: Item, date?: Date) => Streak; status?: (i: Item) => Status; weekStart?: Date; occ?: Occurrence[]; planOf?: (d: Date) => DayPlan | null; onApply?: (date: Date, p: { moves: Moves; extras?: Extra[] }) => void; onUndo?: () => void; markOf?: (id: string) => string | undefined; dayStart?: string; focusToday?: boolean; parts?: Parts; show?: Fields; onLabel?: (id: string) => void; onPatch?: (i: Item, p: Partial<Item>) => void; onAdd: (d: number, time?: string) => void; onMove: (id: string, d: number) => void }> = ({ items, labels, streak, status, weekStart, occ = [], planOf, onApply, onUndo, markOf, dayStart = 'h:00:00', focusToday = false, parts = PARTS_DEFAULT, show = FIELDS_ALL, onLabel, onPatch, onOpen, onAdd, onMove }) => {
  // 🌤️ Aviso del clima por tarjeta (el pronóstico por hora alcanza 10 días).
  const wxBoard = useWeather().here;
  // Franjas plegadas o abiertas a mano. Sin tocar: si la semana es esta, se pliega lo que ya pasó hoy.
  const [fold, setFold] = useState<Partial<Record<PartKey, boolean>>>({});
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
  // Ancho visible del tablero: la barra de cada franja mide eso (los puntos no siguen fuera de la pantalla).
  const scroller = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      setVw(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const today = weekdayOf(appNow());
  const now = appNow();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // «Comenzar desde» una hora distinta de las 00:00 (o desde una acción): la madrugada va al final.
  const madrugadaLast = dayStart.startsWith('a:') || toMinutes(dayStart.slice(2) || '00:00') > 0;
  const order: PartKey[] = madrugadaLast ? ['manana', 'tarde', 'noche', 'madrugada'] : ['madrugada', 'manana', 'tarde', 'noche'];

  type Entry = { key: string; start: number; end: number } & ({ kind: 'item'; i: Item } | { kind: 'ev'; o: Occurrence } | { kind: 'extra'; x: Extra });
  const days = WEEK.map((name, d) => {
    const date = weekStart ? addDays(weekStart, d) : null;
    const dayOcc = date ? occ.filter((o) => sameDay(o.start, date)).sort((a, b) => +a.start - +b.start) : [];
    const plan = date ? planOf?.(date) ?? null : null;
    // Ordenadas por la hora que valen ESE día (si reacomodaste, con la hora nueva).
    const eff = (i: Item) => toMinutes(plan?.moves?.[i.id]?.time ?? i.time);
    const dayItems = items.filter((i) => i.weekday === d).sort((a, b) => eff(a) - eff(b));
    // La rutina de la mañana después de un evento temprano (ej. carrera 7:00, levantarse 9:00) también es choque.
    const morning = morningConflict(dayItems, dayOcc, plan);
    // Acciones, eventos del calendario y lo agregado solo ese día, por hora.
    const entries: Entry[] = [
      ...dayItems.map((i): Entry => ({ kind: 'item', i, key: i.id, start: eff(i), end: plan?.moves?.[i.id]?.off ? eff(i) : eff(i) + i.minutes })),
      ...dayOcc.filter((o) => !o.ev.all_day).map((o): Entry => ({ kind: 'ev', o, key: o.key, start: minutesOf(o.start), end: sameDay(o.start, o.end) ? minutesOf(o.end) : 1440 })),
      ...(plan?.extras ?? []).map((x): Entry => ({ kind: 'extra', x, key: x.id, start: toMinutes(x.time), end: toMinutes(x.time) + x.minutes })),
    ].sort((a, b) => a.start - b.start || (a.kind === 'ev' ? -1 : b.kind === 'ev' ? 1 : 0));
    const s0 = dayStart.startsWith('a:') ? (() => { const a = dayItems.find((i) => refOf(i.title) === dayStart.slice(2)); return a ? eff(a) : 0; })() : toMinutes(dayStart.slice(2) || '00:00');
    const rel = (m: number) => (m - s0 + 1440) % 1440;
    const when = date ? dayDiff(date) : 0;
    // Antes de que empiece el día (ej. 02:30 con «Comenzar desde» Levantarse 09:00) todo lo de hoy está por venir:
    // la hora de ahora queda «antes del inicio», no al final del día (si no, todo salía ⏳ Atrasada).
    const nowRel = s0 > 0 && nowMin < s0 ? nowMin - s0 : rel(nowMin);
    // Hoy: una parte ya pasó cuando terminó (la madrugada del final es la de esta noche, esa no).
    const passed = (k: PartKey) => when === 0 && !!date && partRange(k, parts)[1] <= nowMin && !(k === 'madrugada' && madrugadaLast);
    // «Enfocar hoy»: lo que pasó en gris, hoy a todo color, lo que viene a media luz.
    const tone = (e: Entry) => {
      if (!focusToday || !date) return '';
      if (when < 0) return 'tone-past';
      if (when > 0) return 'tone-next';
      const madrugada = s0 > 0 && e.start < s0;
      return !madrugada && e.end <= nowMin ? 'tone-past' : '';
    };
    const hasClash = !!morning || dayItems.some((i) => !plan?.moves?.[i.id]?.off && clashes({ ...i, time: plan?.moves?.[i.id]?.time ?? i.time }, dayOcc).length > 0);
    return { name, d, date, dayOcc, plan, dayItems, morning, entries, rel, nowRel, when, passed, tone, hasClash };
  });
  const todayCol = days.find((x) => x.date && x.when === 0);
  // Solo las franjas que tienen algo en la semana.
  const rows = order.filter((k) => days.some((x) => x.entries.some((e) => partOf(e.start, parts) === k)));
  const drop = (d: number) => ({
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      const id = e.dataTransfer.getData('text/plain');
      if (id) onMove(id, d);
    },
  });
  const cols = { gridTemplateColumns: `repeat(${WEEK.length}, 16rem)` };

  return (
    <div className="relative" data-tour="tablero">
      <div ref={scroller} className="relative -mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
        <div className="grid w-max gap-x-3" style={cols}>
          {/* Cabecera de cada día: fecha, eventos de todo el día y reacomodar. */}
          {days.map(({ name, d, date, dayOcc, dayItems, plan, hasClash }) => (
            <section key={name} {...drop(d)} className="relative overflow-hidden rounded-2xl bg-white/[0.035] p-2 ring-1 ring-white/5">
              {date && <span aria-hidden className="pointer-events-none absolute -right-1 -top-4 select-none font-display text-[104px] font-black leading-none tracking-tighter text-white/[0.07]">{date.getDate()}</span>}
              <h2 className="relative px-2 py-1.5"><span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${(date ? sameDay(date, appNow()) : d === today) ? 'bg-sky-500/20 text-sky-200' : 'bg-white/[0.06] text-zinc-300'}`}>{name}{date && <span className="ml-1 font-normal opacity-70">{date.getDate()} {MONTHS_SHORT[date.getMonth()]}</span>}</span></h2>
              <div className="relative space-y-2 empty:hidden">
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
              </div>
            </section>
          ))}

          {rows.map((k, r) => {
            const info = PART_INFO[k];
            const folded = fold[k] ?? (todayCol ? todayCol.passed(k) : false);
            // Resumen al plegar: lo de hoy (si la semana es esta) o cuántas tareas hay en la semana.
            const actsOf = (x: (typeof days)[number]) => x.entries.filter((e): e is Extract<Entry, { kind: 'item' }> => e.kind === 'item' && partOf(e.start, parts) === k && !x.plan?.moves?.[e.i.id]?.off);
            const acts = todayCol ? actsOf(todayCol) : days.flatMap(actsOf);
            const done = todayCol && status ? acts.filter((e) => status(e.i) === 'hecho').length : 0;
            const late = todayCol && status && todayCol.passed(k) ? acts.length - done : 0;
            return (
              <React.Fragment key={k}>
                <button
                  type="button"
                  onClick={() => setFold((f) => ({ ...f, [k]: !folded }))}
                  aria-expanded={!folded}
                  aria-label={show.partes ? undefined : `${info.name}: ${folded ? 'desplegar' : 'plegar'}`}
                  className={`col-span-full block rounded-md text-left text-sm font-semibold outline-none ${r === 0 ? 'py-2' : show.partes ? 'pb-2 pt-3' : 'pb-1.5 pt-2'} ${info.cls}`}
                  style={{ gridColumn: '1 / -1' }}
                >
                  {/* La barra ocupa solo lo que se ve: texto, puntos y al final la flecha (sin puntos encima ni después). */}
                  <span className="sticky left-0 flex items-center gap-2" style={{ width: vw ? `min(${vw}px, 100%)` : '100%' }}>
                    {show.partes && (
                      <span className="flex shrink-0 items-center gap-2">
                        <span aria-hidden>{info.emoji}</span> {info.name}
                        {folded && acts.length > 0 && <span className="font-normal text-zinc-400">· {todayCol ? (status ? `hoy ${done} de ${acts.length} hechas` : `hoy ${acts.length} ${acts.length === 1 ? 'tarea' : 'tareas'}`) : `${acts.length} ${acts.length === 1 ? 'tarea' : 'tareas'}`}{late > 0 ? <span className="text-rose-300"> · {late} se pasaron</span> : null}</span>}
                      </span>
                    )}
                    <span className="h-0 flex-1 border-t border-dotted border-current opacity-50" />
                    <ChevronDown className={`h-4 w-4 shrink-0 opacity-70 transition-transform ${folded ? '-rotate-90' : ''}`} />
                  </span>
                </button>
                {/* Alineado por hora (Emanuel, 2026-11-05): dentro de la franja, una fila por hora; la misma
                    actividad queda a la misma altura todos los días y donde un día no tiene nada queda un hueco suave. */}
                {!folded && (() => {
                  const inPart = days.map((x) => x.entries.filter((e) => partOf(e.start, parts) === k));
                  const slots = [...new Set(inPart.flat().map((e) => e.start))].sort((a, b) => a - b);
                  const rowOf = (m: number) => slots.indexOf(m) + 2; // la fila 1 es el margen de arriba
                  return (
                    <div className="grid gap-x-3 gap-y-2" style={{ ...cols, gridColumn: '1 / -1', gridTemplateRows: `0px repeat(${slots.length + 1}, auto)` }}>
                      {days.map((x, c) => {
                        const mine = inPart[c];
                        const last = mine.length ? rowOf(mine[mine.length - 1].start) : 1;
                        const { plan, dayItems, dayOcc, morning } = x;
                        return (
                          <React.Fragment key={x.name}>
                            {/* El fondo de la casilla llega hasta el + de ese día. */}
                            <div {...drop(x.d)} className="rounded-2xl ring-1 ring-white/[0.04]" style={{ background: info.grad, gridColumn: c + 1, gridRow: `1 / ${last + 2}` }} />
                            {slots.map((m) => {
                              const here = mine.filter((e) => e.start === m);
                              if (!here.length) return null;
                              return (
                                <div key={m} {...drop(x.d)} className="space-y-2 px-2" style={{ gridColumn: c + 1, gridRow: rowOf(m) }}>
                                  {here.map((e) => {
                                    const st = e.kind === 'item' ? status?.(e.i) ?? null : null;
                                    const live = e.kind === 'item' ? liveStatus(st, x.rel(e.start), x.rel(e.end), x.nowRel, x.passed(k)) : null;
                                    return (
                                      // Atrasada todavía se puede hacer: no va en gris.
                                      <div key={e.key} className={live?.label === '⏳ Atrasada' ? '' : x.tone(e)}>
                                        {e.kind === 'ev' ? evChip(e.o) : e.kind === 'extra' ? <ExtraCard x={e.x} /> : (() => {
                                          const i = e.i;
                                          return <Card item={i} labels={labels} weather={x.date ? hintFor(wxBoard, iso(x.date), plan?.moves?.[i.id]?.time ?? i.time) : null} crossed={[...new Set(overlaps(dayItems.filter((y) => y.id !== i.id && !plan?.moves?.[y.id]?.off).map((y) => ({ ...y, time: plan?.moves?.[y.id]?.time ?? y.time })), plan?.moves?.[i.id]?.time ?? i.time, i.minutes).map((y) => y.title))]} streak={streak?.(i, x.date ?? undefined)} live={live} clash={plan?.moves?.[i.id]?.off ? [] : clashes({ ...i, time: plan?.moves?.[i.id]?.time ?? i.time }, dayOcc)} move={plan?.moves?.[i.id]} ownTime={usual(i)} mark={markOf?.(i.id)} warn={morning?.items.some((y) => y.id === i.id) ? `Levántate antes: ${morning.event.ev.title} es a las ${fmtTime(morning.event.start)}` : undefined} show={show} onLabel={onLabel} onPatch={onPatch ? (p) => onPatch(i, p) : undefined} onOpen={onOpen} draggable />;
                                        })()}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                            {/* Agregar en esta franja: parte a su hora (o la siguiente libre). */}
                            <div className="px-2 pb-2" style={{ gridColumn: c + 1, gridRow: last + 1 }}>
                              <button type="button" onClick={() => onAdd(x.d, toTime(Math.max(partRange(k, parts)[0], mine.length ? Math.min(1425, Math.max(...mine.map((e) => e.end))) : 0)))} aria-label={`Agregar en la ${info.name.toLowerCase()} del ${x.name.toLowerCase()}`} data-help={`Nueva tarea en la ${info.name.toLowerCase()}`} className="flex w-full items-center justify-center rounded-lg py-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200">
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  );
                })()}
              </React.Fragment>
            );
          })}

          {/* Sin nada esa semana: un + por día para empezar. */}
          {rows.length === 0 && days.map(({ name, d }) => (
            <button key={name} type="button" onClick={() => onAdd(d)} {...drop(d)} className="mt-3 flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-sm text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200">
              <Plus className="h-4 w-4" /> Nueva tarea
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Fondo del horario (Emanuel, 2026-11-05): una escena por parte del día — 🌅 amanecer (mañana),
 * 🌇 atardecer (tarde), 🌆 anochecer (noche) y 🌌 madrugada. Arriba a la derecha, sutil; el resplandor respira
 * y las estrellas titilan.
 */
const SkyDecor: React.FC<{ parts: Parts }> = ({ parts }) => {
  // Clima real (Emanuel, 2026-11-12): encima de la escena de la hora va el clima de verdad.
  const wx = useWeather().here;
  const scene = wx ? sceneOf(wx.now.code, wx.now.temp) : null;
  const n = useAppNow();
  const min = n.getHours() * 60 + n.getMinutes();
  const k = partOf(min, parts);
  // La luz de fondo de toda la app sigue la hora mientras estás en el Horario (de noche, color noche; no naranjo).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.sky = k;
    return () => { delete root.dataset.sky; };
  }, [k]);
  const cloud = (x: number, y: number, s: number, o: number, fill = '#e2e8f0') => (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o} fill={fill}>
      <ellipse cx="0" cy="0" rx="46" ry="16" /><circle cx="-18" cy="-10" r="18" /><circle cx="12" cy="-17" r="24" />
    </g>
  );
  const stars = (list: [number, number, number][], color: string) =>
    list.map(([x, y, r], n) => <circle key={n} className="hz-star" style={{ animationDelay: `${(n * 0.7) % 4}s` }} cx={x} cy={y} r={r} fill={color} />);
  // Horizonte suave: dos lomas abajo del dibujo.
  const hills = (fill: string, o: number) => <path d="M0 230 Q70 200 150 218 T300 210 T400 214 V260 H0z" fill={fill} opacity={o} />;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-0">
      <svg viewBox="0 0 400 260" className="absolute -top-6 right-0 h-72 w-[28rem] max-w-full opacity-35 sm:opacity-45">
        <defs>
          <radialGradient id="hz-amanecer" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#fde68a" /><stop offset="45%" stopColor="#fdba74" stopOpacity=".6" /><stop offset="75%" stopColor="#f9a8d4" stopOpacity=".25" /><stop offset="100%" stopColor="#f9a8d4" stopOpacity="0" /></radialGradient>
          <radialGradient id="hz-atardecer" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#fdba74" /><stop offset="45%" stopColor="#f97316" stopOpacity=".55" /><stop offset="75%" stopColor="#e11d48" stopOpacity=".2" /><stop offset="100%" stopColor="#e11d48" stopOpacity="0" /></radialGradient>
          <radialGradient id="hz-anochecer" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ddd6fe" stopOpacity=".8" /><stop offset="55%" stopColor="#a78bfa" stopOpacity=".35" /><stop offset="100%" stopColor="#7c3aed" stopOpacity="0" /></radialGradient>
          <radialGradient id="hz-madrugada" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#e0e7ff" stopOpacity=".85" /><stop offset="50%" stopColor="#818cf8" stopOpacity=".35" /><stop offset="100%" stopColor="#312e81" stopOpacity="0" /></radialGradient>
          <linearGradient id="hz-sol-amanecer" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fde047" /><stop offset="100%" stopColor="#fb923c" /></linearGradient>
          <linearGradient id="hz-sol-atardecer" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fb923c" /><stop offset="100%" stopColor="#e11d48" /></linearGradient>
          <clipPath id="hz-horizonte"><rect x="0" y="0" width="400" height="212" /></clipPath>
          {/* Todo se desvanece hacia los bordes del dibujo: así nada queda cortado en una línea recta. */}
          <radialGradient id="hz-fade-g" cx="65%" cy="50%" r="62%"><stop offset="55%" stopColor="#fff" /><stop offset="100%" stopColor="#000" /></radialGradient>
          <mask id="hz-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="260"><rect width="400" height="260" fill="url(#hz-fade-g)" /></mask>
          <radialGradient id="hz-calor" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#fde047" /><stop offset="40%" stopColor="#fb923c" stopOpacity=".55" /><stop offset="100%" stopColor="#f97316" stopOpacity="0" /></radialGradient>
          <linearGradient id="hz-sol-calor" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fef08a" /><stop offset="100%" stopColor="#f59e0b" /></linearGradient>
        </defs>

        {/* 🌅 Amanecer: el sol saliendo por el horizonte, con rayos y nubecitas rosadas. */}
        {k === 'manana' && (
          <g mask="url(#hz-fade)">
            <circle className="hz-glow" cx="270" cy="200" r="120" fill="url(#hz-amanecer)" />
            <g clipPath="url(#hz-horizonte)">
              <g className="hz-rays" stroke="#fcd34d" strokeWidth="3" strokeLinecap="round" opacity=".7">
                {Array.from({ length: 9 }, (_, n) => {
                  const a = Math.PI + (n * Math.PI) / 8;
                  return <line key={n} x1={270 + Math.cos(a) * 54} y1={205 + Math.sin(a) * 54} x2={270 + Math.cos(a) * 78} y2={205 + Math.sin(a) * 78} />;
                })}
              </g>
              <circle cx="270" cy="205" r="42" fill="url(#hz-sol-amanecer)" />
            </g>
            {hills('#fcd9b6', 0.9)}
            {cloud(150, 120, 0.8, 0.7, '#fbcfe8')}
            {cloud(345, 95, 0.6, 0.6, '#fde2e4')}
          </g>
        )}

        {/* 🌇 Atardecer: el sol bajo y rojizo, a medio esconder entre nubes. */}
        {k === 'tarde' && (
          <g mask="url(#hz-fade)">
            <circle className="hz-glow" cx="270" cy="160" r="115" fill="url(#hz-atardecer)" />
            <circle cx="270" cy="160" r="40" fill="url(#hz-sol-atardecer)" />
            {cloud(230, 178, 1.15, 0.85, '#fed7aa')}
            {cloud(320, 150, 0.8, 0.75, '#fecdd3')}
            {cloud(140, 100, 0.7, 0.5, '#fde68a')}
            {hills('#fdba74', 0.45)}
          </g>
        )}

        {/* 🌆 Anochecer: luna creciente sobre un cielo violeta y las primeras estrellas. */}
        {k === 'noche' && (
          <g mask="url(#hz-fade)">
            <circle className="hz-glow" cx="285" cy="105" r="100" fill="url(#hz-anochecer)" />
            <path d="M303 67a42 42 0 1 0 0 76a34 34 0 1 1 0-76z" fill="#c4b5fd" />
            {stars([[150, 60, 2.2], [200, 130, 1.5], [120, 150, 1.8], [240, 40, 1.6], [360, 180, 1.4]], '#a78bfa')}
            {hills('#4c1d95', 0.35)}
          </g>
        )}

        {/* 🌌 Madrugada: luna llena con cráteres y un cielo lleno de estrellas que titilan. */}
        {k === 'madrugada' && (
          <g mask="url(#hz-fade)">
            <circle className="hz-glow" cx="280" cy="100" r="105" fill="url(#hz-madrugada)" />
            <circle cx="280" cy="100" r="36" fill="#c7d2fe" />
            <circle cx="268" cy="90" r="7" fill="#a5b4fc" />
            <circle cx="292" cy="112" r="5" fill="#a5b4fc" />
            <circle cx="286" cy="84" r="3.5" fill="#a5b4fc" />
            {stars([[110, 40, 2.2], [150, 90, 1.4], [190, 30, 1.8], [210, 160, 1.5], [130, 170, 2], [350, 40, 1.6], [370, 150, 2.2], [330, 200, 1.4], [175, 210, 1.7], [90, 120, 1.5], [240, 220, 1.3], [380, 90, 1.5]], '#a5b4fc')}
          </g>
        )}
        {/* 🌤️ El clima de ahora (Open-Meteo), encima de la escena de la hora. */}
        {scene && (
          <g mask="url(#hz-fade)">
            {scene === 'calor' && k !== 'noche' && k !== 'madrugada' && (
              <>
                <circle className="hz-glow" cx="285" cy="95" r="150" fill="url(#hz-calor)" />
                <g className="hz-rays" stroke="#fbbf24" strokeWidth="4" strokeLinecap="round" opacity=".85">
                  {Array.from({ length: 12 }, (_, m) => {
                    const a = (m * Math.PI) / 6;
                    return <line key={m} x1={285 + Math.cos(a) * 58} y1={95 + Math.sin(a) * 58} x2={285 + Math.cos(a) * 86} y2={95 + Math.sin(a) * 86} />;
                  })}
                </g>
                <circle cx="285" cy="95" r="46" fill="url(#hz-sol-calor)" />
              </>
            )}
            {scene === 'parcial' && (
              <>
                {cloud(250, 120, 1.1, 0.85, '#f1f5f9')}
                {cloud(330, 150, 0.8, 0.75, '#e2e8f0')}
              </>
            )}
            {['nublado', 'llovizna', 'lluvia', 'tormenta', 'nieve'].includes(scene) && (
              <>
                <rect width="400" height="260" fill={scene === 'tormenta' ? '#1e1b4b' : '#64748b'} opacity={scene === 'tormenta' ? 0.35 : 0.18} />
                {cloud(190, 95, 1.3, 0.9, scene === 'tormenta' ? '#475569' : '#94a3b8')}
                {cloud(290, 75, 1.6, 0.92, scene === 'tormenta' ? '#334155' : '#cbd5e1')}
                {cloud(360, 120, 1.1, 0.85, scene === 'tormenta' ? '#475569' : '#94a3b8')}
              </>
            )}
            {['llovizna', 'lluvia', 'tormenta'].includes(scene) && (
              <g className="hz-rain" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" opacity=".8">
                {Array.from({ length: scene === 'llovizna' ? 10 : 18 }, (_, m) => {
                  const x = 170 + ((m * 37) % 220);
                  const y = 110 + ((m * 23) % 60);
                  return <line key={m} x1={x} y1={y} x2={x - 4} y2={y + 14} style={{ animationDelay: `${(m * 0.13) % 0.9}s` }} />;
                })}
              </g>
            )}
            {scene === 'nieve' && (
              <g className="hz-snow" fill="#f8fafc">
                {Array.from({ length: 16 }, (_, m) => (
                  <circle key={m} cx={170 + ((m * 41) % 220)} cy={115 + ((m * 19) % 60)} r={2 + (m % 3)} style={{ animationDelay: `${(m * 0.31) % 2.4}s` }} />
                ))}
              </g>
            )}
            {scene === 'tormenta' && <polyline className="hz-bolt" points="300,110 284,150 298,150 280,195" fill="none" stroke="#fde047" strokeWidth="5" strokeLinejoin="round" />}
            {scene === 'niebla' && (
              <g fill="#e2e8f0" opacity=".45">
                <rect x="120" y="120" width="260" height="14" rx="7" />
                <rect x="150" y="146" width="230" height="12" rx="6" />
                <rect x="100" y="170" width="280" height="12" rx="6" />
              </g>
            )}
          </g>
        )}
      </svg>
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
  const n = appNow();
  return Math.sign(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime());
};
/** Clase de «Enfocar hoy»: lo que pasó en gris, hoy a todo color (lo terminado en gris), lo que viene a media luz. */
const toneOf = (ctx: DayCtx, date: Date, s0: number, start: number, end: number) => {
  if (!ctx.focusToday) return '';
  const w = dayDiff(date);
  if (w < 0) return 'tone-past';
  if (w > 0) return 'tone-next';
  const now = appNow();
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
  <span className={`rounded-md px-2 py-0.5 text-sm font-semibold ${sameDay(date, appNow()) ? 'bg-sky-500/20 text-sky-200' : 'bg-white/[0.06] text-zinc-300'}`}>{name}<span className="ml-1 font-normal opacity-70">{date.getDate()} {MONTHS_SHORT[date.getMonth()]}</span></span>
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
const Gallery: React.FC<ViewProps & { ctx: DayCtx; show: Fields; streak?: (i: Item, date?: Date) => Streak }> = ({ items, labels, ctx, show, streak, onOpen }) => (
  <div className="space-y-6">
    {daysOfWeek(items, ctx).filter((g) => g.list.length).map((g) => (
      <section key={g.d}>
        <h2 className="mb-2"><DayTitle name={g.name} date={g.date} /></h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {g.list.map((i) => {
            const m = toMinutes(i.time);
            const l = labelOf(labels, i.label_id);
            return (
              <button key={i.id} type="button" onClick={() => onOpen(i.id)} className={`overflow-hidden rounded-2xl bg-white/[0.04] text-left ring-1 ring-white/10 hover:bg-white/[0.08] ${toneOf(ctx, g.date, g.s0, m, m + i.minutes)}`} style={tintCss(i.bg_color, i.border_color)}>
                {show.portada && <div className="flex h-24 items-center justify-center bg-white/[0.04] text-3xl" style={coverCss(i.cover_url)}>{!i.cover_url && <ItemIcon value={i.icon || emojiFor(i.title)} />}</div>}
                <div className="space-y-1.5 p-3">
                  <p className="truncate font-semibold text-white">{i.title || 'Sin título'}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {show.hora && <span className="text-sm font-bold tabular-nums text-white">{i.time}</span>}
                    {show.duracion && <span className="text-sm tabular-nums text-zinc-400">– {toTime((m + i.minutes) % 1440)} · {i.minutes} min</span>}
                    {show.partes && <PartTag k={partOf(m, ctx.parts)} />}
                    {show.racha && streak && <StreakChip streak={streak(i, g.date)} />}
                    {show.extras && i.focus && <Chip color="#a78bfa" icon={Zap} help="Tiene modo focus">Focus</Chip>}
                    {show.extras && i.alarm === 'alarma' && <Chip color="#f59e0b" icon={AlarmClock} help="Suena una alarma">Alarma</Chip>}
                    {show.etiqueta && l && <TagChip label={l} />}
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
const ListView: React.FC<ViewProps & { ctx: DayCtx; show: Fields; streak?: (i: Item, date?: Date) => Streak }> = ({ items, labels, ctx, show, streak, onOpen }) => (
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
                {head && show.partes && <p className="px-4 pb-0.5 pt-2"><PartTag k={part} /></p>}
                <button type="button" onClick={() => onOpen(i.id)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04] ${toneOf(ctx, g.date, g.s0, m, m + i.minutes)}`} style={{ ...(i.bg_color ? { backgroundImage: `linear-gradient(${i.bg_color}47, ${i.bg_color}47)` } : {}), ...(i.border_color ? { boxShadow: `inset 3px 0 0 ${i.border_color}` } : {}) }}>
                  {show.hora && <span className="w-12 shrink-0 text-sm font-bold tabular-nums text-white">{i.time}</span>}
                  <span className="min-w-0 flex-1 truncate text-white"><ItemIcon value={i.icon || emojiFor(i.title)} /> {i.title}</span>
                  {show.duracion && <span className="hidden shrink-0 text-xs tabular-nums text-zinc-400 sm:inline">hasta {toTime((m + i.minutes) % 1440)} · {i.minutes} min</span>}
                  {show.racha && streak && <StreakChip streak={streak(i, g.date)} />}
                  {show.extras && i.focus && <Zap className="h-3.5 w-3.5 shrink-0 text-violet-300" />}
                  {show.etiqueta && l && <span className="hidden sm:inline"><TagChip label={l} /></span>}
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
