'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Settings2, Sparkles, X } from 'lucide-react';
import { useHorario } from '@/components/organiza/useHorario';
import { useCalendar } from '@/components/calendar/useCalendar';
import { addDays, expand } from '@/components/calendar/model';
import { AIPanel } from '@/components/organiza/AIPanel';
import { JarvisSettingsModal } from '@/components/organiza/JarvisSettingsModal';
import { useJarvisSettings } from '@/components/organiza/jarvisSettings';
import { detectClashes, markSeen, seenEvents, type JarvisEvent } from '@/components/organiza/jarvisEvents';

/**
 * 🤖 Jarvis en toda la app (J6/J7, Emanuel 2026-11-19): botón flotante, saludo al abrir (texto fijo, sin gastar IA,
 * una vez por sesión), panel de Jarvis desde cualquier sección y, según el modo:
 *  · Reactivo: nada por su cuenta.
 *  · Proactivo: detecta choques del Horario con el Calendario (código, sin IA) y te los muestra.
 *  · Autónomo: si autorizaste «resolver_choques», reacomoda ese día solo (el mismo arreglo del botón del Horario,
 *    con ↶ para deshacer). Nada más.
 * Desactivado: solo queda un botón chico para volver a activarlo; no saluda ni avisa.
 */
const GREETED = 'jarvis-greeted';

/** Horario + Calendario cargados (solo se monta si hace falta: panel abierto o modo proactivo/autónomo). */
const Brain: React.FC<{ panel: boolean; where: string; watch: boolean; autoFix: boolean; onEvents: (e: JarvisEvent[]) => void; onAuto: (lines: string[], undo: () => void) => void; ask: string | null; onClosePanel: () => void }> = ({ panel, where, watch, autoFix, onEvents, onAuto, ask, onClosePanel }) => {
  const [from, to] = useMemo(() => [addDays(new Date(), -90), addDays(new Date(), 400)], []);
  const cal = useCalendar(from, to);
  const h = useHorario();
  const done = useRef(new Set<string>());

  useEffect(() => {
    if (!watch || !h.ready || cal.status !== 'ready') return;
    const today = new Date();
    const occ = expand(cal.events.filter((e) => e.source !== 'horario'), today, addDays(today, 4));
    const events = detectClashes({ today, days: 3, itemsOn: h.itemsOn, planOf: (d) => h.planOf(d) ?? null, occ }).filter((e) => !seenEvents().includes(e.key));
    if (autoFix) {
      const todo = events.filter((e) => !done.current.has(e.key));
      if (todo.length) {
        todo.forEach((e) => done.current.add(e.key));
        (async () => {
          const lines: string[] = [];
          await h.batch('Jarvis reacomodó', async () => {
            for (const e of todo) {
              const day = e.date.toLocaleDateString('sv-SE');
              const plan = h.planOf(e.date);
              await h.setPlan(day, { moves: e.moves, extras: plan?.extras ?? [] });
              markSeen(e.key);
              lines.push(`⚡ ${e.title}: reacomodé ese día${e.lines.length ? ` (${e.lines.slice(0, 3).join(' · ')})` : ''}.`);
            }
          });
          onAuto(lines, () => h.undo());
        })();
      }
      onEvents([]);
    } else onEvents(events);
  }, [watch, autoFix, h.ready, cal.status, cal.events, h.itemsOn]); // eslint-disable-line react-hooks/exhaustive-deps

  return panel ? <AIPanel h={h} cal={cal} where={where} initial={ask} onClose={onClosePanel} /> : null;
};

export const JarvisDock: React.FC<{ userName: string; where: string; hidden?: boolean }> = ({ userName, where, hidden }) => {
  const { settings: s, ready, save } = useJarvisSettings();
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<string | null>(null);
  const [greet, setGreet] = useState(false);
  const [events, setEvents] = useState<JarvisEvent[]>([]);
  const [auto, setAuto] = useState<{ lines: string[]; undo: () => void } | null>(null);
  const [settings, setSettings] = useState(false);
  const first = userName.split(' ')[0];

  // Saludo: al abrir o recargar Master Planner, una vez por sesión del navegador, con cualquier modo.
  useEffect(() => {
    if (!ready || !s.enabled || !s.greet) return;
    try {
      if (sessionStorage.getItem(GREETED)) return;
      sessionStorage.setItem(GREETED, '1');
    } catch {}
    setGreet(true);
    if (s.voice_reply && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(`¡Hola${first ? `, ${first}` : ''}! ¿Cómo estás? ¿En qué te puedo ayudar hoy?`);
      u.lang = 'es-CL';
      window.speechSynthesis.speak(u);
    }
    const t = setTimeout(() => setGreet(false), 12000);
    return () => clearTimeout(t);
  }, [ready, s.enabled, s.greet]); // eslint-disable-line react-hooks/exhaustive-deps

  if (hidden || !ready) return null;
  const watch = s.enabled && s.mode !== 'reactivo';
  const autoFix = s.mode === 'autonomo' && !!s.permissions.resolver_choques;
  const bubble = s.enabled && (greet || events.length > 0 || auto);

  return (
    <>
      {(open || watch) && (
        <Brain panel={open} where={where} watch={watch} autoFix={autoFix} onEvents={setEvents} onAuto={(lines, undo) => setAuto({ lines, undo })} ask={ask} onClosePanel={() => { setOpen(false); setAsk(null); }} />
      )}
      {!open && (
        <div className="pointer-events-none fixed bottom-[96px] right-4 z-40 flex flex-col items-end gap-2 md:bottom-6 md:right-6">
          {bubble && (
            <div className="pointer-events-auto w-[min(320px,calc(100vw-2rem))] space-y-2 rounded-2xl bg-[#16181f]/95 p-3 text-sm text-zinc-100 shadow-2xl ring-1 ring-fuchsia-400/30 backdrop-blur theme-fixed">
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 font-semibold">{greet ? `¡Hola${first ? `, ${first}` : ''}! ¿Cómo estás? ¿En qué te puedo ayudar hoy?` : '🤖 Jarvis'}</p>
                <button type="button" aria-label="Cerrar" onClick={() => { setGreet(false); setAuto(null); events.forEach((e) => markSeen(e.key)); setEvents([]); }} className="rounded-md p-0.5 text-zinc-500 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
              {auto && (
                <div className="space-y-1 rounded-xl bg-emerald-500/10 p-2 text-xs text-emerald-100 ring-1 ring-emerald-400/25">
                  {auto.lines.map((l) => <p key={l}>{l}</p>)}
                  <button type="button" onClick={() => { auto.undo(); setAuto({ lines: ['↶ Lo deshice.'], undo: () => {} }); }} className="rounded-lg bg-white/10 px-2 py-0.5 font-semibold">↶ Deshacer</button>
                </div>
              )}
              {events.slice(0, 3).map((e) => (
                <div key={e.key} className="space-y-1.5 rounded-xl bg-amber-500/10 p-2 text-xs text-amber-50 ring-1 ring-amber-400/30">
                  <p>💡 <b>{e.title}.</b> {e.body}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => { markSeen(e.key); setEvents((l) => l.filter((x) => x.key !== e.key)); setAsk(e.ask); setOpen(true); }} className="rounded-lg bg-fuchsia-600 px-2 py-1 font-semibold text-[#fff]">Verlo con Jarvis</button>
                    <button type="button" onClick={() => { markSeen(e.key); setEvents((l) => l.filter((x) => x.key !== e.key)); }} className="rounded-lg bg-white/10 px-2 py-1 font-semibold">Ahora no</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="pointer-events-auto flex items-center gap-1.5">
            {s.enabled && <button type="button" aria-label="Ajustes de Jarvis" data-help="Ajustes de Jarvis: modo, permisos y memoria" onClick={() => setSettings(true)} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#16181f] text-zinc-400 shadow-lg ring-1 ring-white/10 hover:text-white"><Settings2 className="h-4 w-4" /></button>}
            {s.enabled ? (
              <button type="button" aria-label="Hablar con Jarvis" data-help="Jarvis: pídele lo que quieras" onClick={() => { setGreet(false); setOpen(true); }} className="flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 text-sm font-bold text-[#fff] shadow-lg shadow-fuchsia-500/25 hover:brightness-110">
                <Sparkles className="h-4 w-4" /> Jarvis{events.length ? <span className="rounded-full bg-amber-400 px-1.5 text-[10px] text-[#111]">{events.length}</span> : null}
              </button>
            ) : (
              <button type="button" aria-label="Activar Jarvis" data-help="Jarvis está apagado: toca para activarlo" onClick={() => save({ enabled: true })} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#16181f] text-zinc-500 opacity-60 shadow ring-1 ring-white/10 hover:opacity-100"><Sparkles className="h-4 w-4" /></button>
            )}
          </div>
        </div>
      )}
      {settings && <JarvisSettingsModal onClose={() => setSettings(false)} />}
    </>
  );
};
