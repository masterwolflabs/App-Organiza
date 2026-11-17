'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useDb } from '@/components/organiza/db';
import { useSpace } from '@/components/organiza/space';
import { MicButton } from '@/components/organiza/DayAdjust';
import { nightsOf, sleepHours } from '@/components/organiza/SleepLog';
import type { Check, DayClose } from '@/components/organiza/model';
import { add, dayTotal, NUTRIENTS, refFor, type FoodApi, type Nutrients } from '@/components/organiza/nutrients';
import { authFetch } from '@/lib/authFetch';
import { cloudAI } from '@/lib/aiClient';
import { APP } from '@/app.config';

/**
 * 💊 Test de suplementación (Emanuel, 2026-11-17, Daily nutrition-test-suplementacion):
 * 1) encuesta pregunta por pregunta (opciones + escribir o dictar) → 2) resumen que corriges → 3) tu
 * propuesta → 4) análisis experto (nube, `/api/organiza/supplement-test`) con tu sueño, comidas,
 * cumplimiento del horario y entrenamiento → 5) plan: cada uno con hora, hasta cuándo y 🛒 para comprar.
 * Seguridad aprobada: solo personas sanas, lo recetado no se toca, dosis de etiqueta, lo delicado se deriva.
 * Cada test se guarda (organiza_supplement_tests, SQL 46).
 */

const field = 'w-full rounded-xl bg-white/[0.05] px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-sky-400/50';
type Q = { q: string; options: string[]; more?: string };
const QUESTIONS: Q[] = [
  { q: '¿Tomas algún suplemento hoy?', options: ['No', 'Sí, uno o dos', 'Sí, varios'], more: '¿Cuáles? (nombre y dosis si la sabes)' },
  { q: '¿Cada cuánto los tomas?', options: ['Todos los días', 'Algunos días', 'Solo cuando me siento mal', 'No tomo'] },
  { q: '¿Alguno te lo recetó un médico?', options: ['No', 'Sí'], more: '¿Cuál?' },
  { q: '¿Tienes alguna enfermedad, embarazo, lactancia o tomas medicamentos?', options: ['No', 'Sí'], more: '¿Cuál? (es para cuidarte)' },
  { q: '¿Cómo está tu energía durante el día?', options: ['Alta', 'Normal', 'Baja en la tarde', 'Baja todo el día'] },
  { q: '¿Cómo duermes?', options: ['Bien', 'Me cuesta quedarme dormido', 'Despierto cansado', 'Me despierto de noche'] },
  { q: '¿Te has enfermado últimamente?', options: ['No', 'Resfríos seguidos', 'Algo más'], more: '¿Qué?' },
  { q: '¿Cómo has estado de ánimo?', options: ['Bien', 'Estresado', 'Ansioso', 'Bajo'] },
  { q: '¿Qué buscas con el entrenamiento?', options: ['Fuerza y músculo', 'Rendir más', 'Bajar grasa', 'Salud general'] },
];

type Item = { name: string; verdict: 'acertaste' | 'bien' | 'no_conviene' | 'recetado' | 'sugerencia'; why: string; dose: string; time: string; with_food: boolean; weeks: number };
type Analysis = { refer: boolean; refer_why: string; summary: string; items: Item[]; sueroterapia: string; habits: string };
const VERDICT: Record<Item['verdict'], { label: string; cls: string }> = {
  acertaste: { label: '🎯 Acertaste', cls: 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/40' },
  bien: { label: '👍 Está bien', cls: 'bg-sky-500/15 text-sky-200 ring-sky-400/40' },
  no_conviene: { label: '✋ No conviene', cls: 'bg-rose-500/15 text-rose-200 ring-rose-400/40' },
  recetado: { label: '🩺 Recetado: no se toca', cls: 'bg-zinc-500/15 text-zinc-200 ring-zinc-400/40' },
  sugerencia: { label: '💡 Creo que buscas esto', cls: 'bg-amber-500/15 text-amber-200 ring-amber-400/40' },
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Lo que Master Planner ya sabe de ti, en texto para la IA (sin datos personales de más). */
function useContextText(api: FoodApi) {
  const db = useDb();
  const { space } = useSpace();
  const [extra, setExtra] = useState<{ checks: Check[]; days: DayClose[]; workouts: { day: string; title: string }[] } | null>(null);
  useEffect(() => {
    Promise.all([db.select<Check>('organiza_checks', { space }), db.select<DayClose>('organiza_days', { space }), db.select<{ day: string; title: string }>('organiza_workout_logs', { space })]).then(([checks, days, workouts]) => setExtra({ checks, days, workouts }));
  }, [db, space]);
  return useMemo(() => {
    if (!extra) return null;
    const lines: string[] = [];
    const nights = nightsOf(extra.checks).slice(-14);
    const hrs = nights.map((n) => sleepHours(n.value.bed, n.value.wake)).filter((h): h is number => h !== null);
    const q = nights.map((n) => n.value.quality).filter((x): x is number => !!x);
    if (hrs.length) lines.push(`Sueño (${hrs.length} noches): promedio ${(hrs.reduce((a, b) => a + b, 0) / hrs.length).toFixed(1)} h${q.length ? `, calidad ${(q.reduce((a, b) => a + b, 0) / q.length).toFixed(1)}/5` : ''}, despertares anotados en ${nights.filter((n) => n.value.wakeups?.length).length} noches.`);
    else lines.push('Sueño: sin registro.');
    const days = extra.days.slice(-14);
    if (days.length) lines.push(`Cumplimiento del horario (últimos ${days.length} días cerrados): ${Math.round((days.reduce((s, d) => s + (d.total ? d.done / d.total : 0), 0) / days.length) * 100)}% promedio.`);
    const since = iso(new Date(Date.now() - 13 * 86400000));
    const w = extra.workouts.filter((x) => x.day >= since);
    lines.push(w.length ? `Entrenamiento (14 días): ${w.length} entrenos (${[...new Set(w.map((x) => x.title))].slice(0, 6).join(', ')}).` : 'Entrenamiento: sin registro en 14 días.');
    const logged = [...new Set(api.entries.filter((e) => e.day >= since).map((e) => e.day))];
    if (logged.length) {
      const avg = logged.reduce((s, d) => add(s, dayTotal(d, api.entries, [], []).food, 1 / logged.length), {} as Nutrients);
      const low = NUTRIENTS.filter((n) => n.ref && !n.limit && (avg[n.key] ?? 0) < (refFor(n, api.body) ?? 0) * 0.6).map((n) => `${n.label} ${Math.round(((avg[n.key] ?? 0) / (refFor(n, api.body) ?? 1)) * 100)}%`);
      lines.push(`Comidas (${logged.length} días registrados, estimado): ${Math.round(avg.kcal ?? 0)} kcal y ${Math.round(avg.protein ?? 0)} g proteína al día. Bajo la referencia: ${low.join(', ') || 'nada'}.`);
    } else lines.push('Comidas: sin registro.');
    const mine = api.supplements.filter((s) => s.active);
    if (mine.length) lines.push(`Suplementos registrados: ${mine.map((s) => `${s.name} (${s.dose} × ${s.per_day})`).join('; ')}.`);
    lines.push(`Figura del perfil: ${api.body ?? 'no dijo'}.`);
    return lines.join('\n');
  }, [extra, api.entries, api.supplements, api.body]);
}

export const SupplementTest: React.FC<{ api: FoodApi; onClose: () => void }> = ({ api, onClose }) => {
  const db = useDb();
  const { space } = useSpace();
  const context = useContextText(api);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(() => QUESTIONS.map(() => ''));
  const [extraText, setExtraText] = useState<string[]>(() => QUESTIONS.map(() => ''));
  const [proposal, setProposal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Analysis | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const [applied, setApplied] = useState(false);
  const full = (i: number) => [answers[i], extraText[i]].filter((x) => x.trim()).join(' — ');
  const SUMMARY = QUESTIONS.length;
  const PROPOSAL = QUESTIONS.length + 1;

  const analyze = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { answers: QUESTIONS.map((q, i) => ({ q: q.q, a: full(i) })), proposal, context: context ?? '', app: APP.slug };
      const res = await authFetch(cloudAI('/api/organiza/supplement-test'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'No pude hacer el análisis.');
      setResult(j);
      setChosen((j as Analysis).items.map((x, i) => (['acertaste', 'bien', 'sugerencia'].includes(x.verdict) && !(j as Analysis).refer ? i : -1)).filter((i: number) => i >= 0));
      await db.insert('organiza_supplement_tests', { space, answers: body.answers, proposal, analysis: j });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  /** Plan final: cada uno elegido queda en tus suplementos con hora, hasta cuándo, por qué y 🛒. */
  const apply = async () => {
    if (!result) return;
    for (const i of chosen) {
      const it = result.items[i];
      const until = it.weeks ? iso(new Date(Date.now() + it.weeks * 7 * 86400000)) : null;
      const there = api.supplements.find((s) => s.name.toLowerCase() === it.name.toLowerCase());
      const p = { dose: it.dose || '1 dosis', time: it.time || null, until, reason: it.why.slice(0, 300), active: true, buy: !there };
      if (there) await api.patchSupplement(there.id, p);
      else await api.addSupplement({ name: it.name, per_day: 1, nutrients: {}, ...p });
    }
    // Lo que «no conviene» y ya tomabas queda marcado para dejarlo (se oculta).
    for (const it of result.items.filter((x) => x.verdict === 'no_conviene')) {
      const there = api.supplements.find((s) => s.name.toLowerCase() === it.name.toLowerCase());
      if (there) await api.patchSupplement(there.id, { active: false });
    }
    setApplied(true);
  };

  const q = QUESTIONS[step];
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[92] flex items-end justify-center bg-black/70 p-3 sm:items-center" onClick={onClose}>
        <div role="dialog" aria-label="Test de suplementación" onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-[#14161b] p-5 ring-1 ring-white/10">
          <div className="flex items-center gap-3">
            <p className="flex-1 font-semibold text-white">💊 Test de suplementación</p>
            {!result && <span className="text-xs tabular-nums text-zinc-500">{Math.min(step + 1, PROPOSAL + 1)} / {PROPOSAL + 1}</span>}
            <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
          {!result && <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-sky-500 transition-all" style={{ width: `${((step + 1) / (PROPOSAL + 1)) * 100}%` }} /></div>}

          {result ? (
            <div className="space-y-3">
              {result.refer && <p className="rounded-xl bg-rose-500/15 p-3 text-sm text-rose-100 ring-1 ring-rose-400/40">🩺 <b>Antes de tomar algo nuevo, consulta a un profesional.</b> {result.refer_why}</p>}
              <p className="text-sm text-zinc-200">{result.summary}</p>
              <ul className="space-y-2">
                {result.items.map((it, i) => {
                  const can = ['acertaste', 'bien', 'sugerencia'].includes(it.verdict);
                  return (
                    <li key={i} className={`rounded-xl p-3 ring-1 ${VERDICT[it.verdict].cls}`}>
                      <div className="flex items-start gap-2">
                        {can && <input type="checkbox" checked={chosen.includes(i)} onChange={(e) => setChosen((l) => (e.target.checked ? [...l, i] : l.filter((x) => x !== i)))} aria-label={`Agregar ${it.name} a mi plan`} className="mt-1 accent-sky-500" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white">{it.name} <span className="ml-1 text-[11px] font-semibold">{VERDICT[it.verdict].label}</span></p>
                          <p className="mt-0.5 text-xs text-zinc-300">{it.why}</p>
                          {(it.dose || it.time || it.weeks > 0) && <p className="mt-1 text-[11px] text-zinc-400">{[it.dose, it.time && `🕐 ${it.time}${it.with_food ? ' con comida' : ''}`, it.weeks > 0 && `por ${it.weeks} semanas y reevaluar`].filter(Boolean).join(' · ')}</p>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {result.habits && <p className="rounded-xl bg-white/[0.04] p-3 text-xs text-zinc-300">🌱 {result.habits}</p>}
              {result.sueroterapia && <p className="rounded-xl bg-white/[0.04] p-3 text-xs text-zinc-300">💧 Sueroterapia (solo información, siempre con profesional): {result.sueroterapia}</p>}
              {applied ? (
                <p className="rounded-xl bg-emerald-500/15 p-3 text-sm text-emerald-100">✅ Listo: quedaron en tus suplementos con su hora y hasta cuándo. Los nuevos están marcados 🛒 para comprar.</p>
              ) : (
                <button type="button" disabled={!chosen.length} onClick={apply} className="w-full rounded-xl bg-sky-600 px-3 py-2.5 text-sm font-bold text-[#fff] hover:bg-sky-500 disabled:opacity-50">Armar mi plan con {chosen.length} {chosen.length === 1 ? 'suplemento' : 'suplementos'}</button>
              )}
              <p className="text-[10px] text-zinc-500">No es indicación médica. Es una orientación general para personas sanas; lo recetado lo maneja tu médico.</p>
            </div>
          ) : step < SUMMARY ? (
            <div className="space-y-3">
              <p className="text-lg font-semibold text-white">{q.q}</p>
              <div className="flex flex-wrap gap-2">
                {q.options.map((o) => <button key={o} type="button" onClick={() => { setAnswers((l) => l.map((x, i) => (i === step ? o : x))); if (!q.more || o === 'No' || o === 'No tomo') setTimeout(() => setStep((s) => s + 1), 150); }} className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${answers[step] === o ? 'bg-sky-600 text-[#fff] ring-sky-500' : 'text-zinc-200 ring-white/15 hover:bg-white/[0.06]'}`}>{o}</button>)}
              </div>
              <div className="flex gap-2">
                <textarea value={extraText[step]} onChange={(e) => setExtraText((l) => l.map((x, i) => (i === step ? e.target.value : x)))} rows={2} placeholder={q.more ?? 'Algo más que quieras contar (opcional)'} className={field} />
                <MicButton onText={(t) => setExtraText((l) => l.map((x, i) => (i === step ? (x.trim() ? `${x.trim()} ${t}` : t) : x)))} />
              </div>
            </div>
          ) : step === SUMMARY ? (
            <div className="space-y-2">
              <p className="text-lg font-semibold text-white">📝 Tu resumen</p>
              <p className="text-xs text-zinc-400">Corrige lo que no quedó bien.</p>
              {QUESTIONS.map((qq, i) => (
                <label key={i} className="block text-xs text-zinc-400">{qq.q}
                  <input value={full(i)} onChange={(e) => { setAnswers((l) => l.map((x, j) => (j === i ? e.target.value : x))); setExtraText((l) => l.map((x, j) => (j === i ? '' : x))); }} className={`${field} mt-1 py-1.5`} />
                </label>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-lg font-semibold text-white">💡 ¿Qué te gustaría tomar y por qué?</p>
              <p className="text-xs text-zinc-400">Ej: «creatina para rendir más y magnesio porque duermo mal». Si no sabes, déjalo vacío.</p>
              <div className="flex gap-2">
                <textarea value={proposal} onChange={(e) => setProposal(e.target.value)} rows={4} className={field} />
                <MicButton onText={(t) => setProposal((x) => (x.trim() ? `${x.trim()} ${t}` : t))} />
              </div>
              <p className="rounded-xl bg-white/[0.03] p-3 text-[11px] leading-relaxed text-zinc-400">🔎 Se usa también lo que Master Planner sabe de ti: sueño, cumplimiento del horario, entrenamiento y comidas registradas.{context ? '' : ' (cargando…)'}</p>
              {error && <p className="text-xs text-rose-300">{error}</p>}
              <button type="button" disabled={busy || !context} onClick={analyze} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-2.5 text-sm font-bold text-[#fff] hover:bg-sky-500 disabled:opacity-60">{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Analizando como experto…</> : 'Analizar'}</button>
              <p className="text-[10px] text-zinc-500">Usa créditos de la app. No es indicación médica.</p>
            </div>
          )}

          {!result && (
            <div className="flex justify-between">
              <button type="button" disabled={!step} onClick={() => setStep((s) => s - 1)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-zinc-400 hover:text-white disabled:opacity-30"><ArrowLeft className="h-4 w-4" /> Atrás</button>
              {step < PROPOSAL && <button type="button" onClick={() => setStep((s) => s + 1)} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.08] px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/[0.14]">{step === SUMMARY ? 'Seguir' : answers[step] || extraText[step] ? 'Siguiente' : 'Saltar'} <ArrowRight className="h-4 w-4" /></button>}
            </div>
          )}
        </div>
      </div>
    </BodyPortal>
  );
};
