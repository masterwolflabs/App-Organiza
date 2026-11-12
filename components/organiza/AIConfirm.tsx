'use client';

import React, { useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useHorario } from '@/components/organiza/useHorario';
import { useCalendar } from '@/components/calendar/useCalendar';
import { describeActions, isLiveAction, runAIActions, runScreenActions } from '@/components/organiza/aiExecutor';

/**
 * 🤖 «Voy a…: ¿sí?» (Daily agente-organiza-poderes, 2026-11-12): antes de cambiar datos, el agente muestra
 * en palabras lo que va a hacer y lo hace solo si dices Sí. Los cambios de pantalla (vista, sección…) van directo.
 */
export const AIConfirmCard: React.FC<{ lines: string[]; onYes: () => Promise<void> | void; onNo: () => void }> = ({ lines, onYes, onNo }) => {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 rounded-xl bg-fuchsia-500/10 px-3 py-2.5 text-sm text-white ring-1 ring-fuchsia-400/30">
      <p className="font-semibold">🤖 Voy a…</p>
      <ul className="space-y-0.5 text-xs text-zinc-200">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      <div className="flex gap-2 pt-1">
        <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onYes(); setBusy(false); }} className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-[#fff] hover:bg-fuchsia-500 disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Sí, hazlo
        </button>
        <button type="button" disabled={busy} onClick={onNo} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/15">
          <X className="h-3.5 w-3.5" /> No
        </button>
      </div>
    </div>
  );
};

type Step = { target: string; text: string };

/** 🎓 Modo tutorial: oscurece todo menos lo que explica, de a un paso (lo pide la persona: «explícame cómo…»). */
const Spotlight: React.FC<{ steps: Step[]; onClose: () => void }> = ({ steps, onClose }) => {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${step?.target}"]`);
    if (!el) return setRect(null);
    el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    const t = setTimeout(() => setRect(el.getBoundingClientRect()), 60);
    return () => clearTimeout(t);
  }, [step]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!step) return null;
  const pad = 8;
  const box = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  const below = box ? box.top + box.height + 12 < window.innerHeight - 160 : true;
  return (
    <BodyPortal lockScroll={false}>
      <div className="fixed inset-0 z-[120]" onClick={onClose}>
        {box ? <div className="pointer-events-none absolute rounded-xl ring-2 ring-fuchsia-400 transition-all" style={{ ...box, boxShadow: '0 0 0 9999px rgba(0,0,0,.72)' }} /> : <div className="absolute inset-0 bg-black/70" />}
        <div onClick={(e) => e.stopPropagation()} className="absolute w-[min(360px,calc(100vw-24px))] rounded-2xl bg-[#14171d] p-4 text-sm text-white shadow-2xl ring-1 ring-white/15" style={box ? { left: Math.min(Math.max(12, box.left), window.innerWidth - 372), top: below ? box.top + box.height + 12 : Math.max(12, box.top - 170) } : { left: '50%', top: '40%', transform: 'translateX(-50%)' }}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-fuchsia-300">🎓 Paso {i + 1} de {steps.length}</p>
          <p className="leading-relaxed">{step.text}</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-white">Salir</button>
            {i > 0 && <button type="button" onClick={() => setI(i - 1)} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold">Atrás</button>}
            <button type="button" onClick={() => (i + 1 < steps.length ? setI(i + 1) : onClose())} className="rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-[#fff]">{i + 1 < steps.length ? 'Siguiente' : 'Listo'}</button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};

/**
 * Siempre montado (AppShell): ejecuta lo que pide el robot de VOZ (evento `mw:ai-actions` con las acciones de la
 * nube): pantalla directo y datos con la tarjeta «Voy a…». También muestra el tutorial (`organiza:tour`) del chat y la voz.
 */
export const AIActionsHost: React.FC = () => {
  const h = useHorario();
  const now = new Date();
  const [range] = useState(() => [new Date(now.getTime() - 7 * 864e5), new Date(now.getTime() + 120 * 864e5)] as const);
  const cal = useCalendar(range[0], range[1]);
  const [pending, setPending] = useState<{ actions: unknown[]; lines: string[] } | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const [tour, setTour] = useState<Step[] | null>(null);
  const live = React.useRef({ h, cal });
  live.current = { h, cal };

  useEffect(() => {
    const onActions = (e: Event) => {
      const actions = (e as CustomEvent<unknown[]>).detail;
      runScreenActions(actions);
      const data = (Array.isArray(actions) ? actions : []).filter(isLiveAction);
      if (data.length) setPending({ actions: data, lines: describeActions(data, live.current.h, live.current.cal) });
    };
    const onTour = (e: Event) => {
      const steps = (e as CustomEvent<Step[]>).detail;
      if (Array.isArray(steps) && steps.length) setTour(steps);
    };
    window.addEventListener('mw:ai-actions', onActions);
    window.addEventListener('organiza:tour', onTour);
    return () => {
      window.removeEventListener('mw:ai-actions', onActions);
      window.removeEventListener('organiza:tour', onTour);
    };
  }, []);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 6000);
    return () => clearTimeout(t);
  }, [done]);

  return (
    <>
      {(pending || done) && (
        <BodyPortal lockScroll={false}>
          <div className="fixed bottom-24 left-1/2 z-[95] w-[min(420px,calc(100vw-24px))] -translate-x-1/2 rounded-2xl bg-[#14171d]/95 p-2 shadow-2xl ring-1 ring-white/15 backdrop-blur">
            {pending ? (
              <AIConfirmCard
                lines={pending.lines}
                onYes={async () => {
                  const lines = await runAIActions(pending.actions, { ...live.current, confirm: async () => true });
                  setPending(null);
                  setDone(lines);
                  window.dispatchEvent(new Event('focus'));
                }}
                onNo={() => { setPending(null); setDone(['↩️ No hice nada.']); }}
              />
            ) : (
              <div className="space-y-0.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 ring-1 ring-emerald-400/25">{done!.map((l, k) => <p key={k}>{l}</p>)}</div>
            )}
          </div>
        </BodyPortal>
      )}
      {tour && <Spotlight steps={tour} onClose={() => setTour(null)} />}
    </>
  );
};
