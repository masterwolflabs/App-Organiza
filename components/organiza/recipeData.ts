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
/** `choices` = a elección (ej. la fruta): cada día sugiere una distinta y se puede pedir «otra» (Emanuel, 2026-11-16). */
export type RecipeIngredient = { name: string; qty: number | null; unit: string; choices?: string[] };
/** `repeat` = por tandas (ej. 10 panqueques): el timer de `minutes` se repite y suena en cada una. */
export type RecipeStep = { id: string; text: string; at: number; minutes: number | null; track: number; repeat?: number | null };
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
export const stepSpan = (s: RecipeStep) => (s.minutes ?? 1) * Math.max(1, s.repeat ?? 1);
export const totalMinutes = (r: Pick<Recipe, 'steps'>) => r.steps.reduce((m, s) => Math.max(m, s.at + stepSpan(s)), 0);

/**
 * Sugerencia del día para un ingrediente a elección: cada día de la semana una distinta (así la semana se
 * reparte sola y la lista de compras sale clara); `skip` = cuántas veces pediste «otra».
 */
export function choiceFor(i: RecipeIngredient, weekday: number, skip = 0, salt = ''): string {
  if (!i.choices?.length) return i.name;
  const h = [...(salt + i.name)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return i.choices[(h + weekday + skip) % i.choices.length];
}

/* ── Recetas de fábrica ──────────────────────────────────────────────────────────────── */

let n = 0;
const st = (text: string, at: number, minutes: number | null = null, track = 0): RecipeStep => ({ id: `s${++n}`, text, at, minutes, track });
const ing = (qty: number | null, unit: string, name: string): RecipeIngredient => ({ qty, unit, name });
type Seed = Omit<Recipe, 'id' | 'made' | 'sort' | 'cover_url'>;

const FRUTAS = ['Plátano', 'Manzana', 'Kiwi', 'Pera', 'Frutillas', 'Mandarina', 'Durazno'];
const FRUTA_MANANA = ['Plátano con crema de maní y manjar', 'Manzana', 'Kiwi', 'Pera', 'Frutillas', 'Mandarina'];
const fruta = (opts = FRUTAS, qty: number | null = 1, unit = 'porción'): RecipeIngredient => ({ qty, unit, name: 'Fruta del día', choices: opts });

/**
 * Las recetas de Emanuel (2026-11-16) — de fábrica y editables: los tiempos son el punto de partida
 * («la 1ª te arriesgas y modificas…»). Desayunos con café siempre; onces/cenas rápidas y solucionadoras;
 * almuerzos de verdad + prácticos y especiales sugeridos por la IA.
 */
export const DEFAULT_RECIPES: Seed[] = [
  /* 🍳 Desayunos */
  {
    category: 'desayuno', title: 'Desayuno A · Huevos duros, jugo de naranja, café y fruta', needs: ['coccion', 'olla', 'cafetera'], servings: 1, kcal: 520, protein: 18,
    notes: 'El café siempre, aunque te lo tomes después. La fruta cambia cada día: si no la tienes, «otra».',
    ingredients: [ing(2, 'unidades', 'Huevos'), ing(3, 'unidades', 'Naranjas'), ing(2, 'cdta', 'Café'), ing(1, 'taza', 'Agua (para el café)'), fruta(FRUTA_MANANA), ing(null, 'a gusto', 'Sal')],
    steps: [st('Pon agua a hervir en una olla', 0, 4), st('Echa los huevos al agua hirviendo', 4, 10), st('Mientras se cuecen: exprime las naranjas', 5, 4, 1), st('Prepara el café', 9, 4, 1), st('Prepara la fruta del día', 9, 3, 2), st('Pasa los huevos a agua fría', 14, 2), st('Pela los huevos, sal y a la mesa', 16, 2)],
  },
  {
    category: 'desayuno', title: 'Huevo frito con tostadas con harto queso y café', needs: ['coccion', 'sartén', 'cafetera'], servings: 1, kcal: 560, protein: 26, notes: '',
    ingredients: [ing(2, 'unidades', 'Huevos'), ing(2, 'rebanadas', 'Pan de molde o marraqueta'), ing(3, 'láminas', 'Queso'), ing(1, 'cdta', 'Aceite o mantequilla'), ing(2, 'cdta', 'Café'), ing(null, 'a gusto', 'Sal')],
    steps: [st('Prepara el café', 0, 4, 1), st('Tuesta el pan con el queso encima hasta que se derrita', 0, 4, 2), st('Calienta el sartén con aceite', 0, 2), st('Fríe los huevos', 2, 4), st('Arma: tostadas con queso + huevos encima, sal', 6, 1)],
  },
  {
    category: 'desayuno', title: 'Perico con marraqueta y café helado', needs: ['coccion', 'sartén', 'cafetera'], servings: 1, kcal: 540, protein: 22, notes: 'Para variarle: el café helado bien cargado.',
    ingredients: [ing(3, 'unidades', 'Huevos'), ing(1, 'unidad', 'Tomate'), ing(0.5, 'unidad', 'Cebolla'), ing(1, 'cdta', 'Aceite'), ing(1, 'unidad', 'Marraqueta'), ing(3, 'cdta', 'Café (cargado)'), ing(1, 'vaso', 'Hielo'), ing(0.5, 'vaso', 'Leche'), ing(null, 'a gusto', 'Azúcar o endulzante'), ing(null, 'a gusto', 'Sal')],
    steps: [st('Prepara el café cargado y déjalo enfriar', 0, 4, 1), st('Pica la cebolla y el tomate', 0, 4), st('Sofríe la cebolla', 4, 3), st('Agrega el tomate', 7, 2), st('Echa los huevos batidos y revuelve hasta que cuajen', 9, 3), st('Mientras: calienta la marraqueta', 9, 2, 2), st('Arma el café helado: hielo, café, leche y azúcar', 10, 2, 1), st('Sirve el perico con la marraqueta', 12, 1)],
  },

  /* 🌙 Onces y cenas */
  {
    category: 'cena', title: 'Dos panes con atún, yogur con plátano y refresco', needs: ['sin-coccion'], servings: 1, kcal: 650, protein: 34, notes: 'Si hay cebollín, que no falte. El plátano va solo si no te lo comiste en la mañana: si no, otra fruta.',
    ingredients: [ing(1, 'lata', 'Atún'), ing(2, 'unidades', 'Pan (marraqueta o hallulla)'), ing(1, 'cda', 'Cebollín picado'), ing(1, 'cda', 'Mayonesa'), ing(1, 'cdta', 'Mostaza'), ing(0.5, 'unidad', 'Limón'), ing(1, 'cdta', 'Aceite de oliva'), ing(1, 'vaso', 'Refresco'), ing(1, 'unidad', 'Yogur'), fruta(['Plátano', 'Frutillas', 'Manzana', 'Durazno']), ing(2, 'cda', 'Cereales'), ing(null, 'a gusto', 'Sal')],
    steps: [st('Escurre el atún', 0, 1), st('Mientras: pica el cebollín', 0, 2, 1), st('Mezcla atún, cebollín, mayonesa, mostaza, limón, aceite de oliva y sal', 2, 3), st('Abre y calienta los panes', 2, 2, 1), st('Rellena los panes', 5, 1), st('Arma el yogur con la fruta y los cereales', 5, 2, 2), st('Sirve con el refresco', 7, 1)],
  },
  {
    category: 'cena', title: 'Pan con doble jamón y queso (con tomate o palta)', needs: ['sin-coccion'], servings: 1, kcal: 620, protein: 30, notes: 'Acompaña con refresco y un yogur con fruta y cereales.',
    ingredients: [ing(2, 'unidades', 'Pan'), ing(4, 'láminas', 'Jamón'), ing(2, 'láminas', 'Queso'), { qty: 1, unit: 'porción', name: 'Tomate o palta', choices: ['Tomate', 'Palta'] }, ing(1, 'vaso', 'Refresco'), ing(1, 'unidad', 'Yogur'), fruta(), ing(2, 'cda', 'Cereales')],
    steps: [st('Corta el tomate o muele la palta', 0, 2), st('Mientras: calienta los panes', 0, 2, 1), st('Arma: doble jamón, queso y tomate o palta', 2, 2), st('Arma el yogur con fruta y cereales', 2, 2, 1), st('Sirve con el refresco', 4, 1)],
  },
  {
    category: 'cena', title: 'Panqueques con tostadas de queso y té', needs: ['coccion', 'sartén'], servings: 2, kcal: 700, protein: 22,
    notes: 'Timer por tandas: cada panqueque tarda lo mismo, así no estás pendiente — suena, lo das vuelta o lo sacas, y al siguiente. Mixtos: dulces y salados.',
    ingredients: [ing(1, 'taza', 'Harina'), ing(1, 'taza', 'Leche'), ing(2, 'unidades', 'Huevos'), ing(1, 'cda', 'Mantequilla'), ing(null, 'una pizca', 'Sal'), { qty: null, unit: 'a gusto', name: 'Relleno', choices: ['Manjar', 'Mermelada', 'Crema de maní', 'Plátano', 'Queso'] }, ing(2, 'rebanadas', 'Pan para tostar'), ing(2, 'láminas', 'Queso'), ing(1, 'bolsita', 'Té')],
    steps: [st('Bate harina, leche, huevos y sal (deja reposar)', 0, 4), st('Calienta el sartén con un poco de mantequilla', 4, 2), { ...st('Cocina un panqueque (dale vuelta a la mitad)', 6, 2), repeat: 8 }, st('Mientras: tostadas con queso', 8, 4, 1), st('Prepara el té', 12, 3, 2), st('Rellena los panqueques: dulces y salados', 22, 3)],
  },
  {
    category: 'cena', title: 'Shawarma o tortillas de pollo', needs: ['coccion', 'sartén'], servings: 2, kcal: 680, protein: 38, notes: '',
    ingredients: [ing(2, 'unidades', 'Pechugas de pollo'), ing(4, 'unidades', 'Tortillas o pan pita'), ing(1, 'unidad', 'Tomate'), ing(1, 'taza', 'Lechuga'), ing(0.5, 'unidad', 'Cebolla morada'), ing(3, 'cda', 'Yogur natural o mayonesa'), ing(1, 'diente', 'Ajo'), ing(1, 'cdta', 'Comino'), ing(1, 'cdta', 'Paprika'), ing(1, 'cda', 'Aceite')],
    steps: [st('Corta el pollo en tiras y condiméntalo (comino, paprika, sal)', 0, 5), st('Dora el pollo en el sartén', 5, 10), st('Mientras: corta tomate, lechuga y cebolla', 5, 6, 1), st('Mezcla yogur con ajo y sal (salsa)', 11, 2, 1), st('Calienta las tortillas', 13, 2, 2), st('Arma: tortilla, salsa, verduras y pollo; enrolla', 15, 3)],
  },
  {
    category: 'cena', title: 'Asadito (quincenal)', needs: ['coccion'], servings: 4, kcal: 950, protein: 60, notes: 'Quincenal es la clave; si se puede semanal, la raja.',
    ingredients: [ing(1.5, 'kg', 'Carne para asar'), ing(4, 'unidades', 'Choripanes (longanizas)'), ing(1, 'bolsa', 'Carbón'), ing(4, 'unidades', 'Marraquetas'), ing(3, 'unidades', 'Tomates'), ing(1, 'unidad', 'Cebolla'), ing(null, 'a gusto', 'Sal parrillera'), ing(null, 'a gusto', 'Pebre o chimichurri')],
    steps: [st('Prende el carbón', 0, 20), st('Mientras: ensalada chilena (tomate + cebolla en pluma)', 0, 10, 1), st('Prepara el pebre', 10, 8, 1), st('Choripanes a la parrilla', 20, 12), st('Carne a la parrilla (dar vuelta a la mitad)', 25, 20, 2), st('Sirve los choripanes de entrada', 32, 3), st('Deja reposar la carne y corta', 45, 5)],
  },
  {
    category: 'cena', title: 'Completos', needs: ['coccion', 'olla'], servings: 2, kcal: 720, protein: 22, notes: 'Rápidos, sencillos y solucionadores. También choripanes o perros calientes según el día.',
    ingredients: [ing(4, 'unidades', 'Vienesas'), ing(4, 'unidades', 'Pan de completo'), ing(1, 'unidad', 'Palta'), ing(2, 'unidades', 'Tomates'), ing(null, 'a gusto', 'Mayonesa'), ing(null, 'a gusto', 'Chucrut (opcional)')],
    steps: [st('Hierve las vienesas', 0, 6), st('Mientras: muele la palta con sal', 0, 3, 1), st('Pica el tomate', 3, 3, 1), st('Calienta los panes', 4, 2, 2), st('Arma: vienesa, tomate, palta y mayo', 6, 3)],
  },

  /* 🥪 Meriendas */
  {
    category: 'merienda', title: 'Yogur con fruta y cereales', needs: ['sin-coccion'], servings: 1, kcal: 260, protein: 10, notes: '',
    ingredients: [ing(1, 'unidad', 'Yogur'), fruta(), ing(3, 'cda', 'Cereales')],
    steps: [st('Corta la fruta del día', 0, 2), st('Sirve el yogur con la fruta y los cereales', 2, 1)],
  },
  {
    category: 'merienda', title: 'Fruta con crema', needs: ['sin-coccion'], servings: 1, kcal: 280, protein: 4, notes: 'Aquí entra la fruta de distintos tipos.',
    ingredients: [fruta(['Frutillas', 'Durazno', 'Plátano', 'Kiwi', 'Mango'], 1, 'taza'), ing(3, 'cda', 'Crema')],
    steps: [st('Lava y corta la fruta', 0, 3), st('Sirve con la crema', 3, 1)],
  },
  {
    category: 'merienda', title: 'Frutos secos (snack no tan dulce)', needs: ['sin-coccion'], servings: 1, kcal: 200, protein: 6, notes: '',
    ingredients: [{ qty: 1, unit: 'puñado', name: 'Frutos secos', choices: ['Almendras', 'Nueces', 'Maní', 'Mix de frutos secos'] }],
    steps: [st('Sirve un puñado', 0, 1)],
  },

  /* 🍽️ Almuerzos */
  {
    category: 'almuerzo', title: 'Arroz con pollo, ensalada, jugo verde y fruta con crema', needs: ['coccion', 'olla', 'sartén', 'licuadora'], servings: 2, kcal: 850, protein: 45, notes: 'El jugo verde frío y cargado.',
    ingredients: [ing(1, 'taza', 'Arroz'), ing(2, 'tazas', 'Agua'), ing(2, 'unidades', 'Pechugas de pollo'), ing(1, 'unidad', 'Cebolla'), ing(1, 'unidad', 'Zanahoria'), ing(2, 'cda', 'Aceite'), ing(2, 'tazas', 'Lechuga'), ing(1, 'unidad', 'Tomate'), ing(1, 'taza', 'Espinaca'), ing(1, 'unidad', 'Manzana verde'), ing(0.5, 'unidad', 'Pepino'), ing(1, 'unidad', 'Limón'), fruta(['Frutillas', 'Durazno', 'Plátano', 'Kiwi'], 1, 'taza'), ing(3, 'cda', 'Crema'), ing(null, 'a gusto', 'Sal y pimienta')],
    steps: [st('Lava el arroz y ponlo a cocer con agua y sal', 0, 18), st('Mientras: pica cebolla y zanahoria; corta el pollo', 1, 7, 1), st('Dora el pollo con la cebolla y la zanahoria', 8, 10, 1), st('Licúa el jugo verde (espinaca, manzana, pepino, limón, hielo)', 2, 4, 2), st('Arma la ensalada', 8, 5, 2), st('Prepara la fruta con crema (al refri)', 13, 3, 2), st('Junta el arroz con el pollo y sirve', 18, 3)],
  },
  {
    category: 'almuerzo', title: 'Fettuccine en salsa blanca con champiñones', needs: ['coccion', 'olla', 'sartén'], servings: 2, kcal: 780, protein: 24, notes: 'Un clásico.',
    ingredients: [ing(250, 'g', 'Fettuccine'), ing(200, 'g', 'Champiñones'), ing(1, 'cda', 'Mantequilla'), ing(1, 'cda', 'Harina'), ing(1.5, 'tazas', 'Leche'), ing(1, 'diente', 'Ajo'), ing(null, 'a gusto', 'Queso rallado'), ing(null, 'a gusto', 'Sal, pimienta y nuez moscada')],
    steps: [st('Pon agua con sal a hervir', 0, 6), st('Mientras: lamina los champiñones y pica el ajo', 0, 4, 1), st('Saltea champiñones y ajo en mantequilla', 4, 5, 1), st('Echa el fettuccine al agua hirviendo', 6, 10), st('Salsa: harina + leche de a poco, revolviendo hasta espesar', 9, 6, 1), st('Cuela, mezcla con la salsa y sirve con queso', 16, 3)],
  },
  {
    category: 'almuerzo', title: 'Chuleta con arroz', needs: ['coccion', 'olla', 'sartén'], servings: 2, kcal: 760, protein: 42, notes: '',
    ingredients: [ing(2, 'unidades', 'Chuletas de cerdo'), ing(1, 'taza', 'Arroz'), ing(2, 'tazas', 'Agua'), ing(1, 'cda', 'Aceite'), ing(1, 'unidad', 'Tomate'), ing(null, 'a gusto', 'Sal, pimienta y ajo')],
    steps: [st('Pon el arroz a cocer con agua y sal', 0, 18), st('Mientras: condimenta las chuletas', 1, 3, 1), st('Chuletas al sartén (vuelta a la mitad)', 8, 10, 1), st('Corta el tomate para acompañar', 12, 3, 2), st('Sirve', 18, 2)],
  },
  // Sugeridos por la IA: ⚡ prácticos y ✨ especiales.
  {
    category: 'almuerzo', title: '⚡ Pollo a la plancha con puré', needs: ['coccion', 'olla', 'sartén'], servings: 2, kcal: 640, protein: 45, notes: '⚡ Práctico (sugerido por la IA).',
    ingredients: [ing(2, 'unidades', 'Pechugas de pollo'), ing(4, 'unidades', 'Papas'), ing(0.5, 'taza', 'Leche'), ing(1, 'cda', 'Mantequilla'), ing(null, 'a gusto', 'Sal, pimienta y orégano')],
    steps: [st('Pela y corta las papas; ponlas a cocer', 0, 20), st('Mientras: aplana y condimenta el pollo', 2, 4, 1), st('Pollo a la plancha (vuelta a la mitad)', 10, 10, 1), st('Muele las papas con leche y mantequilla', 20, 3), st('Sirve', 23, 2)],
  },
  {
    category: 'almuerzo', title: '⚡ Tallarines a la boloñesa', needs: ['coccion', 'olla', 'sartén'], servings: 3, kcal: 720, protein: 32, notes: '⚡ Práctico (sugerido por la IA).',
    ingredients: [ing(300, 'g', 'Tallarines'), ing(400, 'g', 'Carne molida'), ing(1, 'unidad', 'Cebolla'), ing(1, 'diente', 'Ajo'), ing(400, 'g', 'Salsa de tomate'), ing(1, 'cda', 'Aceite'), ing(null, 'a gusto', 'Queso rallado')],
    steps: [st('Pon agua con sal a hervir', 0, 6), st('Mientras: pica cebolla y ajo', 0, 4, 1), st('Sofríe y dora la carne molida', 4, 8, 1), st('Echa los tallarines', 6, 9), st('Agrega la salsa de tomate a la carne y deja reducir', 12, 6, 1), st('Cuela, mezcla y sirve con queso', 18, 2)],
  },
  {
    category: 'almuerzo', title: '⚡ Charquicán', needs: ['coccion', 'olla'], servings: 4, kcal: 560, protein: 28, notes: '⚡ Práctico y bien chileno (sugerido por la IA). Con huevo frito encima, mejor.',
    ingredients: [ing(400, 'g', 'Carne molida'), ing(4, 'unidades', 'Papas'), ing(500, 'g', 'Zapallo'), ing(1, 'taza', 'Choclo'), ing(1, 'taza', 'Arvejas'), ing(1, 'unidad', 'Cebolla'), ing(1, 'cdta', 'Comino'), ing(1, 'cdta', 'Paprika')],
    steps: [st('Pela y corta papas y zapallo', 0, 8), st('Mientras: sofríe cebolla y dora la carne con comino y paprika', 0, 10, 1), st('Agrega papas, zapallo y un poco de agua', 10, 20), st('Suma choclo y arvejas', 25, 5, 1), st('Muele un poco y sirve', 30, 3)],
  },
  {
    category: 'almuerzo', title: '✨ Salmón al horno con papas', needs: ['horno'], servings: 2, kcal: 780, protein: 42, notes: '✨ Especial (sugerido por la IA).',
    ingredients: [ing(2, 'trozos', 'Salmón'), ing(5, 'unidades', 'Papas chicas'), ing(1, 'unidad', 'Limón'), ing(2, 'cda', 'Aceite de oliva'), ing(1, 'diente', 'Ajo'), ing(null, 'a gusto', 'Sal, pimienta y eneldo')],
    steps: [st('Precalienta el horno a 200 °C', 0, 10), st('Mientras: corta las papas en gajos y aliña', 0, 6, 1), st('Papas al horno', 10, 30), st('Aliña el salmón con limón, ajo y eneldo', 25, 4, 1), st('Salmón al horno junto a las papas', 28, 14), st('Sirve', 42, 2)],
  },
  {
    category: 'almuerzo', title: '✨ Lomo saltado', needs: ['coccion', 'sartén', 'olla'], servings: 2, kcal: 820, protein: 40, notes: '✨ Especial (sugerido por la IA): fuego alto y rápido.',
    ingredients: [ing(400, 'g', 'Lomo de vacuno en tiras'), ing(1, 'unidad', 'Cebolla morada'), ing(2, 'unidades', 'Tomates'), ing(2, 'cda', 'Salsa de soya'), ing(1, 'cda', 'Vinagre'), ing(3, 'unidades', 'Papas (para fritas)'), ing(1, 'taza', 'Arroz'), ing(null, 'a gusto', 'Cilantro')],
    steps: [st('Pon el arroz a cocer', 0, 18), st('Corta las papas en bastones y fríelas', 0, 15, 1), st('Corta cebolla y tomate en gajos', 3, 5, 2), st('Saltea la carne a fuego alto', 12, 4, 2), st('Agrega cebolla, tomate, soya y vinagre', 16, 3, 2), st('Junta con las papas y sirve con arroz y cilantro', 19, 2)],
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
export const mealFromRecipe = (r: Recipe, weekday = 0) => ({
  recipe_id: r.id,
  title: r.title,
  cover_url: r.cover_url,
  kcal: r.kcal,
  protein: r.protein,
  // Lo «a elección» entra ya decidido para ese día (la lista de compras reparte la fruta en la semana).
  ingredients: r.ingredients.map((i) => ({ name: i.choices?.length ? choiceFor(i, weekday, 0, r.title) : i.name, qty: i.qty === null ? i.unit : `${String(i.qty).replace('.', ',')} ${i.unit}`.trim() })),
  steps: r.steps.map((s) => s.text).join('\n'),
});
