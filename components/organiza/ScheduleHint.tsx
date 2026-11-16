'use client';

import React, { useMemo, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import type { Check } from '@/components/organiza/model';
import type { useHorario } from '@/components/organiza/useHorario';
import { makeProvisional, scheduleHints, snoozeHint } from '@/components/organiza/scheduleHints';

/** El aviso «tu semana se está moviendo mucho» del Horario (ver scheduleHints.ts). Uno a la vez, discreto. */
export const ScheduleHint: React.FC<{ h: ReturnType<typeof useHorario>; checks: Check[]; now: Date; onAsk: (text: string) => void }> = ({ h, checks, now, onAsk }) => {
  const [tick, setTick] = useState(0);
  const hints = useMemo(() => (h.ready ? scheduleHints(h, checks, now) : []), [h, checks, now, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const hint = hints[0];
  if (done)
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-100 ring-1 ring-emerald-400/25">
        <span className="min-w-0 flex-1">🧳 Listo: «{done}» rige esos días. Lo tienes abierto aquí para ajustarlo; después vuelve solo tu horario normal.</span>
        <button type="button" onClick={() => setDone(null)} className="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-200 hover:bg-white/10">Ok</button>
      </div>
    );
  if (!hint) return null;
  const off = () => {
    snoozeHint(hint.key);
    setPick(false);
    setTick((t) => t + 1);
  };
  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold';
  return (
    <div className="mb-3 space-y-2 rounded-xl bg-amber-400/[0.07] px-3 py-2.5 text-sm ring-1 ring-amber-300/25">
      <div className="flex flex-wrap items-center gap-2">
        <Lightbulb className="h-4 w-4 shrink-0 text-amber-300" />
        <span className="min-w-0 flex-1 text-zinc-100">
          {hint.text} <span className="text-zinc-400">¿Lo ajustamos?</span>
        </span>
        <button type="button" onClick={() => onAsk(hint.ask)} className={`${btn} bg-gradient-to-r from-fuchsia-600 to-violet-600 text-[#fff] hover:brightness-110`} data-help="Abre la IA con esto ya contado: te propone el cambio en tu horario y lo puedes deshacer">
          🗓️ Cambiar mi horario
        </button>
        <button type="button" onClick={() => setPick((v) => !v)} className={`${btn} bg-white/[0.06] text-zinc-200 hover:bg-white/[0.1]`} data-help="Una copia de tu horario solo para unos días (viaje, enfermedad, una semana distinta). Tu horario real no se toca.">
          🧳 Horario provisorio
        </button>
        <button type="button" onClick={off} className={`${btn} text-zinc-400 hover:bg-white/10 hover:text-white`} data-help="No volver a mostrar este aviso por 7 días">
          Ahora no
        </button>
      </div>
      {pick && (
        <div className="flex flex-wrap items-center gap-1.5 pl-6 text-xs text-zinc-300">
          <span>¿Por cuántos días, desde hoy?</span>
          {[
            [3, '3 días'],
            [7, '1 semana'],
            [14, '2 semanas'],
          ].map(([n, l]) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await makeProvisional(h, Number(n));
                  if (r) {
                    snoozeHint(hint.key);
                    setPick(false);
                    setDone(r.name);
                  }
                } finally {
                  setBusy(false);
                }
              }}
              className={`${btn} bg-white/[0.06] text-zinc-100 ring-1 ring-white/10 hover:bg-white/[0.12] disabled:opacity-50`}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
