'use client';

import { ItemIcon } from '@/components/organiza/IconPicker';

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Feather, Lock, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm';
import { askNotifications, notifState, type NotifState } from '@/components/organiza/notify';
import { getSound, playLoop, playOnce, setSound, soundsOf, tick, type SoundKind } from '@/components/organiza/sounds';
import type { AlarmKind, Flex, Label } from '@/components/organiza/model';
import type { useHorario } from '@/components/organiza/useHorario';

/* ── Rueda (como el temporizador del iPhone, con su clic) ─────────────── */

const ROW = 36;
const pad2 = (n: number) => String(n).padStart(2, '0');

const Wheel: React.FC<{ count: number; value: number; label: (i: number) => string; onChange: (i: number) => void; suffix?: string }> = ({ count, value, label, onChange, suffix }) => {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(value);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = value * ROW;
    // Solo al abrir: después manda el dedo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="relative flex items-center">
      <div
        ref={ref}
        onScroll={(e) => {
          const i = Math.min(count - 1, Math.max(0, Math.round(e.currentTarget.scrollTop / ROW)));
          if (i !== last.current) {
            last.current = i;
            tick();
            onChange(i);
          }
        }}
        className="h-[180px] w-16 snap-y snap-mandatory overflow-y-scroll overscroll-contain py-[72px] text-center"
        style={{ maskImage: 'linear-gradient(transparent, #000 30%, #000 70%, transparent)' }}
      >
        {Array.from({ length: count }, (_, i) => (
          <button key={i} type="button" onClick={() => ref.current?.scrollTo({ top: i * ROW, behavior: 'smooth' })} className={`block h-9 w-full snap-center text-xl font-light tabular-nums transition-colors ${i === value ? 'text-white' : 'text-zinc-500'}`}>{label(i)}</button>
        ))}
      </div>
      {suffix && <span className="pointer-events-none -ml-1 text-xs font-medium text-zinc-400">{suffix}</span>}
    </div>
  );
};

/** Ventanita con las ruedas; se guarda al tocar Listo o afuera. */
const WheelPop: React.FC<{ display: React.ReactNode; onOpen?: () => void; onDone: () => void; children: React.ReactNode }> = ({ display, onOpen, onDone, children }) => {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onDone();
  };
  return (
    <div className="relative">
      <button type="button" onClick={() => { onOpen?.(); setOpen(true); }} className="w-full rounded-xl bg-white/[0.05] px-3 py-2 text-left text-[15px] font-semibold tabular-nums text-white ring-1 ring-white/10 transition hover:bg-white/[0.08]">{display}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute left-0 top-full z-20 mt-1.5 rounded-2xl bg-white/[0.07] p-3 shadow-2xl shadow-black/40 ring-1 ring-white/15 backdrop-blur-2xl backdrop-saturate-150">
            <div className="relative flex items-center justify-center gap-1">
              <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-9 -translate-y-1/2 rounded-lg bg-white/[0.07] ring-1 ring-white/[0.06]" />
              {children}
            </div>
            <button type="button" onClick={close} className="mt-2 w-full rounded-lg bg-white/[0.1] py-1.5 text-sm font-medium text-white ring-1 ring-white/10 hover:bg-white/[0.16]">Listo</button>
          </div>
        </>
      )}
    </div>
  );
};

/** Hora «07:30» con ruedas de hora y minuto. */
export const TimeWheel: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [h, setH] = useState(Number(value.slice(0, 2)) || 0);
  const [m, setM] = useState(Number(value.slice(3, 5)) || 0);
  const shown = `${pad2(h)}:${pad2(m)}`;
  return (
    <WheelPop display={value} onOpen={() => { setH(Number(value.slice(0, 2)) || 0); setM(Number(value.slice(3, 5)) || 0); }} onDone={() => shown !== value && onChange(shown)}>
      <Wheel count={24} value={h} label={pad2} onChange={setH} />
      <span className="text-xl font-light text-white">:</span>
      <Wheel count={60} value={m} label={pad2} onChange={setM} />
    </WheelPop>
  );
};

export const durationText = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);

/** Duración con ruedas de horas y minutos. */
export const DurationWheel: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
  const [h, setH] = useState(Math.floor(value / 60));
  const [m, setM] = useState(value % 60);
  return (
    <WheelPop display={durationText(value)} onOpen={() => { setH(Math.floor(value / 60)); setM(value % 60); }} onDone={() => { const v = h * 60 + m; if (v > 0 && v !== value) onChange(v); }}>
      <Wheel count={13} value={h} label={String} onChange={setH} suffix="h" />
      <Wheel count={60} value={m} label={String} onChange={setM} suffix="min" />
    </WheelPop>
  );
};

/* ── Importancia ──────────────────────────────────────────────────────── */

export const LEVELS: { id: Flex; label: string; icon: React.ElementType; color: string; hint: string }[] = [
  { id: 'obligatorio', label: 'No negociable', icon: Lock, color: '#f43f5e', hint: 'Se bloquea en tu horario: no se mueve ni se salta. Si lo corres o lo saltas, la app te lo hace notar. Ej.: dormir, levantarte, entrenar, desayunar bien.' },
  { id: 'flexible', label: 'Modificable', icon: RefreshCw, color: '#f59e0b', hint: 'Se hace sí o sí, pero puede cambiar de hora si el día lo pide. Ej.: almuerzo, estudiar, revisar correos.' },
  { id: 'secundario', label: 'Flexible', icon: Feather, color: '#10b981', hint: 'Suma si alcanza. Si el día se complica, es lo primero que se suelta. Ej.: ver una serie, ordenar el clóset.' },
];

export const Importance: React.FC<{ value: Flex; onChange: (f: Flex) => void }> = ({ value, onChange }) => {
  const at = Math.max(0, LEVELS.findIndex((l) => l.id === value));
  const lv = LEVELS[at];
  const Icon = lv.icon;
  return (
    <div>
      <div className="relative grid grid-cols-3 rounded-2xl bg-white/[0.04] p-1 ring-1 ring-white/10">
        <span aria-hidden className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-xl transition-all duration-300 ease-out" style={{ transform: `translateX(${at * 100}%)`, background: lv.color, boxShadow: `0 6px 20px -6px ${lv.color}` }} />
        {LEVELS.map((l, i) => {
          const I = l.icon;
          return (
            <button key={l.id} type="button" aria-pressed={i === at} onClick={() => onChange(l.id)} className={`relative z-10 flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-sm font-semibold transition-colors ${i === at ? 'text-[#fff]' : 'text-zinc-400 hover:text-zinc-200'}`}>
              <I className="h-4 w-4" style={i === at ? undefined : { color: l.color }} />
              {l.label}
            </button>
          );
        })}
      </div>
      <p key={value} className="mt-2 flex gap-2 rounded-xl px-3 py-2 text-xs leading-relaxed text-zinc-300 transition-colors" style={{ background: `${lv.color}14`, boxShadow: `inset 3px 0 0 ${lv.color}` }}>
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: lv.color }} />
        <span>{lv.hint}</span>
      </p>
    </div>
  );
};

/* ── Aviso + sonido ───────────────────────────────────────────────────── */

export const ALARMS: { id: AlarmKind; label: string; hint: string }[] = [
  { id: 'no', label: 'Sin aviso', hint: 'No te avisa' },
  { id: 'notificacion', label: 'Notificación', hint: 'Un aviso suave con un sonido corto' },
  { id: 'alarma', label: 'Alarma', hint: 'Suena en bucle y deja un cartel hasta que lo cierras' },
];

/** Un toque y cambia (sin animación lenta). */
export const AlarmPicker: React.FC<{ value: AlarmKind; onChange: (v: AlarmKind) => void }> = ({ value, onChange }) => (
  <div>
    <div className="flex gap-1 rounded-xl bg-white/[0.05] p-1 ring-1 ring-white/10">
      {ALARMS.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === value} onPointerDown={() => o.id !== value && onChange(o.id)} onClick={() => o.id !== value && onChange(o.id)} className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold ${o.id === value ? 'bg-white/[0.14] text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>{o.label}</button>
      ))}
    </div>
    <p className="mt-1.5 text-xs text-zinc-500">{ALARMS.find((o) => o.id === value)?.hint}</p>
  </div>
);

/** Lista de sonidos como la del iPhone: fila «Sonido ›» que abre la lista con ✓; tocar uno lo hace sonar. */
export const SoundList: React.FC<{ kind: SoundKind }> = ({ kind }) => {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(() => getSound(kind));
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => setSel(getSound(kind)), [kind]);
  useEffect(() => () => stop.current?.(), []);
  const list = soundsOf(kind);
  const [perm, setPerm] = useState<NotifState>('unsupported');
  useEffect(() => setPerm(notifState()), []);
  const ask = async () => setPerm(await askNotifications());
  const pick = (id: string) => {
    void ask();
    stop.current?.();
    setSel(id);
    setSound(kind, id);
    if (kind === 'alarma') {
      const s = playLoop('alarma', id, 6);
      stop.current = s;
    } else playOnce('notificacion', id);
  };
  return (
    <div className="overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-white/10">
      <button type="button" onClick={() => { setOpen((v) => !v); if (open) stop.current?.(); }} className="flex w-full items-center justify-between px-3 py-2.5 text-sm">
        <span className="font-semibold text-white">{kind === 'alarma' ? 'Sonido de alarma' : 'Sonido de notificación'}</span>
        <span className="flex items-center gap-1 text-zinc-400">{list.find((s) => s.id === sel)?.label}<ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} /></span>
      </button>
      {open && (
        <ul className="border-t border-white/10">
          {list.map((s, i) => (
            <li key={s.id}>
              <button type="button" onClick={() => pick(s.id)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/[0.05] ${i ? 'border-t border-white/[0.06]' : ''}`}>
                <span className="flex w-4 justify-center text-sky-400">{sel === s.id && <Check className="h-4 w-4" />}</span>
                {s.label}
                {i === 0 && <span className="ml-auto text-xs text-zinc-500">Predeterminado</span>}
              </button>
            </li>
          ))}
          <li className="border-t border-white/10 px-3 py-2 text-[11px] text-zinc-500">Se guarda en este dispositivo.</li>
        </ul>
      )}
      {/* La notificación del navegador (además del sonido): hay que darle permiso una vez. */}
      {perm === 'default' && (
        <button type="button" onClick={() => void ask()} className="flex w-full items-center gap-2 border-t border-white/10 px-3 py-2.5 text-left text-sm font-semibold text-sky-300 hover:bg-white/[0.05]">
          🔔 Activar notificaciones del navegador
        </button>
      )}
      {perm === 'denied' && (
        <p className="border-t border-white/10 px-3 py-2.5 text-xs text-amber-300">🔕 El navegador tiene bloqueadas las notificaciones de Organiza. Toca el 🔒 junto a la dirección (arriba) → Notificaciones → Permitir.</p>
      )}
    </div>
  );
};

/* ── Categorías ───────────────────────────────────────────────────────── */

const COLORS = ['#f59e0b', '#22c55e', '#38bdf8', '#a78bfa', '#f472b6', '#ef4444', '#94a3b8'];
const SUGGESTED = [
  { icon: '🧘', name: 'Personal', color: '#22c55e' },
  { icon: '❤️', name: 'Salud', color: '#ef4444' },
  { icon: '💼', name: 'Trabajo', color: '#38bdf8' },
  { icon: '🏠', name: 'Hogar', color: '#f59e0b' },
  { icon: '📚', name: 'Aprender', color: '#a78bfa' },
  { icon: '👨‍👩‍👧', name: 'Familia y amigos', color: '#f472b6' },
];
const HOLD_MS = 2000;

/**
 * Categorías propias con emoji y color (son las etiquetas del Horario: también filtran y pintan la semana).
 * Clic derecho → borrar. Mantener presionado 2 s → tiritan: × para borrar y arrastrar para ordenar.
 */
export const Categories: React.FC<{ h: ReturnType<typeof useHorario>; value: string | null; onChange: (id: string | null) => void }> = ({ h, value, onChange }) => {
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [icon, setIcon] = useState('✨');
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [drag, setDrag] = useState<string | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  const labels = [...h.labels].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  const create = async (n: string, c: string, i: string) => {
    const made = await h.ensureLabel(n, c, i);
    if (made) onChange(made.id);
  };
  const remove = async (l: Label) => {
    setMenu(null);
    if (await confirm({ title: `¿Borrar la categoría «${l.name}»?`, message: 'Las acciones que la tenían quedan sin categoría.', confirmLabel: 'Borrar', tone: 'danger' })) await h.removeLabel(l.id);
  };
  const drop = async (target: string) => {
    if (!drag || drag === target) return;
    const ids = labels.map((l) => l.id).filter((id) => id !== drag);
    ids.splice(ids.indexOf(target), 0, drag);
    setDrag(null);
    await h.orderLabels(ids);
  };
  const missing = SUGGESTED.filter((x) => !h.labels.some((l) => l.name === x.name));

  return (
    <div className="space-y-2">
      <style>{'@keyframes mw-jiggle{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}'}</style>
      <div className="flex flex-wrap gap-1.5">
        {labels.map((l, i) => {
          const on = l.id === value;
          return (
            <span key={l.id} className="relative" style={editing ? { animation: `mw-jiggle .28s ease-in-out ${i % 2 ? '.14s' : '0s'} infinite` } : undefined}>
              <button
                type="button"
                aria-pressed={on}
                draggable={editing}
                onDragStart={() => setDrag(l.id)}
                onDragOver={(e) => editing && e.preventDefault()}
                onDrop={() => drop(l.id)}
                onContextMenu={(e) => { e.preventDefault(); setMenu({ id: l.id, x: e.clientX, y: e.clientY }); }}
                onPointerDown={() => { held.current = false; clearTimeout(hold.current); hold.current = setTimeout(() => { held.current = true; setEditing(true); }, HOLD_MS); }}
                onPointerUp={() => clearTimeout(hold.current)}
                onPointerLeave={() => clearTimeout(hold.current)}
                onClick={() => { if (held.current || editing) return; onChange(on ? null : l.id); }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-white/10 transition ${editing ? 'cursor-grab' : ''} ${drag === l.id ? 'opacity-40' : ''}`}
                style={{ background: on ? `${l.color}33` : `${l.color}12`, boxShadow: on ? `inset 0 0 0 1.5px ${l.color}` : undefined }}
              >
                <span aria-hidden>{l.icon ? <ItemIcon value={l.icon} /> : '•'}</span>
                <span className={on ? 'text-white' : 'text-zinc-300'}>{l.name}</span>
              </button>
              {editing && (
                <button type="button" aria-label={`Borrar ${l.name}`} onClick={() => remove(l)} className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-700 text-[#fff] ring-2 ring-[#14161b] hover:bg-rose-500"><X className="h-3 w-3" /></button>
              )}
            </span>
          );
        })}
        {editing ? (
          <button type="button" onClick={() => setEditing(false)} className="rounded-full bg-sky-600 px-3 py-1.5 text-sm font-semibold text-[#fff] hover:bg-sky-500">Listo</button>
        ) : (
          <button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/20 px-3 py-1.5 text-sm font-semibold text-sky-300 hover:bg-white/[0.05]"><Plus className="h-3.5 w-3.5" /> Nueva</button>
        )}
      </div>
      {editing && <p className="text-xs text-zinc-500">Arrastra para ordenar (lo de más arriba es lo que más cuidas) · toca la × para borrar.</p>}
      {!editing && missing.length > 0 && h.labels.length < 4 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-500">Ideas:</span>
          {missing.map((x) => (
            <button key={x.name} type="button" onClick={() => create(x.name, x.color, x.icon)} className="rounded-full px-2 py-0.5 text-xs text-zinc-400 ring-1 ring-white/10 hover:bg-white/[0.05] hover:text-zinc-200">{x.icon} {x.name}</button>
          ))}
        </div>
      )}
      {adding && !editing && (
        <form className="flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/10" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await create(name.trim(), color, icon); setName(''); setAdding(false); }}>
          <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} aria-label="Emoji" className="w-11 rounded-lg bg-white/[0.05] py-1 text-center text-lg outline-none ring-1 ring-white/10" />
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Nombre de la categoría" className="min-w-0 flex-1 rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none ring-1 ring-white/10" />
          <div className="flex gap-1">{COLORS.map((c) => <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => setColor(c)} className={`h-5 w-5 rounded-full ${color === c ? 'ring-2 ring-white' : ''}`} style={{ background: c }} />)}</div>
          <button type="submit" className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-[#fff] hover:bg-sky-500">Crear</button>
        </form>
      )}
      {menu && (
        <>
          <div className="fixed inset-0 z-[95]" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="fixed z-[96] w-52 rounded-xl bg-[#1b1e24] p-1 shadow-2xl ring-1 ring-white/10" style={{ left: Math.min(menu.x, window.innerWidth - 216), top: menu.y }}>
            <button type="button" onClick={() => { setMenu(null); setEditing(true); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 hover:bg-white/[0.06]">↕️ Ordenar categorías</button>
            <button type="button" onClick={() => { const l = h.labels.find((x) => x.id === menu.id); if (l) remove(l); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /> Borrar</button>
          </div>
        </>
      )}
    </div>
  );
};

/* ── Emoji de la acción ───────────────────────────────────────────────── */

const EMOJI_SETS: { label: string; list: string[] }[] = [
  { label: 'Rutina', list: ['🌅', '😴', '🚿', '🪥', '🛏️', '☕', '🍳', '🍽️', '💧', '💊', '🧹', '🧺'] },
  { label: 'Cuerpo', list: ['🏋️', '🏃', '🚶', '🚴', '🏊', '🧘', '⚽', '🥊', '🤸', '🥗', '🍎', '❤️'] },
  { label: 'Mente', list: ['📖', '📚', '✍️', '🙏', '🧠', '🎯', '🗓️', '📝', '🎧', '🎵', '🎨', '✨'] },
  { label: 'Trabajo', list: ['💼', '💻', '📧', '👥', '📞', '📊', '💰', '🚀', '🛠️', '📦', '🏢', '🔥'] },
  { label: 'Vida', list: ['👨‍👩‍👧', '🫂', '🐶', '🛒', '🚗', '✈️', '📺', '🎮', '🌳', '🏖️', '🎉', '⭐'] },
];

/** Botón con el emoji de la acción; al tocarlo, un menú para elegir otro (o escribir cualquiera). */
export const EmojiPicker: React.FC<{ value: string; onChange: (e: string) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState('');
  const pick = (e: string) => {
    onChange(e);
    setOpen(false);
  };
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Cambiar emoji" data-help="Cambiar emoji" className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.05] text-2xl ring-1 ring-white/10 transition hover:bg-white/[0.09]">{value}</button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1.5 w-72 space-y-2 rounded-2xl bg-[#1b1e24]/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
            {EMOJI_SETS.map((g) => (
              <div key={g.label}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{g.label}</p>
                <div className="grid grid-cols-6 gap-0.5">
                  {g.list.map((e) => (
                    <button key={e} type="button" onClick={() => pick(e)} className={`rounded-lg py-1 text-xl hover:bg-white/[0.08] ${e === value ? 'bg-white/[0.1]' : ''}`}>{e}</button>
                  ))}
                </div>
              </div>
            ))}
            <form className="flex gap-1.5 border-t border-white/10 pt-2" onSubmit={(e) => { e.preventDefault(); if (own.trim()) pick(own.trim()); }}>
              <input value={own} onChange={(e) => setOwn(e.target.value)} maxLength={8} placeholder="O escribe uno 😊" className="min-w-0 flex-1 rounded-lg bg-white/[0.05] px-2 py-1 text-sm text-white outline-none ring-1 ring-white/10" />
              <button type="submit" className="rounded-lg bg-white/[0.1] px-2.5 text-sm font-medium text-white hover:bg-white/[0.16]">Usar</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
