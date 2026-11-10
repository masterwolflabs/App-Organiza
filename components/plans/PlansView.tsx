'use client';

import React, { useState } from 'react';
import { Check, Coins, Gem, Info, Minus, Sparkles } from 'lucide-react';
import { APP } from '@/app.config';
import { CREDIT_PACKS, formatPlanPrice, formatPlanUSD, PLANS, type PlanDef, type PlanId } from '@/utils/plans';
import { usePlan } from '@/utils/usePlan';

/**
 * Planes (Emanuel, 2026-11-06: «ponle la vista de planes a todas las aplicaciones, mismos valores que
 * Finanzas»). Los mismos 4 planes y precios de Finance (utils/plans.ts). Los beneficios se escriben
 * para cualquier app (créditos de IA de ESTA app, almacenamiento, anuncios, motores). Sin pagos: al
 * elegir un plan se explica que por ahora los asigna el equipo.
 */
const RANK: Record<PlanId, number> = { free: 0, go: 1, pro: 2, max: 3 };
const PREMIUM = ['profundo', 'gpt-4o', 'claude-sonnet-5'];

const benefitsOf = (p: PlanDef) => {
  const yes = [`${p.monthlyCredits.toLocaleString('es-CL')} créditos de IA al mes en ${APP.name}`, `${p.storageGB < 1 ? `${p.storageGB * 1000} MB` : `${p.storageGB} GB`} de almacenamiento`];
  const no: string[] = [];
  (p.ads ? no : yes).push(p.ads ? 'Incluye anuncios' : 'Sin anuncios');
  if (p.engines.some((e) => PREMIUM.includes(e))) yes.push('Todos los motores de IA y modo Profundo');
  else no.push('Sin modo Profundo ni motores premium');
  if (p.id === 'max') yes.push('Prioridad y lo nuevo primero');
  return { yes, no };
};

export const PlanPage: React.FC<{ userId: string }> = ({ userId }) => {
  const { plan, status, creditsUsed, loading } = usePlan(userId);
  const pct = Math.min(1, creditsUsed / Math.max(1, plan.monthlyCredits));
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Tu plan</p>
            <p className="mt-1 flex items-center gap-2 text-2xl font-bold text-white">
              <Gem className="h-5 w-5 text-sky-400" /> {loading ? '…' : plan.name}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {formatPlanPrice(plan)} / mes · {status === 'active' ? 'Activo' : status === 'past_due' ? 'Pago pendiente' : 'Cancelado'}
            </p>
          </div>
          <p className="max-w-xs text-xs text-zinc-500">Los planes y precios son los mismos en todas las apps de Master Wolf. Por ahora los asigna el equipo; los pagos llegan pronto.</p>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-zinc-400">
            <span>Créditos de IA de {APP.name} este mes</span>
            <span className="tabular-nums">
              {Math.round(creditsUsed).toLocaleString('es-CL')} / {plan.monthlyCredits.toLocaleString('es-CL')}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full ${pct >= 0.9 ? 'bg-rose-400' : 'bg-sky-400'}`} style={{ width: `${pct * 100}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-zinc-600">Se renuevan el día 1 de cada mes.</p>
        </div>
      </section>
      <PlansView current={loading ? null : plan} embedded />
    </div>
  );
};

export const PlansView: React.FC<{ current: PlanDef | null; embedded?: boolean }> = ({ current, embedded }) => {
  const [asked, setAsked] = useState<string | null>(null);
  return (
    <section>
      {!embedded && (
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Elige tu plan</h1>
          <p className="mt-3 text-sm text-zinc-400">Usa {APP.name} gratis o desbloquea más IA, más espacio y cero anuncios.</p>
        </div>
      )}
      <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-4 ${embedded ? '' : 'mx-auto mt-10 max-w-6xl'}`}>
        {PLANS.map((p) => {
          const isCurrent = !!current && p.id === current.id;
          const higher = !current || RANK[p.id] > RANK[current.id];
          const b = benefitsOf(p);
          return (
            <div key={p.id} className={`relative flex flex-col rounded-3xl border p-5 ${p.recommended ? 'border-sky-500/50 bg-gradient-to-b from-sky-500/[0.09] to-[#111114] shadow-[0_0_40px_-18px_rgba(56,189,248,0.6)]' : 'border-zinc-800 bg-[#111114]'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-bold text-white">{p.name}</p>
                {p.recommended ? (
                  <span className="flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300">
                    <Sparkles className="h-3 w-3" /> Recomendado
                  </span>
                ) : (
                  isCurrent && <span className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[11px] font-medium text-zinc-300">Tu plan</span>
                )}
              </div>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight text-white">{formatPlanPrice(p)}</span>
                <span className="text-sm text-zinc-500">/ mes</span>
              </p>
              {p.introPriceUSD !== undefined && <p className="mt-1 text-xs font-semibold text-emerald-300">Primer mes {formatPlanUSD(p.introPriceUSD)}</p>}
              <button
                type="button"
                onClick={() => !isCurrent && setAsked(p.name)}
                disabled={isCurrent}
                className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${isCurrent ? 'cursor-default border border-zinc-700 text-zinc-400' : p.recommended ? 'bg-sky-600 text-white hover:bg-sky-500' : higher ? 'bg-white text-black hover:bg-zinc-200' : 'border border-zinc-700 text-zinc-200 hover:bg-zinc-800'}`}
              >
                {isCurrent ? 'Tu plan actual' : !current ? `Elegir ${p.name}` : higher ? `Mejorar a ${p.name}` : `Cambiar a ${p.name}`}
              </button>
              <ul className="mt-5 space-y-2 text-sm">
                {b.yes.map((x) => (
                  <li key={x} className="flex gap-2 text-zinc-300">
                    <Check className={`mt-0.5 h-4 w-4 shrink-0 ${p.recommended ? 'text-sky-400' : 'text-zinc-400'}`} /> {x}
                  </li>
                ))}
                {b.no.map((x) => (
                  <li key={x} className="flex gap-2 text-zinc-600">
                    <Minus className="mt-0.5 h-4 w-4 shrink-0" /> {x}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="mt-6 rounded-3xl border border-zinc-800 bg-[#111114] p-5">
        <p className="flex items-center gap-2 text-base font-bold text-white">
          <Coins className="h-4 w-4 text-amber-300" /> Packs de créditos
        </p>
        <p className="mt-1 text-sm text-zinc-400">¿Se acabaron los créditos del mes? Suma más con cualquier plan. No vencen a fin de mes.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CREDIT_PACKS.map((k) => (
            <button key={k.usd} type="button" onClick={() => setAsked(`el pack de ${formatPlanUSD(k.usd)}`)} className="rounded-2xl border border-zinc-800 p-4 text-left transition hover:border-amber-400/50">
              <p className="text-2xl font-bold text-white">{formatPlanUSD(k.usd)}</p>
              <p className="mt-1 text-sm text-amber-200">{k.credits.toLocaleString('es-CL')} créditos</p>
            </button>
          ))}
        </div>
      </div>
      <p className="mx-auto mt-6 max-w-xl text-center text-[11px] text-zinc-600">Precios en dólares. El primer mes de Pro y Max va con precio de bienvenida. 1 crédito ≈ una pequeña acción de IA.</p>
      {asked && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onMouseDown={() => setAsked(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#18181b] p-6 text-center shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-sky-500/15 text-sky-400">
              <Info className="h-5 w-5" />
            </span>
            <p className="mt-4 text-base font-bold text-white">Los pagos aún no están activos</p>
            <p className="mt-2 text-sm text-zinc-400">
              {APP.name} está en etapa de prueba de planes. Por ahora el equipo asigna los planes; muy pronto podrás elegir <span className="text-white">{asked}</span> desde aquí.
            </p>
            <button type="button" onClick={() => setAsked(null)} className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500">
              Entendido
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
