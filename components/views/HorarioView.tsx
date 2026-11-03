'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useCalendar } from '@/components/calendar/useCalendar';
import { addDays, colorOf, expand, fmtTime, minutesOf, sameDay, startOfWeek, type Occurrence } from '@/components/calendar/model';
import { AlarmClock, Bell, BellRing, CalendarClock, ChevronLeft, ChevronRight, Sparkles, Target, TriangleAlert, CalendarDays, Check as CheckIcon, ChevronDown, Copy, FileUp, Focus, ImagePlus, Moon, LayoutGrid, List, Plus, Rows3, Send, Tags, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import { CoverPicker } from '@/components/organiza/CoverPicker';
import { ImportHorario } from '@/components/organiza/ImportHorario';
import { ItemPanel } from '@/components/organiza/ItemPanel';
import { freeGaps, proposeDay, toTime, type DayPlan, type Moves } from '@/components/organiza/dayPlan';
import { byTime, coverCss, daysOf, LABEL_COLORS, scheduleLabel, type Sleep, stageOf, TEMPLATES, toMinutes, WEEK, weekdayOf, xpOf, rankOf, type Item, type Label, type Schedule, emojiFor, iso, refOf } from '@/components/organiza/model';
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
  const todayStatus = (i: Item): Status => {
    const now = new Date();
    if (i.weekday !== weekdayOf(now)) return null;
    const k = c.checks.find((x) => x.ref === refOf(i.title) && x.day === iso(now));
    return k?.done ? 'hecho' : k ? 'no' : 'pendiente';
  };
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
  const [panel, setPanel] = useState<'publicar' | 'nuevo' | 'etiquetas' | 'portada' | null>(null);

  const rank = rankOf(xpOf(c.checks, c.days));
  const s = h.active;
  const shown = useMemo(() => h.activeItems.filter((i) => !filter || i.label_id === filter).sort(byTime), [h.activeItems, filter]);
  const open = h.activeItems.find((i) => i.id === openId) ?? h.publishedItems.find((i) => i.id === openId) ?? null;
  const dirty = s?.status === 'publicado' && !!s.published_at && new Date(s.updated_at).getTime() > new Date(s.published_at).getTime() + 2000;

  if (!h.ready) return <p className="text-sm text-zinc-500">Leyendo tu horario…</p>;
  if (!s)
    return (
      <>
        <Start onPick={h.createFrom} onImport={() => setImporting(true)} />
        {importing && <ImportHorario onClose={() => setImporting(false)} onCreate={h.createImported} />}
      </>
    );

  const modes = [...new Set(h.schedules.map((x) => x.mode || 'Base'))];
  const add = async (weekday: number) => {
    const made = await h.addItem(s.id, weekday);
    if (made) setOpenId(made.id);
  };

  return (
    <div className="mx-auto max-w-[1640px]" data-tour="horario">
      <header className="relative overflow-hidden rounded-2xl ring-1 ring-white/10">
        <div className="h-28 bg-white/[0.04] sm:h-40" style={coverCss(s.cover_url)} />
        <button type="button" onClick={() => setPanel('portada')} data-tour="portada" className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-black/45 px-2.5 py-1.5 text-xs font-semibold text-[#fff] backdrop-blur hover:bg-black/60">
          <ImagePlus className="h-3.5 w-3.5" /> Portada
        </button>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          key={s.id}
          defaultValue={s.name}
          aria-label="Nombre del horario"
          onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && h.patchSchedule(s.id, { name: e.target.value.trim() })}
          className="w-full min-w-0 rounded-lg bg-transparent font-display sm:w-auto sm:flex-1 text-3xl font-semibold text-white outline-none focus:bg-white/[0.04] sm:text-4xl"
        />
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${s.status === 'publicado' ? 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/30' : 'bg-amber-500/15 text-amber-200 ring-amber-400/30'}`}>
          {s.status === 'publicado' ? (dirty ? 'Publicado · con cambios' : 'Publicado') : 'Vista previa'}
        </span>
        <div className="relative">
          <select aria-label="Elegir horario" value={s.id} onChange={(e) => h.choose(e.target.value)} className="appearance-none rounded-xl bg-white/[0.05] py-2 pl-3 pr-8 text-sm text-zinc-200 ring-1 ring-white/10">
            {modes.map((m) => (
              <optgroup key={m} label={m} className="bg-zinc-900">
                {h.schedules.filter((x) => (x.mode || 'Base') === m).map((x) => <option key={x.id} value={x.id} className="bg-zinc-900">{scheduleLabel(x)}</option>)}
              </optgroup>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-zinc-500" />
        </div>
        <button type="button" onClick={() => setPanel('nuevo')} className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-2 text-sm font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.09]">
          <Plus className="h-4 w-4" /> Nuevo horario
        </button>
        <button type="button" onClick={() => setImporting(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.05] px-3 py-2 text-sm font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.09]">
          <FileUp className="h-4 w-4" /> Importar
        </button>
        <button type="button" data-tour="publicar" onClick={() => setPanel('publicar')} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500">
          <Send className="h-4 w-4" /> {s.status === 'publicado' ? 'Publicar cambios' : 'Publicar horario'}
        </button>
      </div>

      <ModeBar key={s.id} s={s} h={h} modes={modes} />
      <WeekPlan h={h} />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-white/[0.04] p-0.5 ring-1 ring-white/10" data-tour="vistas">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" onClick={() => setView(v.id)} aria-pressed={view === v.id} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === v.id ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-200'}`}>
              <v.icon className="h-4 w-4" /> <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {h.labels.map((l) => (
            <button key={l.id} type="button" onClick={() => setFilter(filter === l.id ? null : l.id)} aria-pressed={filter === l.id} className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${filter && filter !== l.id ? 'opacity-40' : ''}`} style={{ background: `${l.color}26`, color: l.color }}>
              {l.name}
            </button>
          ))}
          <button type="button" onClick={() => setPanel('etiquetas')} data-tour="etiquetas" className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-zinc-400 hover:text-white">
            <Tags className="h-3.5 w-3.5" /> Categorías
          </button>
        </div>
      </div>

      <div className="mt-5">
        {view === 'tablero' && (
          <div className="mb-3 flex items-center gap-2">
            <button type="button" aria-label="Semana anterior" onClick={() => setWeekShift((w) => w - 1)} className="rounded-lg p-1.5 text-zinc-400 ring-1 ring-white/10 hover:bg-white/[0.06] hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-36 text-center text-sm font-semibold text-zinc-200">{weekStart.getDate()} {MONTHS_SHORT[weekStart.getMonth()]} – {addDays(weekStart, 6).getDate()} {MONTHS_SHORT[addDays(weekStart, 6).getMonth()]}</span>
            <button type="button" aria-label="Semana siguiente" onClick={() => setWeekShift((w) => w + 1)} className="rounded-lg p-1.5 text-zinc-400 ring-1 ring-white/10 hover:bg-white/[0.06] hover:text-white"><ChevronRight className="h-4 w-4" /></button>
            {weekShift !== 0 && <button type="button" onClick={() => setWeekShift(0)} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-sky-300 ring-1 ring-white/10 hover:bg-white/[0.06]">Esta semana</button>}
          </div>
        )}
        {view === 'tablero' && <Board items={shown} labels={h.labels} status={weekShift === 0 ? todayStatus : undefined} weekStart={weekStart} occ={occ} planOf={h.planOf} onApply={(date, moves) => h.setPlan(iso(date), { moves })} onOpen={setOpenId} onAdd={add} onMove={(id, weekday) => h.patchItem(id, { weekday })} />}
        {view === 'semana' && <WeekGrid items={shown} labels={h.labels} onOpen={setOpenId} onMove={(id, time) => h.patchItem(id, { time })} />}
        {view === 'mi-semana' && <WeekGrid items={[...h.publishedItems].filter((i) => !filter || i.label_id === filter).sort(byTime)} labels={h.labels} onOpen={setOpenId} onMove={(id, time) => h.patchItem(id, { time })} schedules={h.schedules} />}
        {view === 'galeria' && <Gallery items={shown} labels={h.labels} onOpen={setOpenId} />}
        {view === 'lista' && <ListView items={shown} labels={h.labels} onOpen={setOpenId} />}
      </div>

      <button
        type="button"
        onClick={async () => {
          if (await confirm({ title: `¿Borrar “${s.name}”?`, message: 'Se borran sus tareas. Tu registro de lo cumplido queda guardado.', confirmLabel: 'Borrar', tone: 'danger' })) h.removeSchedule(s.id);
        }}
        className="mt-8 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-rose-300"
      >
        <Trash2 className="h-3.5 w-3.5" /> Borrar este horario
      </button>

      {open && <ItemPanel item={open} h={h} c={c} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
      {panel === 'publicar' && <PublishDialog schedule={s} items={h.activeItems} onClose={() => setPanel(null)} onPublish={(a, days) => h.publish(s.id, a, days)} onSetAllAlarms={async () => { for (const i of h.activeItems.filter((x) => x.alarm === 'no')) await h.patchItem(i.id, { alarm: 'notificacion' }); }} onUnpublish={() => h.unpublish(s.id)} />}
      {importing && <ImportHorario onClose={() => setImporting(false)} onCreate={h.createImported} />}
      {panel === 'nuevo' && <Dialog title="Nuevo horario" onClose={() => setPanel(null)}><TemplateGrid onPick={async (id) => { await h.createFrom(id); setPanel(null); }} /></Dialog>}
      {panel === 'etiquetas' && <LabelsDialog h={h} onClose={() => setPanel(null)} />}
      {panel === 'portada' && <Dialog title="Portada del horario" onClose={() => setPanel(null)}><CoverPicker value={s.cover_url} rank={rank} title={s.name} onPick={(cover) => { h.patchSchedule(s.id, { cover_url: cover }); setPanel(null); }} /></Dialog>}
    </div>
  );
};

/* ── Modalidad, fases y semana ──────────────────────────────────────── */

type HorarioApi = ReturnType<typeof useHorario>;

/** La modalidad agrupa horarios; cada fase es una versión de ella con sus propios bloques. */
const ModeBar: React.FC<{ s: Schedule; h: HorarioApi; modes: string[] }> = ({ s, h, modes }) => {
  const mode = s.mode || 'Base';
  const phases = h.schedules.filter((x) => (x.mode || 'Base') === mode);
  const field = 'rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm text-zinc-200 outline-none ring-1 ring-white/10 focus:ring-sky-500/60';
  const live = phases.find((x) => x.status === 'publicado' && x.id !== s.id);
  const [sleeping, setSleeping] = useState(false);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-400">
      <label className="flex items-center gap-2">
        Modalidad
        <input list="organiza-modes" defaultValue={mode} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== mode && h.patchSchedule(s.id, { mode: e.target.value.trim() })} className={`${field} w-32`} />
        <datalist id="organiza-modes">{modes.map((m) => <option key={m} value={m} />)}</datalist>
      </label>
      <label className="flex items-center gap-2">
        Fase
        <input defaultValue={s.phase} placeholder="Sin fase" onBlur={(e) => e.target.value.trim() !== s.phase && h.patchSchedule(s.id, { phase: e.target.value.trim() })} className={`${field} w-32`} />
      </label>
      {phases.length > 1 && phases.map((x) => (
        <button key={x.id} type="button" onClick={() => h.choose(x.id)} aria-pressed={x.id === s.id} className={`rounded-full px-2.5 py-1 font-semibold ring-1 ${x.id === s.id ? 'bg-white/10 text-white ring-white/25' : 'ring-white/10 hover:text-white'}`}>{x.phase || x.name}{x.status === 'publicado' ? ' ●' : ''}</button>
      ))}
      {live && <button type="button" onClick={() => h.switchPhase(live.id, s.id)} className="rounded-full bg-sky-600 px-2.5 py-1 font-semibold text-[#fff] hover:bg-sky-500">Usar esta fase</button>}
      <button type="button" onClick={() => h.duplicate(s.id, { name: s.name, phase: `Fase ${phases.length + 1}` })} className="rounded-full px-2.5 py-1 font-semibold ring-1 ring-white/10 hover:text-white"><Plus className="mr-1 inline h-3 w-3" />Nueva fase</button>
      <button type="button" onClick={() => h.duplicate(s.id)} className="rounded-full px-2.5 py-1 font-semibold ring-1 ring-white/10 hover:text-white"><Copy className="mr-1 inline h-3 w-3" />Duplicar</button>
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

/** Qué horario usa cada día. Cambiar uno no toca los demás. */
const WeekPlan: React.FC<{ h: HorarioApi }> = ({ h }) => {
  const [busy, setBusy] = useState(false);
  const live = h.schedules.filter((x) => x.status === 'publicado');
  return (
    <section className="mt-4 rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/10" aria-label="Tu semana">
      <p className="mb-2 text-xs font-semibold text-zinc-400">Tu semana</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {WEEK.map((name, d) => {
          const on = live.find((x) => daysOf(x).includes(d));
          return (
            <label key={name} className="min-w-0 rounded-xl bg-white/[0.04] px-2 py-1.5 ring-1 ring-white/10" style={on?.color ? { boxShadow: `inset 3px 0 0 ${on.color}` } : undefined}>
              <span className="block text-[11px] font-semibold text-zinc-500">{name}</span>
              <select
                aria-label={`Horario del ${name}`}
                disabled={busy}
                value={on?.id ?? ''}
                onChange={async (e) => {
                  setBusy(true);
                  await h.assignDay(d, e.target.value || null);
                  setBusy(false);
                }}
                className="w-full truncate bg-transparent text-sm font-medium text-zinc-200 outline-none"
              >
                <option value="" className="bg-zinc-900">Libre</option>
                {h.schedules.map((x) => <option key={x.id} value={x.id} className="bg-zinc-900">{scheduleLabel(x)}</option>)}
              </select>
            </label>
          );
        })}
      </div>
    </section>
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

type Status = 'hecho' | 'no' | 'pendiente' | null;
const STATUS = { hecho: { label: '✅ Hecho hoy', color: '#22c55e' }, no: { label: '✖️ No lo hice hoy', color: '#f43f5e' }, pendiente: { label: 'Pendiente hoy', color: '#94a3b8' } };
const Chip: React.FC<{ color: string; icon: React.ElementType; children: React.ReactNode; help: string }> = ({ color, icon: I, children, help }) => (
  <span data-help={help} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: `${color}22`, color }}><I className="h-3.5 w-3.5" />{children}</span>
);

const Card: React.FC<{ item: Item; labels: Label[]; status?: Status; clash?: Occurrence[]; move?: { time?: string; off?: boolean }; onOpen: (id: string) => void; draggable?: boolean }> = ({ item, labels, status = null, clash = [], move, onOpen, draggable }) => {
  const label = labelOf(labels, item.label_id);
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
      onClick={() => onOpen(item.id)}
      className={`relative z-10 block w-full overflow-hidden rounded-xl bg-[#17191f]/90 text-left ring-1 backdrop-blur-sm transition hover:bg-[#1d2027] ${clash.length ? 'ring-rose-400/60' : 'ring-white/10'}`}
      style={label ? { background: `linear-gradient(0deg, ${label.color}12, ${label.color}12)` } : undefined}
    >
      {item.cover_url && <div className="h-16" style={coverCss(item.cover_url)} />}
      <div className="space-y-2 p-3">
        <p className="flex items-center gap-2 font-semibold text-white">
          <span aria-hidden>{item.icon || emojiFor(item.title)}</span>
          <span className="min-w-0 flex-1 truncate">{item.title || 'Sin título'}</span>
        </p>
        <div className="flex flex-col items-start gap-1.5">
          {status && <Pill color={STATUS[status].color}>{STATUS[status].label}</Pill>}
          {clash.map((o) => <Pill key={o.key} color="#f43f5e">⚠️ Choca con {o.ev.title} ({fmtTime(o.start)})</Pill>)}
          {move?.off && <Pill color="#94a3b8">⏸️ Aplazado este día</Pill>}
          {!move?.off && move?.time && <Pill color="#38bdf8">↪ Este día a las {move.time}</Pill>}
          {label && <Pill color={label.color}>{label.icon} {label.name}</Pill>}
        </div>
        <div className="flex items-center gap-2 text-sm tabular-nums text-zinc-400">
          <span>{item.time}</span>
          <span className="ml-auto flex items-center gap-1.5">
            {item.focus && <Chip color="#a78bfa" icon={Target} help="Tiene modo focus">Focus</Chip>}
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

const Board: React.FC<ViewProps & { status?: (i: Item) => Status; weekStart?: Date; occ?: Occurrence[]; planOf?: (d: Date) => DayPlan | null; onApply?: (date: Date, moves: Moves) => void; onAdd: (d: number) => void; onMove: (id: string, d: number) => void }> = ({ items, labels, status, weekStart, occ = [], planOf, onApply, onOpen, onAdd, onMove }) => {
  const [proposal, setProposal] = useState<{ d: number; moves: Moves; lines: { text: string; tone: 'move' | 'off' | 'lock' }[] } | null>(null);
  const today = weekdayOf(new Date());
  const scroller = useRef<HTMLDivElement>(null);
  return (
    <div ref={scroller} className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0" data-tour="tablero">
      {WEEK.map((name, d) => {
        const date = weekStart ? addDays(weekStart, d) : null;
        const dayOcc = date ? occ.filter((o) => sameDay(o.start, date)).sort((a, b) => +a.start - +b.start) : [];
        const plan = date ? planOf?.(date) ?? null : null;
        const dayItems = items.filter((i) => i.weekday === d);
        const hasClash = dayItems.some((i) => !plan?.moves?.[i.id]?.off && clashes({ ...i, time: plan?.moves?.[i.id]?.time ?? i.time }, dayOcc).length > 0);
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
            {dayOcc.length > 0 && (
              <div className="space-y-1">
                {dayOcc.map((o) => (
                  <p key={o.key} data-help="Está en tu calendario ese día" className="flex items-center gap-1.5 rounded-lg border border-dashed px-2 py-1 text-xs text-zinc-200" style={{ borderColor: `${colorOf(o.ev)}88`, background: `${colorOf(o.ev)}14` }}>
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" style={{ color: colorOf(o.ev) }} />
                    <span className="tabular-nums text-zinc-400">{o.ev.all_day ? 'Todo el día' : fmtTime(o.start)}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{o.ev.title}</span>
                  </p>
                ))}
              </div>
            )}
            {hasClash && date && onApply && proposal?.d !== d && (
              <button type="button" onClick={() => setProposal({ d, ...proposeDay(dayItems, dayOcc, plan) })} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-rose-500/15 px-2 py-1.5 text-xs font-semibold text-rose-200 ring-1 ring-rose-400/30 hover:bg-rose-500/25"><Sparkles className="h-3.5 w-3.5" /> Reacomodar este día</button>
            )}
            {proposal?.d === d && date && (
              <div className="space-y-1.5 rounded-xl bg-[#17191f] p-2.5 text-xs ring-1 ring-sky-400/30">
                <p className="font-semibold text-white">Propuesta para el {name.toLowerCase()} {date.getDate()}</p>
                {proposal.lines.length ? proposal.lines.map((l, k) => <p key={k} className={l.tone === 'lock' ? 'text-rose-200' : l.tone === 'off' ? 'text-zinc-400' : 'text-sky-200'}>{l.tone === 'lock' ? '🔒' : l.tone === 'off' ? '⏸️' : '↪'} {l.text}</p>) : <p className="text-zinc-400">No hay nada que se pueda mover solo.</p>}
                <p className="text-[11px] text-zinc-500">Solo cambia ese día: tu horario queda igual.</p>
                <div className="flex gap-1.5 pt-1">
                  <button type="button" onClick={() => { onApply?.(date, proposal.moves); setProposal(null); }} className="flex-1 rounded-lg bg-sky-600 py-1 font-semibold text-[#fff] hover:bg-sky-500">Aplicar</button>
                  <button type="button" onClick={() => setProposal(null)} className="flex-1 rounded-lg bg-white/[0.06] py-1 font-semibold text-zinc-300 hover:bg-white/[0.1]">Cancelar</button>
                </div>
              </div>
            )}
            {dayItems.map((i, n, day) => {
              const gap = n ? freeGaps(day.slice(0, n + 1)).find((g) => g.to === i.time) : null;
              return (
                <React.Fragment key={i.id}>
                  {gap && <p className="px-2 text-xs text-zinc-500">{gap.minutes} min libres</p>}
                  <Card item={i} labels={labels} status={status?.(i)} clash={plan?.moves?.[i.id]?.off ? [] : clashes({ ...i, time: plan?.moves?.[i.id]?.time ?? i.time }, dayOcc)} move={plan?.moves?.[i.id]} onOpen={onOpen} draggable />
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

const WeekGrid: React.FC<ViewProps & { onMove: (id: string, time: string) => void; schedules?: Schedule[] }> = ({ items, labels, onOpen, onMove, schedules }) => {
  const { drag, start } = useTimeDrag(onMove, onOpen);
  const mins = items.map((i) => toMinutes(i.time));
  const from = Math.max(0, Math.floor((mins.length ? Math.min(...mins) : 360) / 60));
  const to = Math.min(24, Math.ceil(Math.max(mins.length ? Math.max(...items.map((i) => toMinutes(i.time) + i.minutes)) : 1320, from * 60 + 240) / 60));
  const y = (m: number) => ((m - from * 60) / 60) * HOUR;
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="grid min-w-[880px] grid-cols-[3rem_repeat(7,1fr)] gap-x-1.5">
        <span />
        {WEEK.map((n, d) => {
          const s = schedules?.find((x) => x.status === 'publicado' && daysOf(x).includes(d));
          return (
            <div key={n} className="pb-2 text-center">
              <p className="text-sm font-semibold text-zinc-300">{n}</p>
              {schedules && <p className="truncate text-[11px] font-semibold" style={{ color: s?.color ?? '#a1a1aa' }}>{s ? scheduleLabel(s) : 'Libre'}</p>}
            </div>
          );
        })}
        <div className="relative" style={{ height: (to - from) * HOUR }}>
          {Array.from({ length: to - from }, (_, i) => <span key={i} className="absolute right-1 text-[11px] tabular-nums text-zinc-500" style={{ top: i * HOUR }}>{from + i}:00</span>)}
        </div>
        {WEEK.map((n, d) => (
          <div key={n} className="relative rounded-lg bg-white/[0.025]" style={{ height: (to - from) * HOUR }}>
            {items.filter((i) => i.weekday === d).map((i) => {
              const color = schedules?.find((x) => x.id === i.schedule_id)?.color ?? labelOf(labels, i.label_id)?.color ?? '#94a3b8';
              return (
                <button key={i.id} type="button" aria-label={`${i.title}, ${i.time}`} onPointerDown={(e) => start(e, i)} className="absolute inset-x-0.5 cursor-grab touch-none overflow-hidden rounded-md px-1.5 py-0.5 text-left text-xs font-medium text-white active:cursor-grabbing" style={{ top: y(toMinutes(i.time)) + (drag?.id === i.id ? drag.dy : 0), height: Math.max(20, (i.minutes / 60) * HOUR - 2), background: `${color}40`, borderLeft: `3px solid ${color}` }}>
                  <span className="block truncate">{i.icon || emojiFor(i.title)} {i.title}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

const Gallery: React.FC<ViewProps> = ({ items, labels, onOpen }) => (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {items.map((i) => (
      <button key={i.id} type="button" onClick={() => onOpen(i.id)} className="overflow-hidden rounded-2xl bg-white/[0.04] text-left ring-1 ring-white/10 hover:bg-white/[0.08]">
        <div className="flex h-24 items-center justify-center bg-white/[0.04] text-3xl" style={coverCss(i.cover_url)}>{!i.cover_url && (i.icon || emojiFor(i.title))}</div>
        <div className="p-3">
          <p className="truncate font-semibold text-white">{i.title || 'Sin título'}</p>
          <p className="mt-1 text-sm text-zinc-400">{WEEK[i.weekday]} · {i.time}{labelOf(labels, i.label_id) ? ` · ${labelOf(labels, i.label_id)!.name}` : ''}</p>
        </div>
      </button>
    ))}
  </div>
);

const ListView: React.FC<ViewProps> = ({ items, labels, onOpen }) => (
  <ul className="rounded-2xl bg-white/[0.025] ring-1 ring-white/5">
    {[...items].sort((a, b) => a.weekday - b.weekday || byTime(a, b)).map((i) => {
      const l = labelOf(labels, i.label_id);
      return (
        <li key={i.id} className="border-b border-white/5 last:border-0">
          <button type="button" onClick={() => onOpen(i.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04]">
            <span className="w-24 shrink-0 text-sm text-zinc-400">{WEEK[i.weekday]}</span>
            <span className="w-12 shrink-0 text-sm tabular-nums text-zinc-400">{i.time}</span>
            <span className="min-w-0 flex-1 truncate text-white">{i.icon || emojiFor(i.title)} {i.title}</span>
            {l && <span className="hidden sm:inline"><Pill color={l.color}>{l.name}</Pill></span>}
            {i.alarm !== 'no' && <Bell className="h-3.5 w-3.5 shrink-0 text-sky-300" />}
          </button>
        </li>
      );
    })}
  </ul>
);

/* ── Ventanas ───────────────────────────────────────────────────────── */

export const Dialog: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <BodyPortal>
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-[#14161b] p-5 ring-1 ring-white/10 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  </BodyPortal>
);

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

const LabelsDialog: React.FC<{ h: ReturnType<typeof useHorario>; onClose: () => void }> = ({ h, onClose }) => {
  const [name, setName] = useState('');
  return (
    <Dialog title="Categorías" onClose={onClose}>
      <ul className="space-y-3">
        {h.labels.map((l) => (
          <li key={l.id} className="space-y-2 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-2">
              <input defaultValue={l.name} aria-label="Nombre de la categoría" onBlur={(e) => e.target.value.trim() && h.patchLabel(l.id, { name: e.target.value.trim() })} className="min-w-0 flex-1 rounded-md bg-transparent px-1 text-sm font-semibold text-white outline-none focus:bg-white/[0.06]" />
              <button type="button" aria-label={`Borrar ${l.name}`} onClick={() => h.removeLabel(l.id)} className="rounded p-1 text-zinc-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {LABEL_COLORS.map((c) => <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => h.patchLabel(l.id, { color: c })} className={`h-6 w-6 rounded-full ${l.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#14161b]' : ''}`} style={{ background: c }} />)}
              <input type="color" aria-label="Elegir cualquier color" value={l.color} onChange={(e) => h.patchLabel(l.id, { color: e.target.value })} className="h-6 w-8 cursor-pointer bg-transparent" />
            </div>
          </li>
        ))}
      </ul>
      <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (name.trim()) { await h.ensureLabel(name.trim(), LABEL_COLORS[h.labels.length % LABEL_COLORS.length]); setName(''); } }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva categoría" className="min-w-0 flex-1 rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10" />
        <button type="submit" className="rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-[#fff]">Agregar</button>
      </form>
    </Dialog>
  );
};
