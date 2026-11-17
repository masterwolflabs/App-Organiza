'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDb } from '@/components/organiza/db';
import { useSpace } from '@/components/organiza/space';

/**
 * 🥗 Nutrition Pro — el recetario (Emanuel, 2026-11-16, Daily planner-cocina-recetas). Tabla
 * `organiza_recipes` (docs/sql/42). Una receta tiene categoría, portada, requisitos (🔥 cocción, ☕ cafetera…),
 * ingredientes y pasos en LÍNEA DE TIEMPO: cada paso parte en un minuto (`at`), puede tener timer
 * (`minutes`) y va en un carril (`track`) para hacer cosas en paralelo («mientras se cuece el arroz,
 * pica la cebolla»). Viene con recetas de fábrica que la persona edita o borra: «la 1ª te arriesgas y
 * modificas, la 2ª te certificas, la 3ª te beneficias».
 */

export type RecipeCategory = 'desayuno' | 'almuerzo' | 'cena' | 'merienda';
export type RecipeIngredient = { name: string; qty: number | null; unit: string };
export type RecipeStep = { id: string; text: string; at: number; minutes: number | null; track: number };
export type Recipe = {
  id: string;
  category: RecipeCategory;
  title: string;
  cover_url: string | null;
  needs: string[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  servings: number | null;
  kcal: number | null;
  protein: number | null;
  notes: string;
  made: number;
  sort: number;
};

export const CATEGORIES: { id: RecipeCategory; label: string; emoji: string; slots: string[] }[] = [
  { id: 'desayuno', label: 'Desayunos', emoji: '🍳', slots: ['desayuno'] },
  { id: 'almuerzo', label: 'Almuerzos', emoji: '🍽️', slots: ['almuerzo'] },
  { id: 'cena', label: 'Cenas', emoji: '🌙', slots: ['cena'] },
  { id: 'merienda', label: 'Meriendas', emoji: '🥪', slots: ['colacion-am', 'colacion-pm'] },
];
export const categoryOfSlot = (slot: string | null | undefined): RecipeCategory | null => CATEGORIES.find((c) => slot && c.slots.includes(slot))?.id ?? null;

/** Requisitos básicos: el ícono que sale en la tarjeta. */
export const NEEDS: { id: string; emoji: string; label: string }[] = [
  { id: 'coccion', emoji: '🔥', label: 'Con cocción' },
  { id: 'horno', emoji: '♨️', label: 'Horno' },
  { id: 'cafetera', emoji: '☕', label: 'Cafetera' },
  { id: 'licuadora', emoji: '🥤', label: 'Licuadora' },
  { id: 'microondas', emoji: '📡', label: 'Microondas' },
  { id: 'sartén', emoji: '🍳', label: 'Sartén' },
  { id: 'olla', emoji: '🍲', label: 'Olla' },
  { id: 'sin-coccion', emoji: '🥗', label: 'Sin cocción' },
];
export const needOf = (id: string) => NEEDS.find((n) => n.id === id) ?? { id, emoji: '•', label: id };

/* ── Medidas: ver cada ingrediente en otra unidad (aproximado) ─────────────────────── */

export type UnitMode = 'original' | 'gramos' | 'cucharas' | 'tazas';
export const UNIT_MODES: { id: UnitMode; label: string }[] = [
  { id: 'original', label: 'Como viene' },
  { id: 'gramos', label: 'Gramos / ml' },
  { id: 'cucharas', label: 'Cucharas' },
  { id: 'tazas', label: 'Tazas / vasos' },
];
const ML: Record<string, number> = { ml: 1, l: 1000, litro: 1000, litros: 1000, taza: 240, tazas: 240, vaso: 200, vasos: 200, cda: 15, cdas: 15, cucharada: 15, cucharadas: 15, cdta: 5, cdtas: 5, cucharadita: 5, cucharaditas: 5 };
const G: Record<string, number> = { g: 1, gr: 1, gramos: 1, kg: 1000 };
// Densidad aproximada (g por ml) de lo más común; sin dato, se trata como agua (1).
const DENSITY: [RegExp, number][] = [
  [/arroz/, 0.77], [/az[uú]car/, 0.85], [/harina/, 0.53], [/avena/, 0.36], [/aceite/, 0.92], [/leche|agua|jugo|caldo|caf[eé]/, 1],
  [/mantequilla|margarina/, 0.96], [/sal\b/, 1.2], [/miel/, 1.42], [/yogur/, 1.03], [/queso rallado/, 0.4], [/lenteja|poroto|garbanzo/, 0.8],
];
const density = (name: string) => DENSITY.find(([re]) => re.test(name.toLowerCase()))?.[1] ?? 1;
const round = (n: number) => (n >= 100 ? Math.round(n / 5) * 5 : n >= 10 ? Math.round(n) : Math.round(n * 4) / 4);
const nice = (n: number) => String(round(n)).replace('.', ',');

/** «200 g» · «1 taza» · «2 unidades»: el ingrediente en la medida elegida (lo que no se puede convertir queda igual). */
export function showQty(i: RecipeIngredient, mode: UnitMode): string {
  const u = i.unit.trim().toLowerCase();
  const base = i.qty === null ? i.unit : `${nice(i.qty)} ${i.unit}`.trim();
  if (mode === 'original' || i.qty === null) return base;
  const ml = ML[u] !== undefined ? i.qty * ML[u] : G[u] !== undefined ? (i.qty * G[u]) / density(i.name) : null;
  if (ml === null) return base;
  const liquid = /leche|agua|jugo|caldo|aceite|caf[eé]|vino|crema/.test(i.name.toLowerCase());
  if (mode === 'gramos') return liquid ? `${nice(ml)} ml` : `${nice(ml * density(i.name))} g`;
  if (mode === 'cucharas') return ml / 15 >= 1 ? `${nice(ml / 15)} cda` : `${nice(ml / 5)} cdta`;
  return `${nice(ml / 240)} taza${ml / 240 > 1 ? 's' : ''}`;
}

/** Cuánto dura la receta: el final del último paso. */
export const totalMinutes = (r: Pick<Recipe, 'steps'>) => r.steps.reduce((m, s) => Math.max(m, s.at + (s.minutes ?? 1)), 0);

/* ── Recetas de fábrica ──────────────────────────────────────────────────────────────── */

let n = 0;
const st = (text: string, at: number, minutes: number | null = null, track = 0): RecipeStep => ({ id: `s${++n}`, text, at, minutes, track });
const ing = (qty: number | null, unit: string, name: string): RecipeIngredient => ({ qty, unit, name });
type Seed = Omit<Recipe, 'id' | 'made' | 'sort' | 'cover_url'>;

export const DEFAULT_RECIPES: Seed[] = [
  {
    category: 'desayuno', title: 'Huevos duros con café', needs: ['coccion', 'olla', 'cafetera'], servings: 1, kcal: 160, protein: 13, notes: 'Si te gustan con la yema más blanda, baja el timer a 8 min.',
    ingredients: [ing(2, 'unidades', 'Huevos'), ing(1, 'taza', 'Agua (para el café)'), ing(2, 'cdta', 'Café molido'), ing(null, 'a gusto', 'Sal')],
    steps: [st('Pon agua a hervir en una olla', 0, 4), st('Echa los huevos con cuidado al agua hirviendo', 4, 10), st('Mientras se cuecen: prepara la cafetera y el café', 5, 5, 1), st('Pasa los huevos a agua fría', 14, 2), st('Pela y sirve con sal', 16, 2)],
  },
  {
    category: 'desayuno', title: 'Jugo de naranja con huevos duros', needs: ['coccion', 'olla', 'licuadora'], servings: 1, kcal: 260, protein: 13, notes: '',
    ingredients: [ing(2, 'unidades', 'Huevos'), ing(3, 'unidades', 'Naranjas'), ing(null, 'a gusto', 'Sal')],
    steps: [st('Pon agua a hervir', 0, 4), st('Echa los huevos al agua hirviendo', 4, 10), st('Mientras: exprime las naranjas', 5, 5, 1), st('Pasa los huevos a agua fría', 14, 2), st('Pela, sirve y acompaña con el jugo', 16, 2)],
  },
  {
    category: 'desayuno', title: 'Avena con plátano', needs: ['coccion', 'olla'], servings: 1, kcal: 350, protein: 12, notes: '',
    ingredients: [ing(0.5, 'taza', 'Avena'), ing(1, 'taza', 'Leche'), ing(1, 'unidad', 'Plátano'), ing(1, 'cdta', 'Miel'), ing(null, 'una pizca', 'Canela')],
    steps: [st('Calienta la leche a fuego medio', 0, 3), st('Agrega la avena y revuelve', 3, 5), st('Mientras: corta el plátano en rodajas', 3, 3, 1), st('Sirve con plátano, miel y canela', 8, 2)],
  },
  {
    category: 'almuerzo', title: 'Arroz con pollo', needs: ['coccion', 'olla', 'sartén'], servings: 2, kcal: 620, protein: 40, notes: '',
    ingredients: [ing(1, 'taza', 'Arroz'), ing(2, 'tazas', 'Agua'), ing(2, 'unidades', 'Pechugas de pollo'), ing(1, 'unidad', 'Cebolla'), ing(1, 'unidad', 'Zanahoria'), ing(2, 'cda', 'Aceite'), ing(null, 'a gusto', 'Sal y pimienta')],
    steps: [st('Lava el arroz y ponlo a cocer con el agua y sal', 0, 18), st('Mientras: pica la cebolla y la zanahoria', 1, 5, 1), st('Corta el pollo en cubos y salpimienta', 6, 4, 1), st('Dora el pollo con la cebolla en el sartén', 10, 10, 2), st('Junta el arroz con el pollo y sirve', 20, 3)],
  },
  {
    category: 'almuerzo', title: 'Tallarines con salsa de tomate', needs: ['coccion', 'olla', 'sartén'], servings: 2, kcal: 560, protein: 18, notes: '',
    ingredients: [ing(200, 'g', 'Tallarines'), ing(1, 'unidad', 'Cebolla'), ing(1, 'diente', 'Ajo'), ing(400, 'g', 'Tomate en conserva'), ing(1, 'cda', 'Aceite'), ing(null, 'a gusto', 'Queso rallado')],
    steps: [st('Pon agua con sal a hervir', 0, 6), st('Mientras: pica cebolla y ajo', 1, 4, 1), st('Sofríe cebolla y ajo', 5, 5, 1), st('Echa los tallarines al agua hirviendo', 6, 9), st('Agrega el tomate a la salsa y deja reducir', 10, 8, 1), st('Cuela los tallarines, mezcla con la salsa y sirve con queso', 18, 3)],
  },
  {
    category: 'almuerzo', title: 'Lentejas guisadas', needs: ['coccion', 'olla'], servings: 3, kcal: 480, protein: 24, notes: 'Si las dejas remojando la noche anterior, se cuecen en 20 min.',
    ingredients: [ing(1, 'taza', 'Lentejas'), ing(1, 'unidad', 'Cebolla'), ing(1, 'unidad', 'Zanahoria'), ing(1, 'unidad', 'Papa'), ing(4, 'tazas', 'Agua'), ing(1, 'cdta', 'Comino'), ing(1, 'cda', 'Aceite')],
    steps: [st('Pon las lentejas a cocer en el agua', 0, 30), st('Mientras: pica cebolla, zanahoria y papa', 1, 8, 1), st('Sofríe la cebolla con comino', 10, 6, 1), st('Agrega el sofrito, la zanahoria y la papa a las lentejas', 16, 14), st('Ajusta la sal y sirve', 30, 2)],
  },
  {
    category: 'cena', title: 'Omelette de queso', needs: ['coccion', 'sartén'], servings: 1, kcal: 300, protein: 20, notes: '',
    ingredients: [ing(3, 'unidades', 'Huevos'), ing(40, 'g', 'Queso'), ing(1, 'cdta', 'Mantequilla'), ing(null, 'a gusto', 'Sal y pimienta')],
    steps: [st('Bate los huevos con sal y pimienta', 0, 2), st('Mientras: calienta el sartén con mantequilla', 0, 2, 1), st('Echa los huevos y cocina a fuego bajo', 2, 3), st('Agrega el queso, dobla y deja 1 minuto más', 5, 1), st('Sirve', 6, 1)],
  },
  {
    category: 'cena', title: 'Ensalada con atún', needs: ['sin-coccion'], servings: 1, kcal: 330, protein: 28, notes: '',
    ingredients: [ing(1, 'lata', 'Atún'), ing(2, 'tazas', 'Lechuga'), ing(1, 'unidad', 'Tomate'), ing(0.5, 'unidad', 'Palta'), ing(1, 'cda', 'Aceite de oliva'), ing(null, 'a gusto', 'Limón y sal')],
    steps: [st('Lava y corta la lechuga', 0, 3), st('Mientras: corta tomate y palta', 0, 3, 1), st('Escurre el atún', 3, 1), st('Mezcla todo y aliña con aceite, limón y sal', 4, 2)],
  },
  {
    category: 'cena', title: 'Sopa de verduras', needs: ['coccion', 'olla'], servings: 3, kcal: 180, protein: 6, notes: '',
    ingredients: [ing(1, 'unidad', 'Zapallo italiano'), ing(1, 'unidad', 'Zanahoria'), ing(1, 'unidad', 'Papa'), ing(1, 'unidad', 'Cebolla'), ing(4, 'tazas', 'Caldo o agua'), ing(null, 'a gusto', 'Sal')],
    steps: [st('Pon el caldo a calentar', 0, 5), st('Mientras: pela y corta todas las verduras', 0, 8, 1), st('Echa las verduras al caldo', 8, 15), st('Ajusta la sal y sirve', 23, 2)],
  },
  {
    category: 'merienda', title: 'Yogur con fruta y granola', needs: ['sin-coccion'], servings: 1, kcal: 250, protein: 10, notes: '',
    ingredients: [ing(1, 'taza', 'Yogur natural'), ing(1, 'taza', 'Frutillas o fruta de la estación'), ing(3, 'cda', 'Granola')],
    steps: [st('Lava y corta la fruta', 0, 3), st('Sirve el yogur con la fruta y la granola encima', 3, 1)],
  },
  {
    category: 'merienda', title: 'Pan con palta y huevo', needs: ['coccion', 'sartén'], servings: 1, kcal: 320, protein: 12, notes: '',
    ingredients: [ing(1, 'unidad', 'Marraqueta o pan'), ing(0.5, 'unidad', 'Palta'), ing(1, 'unidad', 'Huevo'), ing(null, 'a gusto', 'Sal')],
    steps: [st('Fríe el huevo', 0, 4), st('Mientras: tuesta el pan', 0, 3, 1), st('Muele la palta con sal', 1, 2, 2), st('Arma: pan, palta y el huevo encima', 4, 1)],
  },
  {
    category: 'merienda', title: 'Batido de plátano', needs: ['licuadora', 'sin-coccion'], servings: 1, kcal: 280, protein: 10, notes: '',
    ingredients: [ing(1, 'unidad', 'Plátano'), ing(1, 'vaso', 'Leche'), ing(1, 'cda', 'Avena'), ing(1, 'cdta', 'Miel')],
    steps: [st('Pela y corta el plátano', 0, 1), st('Licúa todo 1 minuto', 1, 1), st('Sirve', 2, 1)],
  },
];

/* ── Datos ──────────────────────────────────────────────────────────────────────────── */

const SEEDED = (space: string) => `organiza-recetas-de-fabrica:${space}`;

export function useRecipes() {
  const db = useDb();
  const { space } = useSpace();
  const [rows, setRows] = useState<Recipe[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    let r = await db.select<Recipe>('organiza_recipes', { space });
    // La primera vez: las recetas de fábrica (si las borras todas, no vuelven).
    let seeded = false;
    try {
      seeded = !!localStorage.getItem(SEEDED(space));
    } catch {}
    if (!r.length && !seeded) {
      const made = await db.insert<Recipe>('organiza_recipes', DEFAULT_RECIPES.map((x, i) => ({ ...x, space, sort: i })));
      r = made;
      try {
        localStorage.setItem(SEEDED(space), '1');
      } catch {}
    } else if (r.length) {
      try {
        localStorage.setItem(SEEDED(space), '1');
      } catch {}
    }
    setRows(r.sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, 'es')));
    setReady(true);
  }, [db, space]);
  useEffect(() => {
    load();
  }, [load]);

  const add = useCallback(async (category: RecipeCategory, p: Partial<Recipe> = {}) => {
    const [made] = await db.insert<Recipe>('organiza_recipes', { space, category, title: '', needs: [], ingredients: [], steps: [], notes: '', sort: rows.length, ...p });
    if (made) setRows((l) => [...l, made]);
    return made ?? null;
  }, [db, rows.length, space]);

  const patch = useCallback(async (id: string, p: Partial<Recipe>) => {
    setRows((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
    await db.update('organiza_recipes', { id }, { ...p, updated_at: new Date().toISOString() } as Record<string, unknown>);
  }, [db]);

  const remove = useCallback(async (id: string) => {
    setRows((l) => l.filter((x) => x.id !== id));
    await db.remove('organiza_recipes', { id });
  }, [db]);

  return { rows, ready, add, patch, remove, reload: load };
}
export type RecipesApi = ReturnType<typeof useRecipes>;

/** Lo que un plato de la semana copia de su receta (así la grilla y la lista de compras siguen igual). */
export const mealFromRecipe = (r: Recipe) => ({
  recipe_id: r.id,
  title: r.title,
  cover_url: r.cover_url,
  kcal: r.kcal,
  protein: r.protein,
  ingredients: r.ingredients.map((i) => ({ name: i.name, qty: i.qty === null ? i.unit : `${String(i.qty).replace('.', ',')} ${i.unit}`.trim() })),
  steps: r.steps.map((s) => s.text).join('\n'),
});
