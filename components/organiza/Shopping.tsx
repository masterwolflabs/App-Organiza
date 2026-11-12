'use client';

import React, { useMemo, useState } from 'react';
import { Check, ClipboardCopy, ShoppingCart, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { usePlan, type Meal } from '@/components/organiza/plan';

/**
 * 🛒 Lista de compras (Daily «organizar-compras», paso 2 — 2026-11-12): suma los ingredientes de las comidas
 * de la semana (o de los días que elijas), junta los repetidos («Huevos 2 + 3 → 5») y se marcan comprados.
 * Lo que hay en el refri (pasos 1 y 3) se define con Emanuel. Lo comprado se recuerda en este dispositivo
 * por semana.
 */
const WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/([nlrdzj])es$/, '$1').replace(/s$/, '');
const weekKey = () => {
  const d = new Date();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `organiza-compras:${monday.toISOString().slice(0, 10)}`;
};

type Line = { key: string; name: string; qty: string; meals: string[] };

/** «2 tazas» + «1 taza» → «3 tazas»; si no se puede sumar, se listan: «2 tazas · 100 g». */
function sumQty(qtys: string[]) {
  const nums = new Map<string, number>();
  const rest: string[] = [];
  for (const q of qtys.map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(q);
    if (!m) {
      rest.push(q);
      continue;
    }
    const unit = m[2].trim().toLowerCase().replace(/([nlrdzj])es$/, '$1').replace(/s$/, '');
    nums.set(unit, (nums.get(unit) ?? 0) + Number(m[1].replace(',', '.')));
  }
  const parts = [...nums].map(([u, n]) => `${Math.round(n * 100) / 100}${u ? ` ${u}${n > 1 && u.length > 2 ? (/[aeiou]$/.test(u) ? 's' : 'es') : ''}` : ''}`);
  return [...parts, ...rest].join(' · ');
}

export function shoppingList(meals: Meal[], days: number[]): Line[] {
  const map = new Map<string, { name: string; qtys: string[]; meals: Set<string> }>();
  for (const m of meals) {
    if (!days.includes(m.weekday)) continue;
    for (const ing of m.ingredients ?? []) {
      if (!ing.name?.trim()) continue;
      const k = norm(ing.name);
      const e = map.get(k) ?? { name: ing.name.trim(), qtys: [], meals: new Set<string>() };
      e.qtys.push(ing.qty ?? '');
      if (m.title) e.meals.add(m.title);
      map.set(k, e);
    }
  }
  return [...map].map(([key, e]) => ({ key, name: e.name, qty: sumQty(e.qtys), meals: [...e.meals] })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export const ShoppingButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-[#fff] hover:bg-emerald-500">
        <ShoppingCart className="h-4 w-4" /> Lista de compras
      </button>
      {open && <ShoppingPanel onClose={() => setOpen(false)} />}
    </>
  );
};

const ShoppingPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const plan = usePlan<Meal>('meals');
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [bought, setBought] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(weekKey()) || '[]');
    } catch {
      return [];
    }
  });
  const [copied, setCopied] = useState(false);
  const list = useMemo(() => shoppingList(plan.rows, days), [plan.rows, days]);
  const toggle = (k: string) => {
    const next = bought.includes(k) ? bought.filter((x) => x !== k) : [...bought, k];
    setBought(next);
    try {
      localStorage.setItem(weekKey(), JSON.stringify(next));
    } catch {
      /* modo privado */
    }
  };
  const pending = list.filter((l) => !bought.includes(l.key));
  const copy = async () => {
    const text = [`🛒 Compras (${days.length === 7 ? 'semana' : days.map((d) => WEEK[d]).join(', ')})`, ...pending.map((l) => `▫️ ${l.name}${l.qty ? ` — ${l.qty}` : ''}`)].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* sin portapapeles */
    }
  };

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[80] flex justify-end bg-black/50" onClick={onClose}>
        <aside onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-md flex-col bg-[#111317] text-white shadow-2xl ring-1 ring-white/10">
          <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <ShoppingCart className="h-5 w-5 text-emerald-300" />
            <h2 className="flex-1 font-display text-lg font-semibold">Lista de compras</h2>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Cerrar">
              <X className="h-5 w-5" />
            </button>
          </header>
          <div className="space-y-2 border-b border-white/10 px-4 py-3">
            <p className="text-xs text-zinc-400">¿Para qué días?</p>
            <div className="flex flex-wrap gap-1">
              {WEEK.map((d, i) => (
                <button key={d} type="button" onClick={() => setDays((l) => (l.includes(i) ? l.filter((x) => x !== i) : [...l, i].sort()))} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${days.includes(i) ? 'bg-emerald-600 text-[#fff]' : 'bg-white/[0.06] text-zinc-400'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {!plan.ready ? (
              <p className="px-2 py-6 text-center text-sm text-zinc-500">Cargando tu plan…</p>
            ) : !list.length ? (
              <p className="px-2 py-6 text-center text-sm text-zinc-500">Tus comidas de esos días no tienen ingredientes. Ábrelas en Alimentación y agrégalos en 🧺 Ingredientes.</p>
            ) : (
              <ul>
                {list.map((l) => {
                  const on = bought.includes(l.key);
                  return (
                    <li key={l.key}>
                      <button type="button" onClick={() => toggle(l.key)} className={`flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/[0.04] ${on ? 'opacity-50' : ''}`}>
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? 'border-emerald-400 bg-emerald-500' : 'border-white/30'}`}>{on && <Check className="h-3.5 w-3.5" />}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm font-semibold ${on ? 'line-through' : ''}`}>{l.name}</span>
                          <span className="block text-xs text-zinc-500">
                            {l.qty && <b className="text-zinc-300">{l.qty}</b>}
                            {l.qty && l.meals.length ? ' · ' : ''}
                            {l.meals.slice(0, 3).join(', ')}
                            {l.meals.length > 3 ? '…' : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <footer className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
            <span className="flex-1 text-xs text-zinc-400">
              {pending.length} por comprar · {list.length - pending.length} listas
            </span>
            {bought.length > 0 && (
              <button type="button" onClick={() => { setBought([]); try { localStorage.removeItem(weekKey()); } catch { /* */ } }} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-zinc-400 hover:text-white">
                Desmarcar todo
              </button>
            )}
            <button type="button" onClick={() => void copy()} disabled={!pending.length} className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-40">
              <ClipboardCopy className="h-3.5 w-3.5" /> {copied ? '✓ Copiada' : 'Copiar para WhatsApp'}
            </button>
          </footer>
        </aside>
      </div>
    </BodyPortal>
  );
};
