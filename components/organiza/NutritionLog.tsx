'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Loader2, Pill, Plus, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import { weekdayOf } from '@/components/organiza/model';
import { MEAL_SLOTS, useNutrition, usePlan, type Meal, type Workout } from '@/components/organiza/plan';
import { useRecipes } from '@/components/organiza/recipeData';
import { SupplementTest } from '@/components/organiza/SupplementTest';
import {
  add, dayTotal, entryTotal, fmt, itemTotal, NUTRIENTS, photoToBase64, readLabel, recognizeFood, refFor, useFoodLog,
  type FoodApi, type FoodEntry, type FoodItem, type NKey, type Nutrients, type Supplement,
} from '@/components/organiza/nutrients';

/**
 * 📸 Nutrition Pro · «Lo que comí» (Emanuel, 2026-11-17): registrar de 4 formas (foto, escribir o dictar,
 * gramos de balanza, «me comí la receta de hoy»), ver el día con TODOS los nutrientes contra tus metas y
 * una referencia general (no indicación médica), la semana, y tus suplementos con su check diario.
 */

const field = 'w-full rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-orange-400/50';
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T12:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const SLOTS = MEAL_SLOTS.filter((s) => s.id !== 'ayuno');
const slotNow = () => {
  const h = new Date().getHours();
  return h < 11 ? 'desayuno' : h < 13 ? 'colacion-am' : h < 16 ? 'almuerzo' : h < 19 ? 'colacion-pm' : 'cena';
};
const pct = (v: number, ref?: number) => (ref ? Math.round((v / ref) * 100) : 0);

/** Barra de un nutriente contra su meta o referencia. */
const Bar: React.FC<{ label: string; value: number; unit: string; goal?: number; limit?: boolean; small?: boolean }> = ({ label, value, unit, goal, limit, small }) => {
  const p = pct(value, goal);
  const color = limit ? (p > 100 ? 'bg-rose-400' : 'bg-zinc-400') : p >= 100 ? 'bg-emerald-400' : p >= 50 ? 'bg-orange-400' : 'bg-orange-400/60';
  return (
    <div className={small ? 'text-[11px]' : 'text-xs'}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-zinc-300">{label}</span>
        <span className="shrink-0 tabular-nums text-zinc-400">{fmt(value, unit)}{goal ? <span className="text-zinc-600"> / {fmt(goal, unit)}{limit ? ' máx' : ''}</span> : null}</span>
      </div>
      {goal ? <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, p)}%` }} /></div> : null}
    </div>
  );
};

export const NutritionLog: React.FC = () => {
  const api = useFoodLog();
  const { goals } = useNutrition();
  const confirm = useConfirm();
  const [day, setDay] = useState(() => iso(new Date()));
  const [tab, setTab] = useState<'dia' | 'semana'>('dia');
  const [registering, setRegistering] = useState(false);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [allNutrients, setAllNutrients] = useState(false);
  const totals = useMemo(() => dayTotal(day, api.entries, api.supplements, api.takes), [day, api.entries, api.supplements, api.takes]);
  const today = iso(new Date());
  const label = day === today ? 'Hoy' : day === shift(today, -1) ? 'Ayer' : new Date(`${day}T12:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' });
  const goalOf = (k: NKey) => (k === 'kcal' || k === 'protein' || k === 'carbs' || k === 'fat' ? goals[k] : undefined);
  const list = api.entries.filter((e) => e.day === day);

  if (!api.ready) return null;
  return (
    <section className="mb-10">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 font-display text-2xl font-semibold text-white">📸 Lo que comí</h2>
        <div className="flex rounded-lg bg-white/[0.05] p-0.5 text-xs">
          {(['dia', 'semana'] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-md px-3 py-1 font-semibold ${tab === t ? 'bg-orange-500 text-[#fff]' : 'text-zinc-400'}`}>{t === 'dia' ? 'Día' : 'Semana'}</button>)}
        </div>
        <div className="flex items-center gap-1 text-sm text-zinc-200">
          <button type="button" aria-label="Día anterior" onClick={() => setDay((d) => shift(d, tab === 'dia' ? -1 : -7))} className="rounded-lg p-1 hover:bg-white/10"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-24 text-center font-semibold capitalize">{tab === 'dia' ? label : 'Semana'}</span>
          <button type="button" aria-label="Día siguiente" disabled={day >= today} onClick={() => setDay((d) => (shift(d, tab === 'dia' ? 1 : 7) > today ? today : shift(d, tab === 'dia' ? 1 : 7)))} className="rounded-lg p-1 hover:bg-white/10 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <button type="button" onClick={() => setRegistering(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-[#fff] hover:bg-orange-400"><Plus className="h-4 w-4" /> Registrar</button>
      </div>

      {tab === 'semana' ? (
        <WeekView day={day} api={api} goals={goals} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            {SLOTS.map((s) => {
              const here = list.filter((e) => e.slot === s.id);
              if (!here.length) return null;
              return (
                <div key={s.id}>
                  <p className="mb-1 text-xs font-semibold text-zinc-400">{s.emoji} {s.label}</p>
                  <div className="space-y-1.5">
                    {here.map((e) => {
                      const t = entryTotal(e);
                      return (
                        <div key={e.id} className="rounded-xl bg-white/[0.03] ring-1 ring-white/10">
                          <button type="button" onClick={() => setOpenEntry(openEntry === e.id ? null : e.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left">
                            <span className="text-lg">{e.source === 'foto' ? '📸' : e.source === 'balanza' ? '⚖️' : e.source === 'receta' ? '🍳' : '✍️'}</span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{e.title || 'Comida'}</span><span className="block truncate text-[11px] text-zinc-500">{e.items.map((i) => `${i.name} ${i.grams} g`).join(' · ')}</span></span>
                            <span className="shrink-0 text-right text-xs tabular-nums text-zinc-300">{fmt(t.kcal, 'kcal')}<span className="block text-[11px] text-zinc-500">{fmt(t.protein, 'g')} prot.</span></span>
                          </button>
                          {openEntry === e.id && (
                            <div className="space-y-1.5 border-t border-white/10 px-3 py-2">
                              {e.items.map((it, k) => (
                                <div key={k} className="flex items-center gap-2 text-xs">
                                  <span className="min-w-0 flex-1 truncate text-zinc-200">{it.name}{it.sure === false && <span className="text-amber-300"> · revisar</span>}</span>
                                  <input type="number" min={0} value={it.grams} onChange={(x) => api.patchEntry(e.id, { items: e.items.map((y, j) => (j === k ? { ...y, grams: Math.max(0, Number(x.target.value) || 0) } : y)) })} aria-label="Gramos" className="w-16 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-center text-zinc-100 outline-none ring-1 ring-white/10" />
                                  <span className="w-6 text-zinc-500">g</span>
                                  <span className="w-16 text-right tabular-nums text-zinc-400">{fmt(itemTotal(it).kcal, 'kcal')}</span>
                                </div>
                              ))}
                              {e.note && <p className="text-[11px] text-zinc-500">💡 {e.note}</p>}
                              <button type="button" onClick={async () => { if (await confirm({ title: `¿Borrar «${e.title || 'esta comida'}»?`, confirmLabel: 'Borrar', tone: 'danger' })) api.removeEntry(e.id); }} className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-rose-300"><Trash2 className="h-3 w-3" /> Borrar</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {!list.length && <button type="button" onClick={() => setRegistering(true)} className="w-full rounded-2xl bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500 ring-1 ring-white/10 hover:ring-white/25">Nada registrado {day === today ? 'hoy' : 'este día'}. 📸 Saca una foto a tu plato, escribe lo que comiste o usa la balanza.</button>}
            <Supplements api={api} day={day} />
          </div>

          <aside className="space-y-3 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10 lg:self-start">
            <p className="text-sm font-semibold text-white">🧪 {label}: lo que aportó</p>
            {NUTRIENTS.filter((n) => n.group === 'macro').map((n) => <Bar key={n.key} label={n.label} value={totals.all[n.key] ?? 0} unit={n.unit} goal={goalOf(n.key) ?? refFor(n, api.body)} />)}
            {!goals.kcal && <p className="text-[11px] text-zinc-500">Pon tus metas de calorías y proteína en 🎯 Metas (abajo, en tu semana).</p>}
            <p className="pt-1 text-xs font-semibold text-zinc-300">A cuidar</p>
            {NUTRIENTS.filter((n) => n.group === 'cuidar').map((n) => <Bar key={n.key} small label={n.label} value={totals.all[n.key] ?? 0} unit={n.unit} goal={refFor(n, api.body)} limit />)}
            <button type="button" onClick={() => setAllNutrients((v) => !v)} className="text-xs font-semibold text-orange-300 hover:text-orange-200">{allNutrients ? 'Ocultar vitaminas y minerales' : 'Ver vitaminas y minerales'}</button>
            {allNutrients && (
              <>
                {(['vitamina', 'mineral'] as const).map((g) => (
                  <div key={g} className="space-y-1.5">
                    <p className="pt-1 text-xs font-semibold text-zinc-300">{g === 'vitamina' ? 'Vitaminas' : 'Minerales'}</p>
                    {NUTRIENTS.filter((n) => n.group === g).map((n) => <Bar key={n.key} small label={`${n.label}${totals.supp[n.key] ? ' 💊' : ''}`} value={totals.all[n.key] ?? 0} unit={n.unit} goal={refFor(n, api.body)} />)}
                  </div>
                ))}
                <p className="text-[10px] leading-relaxed text-zinc-500">Referencia general de adulto ({api.body === 'mujer' ? 'mujer' : 'hombre'}), no es indicación médica. 💊 = incluye suplementos. Los valores de comida son estimados.</p>
              </>
            )}
          </aside>
        </div>
      )}
      {registering && <Register api={api} day={day} onClose={() => setRegistering(false)} />}
    </section>
  );
};

/* ── Semana ─────────────────────────────────────────────────────────────────────── */

const WeekView: React.FC<{ day: string; api: FoodApi; goals: { kcal?: number; protein?: number } }> = ({ day, api, goals }) => {
  const d = new Date(`${day}T12:00`);
  const monday = shift(day, -weekdayOf(d));
  const days = Array.from({ length: 7 }, (_, i) => shift(monday, i));
  const per = days.map((x) => ({ day: x, t: dayTotal(x, api.entries, api.supplements, api.takes).all, has: api.entries.some((e) => e.day === x) }));
  const logged = per.filter((p) => p.has);
  const avg = logged.reduce((s, p) => add(s, p.t, 1 / Math.max(1, logged.length)), {} as Nutrients);
  const maxK = Math.max(goals.kcal ?? 0, ...per.map((p) => p.t.kcal ?? 0), 1);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
        <div className="flex h-44 gap-2">
          {per.map((p) => (
            <div key={p.day} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-zinc-400">{p.has ? Math.round(p.t.kcal ?? 0) : ''}</span>
              <div className="relative w-full flex-1"><div className={`absolute inset-x-0 bottom-0 rounded-t-md ${p.has ? 'bg-orange-400/80' : 'bg-white/[0.04]'}`} style={{ height: `${Math.max(3, ((p.t.kcal ?? 0) / maxK) * 100)}%` }} /></div>
              <span className="text-[11px] capitalize text-zinc-500">{new Date(`${p.day}T12:00`).toLocaleDateString('es-CL', { weekday: 'short' })}</span>
              <span className="text-[10px] tabular-nums text-zinc-500">{p.has ? `${Math.round(p.t.protein ?? 0)} g` : ''}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">Calorías por día (arriba) y proteína (abajo).{goals.kcal ? ` Tu meta: ${goals.kcal} kcal.` : ''}</p>
      </div>
      <aside className="space-y-1.5 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
        <p className="text-sm font-semibold text-white">Promedio de {logged.length} {logged.length === 1 ? 'día registrado' : 'días registrados'}</p>
        {logged.length ? NUTRIENTS.filter((n) => n.group !== 'macro' || n.key === 'kcal' || n.key === 'protein').map((n) => <Bar key={n.key} small label={n.label} value={avg[n.key] ?? 0} unit={n.unit} goal={n.key === 'kcal' ? goals.kcal : n.key === 'protein' ? goals.protein : refFor(n, api.body)} limit={n.limit} />) : <p className="text-xs text-zinc-500">Registra lo que comes y aquí ves cómo vas en la semana.</p>}
        <p className="pt-1 text-[10px] text-zinc-500">Referencia general de adulto, no es indicación médica.</p>
      </aside>
    </div>
  );
};

/* ── Registrar ──────────────────────────────────────────────────────────────────── */

type Way = 'foto' | 'texto' | 'balanza' | 'receta';

const Register: React.FC<{ api: FoodApi; day: string; onClose: () => void }> = ({ api, day, onClose }) => {
  const [way, setWay] = useState<Way>('foto');
  const [slot, setSlot] = useState(slotNow);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<{ name: string; grams: string }[]>([{ name: '', grams: '' }]);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<{ title: string; items: FoodItem[]; note: string; source: Way; recipe_id?: string | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const plan = usePlan<Meal & Workout>('meals');
  const recipes = useRecipes();
  const wd = weekdayOf(new Date(`${day}T12:00`));
  const planned = plan.rows.filter((r) => r.weekday === wd && r.title);

  const run = async (p: { text?: string; image?: { mime: string; data: string } }, source: Way, recipe_id?: string | null) => {
    setBusy(true);
    setError('');
    try {
      const r = await recognizeFood(p);
      if (!r.items.length) throw new Error('No reconocí comida ahí. Prueba escribiéndolo.');
      setDraft({ ...r, source, recipe_id });
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  const go = async () => {
    if (way === 'foto') {
      if (!photo) return setError('Saca o elige una foto de tu plato.');
      return run({ image: await photoToBase64(photo.file), text: text.trim() || undefined }, 'foto');
    }
    if (way === 'texto') return text.trim() ? run({ text }, 'texto') : setError('Escribe o dicta lo que comiste.');
    if (way === 'balanza') {
      const ok = rows.filter((r) => r.name.trim() && Number(r.grams) > 0);
      if (!ok.length) return setError('Anota cada alimento con sus gramos.');
      return run({ text: ok.map((r) => `${r.name.trim()}: ${Number(r.grams)} g (balanza, exacto)`).join('\n') }, 'balanza');
    }
  };
  const fromMeal = (m: Meal) => {
    const r = recipes.rows.find((x) => x.id === m.recipe_id);
    const ing = r ? r.ingredients.map((i) => `${i.qty ?? ''} ${i.unit} ${i.name}`.trim()).join(', ') : m.ingredients.map((i) => `${i.qty} ${i.name}`).join(', ');
    const serv = r?.servings && r.servings > 1 ? ` (la receta rinde ${r.servings} porciones; comí 1)` : '';
    void run({ text: `${m.title}${serv}. Ingredientes: ${ing || 'los típicos de ese plato'}` }, 'receta', r?.id ?? null);
  };
  const save = async () => {
    if (!draft) return;
    await api.addEntry({ day, slot, title: draft.title, source: draft.source, items: draft.items, note: draft.note, recipe_id: draft.recipe_id ?? null });
    onClose();
  };
  const total = draft ? entryTotal(draft) : null;

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onClose}>
        <div role="dialog" aria-label="Registrar lo que comí" onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-[#14161b] p-5 ring-1 ring-white/10">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-white">📸 Registrar lo que comí</p>
            <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SLOTS.map((s) => <button key={s.id} type="button" onClick={() => setSlot(s.id)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${slot === s.id ? 'bg-orange-500 text-[#fff] ring-orange-400' : 'text-zinc-300 ring-white/15'}`}>{s.emoji} {s.label}</button>)}
          </div>

          {!draft ? (
            <>
              <div className="grid grid-cols-4 gap-1.5">
                {([['foto', '📸', 'Foto'], ['texto', '✍️', 'Escribir'], ['balanza', '⚖️', 'Balanza'], ['receta', '🍳', 'Receta de hoy']] as [Way, string, string][]).map(([id, e, l]) => (
                  <button key={id} type="button" onClick={() => { setWay(id); setError(''); }} className={`rounded-xl px-1 py-2 text-xs font-semibold ring-1 ${way === id ? 'bg-orange-500/20 text-[#fff] ring-orange-400/60' : 'text-zinc-300 ring-white/10'}`}><span className="block text-lg">{e}</span>{l}</button>
                ))}
              </div>
              {way === 'foto' && (
                <div className="space-y-2">
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setPhoto({ file: f, url: URL.createObjectURL(f) }); }} />
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-white/10 hover:ring-white/25" style={{ minHeight: 140 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {photo ? <img src={photo.url} alt="Tu plato" className="max-h-60 w-full object-cover" /> : <span className="flex items-center gap-2 py-10 text-sm text-zinc-400"><Camera className="h-5 w-5" /> Sacar o elegir foto del plato</span>}
                  </button>
                  <input value={text} onChange={(e) => setText(e.target.value)} placeholder="(Opcional) detalles: «con una cucharada de aceite», «media porción»" className={field} />
                </div>
              )}
              {way === 'texto' && <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Ej: dos huevos revueltos, una marraqueta con palta y un café con leche. (Puedes dictar con el micrófono del teclado.)" className={field} />}
              {way === 'balanza' && (
                <div className="space-y-1.5">
                  {rows.map((r, i) => (
                    <div key={i} className="flex gap-1.5">
                      <input value={r.name} onChange={(e) => setRows((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Alimento (ej. pechuga de pollo a la plancha)" className={`${field} flex-1`} />
                      <input type="number" min={0} value={r.grams} onChange={(e) => setRows((l) => l.map((x, j) => (j === i ? { ...x, grams: e.target.value } : x)))} placeholder="g" className={`${field} w-20 text-center`} />
                    </div>
                  ))}
                  <button type="button" onClick={() => setRows((l) => [...l, { name: '', grams: '' }])} className="text-xs font-semibold text-orange-300">＋ Otro alimento</button>
                </div>
              )}
              {way === 'receta' && (
                <div className="space-y-1.5">
                  {planned.length ? planned.map((m) => (
                    <button key={m.id} type="button" disabled={busy} onClick={() => fromMeal(m)} className="flex w-full items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-left text-sm text-zinc-100 ring-1 ring-white/10 hover:ring-orange-400/50 disabled:opacity-50">
                      <span>{MEAL_SLOTS.find((s) => s.id === m.slot)?.emoji}</span><span className="flex-1">Me comí: <b>{m.title}</b></span><span className="text-xs text-orange-300">Un toque →</span>
                    </button>
                  )) : <p className="text-sm text-zinc-500">No hay platos planificados para este día en tu semana.</p>}
                </div>
              )}
              {error && <p className="text-xs text-rose-300">{error}</p>}
              {way !== 'receta' && (
                <button type="button" disabled={busy} onClick={go} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-3 py-2.5 text-sm font-bold text-[#fff] hover:bg-orange-400 disabled:opacity-60">{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Calculando…</> : 'Calcular nutrientes'}</button>
              )}
              {busy && way === 'receta' && <p className="flex items-center gap-2 text-xs text-zinc-400"><Loader2 className="h-4 w-4 animate-spin" /> Calculando…</p>}
              <p className="text-[11px] text-zinc-500">La IA reconoce alimentos y porciones (usa créditos de la app). Antes de guardar puedes corregir los gramos.</p>
            </>
          ) : (
            <>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Nombre" className={`${field} text-base font-semibold`} />
              <div className="space-y-1.5">
                {draft.items.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <input value={it.name} onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} aria-label="Alimento" className={`${field} flex-1 py-1`} />
                    <input type="number" min={0} value={it.grams} onChange={(e) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, grams: Math.max(0, Number(e.target.value) || 0), sure: true } : x)) })} aria-label="Gramos" className={`${field} w-20 py-1 text-center ${it.sure === false ? 'ring-amber-400/60' : ''}`} />
                    <span className="w-14 text-right text-xs tabular-nums text-zinc-400">{fmt(itemTotal(it).kcal, 'kcal')}</span>
                    <button type="button" aria-label="Quitar" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })} className="text-zinc-600 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
              {draft.items.some((i) => i.sure === false) && <p className="text-[11px] text-amber-200">Los marcados en amarillo son una estimación dudosa: revisa los gramos.</p>}
              {draft.note && <p className="text-[11px] text-zinc-400">💡 {draft.note}</p>}
              {total && <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-zinc-100">≈ <b>{fmt(total.kcal, 'kcal')}</b> · {fmt(total.protein, 'g')} proteína · {fmt(total.carbs, 'g')} carbos · {fmt(total.fat, 'g')} grasas</p>}
              <div className="flex gap-2">
                <button type="button" onClick={save} className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-[#09090b] hover:bg-emerald-400">Guardar</button>
                <button type="button" onClick={() => setDraft(null)} className="rounded-xl bg-white/[0.06] px-3 py-2 text-sm font-semibold text-zinc-300">Volver</button>
              </div>
            </>
          )}
        </div>
      </div>
    </BodyPortal>
  );
};

/* ── Suplementos ────────────────────────────────────────────────────────────────── */

const Supplements: React.FC<{ api: FoodApi; day: string }> = ({ api, day }) => {
  const [editing, setEditing] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const active = api.supplements.filter((s) => s.active);
  const fromLabel = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    setError('');
    try {
      const r = await readLabel(await photoToBase64(f));
      const made = await api.addSupplement({ name: r.name || 'Suplemento', dose: r.dose || '1 dosis', per_day: r.per_day || 1, nutrients: r.per_dose, other: r.other });
      if (made) setEditing(made.id);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  const editingRow = api.supplements.find((s) => s.id === editing) ?? null;
  return (
    <div className="rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/10">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm font-semibold text-white"><Pill className="mr-1 inline h-4 w-4 text-sky-300" /> Suplementos</p>
        <button type="button" onClick={() => setTesting(true)} data-help="Encuesta → tu propuesta → análisis experto → plan con horas y duración" className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2 py-1 text-xs font-bold text-[#fff] hover:bg-sky-500">🧪 Test de suplementación</button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => fromLabel(e.target.files?.[0])} />
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/[0.12] disabled:opacity-60">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />} Foto de la etiqueta</button>
        <button type="button" onClick={async () => { const s = await api.addSupplement({ name: 'Suplemento' }); if (s) setEditing(s.id); }} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/[0.12]"><Plus className="h-3.5 w-3.5" /> Agregar</button>
      </div>
      {error && <p className="mb-1 text-xs text-rose-300">{error}</p>}
      {active.length ? (
        <ul className="space-y-1">
          {[...active].sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99')).map((s) => {
            const n = api.takes.find((t) => t.supplement_id === s.id && t.day === day)?.n ?? 0;
            return (
              <li key={s.id} className="flex items-center gap-2">
                <button type="button" onClick={() => api.take(s, day)} data-help={n >= s.per_day ? 'Listo por hoy (toca para desmarcar)' : 'Lo tomé'} className="flex shrink-0 gap-1">
                  {Array.from({ length: s.per_day }, (_, k) => <span key={k} className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ring-2 ${k < n ? 'bg-emerald-500 text-[#fff] ring-emerald-400' : 'text-zinc-500 ring-white/25'}`}>{k < n ? '✓' : k + 1}</span>)}
                </button>
                <button type="button" onClick={() => setEditing(s.id)} className="min-w-0 flex-1 truncate text-left text-sm text-zinc-100 hover:text-white">{s.buy ? '🛒 ' : ''}{s.name} <span className="text-xs text-zinc-500">· {s.dose}{s.per_day > 1 ? ` × ${s.per_day}` : ''}{s.time ? ` · ${s.time}` : ''}{s.until ? ` · hasta ${new Date(`${s.until}T12:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}${s.until < day ? ' (reevaluar)' : ''}` : ''}</span></button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-zinc-500">Agrega lo que tomas (o saca foto a la etiqueta del frasco) y márcalo cada día: lo que aporta se suma a tus vitaminas.</p>
      )}
      {api.supplements.some((s) => s.buy) && (
        <div className="mt-2 rounded-xl bg-black/20 p-2 text-xs text-zinc-300">
          <p className="flex items-center gap-2 font-semibold text-zinc-200">🛒 Para comprar <span className="flex-1" />
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(api.supplements.filter((s) => s.buy).map((s) => `- ${s.name} (${s.dose})`).join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-[11px] font-semibold text-orange-300">{copied ? '✓ Copiada' : 'Copiar lista'}</button>
          </p>
          <ul className="mt-1 space-y-0.5">
            {api.supplements.filter((s) => s.buy).map((s) => (
              <li key={s.id} className="flex items-center gap-2"><span className="flex-1">{s.name} <span className="text-zinc-500">· {s.dose}</span></span><button type="button" onClick={() => api.patchSupplement(s.id, { buy: false })} className="text-[11px] text-emerald-300 hover:text-emerald-200">✓ Ya lo compré</button></li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-zinc-500">También sale en 🛒 Master Compras.</p>
        </div>
      )}
      {editingRow && <SupplementEditor s={editingRow} api={api} onClose={() => setEditing(null)} />}
      {testing && <SupplementTest api={api} onClose={() => setTesting(false)} />}
    </div>
  );
};

const SupplementEditor: React.FC<{ s: Supplement; api: FoodApi; onClose: () => void }> = ({ s, api, onClose }) => {
  const confirm = useConfirm();
  const set = (p: Partial<Supplement>) => api.patchSupplement(s.id, p);
  const [showAll, setShowAll] = useState(false);
  const shown = NUTRIENTS.filter((n) => showAll || (s.nutrients[n.key] ?? 0) > 0);
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[91] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div role="dialog" aria-label={`Suplemento ${s.name}`} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-[#14161b] p-5 ring-1 ring-white/10">
          <div className="flex items-center justify-between"><p className="font-semibold text-white">💊 Suplemento</p><button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X className="h-4 w-4" /></button></div>
          <input value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder="Nombre (ej. Vitamina D3 2000 UI)" className={field} />
          <div className="flex flex-wrap gap-2 text-xs text-zinc-300">
            <label className="flex flex-1 items-center gap-1.5">Dosis <input value={s.dose} onChange={(e) => set({ dose: e.target.value })} className={`${field} py-1`} /></label>
            <label className="flex items-center gap-1.5">Al día <input type="number" min={1} max={10} value={s.per_day} onChange={(e) => set({ per_day: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} className={`${field} w-14 py-1 text-center`} /></label>
            <label className="flex items-center gap-1.5">Hora <input type="time" value={s.time ?? ''} onChange={(e) => set({ time: e.target.value || null })} className={`${field} w-28 py-1`} /></label>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-zinc-300">Lo que aporta UNA dosis</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {shown.map((n) => (
                <label key={n.key} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <span className="min-w-0 flex-1 truncate">{n.label}</span>
                  <input type="number" min={0} step="any" value={s.nutrients[n.key] ?? ''} onChange={(e) => set({ nutrients: { ...s.nutrients, [n.key]: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) } })} className="w-16 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-right text-zinc-100 outline-none ring-1 ring-white/10" />
                  <span className="w-6">{n.unit}</span>
                </label>
              ))}
            </div>
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 text-[11px] font-semibold text-orange-300">{showAll ? 'Solo lo que aporta' : '＋ Agregar otro nutriente'}</button>
          </div>
          <input value={s.other} onChange={(e) => set({ other: e.target.value })} placeholder="Otros (creatina 5 g, colágeno…)" className={field} />
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300">
            <label className="flex items-center gap-1.5">Hasta <input type="date" value={s.until ?? ''} onChange={(e) => set({ until: e.target.value || null })} className={`${field} w-36 py-1`} /></label>
            <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={!!s.buy} onChange={(e) => set({ buy: e.target.checked })} className="accent-orange-500" /> 🛒 Para comprar</label>
          </div>
          {s.reason && <p className="text-[11px] text-zinc-400">💡 {s.reason}</p>}
          <div className="flex items-center gap-2">
            <label className="flex flex-1 cursor-pointer items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={!s.active} onChange={(e) => set({ active: !e.target.checked })} className="accent-orange-500" /> Ya no lo tomo (se oculta)</label>
            <button type="button" onClick={async () => { if (await confirm({ title: `¿Borrar «${s.name}»?`, message: 'Se borran también sus checks.', confirmLabel: 'Borrar', tone: 'danger' })) { await api.removeSupplement(s.id); onClose(); } }} className="text-xs text-zinc-500 hover:text-rose-300">Borrar</button>
          </div>
          <p className="text-[10px] text-zinc-500">No es indicación médica: sigue la dosis de la etiqueta o de tu médico.</p>
        </div>
      </div>
    </BodyPortal>
  );
};
