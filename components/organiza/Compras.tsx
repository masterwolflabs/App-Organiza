'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ClipboardCopy, Minus, Plus, Trash2, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { useConfirm } from '@/components/ui/confirm';
import { useDb } from '@/components/organiza/db';
import { useSpace } from '@/components/organiza/space';
import { usePlan, type Meal, type Workout } from '@/components/organiza/plan';
import { shoppingList } from '@/components/organiza/Shopping';
import type { Supplement } from '@/components/organiza/nutrients';

/**
 * 🛒 Master Compras · fase 1 (Emanuel, 2026-11-17, Daily idea-app-compras): que la app sepa qué comprar,
 * cuándo y cuánto. Vive en Master Planner hasta salir como app propia.
 * - 🏠 Bodega: lo que hay en la casa (cuánto, y desde cuánto reponer).
 * - 🔁 Recurrentes: cada cuántos días se acaba algo (remedios, suplementos, barba, limpieza…).
 * - 🧾 Lista: lo que toca comprar, por prioridad (⚡ urgente · ⭐ importante · 💤 se puede descartar): lo bajo
 *   el mínimo, lo recurrente que vence en 3 días, lo que agregaste, lo que pide tu semana de Nutrition Pro
 *   que no está en la bodega y los suplementos marcados 🛒. «✓ Comprado» repone la bodega.
 * Tabla organiza_pantry (SQL 47). Siguientes fases: minuta por presupuesto, extensión que arma el carrito
 * (Jumbo, Líder, Unimarc, Tottus), Finanzas, Master Outfit y XP.
 */

export type Category = 'comida' | 'suplementos' | 'remedios' | 'cuidado' | 'limpieza' | 'otro';
export const CATEGORIES: { id: Category; label: string; emoji: string }[] = [
  { id: 'comida', label: 'Comida', emoji: '🥫' },
  { id: 'suplementos', label: 'Suplementos', emoji: '💊' },
  { id: 'remedios', label: 'Remedios', emoji: '🩺' },
  { id: 'cuidado', label: 'Cuidado personal', emoji: '🧴' },
  { id: 'limpieza', label: 'Limpieza', emoji: '🧽' },
  { id: 'otro', label: 'Otro', emoji: '📦' },
];
export type Priority = 'urgente' | 'importante' | 'descartable';
const PRIORITIES: { id: Priority; label: string; emoji: string }[] = [
  { id: 'urgente', label: 'Urgente', emoji: '⚡' },
  { id: 'importante', label: 'Importante', emoji: '⭐' },
  { id: 'descartable', label: 'Se puede descartar', emoji: '💤' },
];
export type PantryItem = { id: string; name: string; category: Category; stock: number; unit: string; min: number; buy_qty: number | null; lasts_days: number | null; last_bought: string | null; priority: Priority; on_list: boolean; note: string; sort: number };

const field = 'w-full rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-emerald-400/50';
const iso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/([nlrdzj])es$/, '$1').replace(/s$/, '');
const daysUntil = (p: PantryItem) => {
  if (!p.lasts_days || !p.last_bought) return null;
  const due = new Date(`${p.last_bought}T12:00`);
  due.setDate(due.getDate() + p.lasts_days);
  return Math.round((due.getTime() - new Date(`${iso()}T12:00`).getTime()) / 86400000);
};
const nice = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Por qué algo está en la lista (o null si no toca). */
export function reasonToBuy(p: PantryItem): string | null {
  if (p.on_list) return 'Lo agregaste';
  if (p.min > 0 && p.stock <= p.min) return p.stock <= 0 ? 'Se acabó' : `Quedan ${nice(p.stock)} ${p.unit}`;
  const d = daysUntil(p);
  if (d !== null && d <= 3) return d <= 0 ? 'Ya debería haberse acabado' : `Se acaba en ${d} ${d === 1 ? 'día' : 'días'}`;
  return null;
}

function usePantry() {
  const db = useDb();
  const { space } = useSpace();
  const [rows, setRows] = useState<PantryItem[]>([]);
  const [supps, setSupps] = useState<Supplement[]>([]);
  const [ready, setReady] = useState(false);
  const load = useCallback(async () => {
    const [p, s] = await Promise.all([db.select<PantryItem>('organiza_pantry', { space }), db.select<Supplement>('organiza_supplements', { space })]);
    setRows(p.map((x) => ({ ...x, stock: Number(x.stock), min: Number(x.min), buy_qty: x.buy_qty === null ? null : Number(x.buy_qty) })).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'es')));
    setSupps(s);
    setReady(true);
  }, [db, space]);
  useEffect(() => {
    load();
  }, [load]);
  const add = async (p: Partial<PantryItem>) => {
    const [made] = await db.insert<PantryItem>('organiza_pantry', { space, name: '', category: 'comida', stock: 0, unit: 'unidad', min: 0, priority: 'importante', on_list: false, note: '', sort: rows.length, ...p });
    if (made) setRows((l) => [...l, { ...made, stock: Number(made.stock), min: Number(made.min) }]);
    return made ?? null;
  };
  const patch = async (id: string, p: Partial<PantryItem>) => {
    setRows((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
    await db.update('organiza_pantry', { id }, p as Record<string, unknown>);
  };
  const remove = async (id: string) => {
    setRows((l) => l.filter((x) => x.id !== id));
    await db.remove('organiza_pantry', { id });
  };
  const suppBought = async (id: string) => {
    setSupps((l) => l.map((x) => (x.id === id ? { ...x, buy: false } : x)));
    await db.update('organiza_supplements', { id }, { buy: false });
  };
  return { rows, supps, ready, add, patch, remove, suppBought };
}
type PantryApi = ReturnType<typeof usePantry>;

/** Una línea de la lista: de la bodega, de la semana de comidas o un suplemento. */
type Line = { key: string; name: string; qty: string; why: string; priority: Priority; category: Category; item?: PantryItem; suppId?: string };

export const ComprasView: React.FC = () => {
  const api = usePantry();
  const meals = usePlan<Meal & Workout>('meals');
  const [tab, setTab] = useState<'lista' | 'bodega' | 'recurrentes'>('lista');
  const [editing, setEditing] = useState<string | null>(null);
  const [quick, setQuick] = useState('');
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState<string[]>([]);

  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [];
    for (const p of api.rows) {
      const why = reasonToBuy(p);
      if (why) out.push({ key: `p:${p.id}`, name: p.name, qty: p.buy_qty ? `${nice(p.buy_qty)} ${p.unit}` : '', why, priority: p.priority, category: p.category, item: p });
    }
    // Lo que pide tu semana de Nutrition Pro y no está en la bodega (o no alcanza).
    const have = new Map(api.rows.map((p) => [norm(p.name), p]));
    for (const l of shoppingList(meals.rows, [0, 1, 2, 3, 4, 5, 6])) {
      const p = have.get(norm(l.name));
      if (p && out.some((o) => o.item?.id === p.id)) continue;
      // ¿Lo tienes? Si le pusiste mínimo, manda tu stock; si no (la app no sabe cuándo te lo comiste), cuenta
      // como «hay» solo si lo compraste en los últimos 7 días: así la semana siguiente vuelve a la lista.
      const fresh = !!p?.last_bought && p.last_bought > iso(new Date(Date.now() - 7 * 86400000));
      if (p && p.stock > p.min && (p.min > 0 || fresh)) continue;
      out.push({ key: `m:${l.key}`, name: l.name, qty: l.qty, why: `Tu semana: ${l.meals.slice(0, 2).join(', ')}${l.meals.length > 2 ? '…' : ''}`, priority: 'importante', category: 'comida', item: p });
    }
    for (const s of api.supps.filter((x) => x.buy && x.active)) out.push({ key: `s:${s.id}`, name: s.name, qty: s.dose, why: 'Tu plan de suplementos', priority: 'importante', category: 'suplementos', suppId: s.id });
    return out;
  }, [api.rows, api.supps, meals.rows]);

  const bought = async (l: Line) => {
    setDone((d) => [...d, l.key]);
    if (l.suppId) return api.suppBought(l.suppId);
    if (l.item) {
      const add = l.item.buy_qty ?? Math.max(1, l.item.min || 1);
      await api.patch(l.item.id, { on_list: false, last_bought: iso(), stock: l.item.stock + add });
    } else {
      // De la semana y sin ficha en la bodega: se crea al comprarlo, así la próxima vez se sabe que hay.
      await api.add({ name: l.name, category: l.category, stock: 1, unit: 'unidad', last_bought: iso() });
    }
  };
  const addQuick = async () => {
    const n = quick.trim();
    if (!n) return;
    const there = api.rows.find((p) => norm(p.name) === norm(n));
    if (there) await api.patch(there.id, { on_list: true });
    else await api.add({ name: n, on_list: true });
    setQuick('');
  };
  const copy = () => {
    const txt = PRIORITIES.flatMap((pr) => lines.filter((l) => l.priority === pr.id && !done.includes(l.key)).map((l) => `- ${l.name}${l.qty ? ` (${l.qty})` : ''}`)).join('\n');
    void navigator.clipboard?.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const recurring = api.rows.filter((p) => p.lasts_days);
  const editingItem = api.rows.find((p) => p.id === editing) ?? null;

  if (!api.ready) return <p className="text-sm text-zinc-500">Cargando…</p>;
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-3xl font-semibold text-white">🛒 Master Compras</h1>
      <p className="mb-5 mt-1 text-sm text-zinc-400">Que tu cabeza no tenga que acordarse: qué comprar, cuándo y cuánto. Se conecta con Nutrition Pro y tus suplementos.</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {([['lista', `🧾 Lista (${lines.filter((l) => !done.includes(l.key)).length})`], ['bodega', `🏠 Bodega (${api.rows.length})`], ['recurrentes', `🔁 Recurrentes (${recurring.length})`]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${tab === id ? 'bg-emerald-500 text-[#09090b] ring-emerald-400' : 'text-zinc-300 ring-white/15 hover:bg-white/[0.06]'}`}>{label}</button>
        ))}
        <span className="flex-1" />
        <button type="button" onClick={async () => { const p = await api.add({ name: 'Nuevo', category: tab === 'recurrentes' ? 'cuidado' : 'comida', lasts_days: tab === 'recurrentes' ? 30 : null, last_bought: tab === 'recurrentes' ? iso() : null }); if (p) setEditing(p.id); }} className="inline-flex items-center gap-1 rounded-xl bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/[0.14]"><Plus className="h-3.5 w-3.5" /> {tab === 'recurrentes' ? 'Nueva compra recurrente' : 'Nuevo en la bodega'}</button>
      </div>

      {tab === 'lista' && (
        <div className="space-y-4">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void addQuick(); }}>
            <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Agregar a la lista (ej. pasta de dientes)" className={field} />
            <button type="submit" className="rounded-lg bg-emerald-500 px-3 text-sm font-bold text-[#09090b]">Agregar</button>
            <button type="button" onClick={copy} disabled={!lines.length} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.08] px-3 text-xs font-semibold text-white disabled:opacity-40"><ClipboardCopy className="h-3.5 w-3.5" /> {copied ? 'Copiada' : 'Copiar'}</button>
          </form>
          {PRIORITIES.map((pr) => {
            const here = lines.filter((l) => l.priority === pr.id);
            if (!here.length) return null;
            return (
              <div key={pr.id}>
                <p className="mb-1.5 text-xs font-semibold text-zinc-400">{pr.emoji} {pr.label}</p>
                <ul className="space-y-1">
                  {here.map((l) => {
                    const ok = done.includes(l.key);
                    const cat = CATEGORIES.find((c) => c.id === l.category);
                    return (
                      <li key={l.key} className={`flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ${ok ? 'bg-emerald-500/[0.06] opacity-60 ring-emerald-400/20' : 'bg-white/[0.03] ring-white/10'}`}>
                        <button type="button" disabled={ok} onClick={() => bought(l)} aria-label={`Comprado: ${l.name}`} data-help="✓ Comprado (repone la bodega)" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 ${ok ? 'bg-emerald-500 ring-emerald-400' : 'ring-white/30 hover:ring-emerald-400'}`}>{ok && <Check className="h-4 w-4 text-[#fff]" />}</button>
                        <span className="text-base">{cat?.emoji}</span>
                        <button type="button" onClick={() => l.item && setEditing(l.item.id)} className={`min-w-0 flex-1 text-left ${ok ? 'line-through' : ''}`}>
                          <span className="block truncate text-sm font-semibold text-white">{l.name}{l.qty && <span className="font-normal text-zinc-400"> · {l.qty}</span>}</span>
                          <span className="block truncate text-[11px] text-zinc-500">{l.why}</span>
                        </button>
                        {l.item && !ok && (
                          <select value={l.item.priority} onChange={(e) => api.patch(l.item!.id, { priority: e.target.value as Priority })} aria-label="Prioridad" className="rounded-lg bg-white/[0.05] px-1.5 py-1 text-xs text-zinc-300 outline-none ring-1 ring-white/10">
                            {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>)}
                          </select>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {!lines.length && <p className="rounded-2xl bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500 ring-1 ring-white/10">🎉 No hay nada que comprar. Cuando algo de la bodega baje del mínimo, una compra recurrente esté por acabarse o tu semana de comidas pida algo, aparece aquí.</p>}
          <p className="text-[11px] text-zinc-500">Próximamente: una extensión del navegador que arma el carrito en Jumbo, Santa Isabel, Líder, Unimarc o Tottus con esta lista (la compra siempre la confirmas tú).</p>
        </div>
      )}

      {tab === 'bodega' && (
        <div className="space-y-4">
          {CATEGORIES.map((c) => {
            const here = api.rows.filter((p) => p.category === c.id);
            if (!here.length) return null;
            return (
              <div key={c.id}>
                <p className="mb-1.5 text-xs font-semibold text-zinc-400">{c.emoji} {c.label}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {here.map((p) => {
                    const low = p.min > 0 && p.stock <= p.min;
                    return (
                      <div key={p.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ${low ? 'bg-amber-500/[0.07] ring-amber-400/30' : 'bg-white/[0.03] ring-white/10'}`}>
                        <button type="button" onClick={() => setEditing(p.id)} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-sm font-semibold text-white">{p.name}</span>
                          <span className={`block text-[11px] ${low ? 'text-amber-200' : 'text-zinc-500'}`}>{nice(p.stock)} {p.unit}{p.min ? ` · reponer bajo ${nice(p.min)}` : ''}</span>
                        </button>
                        <button type="button" aria-label="Uno menos" onClick={() => api.patch(p.id, { stock: Math.max(0, p.stock - 1) })} className="rounded-lg bg-white/[0.06] p-1 text-zinc-200 hover:bg-white/[0.12]"><Minus className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label="Uno más" onClick={() => api.patch(p.id, { stock: p.stock + 1 })} className="rounded-lg bg-white/[0.06] p-1 text-zinc-200 hover:bg-white/[0.12]"><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {!api.rows.length && <p className="rounded-2xl bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500 ring-1 ring-white/10">Anota lo que hay en tu casa (arroz, aceite, huevos…) con el mínimo desde el que quieres reponer. Lo que compras desde la lista se suma solo.</p>}
        </div>
      )}

      {tab === 'recurrentes' && (
        <div className="space-y-2">
          {recurring.map((p) => {
            const d = daysUntil(p);
            return (
              <button key={p.id} type="button" onClick={() => setEditing(p.id)} className="flex w-full items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 text-left ring-1 ring-white/10 hover:ring-white/25">
                <span className="text-lg">{CATEGORIES.find((c) => c.id === p.category)?.emoji}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{p.name}</span><span className="block text-[11px] text-zinc-500">Dura ~{p.lasts_days} días{p.last_bought ? ` · comprado el ${new Date(`${p.last_bought}T12:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}` : ''}</span></span>
                <span className={`shrink-0 text-xs font-semibold ${d !== null && d <= 3 ? 'text-amber-200' : 'text-zinc-400'}`}>{d === null ? 'Sin fecha' : d <= 0 ? 'Toca comprar' : `En ${d} días`}</span>
              </button>
            );
          })}
          {!recurring.length && <p className="rounded-2xl bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500 ring-1 ring-white/10">Lo que se compra cada cierto tiempo: las pastillas del abuelo, el aceite de barba, el detergente… Pon cada cuántos días se acaba y te avisa en la lista 3 días antes.</p>}
        </div>
      )}

      {editingItem && <ItemEditor p={editingItem} api={api} onClose={() => setEditing(null)} />}
    </div>
  );
};

/** Número con coma: se escribe libre («1,5») y se guarda al salir del campo. */
const NumField: React.FC<{ value: number | null; empty: number | null; placeholder?: string; onCommit: (n: number | null) => void }> = ({ value, empty, placeholder, onCommit }) => {
  const [t, setT] = useState(value ? nice(value) : value === 0 && empty === 0 && !placeholder ? '0' : '');
  const commit = () => {
    const n = t.trim() === '' ? empty : Math.max(0, Number(t.replace(',', '.')) || 0);
    if (n !== value) onCommit(n);
    setT(n ? nice(n) : n === 0 && !placeholder ? '0' : '');
  };
  return <input inputMode="decimal" value={t} placeholder={placeholder} onChange={(e) => setT(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className={`${field} mt-1`} />;
};

const ItemEditor: React.FC<{ p: PantryItem; api: PantryApi; onClose: () => void }> = ({ p, api, onClose }) => {
  const confirm = useConfirm();
  const set = (x: Partial<PantryItem>) => api.patch(p.id, x);
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div role="dialog" aria-label={`Editar ${p.name}`} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-2xl bg-[#14161b] p-5 ring-1 ring-white/10">
          <div className="flex items-center justify-between"><p className="font-semibold text-white">🛒 {p.name || 'Nuevo'}</p><button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X className="h-4 w-4" /></button></div>
          <input autoFocus value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="Nombre (ej. Aceite de oliva)" className={field} />
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => <button key={c.id} type="button" onClick={() => set({ category: c.id })} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${p.category === c.id ? 'bg-emerald-500 text-[#09090b] ring-emerald-400' : 'text-zinc-300 ring-white/15'}`}>{c.emoji} {c.label}</button>)}
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs text-zinc-400">
            <label>Hay<NumField value={p.stock} empty={0} onCommit={(n) => set({ stock: n ?? 0 })} /></label>
            <label>Unidad<input value={p.unit} onChange={(e) => set({ unit: e.target.value })} className={`${field} mt-1`} /></label>
            <label>Reponer bajo<NumField value={p.min} empty={0} placeholder="0" onCommit={(n) => set({ min: n ?? 0 })} /></label>
            <label>Se compran<NumField value={p.buy_qty} empty={null} placeholder="1" onCommit={(n) => set({ buy_qty: n || null })} /></label>
            <label>Dura (días)<input inputMode="numeric" value={p.lasts_days ?? ''} placeholder="—" onChange={(e) => set({ lasts_days: e.target.value.trim() ? Math.max(1, Math.round(Number(e.target.value)) || 1) : null, last_bought: p.last_bought ?? iso() })} className={`${field} mt-1`} /></label>
            <label>Última compra<input type="date" value={p.last_bought ?? ''} onChange={(e) => set({ last_bought: e.target.value || null })} className={`${field} mt-1 px-1.5`} /></label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRIORITIES.map((x) => <button key={x.id} type="button" onClick={() => set({ priority: x.id })} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${p.priority === x.id ? 'bg-white/15 text-[#fff] ring-white/40' : 'text-zinc-400 ring-white/15'}`}>{x.emoji} {x.label}</button>)}
          </div>
          <input value={p.note} onChange={(e) => set({ note: e.target.value })} placeholder="Nota (marca, tienda, tamaño…)" className={field} />
          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={() => { set({ on_list: !p.on_list }); }} className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold ${p.on_list ? 'bg-white/[0.08] text-zinc-200' : 'bg-emerald-500 text-[#09090b]'}`}>{p.on_list ? 'Sacar de la lista' : '🧾 Agregar a la lista'}</button>
            <button type="button" aria-label="Borrar" onClick={async () => { if (await confirm({ title: `¿Borrar «${p.name}»?`, confirmLabel: 'Borrar', tone: 'danger' })) { await api.remove(p.id); onClose(); } }} className="rounded-xl p-2 text-zinc-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};
