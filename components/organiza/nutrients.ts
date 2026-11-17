'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDb } from '@/components/organiza/db';
import { useSpace } from '@/components/organiza/space';
import { authFetch } from '@/lib/authFetch';
import { cloudAI } from '@/lib/aiClient';
import { APP } from '@/app.config';

/**
 * 📸 Nutrition Pro · registro (Emanuel, 2026-11-17, Daily nutrition-registro-foto-suplementos): lo que
 * comes (foto, texto/dictado, gramos de balanza o «me comí la receta de hoy») y tus suplementos.
 * La IA de la nube (`/api/organiza/food`) reconoce alimentos, gramos y nutrientes POR 100 g; aquí se
 * multiplica por los gramos y se SUMA (el modelo nunca calcula totales). SQL 45.
 */

export type NKey =
  | 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar' | 'satfat' | 'sodium' | 'chol' | 'omega3'
  | 'vitA' | 'vitC' | 'vitD' | 'vitE' | 'vitK' | 'b1' | 'b2' | 'b3' | 'b6' | 'b9' | 'b12'
  | 'calcium' | 'iron' | 'magnesium' | 'zinc' | 'potassium' | 'phosphorus' | 'selenium';
export type Nutrients = Partial<Record<NKey, number>>;

type Def = { key: NKey; label: string; unit: string; group: 'macro' | 'cuidar' | 'vitamina' | 'mineral'; /** Referencia general de adulto [hombre, mujer]. */ ref?: [number, number]; /** Es un tope (no pasarse), no una meta. */ limit?: boolean };
export const NUTRIENTS: Def[] = [
  { key: 'kcal', label: 'Calorías', unit: 'kcal', group: 'macro' },
  { key: 'protein', label: 'Proteínas', unit: 'g', group: 'macro' },
  { key: 'carbs', label: 'Carbohidratos', unit: 'g', group: 'macro' },
  { key: 'fat', label: 'Grasas', unit: 'g', group: 'macro' },
  { key: 'fiber', label: 'Fibra', unit: 'g', group: 'macro', ref: [30, 25] },
  { key: 'omega3', label: 'Omega-3', unit: 'g', group: 'macro', ref: [1.6, 1.1] },
  { key: 'sugar', label: 'Azúcares', unit: 'g', group: 'cuidar', ref: [50, 50], limit: true },
  { key: 'satfat', label: 'Grasas saturadas', unit: 'g', group: 'cuidar', ref: [22, 20], limit: true },
  { key: 'sodium', label: 'Sodio', unit: 'mg', group: 'cuidar', ref: [2300, 2300], limit: true },
  { key: 'chol', label: 'Colesterol', unit: 'mg', group: 'cuidar', ref: [300, 300], limit: true },
  { key: 'vitA', label: 'Vitamina A', unit: 'µg', group: 'vitamina', ref: [900, 700] },
  { key: 'vitC', label: 'Vitamina C', unit: 'mg', group: 'vitamina', ref: [90, 75] },
  { key: 'vitD', label: 'Vitamina D', unit: 'µg', group: 'vitamina', ref: [15, 15] },
  { key: 'vitE', label: 'Vitamina E', unit: 'mg', group: 'vitamina', ref: [15, 15] },
  { key: 'vitK', label: 'Vitamina K', unit: 'µg', group: 'vitamina', ref: [120, 90] },
  { key: 'b1', label: 'B1 (tiamina)', unit: 'mg', group: 'vitamina', ref: [1.2, 1.1] },
  { key: 'b2', label: 'B2 (riboflavina)', unit: 'mg', group: 'vitamina', ref: [1.3, 1.1] },
  { key: 'b3', label: 'B3 (niacina)', unit: 'mg', group: 'vitamina', ref: [16, 14] },
  { key: 'b6', label: 'B6', unit: 'mg', group: 'vitamina', ref: [1.3, 1.3] },
  { key: 'b9', label: 'B9 (folato)', unit: 'µg', group: 'vitamina', ref: [400, 400] },
  { key: 'b12', label: 'B12', unit: 'µg', group: 'vitamina', ref: [2.4, 2.4] },
  { key: 'calcium', label: 'Calcio', unit: 'mg', group: 'mineral', ref: [1000, 1000] },
  { key: 'iron', label: 'Hierro', unit: 'mg', group: 'mineral', ref: [8, 18] },
  { key: 'magnesium', label: 'Magnesio', unit: 'mg', group: 'mineral', ref: [400, 310] },
  { key: 'zinc', label: 'Zinc', unit: 'mg', group: 'mineral', ref: [11, 8] },
  { key: 'potassium', label: 'Potasio', unit: 'mg', group: 'mineral', ref: [3400, 2600] },
  { key: 'phosphorus', label: 'Fósforo', unit: 'mg', group: 'mineral', ref: [700, 700] },
  { key: 'selenium', label: 'Selenio', unit: 'µg', group: 'mineral', ref: [55, 55] },
];
export const KEYS = NUTRIENTS.map((n) => n.key);
export const refFor = (d: Def, body: 'hombre' | 'mujer' | null) => d.ref?.[body === 'mujer' ? 1 : 0];

/* ── Sumar (lo hace la app, no la IA) ─────────────────────────────────────────────── */

export type FoodItem = { name: string; grams: number; sure?: boolean; per100: Nutrients };
export type FoodEntry = { id: string; day: string; slot: string; title: string; source: 'foto' | 'texto' | 'balanza' | 'receta'; items: FoodItem[]; note: string; recipe_id?: string | null; created_at?: string };
export type Supplement = { id: string; name: string; dose: string; per_day: number; time: string | null; nutrients: Nutrients; other: string; active: boolean; sort: number; /** Test de suplementación (SQL 46): hasta cuándo, por qué y si va a la lista de compras. */ until?: string | null; reason?: string; buy?: boolean };
export type Take = { id: string; supplement_id: string; day: string; n: number };

const round = (n: number) => (n >= 100 ? Math.round(n) : n >= 10 ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100);
export const add = (a: Nutrients, b: Nutrients, factor = 1): Nutrients => {
  const out: Nutrients = { ...a };
  for (const k of KEYS) if (b[k]) out[k] = (out[k] ?? 0) + (b[k] ?? 0) * factor;
  return out;
};
export const itemTotal = (i: FoodItem): Nutrients => add({}, i.per100, (Number(i.grams) || 0) / 100);
export const entryTotal = (e: Pick<FoodEntry, 'items'>): Nutrients => e.items.reduce((s, i) => add(s, itemTotal(i)), {} as Nutrients);
/** Lo de un día: comidas + las dosis de suplementos que marcaste. */
export function dayTotal(day: string, entries: FoodEntry[], supplements: Supplement[], takes: Take[]): { food: Nutrients; supp: Nutrients; all: Nutrients } {
  const food = entries.filter((e) => e.day === day).reduce((s, e) => add(s, entryTotal(e)), {} as Nutrients);
  const supp = takes.filter((t) => t.day === day).reduce((s, t) => {
    const x = supplements.find((y) => y.id === t.supplement_id);
    return x ? add(s, x.nutrients, t.n) : s;
  }, {} as Nutrients);
  return { food, supp, all: add(food, supp) };
}
export const fmt = (n: number | undefined, unit: string) => `${String(round(n ?? 0)).replace('.', ',')} ${unit}`;

/* ── IA (en la nube, con los créditos de la app) ──────────────────────────────────── */

/** Achica la foto (≤ 1280 px, JPEG) para mandarla liviana. */
export async function photoToBase64(file: File): Promise<{ mime: string; data: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = bad;
      i.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return { mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function ask<T>(body: Record<string, unknown>): Promise<T> {
  const res = await authFetch(cloudAI('/api/organiza/food'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, app: APP.slug }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error || 'La IA no respondió. Intenta de nuevo.');
  return j as T;
}
export const recognizeFood = (p: { text?: string; image?: { mime: string; data: string } }) => ask<{ title: string; items: FoodItem[]; note: string }>({ kind: 'comida', ...p });
export const readLabel = (image: { mime: string; data: string }) => ask<{ name: string; dose: string; per_day: number; per_dose: Nutrients; other: string }>({ kind: 'etiqueta', image });

/* ── Datos ─────────────────────────────────────────────────────────────────────────── */

export function useFoodLog() {
  const db = useDb();
  const { space, userId } = useSpace();
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [takes, setTakes] = useState<Take[]>([]);
  const [body, setBody] = useState<'hombre' | 'mujer' | null>(null);
  const [ready, setReady] = useState(false);
  const load = useCallback(async () => {
    const [e, s, t, p] = await Promise.all([
      db.select<FoodEntry>('organiza_food_log', { space }),
      db.select<Supplement>('organiza_supplements', { space }),
      db.select<Take>('organiza_supplement_takes', {}),
      db.select<{ body?: string | null }>('organiza_prefs', { owner_id: userId ?? 'local' }),
    ]);
    setEntries(e.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')));
    setSupplements(s.sort((a, b) => a.sort - b.sort));
    setTakes(t);
    setBody(p[0]?.body === 'mujer' || p[0]?.body === 'hombre' ? p[0].body : null);
    setReady(true);
  }, [db, space, userId]);
  useEffect(() => {
    load();
  }, [load]);

  const addEntry = useCallback(async (p: Omit<FoodEntry, 'id'>) => {
    const [made] = await db.insert<FoodEntry>('organiza_food_log', { ...p, space });
    if (made) setEntries((l) => [...l, made]);
  }, [db, space]);
  const patchEntry = useCallback(async (id: string, p: Partial<FoodEntry>) => {
    setEntries((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
    await db.update('organiza_food_log', { id }, p as Record<string, unknown>);
  }, [db]);
  const removeEntry = useCallback(async (id: string) => {
    setEntries((l) => l.filter((x) => x.id !== id));
    await db.remove('organiza_food_log', { id });
  }, [db]);

  const addSupplement = useCallback(async (p: Partial<Supplement>) => {
    const [made] = await db.insert<Supplement>('organiza_supplements', { space, name: '', dose: '1 cápsula', per_day: 1, time: null, nutrients: {}, other: '', active: true, sort: supplements.length, ...p });
    if (made) setSupplements((l) => [...l, made]);
    return made ?? null;
  }, [db, space, supplements.length]);
  const patchSupplement = useCallback(async (id: string, p: Partial<Supplement>) => {
    setSupplements((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
    await db.update('organiza_supplements', { id }, p as Record<string, unknown>);
  }, [db]);
  const removeSupplement = useCallback(async (id: string) => {
    setSupplements((l) => l.filter((x) => x.id !== id));
    setTakes((l) => l.filter((x) => x.supplement_id !== id));
    await db.remove('organiza_supplements', { id });
  }, [db]);

  /** «Lo tomé»: suma una dosis ese día (hasta las del día); otro toque cuando ya están todas = vuelve a 0. */
  const take = useCallback(async (s: Supplement, day: string) => {
    const t = takes.find((x) => x.supplement_id === s.id && x.day === day);
    const next = t ? (t.n >= s.per_day ? 0 : t.n + 1) : 1;
    if (t && !next) {
      setTakes((l) => l.filter((x) => x.id !== t.id));
      await db.remove('organiza_supplement_takes', { id: t.id });
    } else if (t) {
      setTakes((l) => l.map((x) => (x.id === t.id ? { ...x, n: next } : x)));
      await db.update('organiza_supplement_takes', { id: t.id }, { n: next });
    } else {
      const [made] = await db.insert<Take>('organiza_supplement_takes', { supplement_id: s.id, day, n: 1 });
      if (made) setTakes((l) => [...l, made]);
    }
  }, [db, takes]);

  return { entries, supplements, takes, body, ready, addEntry, patchEntry, removeEntry, addSupplement, patchSupplement, removeSupplement, take, reload: load };
}
export type FoodApi = ReturnType<typeof useFoodLog>;
