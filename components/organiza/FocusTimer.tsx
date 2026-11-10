'use client';

import { ItemIcon } from '@/components/organiza/IconPicker';
import React, { useEffect, useState } from 'react';
import { Check, FastForward, Pause, Play, Rewind, TriangleAlert, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { YouTubeList } from '@/components/organiza/YouTubeList';
import { coverCss, honesty, iso, refOf, type Item } from '@/components/organiza/model';
import { useConfirm } from '@/components/ui/confirm';
import type { useChecks } from '@/components/organiza/useHorario';

/** 0:42 · 12:05 · 6:59:42 (con horas cuando pasa de 60 min, Emanuel 2026-11-10: nada de «419:42»). */
const mmss = (s: number) => {
  const a = Math.abs(s);
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  const ss = String(a % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

/**
 * El focus abierto ahora (sea cual sea quien lo abrió). AutoFocus lo mira para cambiarlo a la hora de la
 * siguiente acción y le avisa con el evento `organiza:focus-switch` (detail = id de la nueva acción).
 */
export let openFocus: Item | null = null;
export const FOCUS_SWITCH = 'organiza:focus-switch';

/**
 * Modo focus (Emanuel, 2026-11-03): la acción a pantalla completa con su tiempo. Si tiene Paso a paso,
 * los pasos aparecen de a uno con el tiempo repartido entre ellos; la barra muestra lo que pasó y lo
 * que queda, y si te atrasas sale «¡Apúrate!». Si tiene Lista de YouTube, suena sola.
 */
export const FocusTimer: React.FC<{ item: Item; checks: ReturnType<typeof useChecks>; onDone: () => void; onClose: () => void }> = ({ item, checks, onDone, onClose }) => {
  const total = item.minutes * 60;
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  // Adelantar / retroceder (para probar): el reloj salta y la música lo sigue.
  const [seek, setSeek] = useState<{ t: number; n: number }>();
  const jump = (d: number) => {
    const t = Math.max(0, elapsed + d);
    setElapsed(t);
    setSeek((x) => ({ t, n: (x?.n ?? 0) + 1 }));
  };
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const today = iso(new Date());
  const check = checks.checks.find((c) => c.ref === refOf(item.title) && c.day === today);
  const steps = item.modules.find((m) => m.type === 'habitos')?.habits ?? [];
  const done = check?.value.habits ?? [];
  const music = item.modules.find((m) => m.type === 'youtube');
  const videos = item.modules.filter((m) => m.type === 'youtube').flatMap((m) => m.videos ?? []);
  const current = steps.findIndex((s) => !done.includes(s));
  const allDone = steps.length > 0 && current === -1;
  const per = steps.length ? total / steps.length : total;

  const left = total - elapsed;
  const late = left < 0 || (current >= 0 && elapsed > (current + 1) * per);
  // Al marcar el último paso, la acción queda hecha sola (sin preguntar: si hiciste todo, lo hiciste).
  const mark = (s: string) => {
    const next = done.includes(s) ? done.filter((x) => x !== s) : [...done, s];
    const complete = steps.length > 0 && steps.every((x) => next.includes(x));
    checks.mark(item.title, today, complete || (check?.done ?? false), { ...check?.value, started: true, habits: next });
  };
  const confirm = useConfirm();
  // Salir sin terminar deja la acción «en curso» (si no estaba hecha).
  const leave = () => {
    if (!check?.done) checks.mark(item.title, today, false, { ...check?.value, started: true });
    onClose();
  };
  // «Terminé»: con todo el paso a paso hecho, directo; si faltan pasos, pide honestidad.
  const finish = async () => {
    if (!allDone && !check?.done && !(await confirm({ title: '¿Seguro que lo terminaste?', message: honesty(), confirmLabel: 'Sí, lo hice' }))) return;
    checks.mark(item.title, today, true, { ...check?.value, started: true });
    onDone();
  };

  // El horario manda (Emanuel, 2026-11-10): llegó la hora de otra acción → este focus se cierra solo,
  // aunque su tiempo no haya llegado a cero (queda «en curso» si no lo marcaste hecho).
  const leaveRef = React.useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    openFocus = item;
    const onSwitch = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== item.id) leaveRef.current();
    };
    window.addEventListener(FOCUS_SWITCH, onSwitch);
    return () => {
      window.removeEventListener(FOCUS_SWITCH, onSwitch);
      if (openFocus?.id === item.id) openFocus = null;
    };
  }, [item]);

  return (
    <BodyPortal>
      <div role="dialog" aria-label={`Focus: ${item.title}`} className="theme-fixed fixed inset-0 z-[96] flex flex-col items-center overflow-y-auto bg-[#09090b] p-6 text-center">
        <div className="absolute inset-0 opacity-25" style={coverCss(item.cover_url)} />
        {late && !allDone && <div className="pointer-events-none absolute inset-0 animate-pulse bg-rose-600/20" />}
        <button type="button" onClick={leave} aria-label="Salir del modo focus" className="absolute right-4 top-4 z-10 rounded-lg p-2 text-zinc-300 hover:bg-white/10"><X className="h-5 w-5" /></button>

        <div className="relative my-auto w-full max-w-md py-10">
          <p className="text-lg text-zinc-300"><ItemIcon value={item.icon} /> {item.title}</p>
          <p className={`mt-2 font-display text-7xl font-semibold tabular-nums sm:text-8xl ${left < 0 ? 'text-rose-400' : 'text-[#fff]'}`}>{left < 0 ? '+' : ''}{mmss(left)}</p>

          {/* Barra: lo que pasó (adelante) y lo que queda; marcas donde termina cada paso. */}
          <div className="mt-5">
            <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${late ? 'bg-rose-500' : 'bg-emerald-400'}`} style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} />
              {steps.slice(0, -1).map((_, i) => <span key={i} className="absolute inset-y-0 w-px bg-white/30" style={{ left: `${((i + 1) / steps.length) * 100}%` }} />)}
            </div>
            <div className="mt-1.5 flex justify-between text-xs tabular-nums text-zinc-400">
              <span>Llevas {mmss(elapsed)}</span>
              <span>{left >= 0 ? `Quedan ${mmss(left)}` : `Te pasaste ${mmss(left)}`}</span>
            </div>
          </div>

          {late && !allDone && (
            <p role="alert" className="mx-auto mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-500/20 px-3 py-2 text-sm font-semibold text-rose-200 ring-1 ring-rose-400/50">
              <TriangleAlert className="h-4 w-4" /> {left < 0 ? '¡Se acabó el tiempo! Apúrate' : `¡Apúrate! Vas atrasado en «${steps[current]}»`}
            </p>
          )}

          {steps.length > 0 && (
            <div className="mt-6 space-y-2 text-left">
              {steps.map((s, i) => {
                const isDone = done.includes(s);
                const isNow = i === current;
                const ahead = current >= 0 && i > current;
                if (ahead && i > current + 2) return null;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => mark(s)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 transition-all duration-300 ${isNow ? 'bg-white/15 py-4 ring-2 ring-white/40 backdrop-blur' : isDone ? 'bg-white/[0.04] py-2 opacity-60' : 'bg-white/[0.04] py-2.5'}`}
                    style={ahead ? { opacity: 0.55 - (i - current - 1) * 0.2, transform: `scale(${1 - (i - current) * 0.03})` } : undefined}
                  >
                    <span className={`flex shrink-0 items-center justify-center rounded-full ring-2 ${isNow ? 'h-8 w-8 ring-white' : 'h-6 w-6 ring-white/40'} ${isDone ? 'bg-emerald-500 ring-emerald-400' : ''}`}>{isDone && <Check className="h-4 w-4 text-[#fff]" />}</span>
                    <span className={`min-w-0 flex-1 ${isNow ? 'text-lg font-semibold text-[#fff]' : 'text-sm text-zinc-300'} ${isDone ? 'line-through' : ''}`}>{s}</span>
                    <span className="text-xs tabular-nums text-zinc-400">{mmss(Math.round(per))}</span>
                  </button>
                );
              })}
              {allDone && <p className="pt-2 text-center text-lg font-semibold text-emerald-300">🎉 ¡Todo hecho!</p>}
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-1.5">
            {[[-60, '−1 min'], [-10, '−10 s'], [10, '+10 s'], [60, '+1 min']].map(([d, label]) => (
              <button key={label} type="button" onClick={() => jump(d as number)} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.08] px-2.5 py-1.5 text-xs font-semibold tabular-nums text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.14]">
                {(d as number) < 0 ? <Rewind className="h-3.5 w-3.5" /> : <FastForward className="h-3.5 w-3.5" />} {label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-center gap-3">
            <button type="button" onClick={() => setRunning((v) => !v)} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 font-semibold text-[#fff] hover:bg-white/15">{running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {running ? 'Pausar' : 'Seguir'}</button>
            <button type="button" onClick={finish} className={`rounded-xl px-4 py-2 font-semibold text-[#09090b] hover:bg-emerald-400 ${allDone ? 'animate-pulse bg-emerald-400' : 'bg-emerald-500'}`}>Terminé</button>
          </div>
          {videos.length > 0 && (
            <div className="relative mx-auto mt-5 max-w-md">
              <YouTubeList videos={videos} crossfade={music?.crossfade ?? 0} loopAll={music?.loopAll ?? false} paused={!running} seek={seek} />
            </div>
          )}
        </div>


      </div>
    </BodyPortal>
  );
};
