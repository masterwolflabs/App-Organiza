'use client';

import React, { useState } from 'react';
import { Copy, Plus, Target, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import { CoverPicker } from '@/components/organiza/CoverPicker';
import { ShoppingButton } from '@/components/organiza/Shopping';
import { coverCss, WEEK, weekdayOf } from '@/components/organiza/model';
import { MEAL_SLOTS, MUSCLES, sum, usePlan, useNutrition, WORKOUT_SLOTS, type Exercise, type Goals, type Meal, type PlanKind, type Workout } from '@/components/organiza/plan';
import { CookMode, RecipeGallery } from '@/components/organiza/Recipes';
import { CATEGORIES, categoryOfSlot, mealFromRecipe, useRecipes, type Recipe } from '@/components/organiza/recipeData';

/**
 * 🍳 Alimentación y 🏋️ Entrenamiento (Emanuel, 2026-11-03): la semana como un calendario
 * (lunes a domingo × desayuno, almuerzo… o sesión 1 y 2). Cada plato o sesión tiene su portada y su
 * ficha: cómo prepararlo, cuánto aporta, o qué ejercicios hacer. Una acción del Horario se conecta y
 * muestra lo de su día.
 */

const SHORT = WEEK.map((w) => w.slice(0, 3));
const field = 'w-full rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-sky-400/50';
const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v));
const weekStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekdayOf(d));
};

/* ── Tarjeta ─────────────────────────────────────────────────────────── */

const PlanCard: React.FC<{ title: string; cover: string | null; sub: string; onOpen: () => void; big?: boolean }> = ({ title, cover, sub, onOpen, big }) => (
  <button type="button" onClick={onOpen} className="block w-full overflow-hidden rounded-xl bg-[#17191f] text-left ring-1 ring-white/10 transition hover:ring-white/25">
    <div className={`${big ? 'h-24' : 'h-14'} bg-white/[0.04]`} style={coverCss(cover)} />
    <div className="px-2 py-1.5">
      <p className="truncate text-xs font-semibold text-white">{title || 'Sin nombre'}</p>
      {sub && <p className="truncate text-[11px] text-zinc-400">{sub}</p>}
    </div>
  </button>
);
const mealSub = (m: Meal) => (m.slot === 'ayuno' ? (m.fast_hours ? `${m.fast_hours} h de ayuno` : 'Ayuno') : [m.kcal ? `${m.kcal} kcal` : '', m.protein ? `${m.protein} g prot.` : ''].filter(Boolean).join(' · '));
const workoutSub = (w: Workout) => [w.muscles.join(', '), w.minutes ? `${w.minutes} min` : '', w.exercises.length ? `${w.exercises.length} ejercicios` : ''].filter(Boolean).join(' · ');

/* ── Grilla semanal ──────────────────────────────────────────────────── */

export const WeekPlanner: React.FC<{ kind: PlanKind; plan?: PlanApi }> = ({ kind, plan: shared }) => {
  const own = usePlan<Meal & Workout>(kind);
  const plan = shared ?? own;
  const nutrition = useNutrition();
  const [open, setOpen] = useState<string | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const slots = kind === 'meals' ? MEAL_SLOTS : WORKOUT_SLOTS;
  const start = weekStart();
  const today = weekdayOf(new Date());
  const row = plan.rows.find((r) => r.id === open) ?? null;

  const add = async (weekday: number, slot: string) => {
    const label = slots.find((s) => s.id === slot)?.label ?? '';
    const made = await plan.add(weekday, slot, kind === 'meals' ? ({ title: slot === 'ayuno' ? 'Ayuno' : '', ingredients: [], steps: '', notes: '' } as Partial<Meal & Workout>) : ({ title: label === 'Sesión 1' ? 'Entrenamiento' : 'Cardio', muscles: [], exercises: [], notes: '' } as Partial<Meal & Workout>));
    if (made) setOpen(made.id);
  };

  return (
    <div>
      {kind === 'meals' && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <button type="button" onClick={() => setGoalsOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1.5 font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/[0.09]"><Target className="h-3.5 w-3.5" /> Metas del día{nutrition.goals.kcal ? `: ${nutrition.goals.kcal} kcal` : ''}{nutrition.goals.protein ? ` · ${nutrition.goals.protein} g prot.` : ''}</button>
          <span>Master Planner no da pautas: tú decides qué comer, aquí lo organizas.</span>
        </div>
      )}
      {goalsOpen && <GoalsForm goals={nutrition.goals} onSave={(g) => { nutrition.save(g); setGoalsOpen(false); }} />}

      <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
        <div className="grid min-w-[980px] gap-2" style={{ gridTemplateColumns: `110px repeat(7, minmax(120px, 1fr))` }}>
          <span />
          {WEEK.map((w, d) => {
            const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
            return (
              <div key={w} className={`rounded-lg px-2 py-1.5 text-center text-sm font-semibold ${d === today ? 'bg-sky-500/20 text-sky-200' : 'bg-white/[0.04] text-zinc-300'}`}>
                {SHORT[d]} <span className="font-normal opacity-70">{date.getDate()}</span>
              </div>
            );
          })}
          {slots.map((s) => (
            <React.Fragment key={s.id}>
              <div className="flex items-start gap-1.5 pt-2 text-sm font-semibold text-zinc-300"><span>{s.emoji}</span>{s.label}</div>
              {WEEK.map((w, d) => {
                const here = plan.rows.filter((r) => r.weekday === d && r.slot === s.id);
                return (
                  <div key={w} className="space-y-1.5 rounded-xl bg-white/[0.02] p-1.5 ring-1 ring-white/5">
                    {here.map((r) => <PlanCard key={r.id} title={r.title} cover={r.cover_url} sub={kind === 'meals' ? mealSub(r) : workoutSub(r)} onOpen={() => setOpen(r.id)} />)}
                    <button type="button" onClick={() => add(d, s.id)} aria-label={`Agregar ${s.label} el ${w}`} className="flex w-full items-center justify-center rounded-lg py-1 text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
          {kind === 'meals' && (
            <>
              <div className="pt-1 text-xs font-semibold text-zinc-500">Total del día</div>
              {WEEK.map((w, d) => {
                const day = plan.rows.filter((r) => r.weekday === d) as Meal[];
                const kcal = sum(day, 'kcal');
                const prot = sum(day, 'protein');
                const g = nutrition.goals;
                const tone = (v: number, goal?: number) => (!goal ? 'text-zinc-300' : v > goal * 1.1 ? 'text-rose-300' : v >= goal * 0.9 ? 'text-emerald-300' : 'text-amber-300');
                return (
                  <div key={w} className="rounded-lg bg-white/[0.03] px-2 py-1.5 text-center text-[11px] tabular-nums">
                    <p className={tone(kcal, g.kcal)}>{kcal ? `${Math.round(kcal)} kcal` : '—'}</p>
                    <p className={tone(prot, g.protein)}>{prot ? `${Math.round(prot)} g prot.` : ''}</p>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {row && kind === 'meals' && <MealPanel meal={row} plan={plan} onClose={() => setOpen(null)} />}
      {row && kind === 'workouts' && <WorkoutPanel workout={row} plan={plan} onClose={() => setOpen(null)} />}
    </div>
  );
};

const GoalsForm: React.FC<{ goals: Goals; onSave: (g: Goals) => void }> = ({ goals, onSave }) => {
  const [g, setG] = useState<Goals>(goals);
  const input = (k: keyof Goals, label: string) => (
    <label className="text-xs text-zinc-400">{label}<input type="number" min={0} value={g[k] ?? ''} onChange={(e) => setG({ ...g, [k]: num(e.target.value) ?? undefined })} className={`${field} mt-1`} /></label>
  );
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:grid-cols-5">
      {input('kcal', 'Calorías (kcal)')}
      {input('protein', 'Proteínas (g)')}
      {input('carbs', 'Carbohidratos (g)')}
      {input('fat', 'Grasas (g)')}
      <button type="button" onClick={() => onSave(g)} className="self-end rounded-lg bg-sky-600 py-2 text-sm font-semibold text-[#fff] hover:bg-sky-500">Guardar metas</button>
    </div>
  );
};

/* ── Fichas ─────────────────────────────────────────────────────────── */

type PlanApi = ReturnType<typeof usePlan<Meal & Workout>>;

const Sheet: React.FC<{ title: string; cover: string | null; onCover: (c: string | null) => void; onClose: () => void; onDelete: () => void; onCopy: (days: number[]) => void; weekday: number; children: React.ReactNode }> = ({ title, cover, onCover, onClose, onDelete, onCopy, weekday, children }) => {
  const [picking, setPicking] = useState(false);
  const [copying, setCopying] = useState<number[] | null>(null);
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[85] bg-black/50" onClick={onClose}>
        <aside role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} className="absolute inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-[#14161b] ring-1 ring-white/10">
          <div className="relative h-40 bg-white/[0.04]" style={coverCss(cover)}>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute left-3 top-3 rounded-lg bg-black/45 p-1.5 text-[#fff] hover:bg-black/60"><X className="h-4 w-4" /></button>
            <button type="button" onClick={() => setPicking((v) => !v)} className="absolute right-3 top-3 rounded-lg bg-black/45 px-2.5 py-1.5 text-xs font-semibold text-[#fff] hover:bg-black/60">Portada</button>
          </div>
          <div className="space-y-4 p-5">
            {picking && <CoverPicker value={cover} rank={9} title={title} onPick={(c) => { onCover(c); setPicking(false); }} />}
            {children}
            <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-white"><Copy className="h-4 w-4" /> Copiar a otros días</p>
              <div className="flex flex-wrap gap-1.5">
                {SHORT.map((w, d) => {
                  const on = d === weekday || copying?.includes(d);
                  return <button key={w} type="button" disabled={d === weekday} onClick={() => setCopying((l) => (l?.includes(d) ? l.filter((x) => x !== d) : [...(l ?? []), d]))} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${on ? 'bg-sky-600 text-[#fff] ring-sky-500' : 'text-zinc-300 ring-white/15 hover:bg-white/[0.06]'} disabled:opacity-60`}>{w}</button>;
                })}
                <button type="button" onClick={() => setCopying([0, 1, 2, 3, 4, 5, 6])} className="rounded-full px-2.5 py-1 text-xs font-semibold text-sky-300 ring-1 ring-white/15">Todos</button>
              </div>
              {!!copying?.length && <button type="button" onClick={() => { onCopy(copying); setCopying(null); }} className="mt-2 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-[#fff] hover:bg-sky-500">Copiar</button>}
            </div>
            <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /> Borrar</button>
          </div>
        </aside>
      </div>
    </BodyPortal>
  );
};

const MealPanel: React.FC<{ meal: Meal; plan: PlanApi; onClose: () => void }> = ({ meal: m, plan, onClose }) => {
  const confirm = useConfirm();
  const set = (p: Partial<Meal>) => plan.patch(m.id, p as Partial<Meal & Workout>);
  const [ing, setIng] = useState({ name: '', qty: '' });
  const slot = MEAL_SLOTS.find((s) => s.id === m.slot);
  const recipes = useRecipes();
  const [cooking, setCooking] = useState(false);
  const linked = recipes.rows.find((r) => r.id === m.recipe_id) ?? null;
  const cat = categoryOfSlot(m.slot);
  const options = recipes.rows.filter((r) => !cat || r.category === cat);
  return (
    <>
    {cooking && linked && <CookMode r={linked} api={recipes} onClose={() => setCooking(false)} />}
    <Sheet title={m.title || 'Plato'} cover={m.cover_url} onCover={(c) => set({ cover_url: c })} onClose={onClose} weekday={m.weekday} onCopy={(d) => plan.copyTo(m.id, d)} onDelete={async () => { if (await confirm({ title: `¿Borrar «${m.title || 'este plato'}»?`, confirmLabel: 'Borrar', tone: 'danger' })) { await plan.remove(m.id); onClose(); } }}>
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{slot?.emoji} {slot?.label} · {WEEK[m.weekday]}</p>
      {m.slot !== 'ayuno' && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-orange-500/10 p-2.5 ring-1 ring-orange-400/25">
          <select value={m.recipe_id ?? ''} onChange={(e) => { const r = recipes.rows.find((x) => x.id === e.target.value); if (r) set(mealFromRecipe(r, m.weekday) as Partial<Meal>); else set({ recipe_id: null }); }} aria-label="Receta del recetario" className="min-w-0 flex-1 rounded-lg bg-white/[0.06] px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-white/10">
            <option value="">🥗 Elegir del recetario…</option>
            {options.map((r) => <option key={r.id} value={r.id}>{r.title || 'Sin nombre'}</option>)}
          </select>
          {linked && <button type="button" onClick={() => setCooking(true)} className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-bold text-[#fff] hover:bg-orange-400">🍳 Cocinar</button>}
        </div>
      )}
      <input key={`t${m.id}`} defaultValue={m.title} autoFocus={!m.title} placeholder="¿Qué vas a comer? Ej.: Huevos revueltos con café" onBlur={(e) => e.target.value !== m.title && set({ title: e.target.value })} className="w-full bg-transparent font-display text-2xl font-semibold text-white outline-none placeholder:text-zinc-600" />
      {m.slot === 'ayuno' ? (
        <label className="block text-xs text-zinc-400">Horas de ayuno<input type="number" min={0} step={0.5} defaultValue={m.fast_hours ?? ''} onBlur={(e) => set({ fast_hours: num(e.target.value) })} className={`${field} mt-1`} /></label>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {([['kcal', 'kcal'], ['protein', 'Prot. g'], ['carbs', 'Carb. g'], ['fat', 'Grasa g']] as const).map(([k, label]) => (
            <label key={k} className="text-[11px] text-zinc-400">{label}<input type="number" min={0} defaultValue={m[k] ?? ''} key={`${k}${m.id}`} onBlur={(e) => set({ [k]: num(e.target.value) } as Partial<Meal>)} className={`${field} mt-1 text-center`} /></label>
          ))}
        </div>
      )}
      <div>
        <p className="mb-1.5 text-sm font-semibold text-white">🧺 Ingredientes</p>
        <ul className="space-y-1">
          {m.ingredients.map((x, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-zinc-200">
              <span className="w-20 shrink-0 truncate text-xs text-zinc-400">{x.qty}</span>
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              <button type="button" aria-label={`Quitar ${x.name}`} onClick={() => set({ ingredients: m.ingredients.filter((_, j) => j !== i) })} className="p-1 text-zinc-600 hover:text-rose-300"><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
        <form className="mt-1.5 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (!ing.name.trim()) return; set({ ingredients: [...m.ingredients, { name: ing.name.trim(), qty: ing.qty.trim() }] }); setIng({ name: '', qty: '' }); }}>
          <input value={ing.qty} onChange={(e) => setIng({ ...ing, qty: e.target.value })} placeholder="2 u." className={`${field} w-20`} />
          <input value={ing.name} onChange={(e) => setIng({ ...ing, name: e.target.value })} placeholder="Agregar ingrediente" className={field} />
          <button type="submit" className="rounded-lg px-2 text-sky-300 hover:bg-white/[0.06]"><Plus className="h-4 w-4" /></button>
        </form>
      </div>
      <label className="block text-sm font-semibold text-white">👩‍🍳 Preparación<textarea key={`s${m.id}`} defaultValue={m.steps} rows={5} placeholder="Paso a paso para prepararlo…" onBlur={(e) => e.target.value !== m.steps && set({ steps: e.target.value })} className={`${field} mt-1.5 font-normal`} /></label>
      <label className="block text-sm font-semibold text-white">📝 A tener en cuenta<textarea key={`n${m.id}`} defaultValue={m.notes} rows={2} onBlur={(e) => e.target.value !== m.notes && set({ notes: e.target.value })} className={`${field} mt-1.5 font-normal`} /></label>
    </Sheet>
    </>
  );
};

const WorkoutPanel: React.FC<{ workout: Workout; plan: PlanApi; onClose: () => void }> = ({ workout: w, plan, onClose }) => {
  const confirm = useConfirm();
  const set = (p: Partial<Workout>) => plan.patch(w.id, p as Partial<Meal & Workout>);
  const setEx = (i: number, p: Partial<Exercise>) => set({ exercises: w.exercises.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const slot = WORKOUT_SLOTS.find((s) => s.id === w.slot);
  return (
    <Sheet title={w.title || 'Entrenamiento'} cover={w.cover_url} onCover={(c) => set({ cover_url: c })} onClose={onClose} weekday={w.weekday} onCopy={(d) => plan.copyTo(w.id, d)} onDelete={async () => { if (await confirm({ title: `¿Borrar «${w.title || 'esta sesión'}»?`, confirmLabel: 'Borrar', tone: 'danger' })) { await plan.remove(w.id); onClose(); } }}>
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{slot?.emoji} {slot?.label} · {WEEK[w.weekday]}</p>
      <input key={`t${w.id}`} defaultValue={w.title} placeholder="Ej.: Brazos y hombros" onBlur={(e) => e.target.value !== w.title && set({ title: e.target.value })} className="w-full bg-transparent font-display text-2xl font-semibold text-white outline-none placeholder:text-zinc-600" />
      <div className="flex flex-wrap gap-1.5">
        {MUSCLES.map((x) => {
          const on = w.muscles.includes(x);
          return <button key={x} type="button" onClick={() => set({ muscles: on ? w.muscles.filter((y) => y !== x) : [...w.muscles, x] })} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${on ? 'bg-violet-600/30 text-violet-100 ring-violet-400/50' : 'text-zinc-400 ring-white/15 hover:bg-white/[0.06]'}`}>{x}</button>;
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-zinc-400">Duración (min)<input type="number" min={0} key={`m${w.id}`} defaultValue={w.minutes ?? ''} onBlur={(e) => set({ minutes: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-zinc-400">Calorías quemadas<input type="number" min={0} key={`k${w.id}`} defaultValue={w.kcal ?? ''} onBlur={(e) => set({ kcal: num(e.target.value) })} className={`${field} mt-1`} /></label>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-semibold text-white">💪 Ejercicios</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] text-zinc-500"><th className="pb-1 font-medium">Ejercicio</th><th className="w-14 pb-1 font-medium">Series</th><th className="w-14 pb-1 font-medium">Reps</th><th className="w-16 pb-1 font-medium">Peso</th><th className="w-16 pb-1 font-medium">Descanso</th><th className="w-6" /></tr></thead>
            <tbody>
              {w.exercises.map((x, i) => (
                <tr key={i}>
                  {(['name', 'sets', 'reps', 'weight', 'rest'] as const).map((k) => (
                    <td key={k} className="pr-1 pb-1"><input defaultValue={x[k]} key={`${k}${i}${w.id}`} onBlur={(e) => e.target.value !== x[k] && setEx(i, { [k]: e.target.value })} className="w-full rounded-md bg-white/[0.05] px-1.5 py-1 text-white outline-none ring-1 ring-white/10" /></td>
                  ))}
                  <td><button type="button" aria-label="Quitar ejercicio" onClick={() => set({ exercises: w.exercises.filter((_, j) => j !== i) })} className="p-1 text-zinc-600 hover:text-rose-300"><X className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => set({ exercises: [...w.exercises, { name: '', sets: '3', reps: '12', weight: '', rest: '60 s' }] })} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-sky-300 hover:text-sky-200"><Plus className="h-3.5 w-3.5" /> Agregar ejercicio</button>
      </div>
      <label className="block text-sm font-semibold text-white">📝 Cómo hacerlo<textarea key={`n${w.id}`} defaultValue={w.notes} rows={3} placeholder="Calentamiento, técnica, qué cuidar…" onBlur={(e) => e.target.value !== w.notes && set({ notes: e.target.value })} className={`${field} mt-1.5 font-normal`} /></label>
    </Sheet>
  );
};

/* ── Conectado a una acción del Horario ──────────────────────────────── */

/**
 * La comida de una acción (Desayunar, Almorzar…) se conecta con la receta de ESE día (Emanuel, 2026-11-16):
 * elegirla, repetirla en otros días de la acción y abrir el modo cocina. En vez de focus, la receta.
 */
const RecipeOfDay: React.FC<{ plan: PlanApi; day: number; slot: string | null; weekdays: number[] }> = ({ plan, day, slot, weekdays }) => {
  const recipes = useRecipes();
  const [cooking, setCooking] = useState(false);
  const s = slot ?? 'desayuno';
  const meal = plan.rows.find((r) => r.weekday === day && r.slot === s) as Meal | undefined;
  const linked = recipes.rows.find((r) => r.id === meal?.recipe_id) ?? null;
  const cat = categoryOfSlot(s);
  const options = recipes.rows.filter((r) => !cat || r.category === cat);
  const pick = async (id: string, days: number[]) => {
    const r = recipes.rows.find((x) => x.id === id);
    if (!r) return;
    for (const d of days) {
      const there = plan.rows.find((x) => x.weekday === d && x.slot === s);
      if (there) await plan.patch(there.id, mealFromRecipe(r, d) as Partial<Meal & Workout>);
      else await plan.add(d, s, { ...mealFromRecipe(r, d), steps: '', notes: '', fast_hours: null } as Partial<Meal & Workout>);
    }
  };
  const others = weekdays.filter((d) => d !== day);
  return (
    <div className="space-y-2 rounded-xl bg-orange-500/10 p-2.5 ring-1 ring-orange-400/25">
      <div className="flex flex-wrap items-center gap-2">
        <select value={linked?.id ?? ''} onChange={(e) => e.target.value && pick(e.target.value, [day])} aria-label="Receta de este día" className="min-w-0 flex-1 rounded-lg bg-white/[0.06] px-2 py-1.5 text-sm text-zinc-100 outline-none ring-1 ring-white/10">
          <option value="">🥗 Receta del {WEEK[day].toLowerCase()}…</option>
          {options.map((r) => <option key={r.id} value={r.id}>{r.title || 'Sin nombre'}</option>)}
        </select>
        {linked && <button type="button" onClick={() => setCooking(true)} className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-bold text-[#fff] hover:bg-orange-400">🍳 Cocinar</button>}
      </div>
      {linked && others.length > 0 && (
        <button type="button" onClick={() => pick(linked.id, others)} className="text-xs font-semibold text-orange-200 hover:text-orange-100">🔁 Repetir «{linked.title}» los otros días ({others.map((d) => SHORT[d]).join(', ')})</button>
      )}
      {cooking && linked && <CookMode r={linked} api={recipes} onClose={() => setCooking(false)} />}
    </div>
  );
};

/** Lo de Alimentación o Entrenamiento para el día de la acción (o los de hoy si la acción cae hoy). */
export const PlanLink: React.FC<{ kind: PlanKind; weekdays: number[]; slot?: string | null }> = ({ kind, weekdays, slot }) => {
  const plan = usePlan<Meal & Workout>(kind);
  const [open, setOpen] = useState<string | null>(null);
  const today = weekdayOf(new Date());
  const [day, setDay] = useState(weekdays.includes(today) ? today : weekdays[0] ?? today);
  const rows = plan.rows.filter((r) => r.weekday === day && (!slot || r.slot === slot));
  const row = plan.rows.find((r) => r.id === open) ?? null;
  const section = kind === 'meals' ? 'alimentacion' : 'entrenamiento';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {weekdays.sort((a, b) => a - b).map((d) => (
          <button key={d} type="button" onClick={() => setDay(d)} className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${d === day ? 'bg-sky-600 text-[#fff] ring-sky-500' : 'text-zinc-400 ring-white/15'}`}>{SHORT[d]}</button>
        ))}
      </div>
      {kind === 'meals' && <RecipeOfDay plan={plan} day={day} slot={slot ?? null} weekdays={weekdays} />}
      {rows.length ? (
        <div className="grid grid-cols-2 gap-2">{rows.map((r) => <PlanCard key={r.id} big title={r.title} cover={r.cover_url} sub={kind === 'meals' ? mealSub(r) : workoutSub(r)} onOpen={() => setOpen(r.id)} />)}</div>
      ) : (
        <p className="text-sm text-zinc-500">Nada planificado para el {WEEK[day].toLowerCase()}.</p>
      )}
      <div className="flex gap-3">
        {!rows.length && <button type="button" onClick={async () => { const made = await plan.add(day, slot ?? (kind === 'meals' ? 'desayuno' : 'sesion-1'), kind === 'meals' ? ({ title: '', ingredients: [], steps: '', notes: '' } as Partial<Meal & Workout>) : ({ title: 'Entrenamiento', muscles: [], exercises: [], notes: '' } as Partial<Meal & Workout>)); if (made) setOpen(made.id); }} className="inline-flex items-center gap-1 text-xs font-semibold text-sky-300 hover:text-sky-200"><Plus className="h-3.5 w-3.5" /> Planificar este día</button>}
        <a href={`#${section}`} className="text-xs font-semibold text-zinc-400 hover:text-white">Ver toda la semana →</a>
      </div>
      {row && kind === 'meals' && <MealPanel meal={row} plan={plan} onClose={() => setOpen(null)} />}
      {row && kind === 'workouts' && <WorkoutPanel workout={row} plan={plan} onClose={() => setOpen(null)} />}
    </div>
  );
};

/** 🗓️ Poner una receta en la semana: qué días y en qué momento (desayuno, almuerzo…). */
const UseInWeek: React.FC<{ r: Recipe; plan: PlanApi; onClose: () => void }> = ({ r, plan, onClose }) => {
  const cat = CATEGORIES.find((c) => c.id === r.category);
  const slots = MEAL_SLOTS.filter((s) => s.id !== 'ayuno');
  const [slot, setSlot] = useState(cat?.slots[0] ?? 'desayuno');
  const [days, setDays] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    for (const d of days) {
      const there = plan.rows.find((x) => x.weekday === d && x.slot === slot);
      // Ese momento ya tenía un plato: lo cambia por la receta (uno por momento y día).
      if (there) await plan.patch(there.id, mealFromRecipe(r, d) as Partial<Meal & Workout>);
      else await plan.add(d, slot, { ...mealFromRecipe(r, d), steps: '', notes: '', fast_hours: null } as Partial<Meal & Workout>);
    }
    setBusy(false);
    onClose();
  };
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div role="dialog" aria-label="Poner en mi semana" onClick={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-3 rounded-2xl bg-[#14161b] p-5 ring-1 ring-white/10">
          <p className="font-semibold text-white">🗓️ «{r.title}» en mi semana</p>
          <select value={slot} onChange={(e) => setSlot(e.target.value)} className={field}>
            {slots.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>)}
          </select>
          <div className="flex flex-wrap gap-1.5">
            {SHORT.map((w, d) => <button key={w} type="button" onClick={() => setDays((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d]))} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${days.includes(d) ? 'bg-orange-500 text-[#fff] ring-orange-400' : 'text-zinc-300 ring-white/15'}`}>{w}</button>)}
            <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])} className="rounded-full px-2.5 py-1 text-xs font-semibold text-orange-300 ring-1 ring-white/15">Todos</button>
          </div>
          <p className="text-[11px] text-zinc-500">Si ese día ya tenía algo en ese momento, se cambia por esta receta.</p>
          <button type="button" disabled={!days.length || busy} onClick={save} className="w-full rounded-xl bg-orange-500 px-3 py-2 text-sm font-bold text-[#fff] hover:bg-orange-400 disabled:opacity-50">{busy ? 'Guardando…' : `Poner en ${days.length || 0} ${days.length === 1 ? 'día' : 'días'}`}</button>
        </div>
      </div>
    </BodyPortal>
  );
};

/** 🥗 Nutrition Pro (Emanuel, 2026-11-16): el recetario en galería y, abajo, la semana. */
export const AlimentacionView: React.FC = () => {
  const recipes = useRecipes();
  const plan = usePlan<Meal & Workout>('meals');
  const [using, setUsing] = useState<Recipe | null>(null);
  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 font-display text-3xl font-semibold text-white">🥗 Nutrition Pro</h1>
        <ShoppingButton />
      </div>
      <p className="mb-5 mt-1 text-sm text-zinc-400">Tu recetario: elige, cocina sin pensar y perfecciona. La 1ª te arriesgas, la 2ª te certificas, la 3ª te beneficias.</p>
      <RecipeGallery api={recipes} onUse={setUsing} />
      <h2 className="mb-3 mt-10 font-display text-2xl font-semibold text-white">🗓️ Tu semana</h2>
      <WeekPlanner kind="meals" plan={plan} />
      {using && <UseInWeek r={using} plan={plan} onClose={() => setUsing(null)} />}
    </div>
  );
};

export const EntrenamientoView: React.FC = () => (
  <div className="mx-auto max-w-7xl">
    <h1 className="font-display text-3xl font-semibold text-white">🏋️ Entrenamiento</h1>
    <p className="mb-5 mt-1 text-sm text-zinc-400">Tu semana de entrenamiento: qué trabajas cada día y cómo.</p>
    <WeekPlanner kind="workouts" />
  </div>
);
