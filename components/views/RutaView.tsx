'use client';

import React, { useMemo } from 'react';
import Image from 'next/image';
import { Flame, Lock, Moon, Target } from 'lucide-react';
import { dayStats } from '@/components/organiza/dayPlan';
import { iso, RANKS, rankOf, refOf, streakOf, XP, xpOf } from '@/components/organiza/model';
import { useChecks, useHorario } from '@/components/organiza/useHorario';

/** La Ruta: cumplir lo que uno mismo se propuso sube el rango y gana beneficios. */
export const RutaView: React.FC = () => {
  const c = useChecks();
  const h = useHorario();
  const xp = xpOf(c.checks, c.days);
  const rank = rankOf(xp);
  const next = RANKS[rank + 1];
  const base = RANKS[rank].min;
  const pct = next ? Math.min(100, ((xp - base) / (next.min - base)) * 100) : 100;

  const stats = useMemo(() => {
    const titles = [...new Set(h.publishedItems.map((i) => i.title))];
    const streaks = titles.map((t) => ({ title: t, n: streakOf(refOf(t), [...new Set(h.publishedItems.filter((i) => i.title === t).map((i) => i.weekday))], c.checks) })).sort((a, b) => b.n - a.n);
    const now = new Date();
    const week = Array.from({ length: 7 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    const statsOf = (d: Date) => dayStats(h.itemsOn(d), (i) => c.checks.find((k) => k.ref === refOf(i.title) && k.day === iso(d)));
    const days = week.map(statsOf);
    const due = days.reduce((s, x) => s + x.total, 0);
    const done = days.reduce((s, x) => s + x.done, 0);
    return { best: streaks[0], week: due ? Math.round((done / due) * 100) : 0, weekDone: done, weekDue: due, today: days[0], closed: c.days.length };
  }, [c.checks, c.days, h]);

  return (
    <div className="mx-auto max-w-4xl" data-tour="ruta">
      <h1 className="font-display text-4xl font-semibold text-white sm:text-5xl">Tu Ruta</h1>
      <p className="mt-2 text-zinc-400">Cada cosa que cumples te sube de rango y desbloquea beneficios.</p>

      <section className="mt-6 flex flex-col items-center gap-5 rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10 sm:flex-row">
        <Image src={`/progress/tier-${rank}.webp`} alt="" width={112} height={112} className="h-28 w-28 shrink-0 rounded-2xl object-cover" />
        <div className="w-full min-w-0 flex-1">
          <p className="text-sm text-zinc-400">Tu rango</p>
          <p className="font-display text-3xl font-semibold text-white">{RANKS[rank].name}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-sky-400 transition-all" style={{ width: `${pct}%` }} /></div>
          <p className="mt-2 text-sm text-zinc-400">{xp} XP{next ? ` · te faltan ${next.min - xp} para ${next.name}` : ' · llegaste a la cima'}</p>
        </div>
      </section>

      <section className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Flame className="h-4 w-4 text-amber-300" />} value={stats.best?.n ?? 0} label={stats.best?.n ? `Mejor racha: ${stats.best.title}` : 'Tu mejor racha'} />
        <Stat icon={<Target className="h-4 w-4 text-emerald-300" />} value={`${stats.today.pct}%`} label={`Hoy: ${stats.today.done} de ${stats.today.total}`} />
        <Stat icon={<Target className="h-4 w-4 text-sky-300" />} value={`${stats.week}%`} label={`Estos 7 días: ${stats.weekDone} de ${stats.weekDue}`} />
        <Stat icon={<Moon className="h-4 w-4 text-violet-300" />} value={stats.closed} label="Días cerrados" />
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-white">Cómo se gana XP</h2>
        <ul className="mt-2 divide-y divide-white/5 text-sm text-zinc-300">
          <li className="flex justify-between py-2"><span>Cumplir una tarea</span><b className="text-white">+{XP.check}</b></li>
          <li className="flex justify-between py-2"><span>Moverla y cumplirla igual</span><b className="text-white">+{XP.check + XP.adapted}</b></li>
          <li className="flex justify-between py-2"><span>Cerrar el día con el checklist</span><b className="text-white">+{XP.close}</b></li>
          <li className="flex justify-between py-2"><span>Día perfecto, todo cumplido</span><b className="text-white">+{XP.perfect}</b></li>
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold text-white">Rangos y beneficios</h2>
        <ol className="mt-3 space-y-2">
          {RANKS.map((r, i) => (
            <li key={r.name} className={`flex items-center gap-3 rounded-xl p-2.5 ring-1 ${i === rank ? 'bg-sky-500/10 ring-sky-400/30' : 'bg-white/[0.02] ring-white/5'} ${i > rank ? 'opacity-60' : ''}`}>
              <Image src={`/progress/tier-${i}.webp`} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-lg object-cover" />
              <span className="min-w-0 flex-1"><b className="block text-sm font-semibold text-white">{r.name}</b><span className="text-sm text-zinc-400">{r.reward}</span></span>
              <span className="shrink-0 text-xs tabular-nums text-zinc-500">{r.min} XP</span>
              {i > rank && <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-500" />}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
};

const Stat: React.FC<{ icon: React.ReactNode; value: React.ReactNode; label: string }> = ({ icon, value, label }) => (
  <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
    <p className="flex items-center gap-2 text-2xl font-semibold tabular-nums text-white">{icon}{value}</p>
    <p className="mt-1 truncate text-sm text-zinc-400">{label}</p>
  </div>
);
