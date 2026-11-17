'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChefHat, ChevronDown, Eye, EyeOff, Minus, Pause, Play, Plus, SkipBack, SkipForward, Trash2, Volume2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import { CoverPicker } from '@/components/organiza/CoverPicker';
import { coverCss } from '@/components/organiza/model';
import { parseYouTube } from '@/components/organiza/YouTubeList';
import { playOnce } from '@/components/organiza/sounds';
import { notify } from '@/components/organiza/notify';
import {
  CATEGORIES, NEEDS, UNIT_MODES, needOf, showQty, totalMinutes,
  type Recipe, type RecipeCategory, type RecipeIngredient, type RecipeStep, type RecipesApi, type UnitMode,
} from '@/components/organiza/recipeData';
import { SPOTIFY_ID, spotifyConnect, spotifyConnected, spotifyDisconnect, spotifyNext, spotifyNow, spotifyPause, spotifyPlay, spotifyPrev, spotifyVolume, type NowPlaying } from '@/lib/spotify';

/**
 * 🥗 Nutrition Pro (Emanuel, 2026-11-16): galería de recetas por categoría (como la galería de acciones),
 * la página de cada receta y el MODO COCINA: receta a la derecha, video de YouTube y Spotify a la izquierda,
 * pasos en paralelo con timers y, al terminar, «¿los tiempos estuvieron bien?» para afinarla.
 */

const field = 'w-full rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-sky-400/50';
const TRACKS = ['A', 'B', 'C'];
const TRACK_CLS = ['bg-orange-500/80', 'bg-emerald-500/80', 'bg-violet-500/80'];
const mmss = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(Math.round(s)) % 60).padStart(2, '0')}`;
const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
const newStepId = () => Math.random().toString(36).slice(2, 9);

/* ── Galería ─────────────────────────────────────────────────────────────────────── */

export const RecipeCard: React.FC<{ r: Recipe; showIngredients: boolean; onOpen: () => void }> = ({ r, showIngredients, onOpen }) => (
  <button type="button" onClick={onOpen} className="block w-full overflow-hidden rounded-2xl bg-[#17191f] text-left ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:ring-white/25">
    <div className="relative h-32 bg-gradient-to-br from-orange-500/30 to-amber-400/10" style={coverCss(r.cover_url)}>
      {!r.cover_url && <span className="absolute inset-0 flex items-center justify-center text-4xl">{CATEGORIES.find((c) => c.id === r.category)?.emoji}</span>}
      {r.needs.length > 0 && (
        <span className="absolute bottom-2 left-2 flex gap-1">
          {r.needs.slice(0, 4).map((n) => (
            <span key={n} data-help={needOf(n).label} className="rounded-full bg-black/55 px-1.5 py-0.5 text-xs backdrop-blur">{needOf(n).emoji}</span>
          ))}
        </span>
      )}
    </div>
    <div className="space-y-1 px-3 py-2.5">
      <p className="line-clamp-2 text-sm font-semibold text-white">{r.title || 'Receta sin nombre'}</p>
      <p className="text-[11px] text-zinc-400">⏱️ {totalMinutes(r)} min{r.kcal ? ` · ${r.kcal} kcal` : ''}{r.made ? ` · hecha ${r.made} ${r.made === 1 ? 'vez' : 'veces'}` : ''}</p>
      {showIngredients && r.ingredients.length > 0 && <p className="line-clamp-3 text-[11px] text-zinc-500">{r.ingredients.map((i) => i.name).join(' · ')}</p>}
    </div>
  </button>
);

export const RecipeGallery: React.FC<{ api: RecipesApi; onUse?: (r: Recipe) => void }> = ({ api, onUse }) => {
  const [open, setOpen] = useState<string | null>(null);
  const [cooking, setCooking] = useState<string | null>(null);
  const [showIng, setShowIng] = useState(() => lsGet('mp-recetas-ingredientes') !== '0');
  const [folded, setFolded] = useState<string[]>(() => {
    try {
      return JSON.parse(lsGet('mp-recetas-plegadas') ?? '[]');
    } catch {
      return [];
    }
  });
  const fold = (id: string) => {
    const next = folded.includes(id) ? folded.filter((x) => x !== id) : [...folded, id];
    setFolded(next);
    lsSet('mp-recetas-plegadas', JSON.stringify(next));
  };
  const add = async (c: RecipeCategory) => {
    const made = await api.add(c);
    if (made) setOpen(made.id);
  };
  const recipe = api.rows.find((r) => r.id === open) ?? null;
  const cook = api.rows.find((r) => r.id === cooking) ?? null;
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => { setShowIng((v) => !v); lsSet('mp-recetas-ingredientes', showIng ? '0' : '1'); }} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-zinc-300 ring-1 ring-white/10 hover:bg-white/[0.09]">
          {showIng ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {showIng ? 'Ocultar ingredientes' : 'Mostrar ingredientes'}
        </button>
      </div>
      <div className="space-y-5">
        {CATEGORIES.map((c) => {
          const list = api.rows.filter((r) => r.category === c.id);
          const closed = folded.includes(c.id);
          return (
            <section key={c.id}>
              <button type="button" onClick={() => fold(c.id)} className="mb-2.5 flex w-full items-center gap-2 text-left">
                <ChevronDown className={`h-4 w-4 text-zinc-500 transition ${closed ? '-rotate-90' : ''}`} />
                <span className="text-lg font-semibold text-white">{c.emoji} {c.label}</span>
                <span className="text-sm text-zinc-500">{list.length}</span>
              </button>
              {!closed && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {list.map((r) => <RecipeCard key={r.id} r={r} showIngredients={showIng} onOpen={() => setOpen(r.id)} />)}
                  <button type="button" onClick={() => add(c.id)} className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-white/15 text-sm font-semibold text-zinc-400 hover:border-orange-400/50 hover:bg-orange-500/5 hover:text-orange-200">
                    <Plus className="h-5 w-5" /> Nueva receta
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {recipe && <RecipeSheet r={recipe} api={api} onClose={() => setOpen(null)} onCook={() => { setCooking(recipe.id); setOpen(null); }} onUse={onUse} />}
      {cook && <CookMode r={cook} api={api} onClose={() => setCooking(null)} />}
    </div>
  );
};

/* ── Línea de tiempo: lo que va en paralelo, graficado ───────────────────────────── */

export const Timeline: React.FC<{ steps: RecipeStep[]; now?: number | null; done?: string[] }> = ({ steps, now, done = [] }) => {
  const total = Math.max(1, totalMinutes({ steps }));
  const tracks = [...new Set(steps.map((s) => s.track))].sort();
  if (!steps.length) return null;
  return (
    <div className="space-y-1.5 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
      <div className="relative">
        {tracks.map((t) => (
          <div key={t} className="relative mb-1 h-7 rounded-md bg-white/[0.03]">
            {steps.filter((s) => s.track === t).map((s) => (
              <div
                key={s.id}
                data-help={`${s.text} · min ${s.at}${s.minutes ? `–${s.at + s.minutes}` : ''}`}
                className={`absolute inset-y-0.5 flex items-center overflow-hidden rounded px-1.5 text-[10px] font-semibold text-[#fff] ${TRACK_CLS[t % 3]} ${done.includes(s.id) ? 'opacity-35' : ''}`}
                style={{ left: `${(s.at / total) * 100}%`, width: `${Math.max(2, ((s.minutes ?? 1) / total) * 100)}%` }}
              >
                <span className="truncate">{s.minutes ? `⏱ ${s.text}` : s.text}</span>
              </div>
            ))}
          </div>
        ))}
        {now !== null && now !== undefined && <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-[#fff] shadow-[0_0_6px_#fff]" style={{ left: `${Math.min(100, (now / total) * 100)}%` }} />}
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-zinc-500">
        <span>0 min</span>
        <span>{tracks.length > 1 ? `${tracks.length} cosas a la vez` : 'Una cosa a la vez'}</span>
        <span>{total} min</span>
      </div>
    </div>
  );
};

/* ── La página de una receta (editar) ─────────────────────────────────────────────── */

const RecipeSheet: React.FC<{ r: Recipe; api: RecipesApi; onClose: () => void; onCook: () => void; onUse?: (r: Recipe) => void }> = ({ r, api, onClose, onCook, onUse }) => {
  const confirm = useConfirm();
  const set = (p: Partial<Recipe>) => api.patch(r.id, p);
  const [picking, setPicking] = useState(false);
  const [mode, setMode] = useState<UnitMode>('original');
  const [ing, setIng] = useState({ qty: '', unit: '', name: '' });
  const setIngredient = (i: number, p: Partial<RecipeIngredient>) => set({ ingredients: r.ingredients.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const setStep = (id: string, p: Partial<RecipeStep>) => set({ steps: r.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  const steps = [...r.steps].sort((a, b) => a.at - b.at || a.track - b.track);
  const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v.replace(',', '.'))) ? null : Number(v.replace(',', '.')));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[85] bg-black/50" onClick={onClose}>
        <aside role="dialog" aria-label={r.title || 'Receta'} onClick={(e) => e.stopPropagation()} className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto bg-[#14161b] ring-1 ring-white/10">
          <div className="relative h-44 bg-gradient-to-br from-orange-500/30 to-amber-400/10" style={coverCss(r.cover_url)}>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute left-3 top-3 rounded-lg bg-black/45 p-1.5 text-[#fff] hover:bg-black/60"><X className="h-4 w-4" /></button>
            <button type="button" onClick={() => setPicking((v) => !v)} className="absolute right-3 top-3 rounded-lg bg-black/45 px-2.5 py-1.5 text-xs font-semibold text-[#fff] hover:bg-black/60">Portada</button>
            <button type="button" onClick={onCook} disabled={!r.steps.length} className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-3.5 py-2 text-sm font-bold text-[#fff] shadow-lg hover:bg-orange-400 disabled:opacity-50"><ChefHat className="h-4 w-4" /> Cocinar</button>
          </div>
          <div className="space-y-5 p-5">
            {picking && <CoverPicker value={r.cover_url} rank={9} title={r.title} onPick={(c) => { set({ cover_url: c }); setPicking(false); }} />}
            <div className="space-y-2">
              <select value={r.category} onChange={(e) => set({ category: e.target.value as RecipeCategory })} className="rounded-lg bg-white/[0.05] px-2 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-300 outline-none ring-1 ring-white/10">
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
              </select>
              <input key={`t${r.id}`} defaultValue={r.title} autoFocus={!r.title} placeholder="Nombre de la receta. Ej.: Huevos duros con café" onBlur={(e) => e.target.value !== r.title && set({ title: e.target.value })} className="w-full bg-transparent font-display text-2xl font-semibold text-white outline-none placeholder:text-zinc-600" />
              <div className="flex flex-wrap gap-1.5">
                {NEEDS.map((n) => {
                  const on = r.needs.includes(n.id);
                  return <button key={n.id} type="button" onClick={() => set({ needs: on ? r.needs.filter((x) => x !== n.id) : [...r.needs, n.id] })} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${on ? 'bg-orange-500/20 text-orange-100 ring-orange-400/50' : 'text-zinc-500 ring-white/10 hover:text-zinc-300'}`}>{n.emoji} {n.label}</button>;
                })}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([['servings', 'Porciones'], ['kcal', 'kcal'], ['protein', 'Proteína g']] as const).map(([k, l]) => (
                  <label key={k} className="text-[11px] text-zinc-400">{l}<input key={`${k}${r.id}`} type="number" min={0} defaultValue={r[k] ?? ''} onBlur={(e) => set({ [k]: num(e.target.value) } as Partial<Recipe>)} className={`${field} mt-1 text-center`} /></label>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">🧺 Ingredientes</p>
                <select value={mode} onChange={(e) => setMode(e.target.value as UnitMode)} aria-label="Ver medidas en" className="rounded-lg bg-white/[0.05] px-2 py-1 text-xs text-zinc-200 outline-none ring-1 ring-white/10">
                  {UNIT_MODES.map((u) => <option key={u.id} value={u.id}>Medidas: {u.label}</option>)}
                </select>
              </div>
              <ul className="space-y-1">
                {r.ingredients.map((x, i) => (
                  <li key={`${r.id}-${i}-${x.name}`} className="flex items-center gap-1.5 text-sm">
                    {mode === 'original' ? (
                      <>
                        <input defaultValue={x.qty ?? ''} placeholder="—" aria-label="Cantidad" onBlur={(e) => setIngredient(i, { qty: num(e.target.value) })} className="w-12 rounded-md bg-white/[0.04] px-1.5 py-1 text-center text-xs text-zinc-200 outline-none" />
                        <input defaultValue={x.unit} placeholder="unidad" aria-label="Unidad" onBlur={(e) => setIngredient(i, { unit: e.target.value.trim() })} className="w-20 rounded-md bg-white/[0.04] px-1.5 py-1 text-xs text-zinc-300 outline-none" />
                      </>
                    ) : (
                      <span className="w-32 shrink-0 text-xs font-semibold text-orange-200">{showQty(x, mode)}</span>
                    )}
                    <input defaultValue={x.name} aria-label="Ingrediente" onBlur={(e) => e.target.value.trim() && setIngredient(i, { name: e.target.value.trim() })} className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-zinc-100 outline-none focus:bg-white/[0.05]" />
                    <button type="button" aria-label={`Quitar ${x.name}`} onClick={() => set({ ingredients: r.ingredients.filter((_, j) => j !== i) })} className="p-1 text-zinc-600 hover:text-rose-300"><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
              <form className="mt-1.5 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (!ing.name.trim()) return; set({ ingredients: [...r.ingredients, { name: ing.name.trim(), qty: num(ing.qty), unit: ing.unit.trim() }] }); setIng({ qty: '', unit: '', name: '' }); }}>
                <input value={ing.qty} onChange={(e) => setIng({ ...ing, qty: e.target.value })} placeholder="2" className={`${field} w-14 text-center`} />
                <input value={ing.unit} onChange={(e) => setIng({ ...ing, unit: e.target.value })} placeholder="tazas" className={`${field} w-20`} />
                <input value={ing.name} onChange={(e) => setIng({ ...ing, name: e.target.value })} placeholder="Agregar ingrediente" className={field} />
                <button type="submit" className="rounded-lg px-2 text-orange-300 hover:bg-white/[0.06]"><Plus className="h-4 w-4" /></button>
              </form>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-white">👩‍🍳 Paso a paso <span className="font-normal text-zinc-500">· en paralelo</span></p>
              <p className="mb-2 text-[11px] text-zinc-500">Cada paso parte en un minuto y puede tener timer. Los que van en otro carril (A, B, C) se hacen al mismo tiempo: «mientras se cuece el arroz, pica la cebolla».</p>
              <Timeline steps={r.steps} />
              <ul className="mt-2 space-y-1.5">
                {steps.map((s) => (
                  <li key={s.id} className="rounded-xl bg-white/[0.03] p-2 ring-1 ring-white/10">
                    <input defaultValue={s.text} aria-label="Paso" onBlur={(e) => e.target.value.trim() && e.target.value !== s.text && setStep(s.id, { text: e.target.value.trim() })} className="w-full bg-transparent px-1 text-sm text-zinc-100 outline-none" />
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                      <label className="flex items-center gap-1">Parte en el min <input key={`a${s.id}${s.at}`} type="number" min={0} defaultValue={s.at} onBlur={(e) => setStep(s.id, { at: Math.max(0, num(e.target.value) ?? 0) })} className="w-12 rounded bg-white/[0.06] px-1 text-center text-zinc-100 outline-none" /></label>
                      <label className="flex items-center gap-1">⏱ Timer <input key={`m${s.id}${s.minutes}`} type="number" min={0} defaultValue={s.minutes ?? ''} placeholder="no" onBlur={(e) => setStep(s.id, { minutes: num(e.target.value) || null })} className="w-12 rounded bg-white/[0.06] px-1 text-center text-zinc-100 outline-none" /> min</label>
                      <span className="flex items-center gap-0.5">Carril {TRACKS.map((t, k) => <button key={t} type="button" onClick={() => setStep(s.id, { track: k })} className={`h-5 w-5 rounded text-[10px] font-bold ${s.track === k ? `${TRACK_CLS[k]} text-[#fff]` : 'bg-white/[0.06] text-zinc-400'}`}>{t}</button>)}</span>
                      <button type="button" aria-label="Quitar paso" onClick={() => set({ steps: r.steps.filter((x) => x.id !== s.id) })} className="ml-auto p-0.5 text-zinc-600 hover:text-rose-300"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => set({ steps: [...r.steps, { id: newStepId(), text: 'Nuevo paso', at: totalMinutes(r), minutes: null, track: 0 }] })} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-orange-300 hover:text-orange-200"><Plus className="h-3.5 w-3.5" /> Agregar paso</button>
            </div>

            <label className="block text-sm font-semibold text-white">📝 Tu cosecha (aliños, especias, trucos)<textarea key={`n${r.id}`} defaultValue={r.notes} rows={3} onBlur={(e) => e.target.value !== r.notes && set({ notes: e.target.value })} className={`${field} mt-1.5 font-normal`} /></label>

            <div className="flex flex-wrap gap-2">
              {onUse && <button type="button" onClick={() => onUse(r)} className="rounded-xl bg-white/[0.06] px-3 py-2 text-sm font-semibold text-zinc-100 ring-1 ring-white/10 hover:bg-white/[0.1]">🗓️ Ponerla en mi semana</button>}
              <button type="button" onClick={async () => { if (await confirm({ title: `¿Borrar «${r.title || 'esta receta'}»?`, message: 'Los días de tu semana que la usan quedan con su nombre, pero sin la receta.', confirmLabel: 'Borrar', tone: 'danger' })) { await api.remove(r.id); onClose(); } }} className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /> Borrar receta</button>
            </div>
          </div>
        </aside>
      </div>
    </BodyPortal>
  );
};

/* ── Spotify (control de lo que ya suena) ─────────────────────────────────────────── */

const SpotifyPanel: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState<NowPlaying>(null);
  const [vol, setVol] = useState<number | null>(null);
  useEffect(() => setConnected(spotifyConnected()), []);
  useEffect(() => {
    if (!connected) return;
    let alive = true;
    const pull = () => spotifyNow().then((n) => { if (!alive) return; setNow(n); if (n?.volume !== null && n?.volume !== undefined) setVol((v) => v ?? n.volume); }).catch(() => {});
    pull();
    const t = setInterval(pull, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [connected]);
  const after = (p: Promise<unknown>) => p.then(() => setTimeout(() => spotifyNow().then(setNow), 500));
  const btn = 'rounded-full p-2 text-zinc-100 hover:bg-white/10';
  return (
    <div className="rounded-2xl bg-[#121417] p-3 ring-1 ring-white/10">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-[#1ed760]">● Spotify</span>
        {connected && now?.device && <span className="truncate text-[11px] text-zinc-500">en {now.device}</span>}
        <a href="spotify:" className="ml-auto rounded-lg bg-white/[0.06] px-2 py-1 text-xs font-semibold text-zinc-200 hover:bg-white/[0.12]" data-help="Abre la app de Spotify para elegir qué escuchar">Abrir Spotify ↗</a>
      </div>
      {connected ? (
        now ? (
          <div className="mt-2.5 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {now.art ? <img src={now.art} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <span className="h-12 w-12 rounded-lg bg-white/[0.06]" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{now.title || '—'}</p>
              <p className="truncate text-xs text-zinc-400">{now.artist}</p>
            </div>
            <button type="button" aria-label="Anterior" onClick={() => after(spotifyPrev())} className={btn}><SkipBack className="h-4 w-4" /></button>
            <button type="button" aria-label={now.playing ? 'Pausar' : 'Reproducir'} onClick={() => after(now.playing ? spotifyPause() : spotifyPlay())} className="rounded-full bg-[#fff] p-2.5 text-[#09090b] hover:scale-105">{now.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
            <button type="button" aria-label="Siguiente" onClick={() => after(spotifyNext())} className={btn}><SkipForward className="h-4 w-4" /></button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-zinc-400">No hay nada sonando. Abre Spotify, pon algo y aquí aparece para controlarlo.</p>
        )
      ) : SPOTIFY_ID ? (
        <button type="button" onClick={() => spotifyConnect()} className="mt-2.5 w-full rounded-xl bg-[#1ed760] px-3 py-2 text-sm font-bold text-[#09090b] hover:brightness-110">Conectar Spotify (pausar, siguiente, volumen)</button>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">Para controlar Spotify desde aquí falta conectarlo (paso pendiente en la Daily). Mientras, ábrelo con el botón.</p>
      )}
      {connected && now && vol !== null && (
        <label className="mt-2.5 flex items-center gap-2 text-xs text-zinc-400">
          <Volume2 className="h-3.5 w-3.5" />
          <input type="range" min={0} max={100} value={vol} onChange={(e) => setVol(Number(e.target.value))} onPointerUp={() => spotifyVolume(vol)} onKeyUp={() => spotifyVolume(vol)} className="flex-1 accent-[#1ed760]" />
          <span className="w-8 tabular-nums">{vol}%</span>
        </label>
      )}
      {connected && <button type="button" onClick={() => { spotifyDisconnect(); setConnected(false); }} className="mt-2 text-[10px] text-zinc-600 hover:text-zinc-300">Desconectar Spotify</button>}
    </div>
  );
};

/* ── Modo cocina ──────────────────────────────────────────────────────────────────── */

const MediaPanel: React.FC = () => {
  const [url, setUrl] = useState(() => lsGet('mp-cocina-video') ?? '');
  const [draft, setDraft] = useState(url);
  const p = parseYouTube(url);
  const src = p?.video ? `https://www.youtube.com/embed/${p.video}?rel=0&playsinline=1` : p?.list ? `https://www.youtube.com/embed/videoseries?list=${p.list}&rel=0` : null;
  return (
    <div className="flex h-full flex-col gap-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setUrl(draft.trim()); lsSet('mp-cocina-video', draft.trim()); }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Pega un video de YouTube para ver mientras cocinas" className={field} />
        <button type="submit" className="rounded-lg bg-white/[0.08] px-3 text-sm font-semibold text-white hover:bg-white/[0.14]">Ver</button>
      </form>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
        {src ? (
          <iframe src={src} title="Video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="absolute inset-0 h-full w-full" />
        ) : (
          <div className="flex h-full min-h-48 items-center justify-center p-6 text-center text-sm text-zinc-500">📺 Aquí va tu video mientras cocinas (una receta, una serie, lo que quieras).</div>
        )}
      </div>
      <SpotifyPanel />
    </div>
  );
};

export const CookMode: React.FC<{ r: Recipe; api: RecipesApi; onClose: () => void }> = ({ r, api, onClose }) => {
  const [split, setSplit] = useState(() => Number(lsGet('mp-cocina-split')) || 70);
  const [mode, setMode] = useState<UnitMode>('original');
  const [have, setHave] = useState<number[]>([]);
  const [done, setDone] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [review, setReview] = useState(false);
  const rang = useRef<string[]>([]);
  const steps = useMemo(() => [...r.steps].sort((a, b) => a.at - b.at || a.track - b.track), [r.steps]);
  const total = totalMinutes(r) * 60;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  // Suena cuando un timer termina (una vez por paso).
  useEffect(() => {
    for (const s of steps) {
      if (!s.minutes || done.includes(s.id) || rang.current.includes(s.id)) continue;
      if (elapsed >= (s.at + s.minutes) * 60) {
        rang.current.push(s.id);
        playOnce('alarma');
        void notify(`⏱ ¡Listo! ${s.text}`, r.title);
      }
    }
  }, [elapsed, steps, done, r.title]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !review && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, review]);
  const nowMin = elapsed / 60;
  const toggleDone = (id: string) => setDone((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const stateOf = (s: RecipeStep) => {
    if (done.includes(s.id)) return 'hecho';
    if (!running && elapsed === 0) return 'espera';
    if (nowMin < s.at) return 'pronto';
    if (s.minutes && nowMin >= s.at + s.minutes) return 'listo';
    return 'ahora';
  };
  return (
    <BodyPortal>
      <div role="dialog" aria-label={`Modo cocina: ${r.title}`} className="theme-fixed fixed inset-0 z-[96] flex flex-col bg-[#0b0c0f] text-left">
        <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2.5">
          <ChefHat className="h-5 w-5 text-orange-300" />
          <p className="min-w-0 flex-1 truncate font-semibold text-white">{r.title}</p>
          <label className="hidden items-center gap-2 text-xs text-zinc-400 md:flex" data-help="Cuánto espacio le das al video y a la receta">
            📺 <input type="range" min={30} max={80} step={5} value={split} onChange={(e) => { setSplit(Number(e.target.value)); lsSet('mp-cocina-split', e.target.value); }} className="w-32 accent-orange-500" /> 📖 <span className="w-14 tabular-nums">{split}/{100 - split}</span>
          </label>
          <button type="button" onClick={onClose} aria-label="Salir del modo cocina" className="rounded-lg p-2 text-zinc-300 hover:bg-white/10"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto md:flex-row md:overflow-hidden">
          <div className="min-w-0 p-4 md:h-full md:overflow-y-auto" style={{ flexBasis: `${split}%` }}>
            <MediaPanel />
          </div>
          <div className="space-y-4 border-white/10 p-4 md:h-full md:min-w-[400px] md:overflow-y-auto md:border-l" style={{ flexBasis: `${100 - split}%` }}>
            <div className="flex items-center gap-3">
              <p className={`font-display text-4xl font-semibold tabular-nums ${elapsed > total && total ? 'text-rose-300' : 'text-[#fff]'}`}>{mmss(elapsed)}</p>
              <span className="text-xs text-zinc-500">de ~{Math.round(total / 60)} min</span>
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={() => setRunning((v) => !v)} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold ${running ? 'bg-white/10 text-[#fff]' : 'bg-orange-500 text-[#fff] hover:bg-orange-400'}`}>{running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {running ? 'Pausar' : elapsed ? 'Seguir' : 'Empezar'}</button>
                <button type="button" onClick={() => { setRunning(false); setReview(true); }} className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-[#09090b] hover:bg-emerald-400">Terminé</button>
              </div>
            </div>
            <Timeline steps={r.steps} now={running || elapsed ? nowMin : null} done={done} />

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">🧺 Ingredientes <span className="font-normal text-zinc-500">{have.length}/{r.ingredients.length}</span></p>
                <select value={mode} onChange={(e) => setMode(e.target.value as UnitMode)} aria-label="Ver medidas en" className="rounded-lg bg-white/[0.05] px-2 py-1 text-xs text-zinc-200 outline-none ring-1 ring-white/10">
                  {UNIT_MODES.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </div>
              <ul className="space-y-1">
                {r.ingredients.map((x, i) => {
                  const on = have.includes(i);
                  return (
                    <li key={i}>
                      <button type="button" onClick={() => setHave((l) => (on ? l.filter((k) => k !== i) : [...l, i]))} className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/[0.04] ${on ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ring-1 ${on ? 'bg-emerald-500 ring-emerald-400' : 'ring-white/25'}`}>{on && <Check className="h-3.5 w-3.5 text-[#fff]" />}</span>
                        <span className="w-28 shrink-0 text-xs font-semibold text-orange-200">{showQty(x, mode)}</span>
                        <span className="min-w-0 flex-1">{x.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-semibold text-white">👩‍🍳 Paso a paso</p>
              <ul className="space-y-1.5">
                {steps.map((s) => {
                  const state = stateOf(s);
                  const left = s.minutes ? (s.at + s.minutes) * 60 - elapsed : null;
                  return (
                    <li key={s.id}>
                      <button type="button" onClick={() => toggleDone(s.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition ${state === 'ahora' ? 'bg-orange-500/15 ring-orange-400/60' : state === 'listo' ? 'animate-pulse bg-emerald-500/15 ring-emerald-400/60' : state === 'hecho' ? 'bg-white/[0.02] opacity-50 ring-white/5' : 'bg-white/[0.03] ring-white/10'}`}>
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 ${state === 'hecho' ? 'bg-emerald-500 ring-emerald-400' : 'ring-white/30'}`}>{state === 'hecho' && <Check className="h-4 w-4 text-[#fff]" />}</span>
                        <span className={`h-5 w-5 shrink-0 rounded text-center text-[10px] font-bold leading-5 text-[#fff] ${TRACK_CLS[s.track % 3]}`}>{TRACKS[s.track] ?? s.track + 1}</span>
                        <span className={`min-w-0 flex-1 text-sm ${state === 'hecho' ? 'line-through' : 'text-zinc-100'} ${state === 'ahora' ? 'font-semibold' : ''}`}>{s.text}</span>
                        <span className="shrink-0 text-right text-xs tabular-nums">
                          {state === 'pronto' && <span className="text-zinc-500">en {mmss(s.at * 60 - elapsed)}</span>}
                          {state === 'espera' && <span className="text-zinc-500">min {s.at}{s.minutes ? ` · ⏱ ${s.minutes}′` : ''}</span>}
                          {state === 'ahora' && left !== null && <span className="font-bold text-orange-200">⏱ {mmss(left)}</span>}
                          {state === 'ahora' && left === null && <span className="font-semibold text-orange-200">ahora</span>}
                          {state === 'listo' && <span className="font-bold text-emerald-200">¡listo!</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            {r.notes && <p className="rounded-xl bg-white/[0.03] p-3 text-xs text-zinc-300 ring-1 ring-white/10">📝 {r.notes}</p>}
          </div>
        </div>
        {review && <TimesReview r={r} api={api} onCancel={() => setReview(false)} onDone={onClose} />}
      </div>
    </BodyPortal>
  );
};

/** Al terminar: «¿los tiempos estuvieron bien?» — se ajustan y se anota tu cosecha. */
const TimesReview: React.FC<{ r: Recipe; api: RecipesApi; onCancel: () => void; onDone: () => void }> = ({ r, api, onCancel, onDone }) => {
  const timed = r.steps.filter((s) => s.minutes);
  const [mins, setMins] = useState<Record<string, number>>(() => Object.fromEntries(timed.map((s) => [s.id, s.minutes ?? 0])));
  const [note, setNote] = useState('');
  const save = async (changed: boolean) => {
    // Un timer más corto o más largo corre lo que venía después de él (ej. «pasa los huevos a agua fría»).
    let steps = r.steps.map((s) => ({ ...s }));
    for (const t of timed) {
      const delta = Math.max(1, mins[t.id]) - (t.minutes ?? 0);
      if (!delta) continue;
      const end = t.at + (t.minutes ?? 0);
      steps = steps.map((s) => (s.id === t.id ? { ...s, minutes: Math.max(1, mins[t.id]) } : s.at >= end ? { ...s, at: Math.max(0, s.at + delta) } : s));
    }
    const notes = note.trim() ? `${r.notes ? `${r.notes}\n` : ''}${new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}: ${note.trim()}` : r.notes;
    await api.patch(r.id, { ...(changed ? { steps } : {}), notes, made: (r.made ?? 0) + 1 });
    onDone();
  };
  const changed = timed.some((s) => mins[s.id] !== s.minutes) || !!note.trim();
  return (
    <div className="fixed inset-0 z-[97] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-[#14161b] p-5 ring-1 ring-white/10">
        <p className="text-lg font-semibold text-white">🍽️ ¡Buen provecho! ¿Los tiempos estuvieron bien?</p>
        <p className="text-xs text-zinc-400">{r.made === 0 ? 'La 1ª vez te arriesgas y modificas.' : r.made === 1 ? 'La 2ª te certificas.' : 'La 3ª te beneficias.'} Ajusta lo que sobró o faltó: queda así para la próxima.</p>
        {timed.length > 0 ? (
          <ul className="space-y-1.5">
            {timed.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-zinc-100">
                <span className="min-w-0 flex-1 truncate">{s.text}</span>
                <button type="button" aria-label="Un minuto menos" onClick={() => setMins((m) => ({ ...m, [s.id]: Math.max(1, m[s.id] - 1) }))} className="rounded-lg bg-white/[0.08] p-1 hover:bg-white/[0.14]"><Minus className="h-3.5 w-3.5" /></button>
                <span className={`w-14 text-center tabular-nums ${mins[s.id] !== s.minutes ? 'font-bold text-orange-200' : ''}`}>{mins[s.id]} min</span>
                <button type="button" aria-label="Un minuto más" onClick={() => setMins((m) => ({ ...m, [s.id]: m[s.id] + 1 }))} className="rounded-lg bg-white/[0.08] p-1 hover:bg-white/[0.14]"><Plus className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-400">Esta receta no tiene timers.</p>
        )}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="¿Algo que cambiar? Aliños, especias, cantidades…" className={field} />
        <div className="flex gap-2">
          <button type="button" onClick={() => save(changed)} className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-[#09090b] hover:bg-emerald-400">{changed ? 'Guardar cambios' : 'Sí, estuvieron bien'}</button>
          <button type="button" onClick={onCancel} className="rounded-xl bg-white/[0.06] px-3 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/[0.1]">Seguir cocinando</button>
        </div>
      </div>
    </div>
  );
};
