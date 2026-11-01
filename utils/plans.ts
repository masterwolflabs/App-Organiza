// Master Finanzas plans — FASE 1: the plans exist and the app reacts to them,
// but there are NO payments yet (Fase 2: gateway, subscriptions, webhooks…).
// A user's plan lives in the `user_plans` table and is assigned manually (SQL
// editor) during this test phase; no row = FREE. Pure data: client + server.

export type PlanId = 'free' | 'go' | 'pro' | 'max';

export interface PlanDef {
  id: PlanId;
  name: string;
  priceUSD: number;
  /** Price of the first month (Emanuel, 2026-10-26: "que se enamore del plan"); from the 2nd month, priceUSD. */
  introPriceUSD?: number;
  tagline: string;
  /** Short benefit list for the Planes card (keep it to ~4-5 lines). */
  benefits: string[];
  /** What this plan does NOT include (shown crossed out). */
  missing: string[];
  /** Master Finanzas Credits per calendar month (1 credit ≈ US$0.001 of AI cost, see lib/ai/usage.ts). */
  monthlyCredits: number;
  storageGB: number;
  /** Free shows (non-intrusive) ads. */
  ads: boolean;
  /** Engine picker ids allowed (utils/aiCatalog ENGINE_OPTIONS). */
  engines: string[];
  /** Report kinds allowed in "Reporte financiero". */
  reports: ('hoy' | 'semanal' | 'mensual')[];
  recommended?: boolean;
}

const BASIC_ENGINES = ['auto', 'rapido', 'estandar', 'gpt-4o-mini'];
const ALL_ENGINES = [...BASIC_ENGINES, 'profundo', 'gpt-4o', 'claude-haiku-4-5', 'claude-sonnet-5'];

export const PLANS: PlanDef[] = [
  {
    id: 'free',
    name: 'Free',
    priceUSD: 0,
    tagline: 'Ordena tus finanzas sin pagar nada.',
    benefits: ['Cuentas, movimientos, deudas y notas', 'Chat y contabilidad', 'IA básica · 300 créditos al mes', 'Reporte de hoy y semanal', '500 MB de almacenamiento'],
    missing: ['Incluye anuncios', 'Sin modo Profundo ni motores premium', 'Sin expediente mensual'],
    monthlyCredits: 300,
    storageGB: 0.5,
    ads: true,
    engines: BASIC_ENGINES,
    reports: ['hoy', 'semanal'],
  },
  {
    id: 'go',
    name: 'Go',
    priceUSD: 4.99,
    tagline: 'Más IA y cero anuncios.',
    benefits: ['Todo lo esencial de Free', 'Sin anuncios', '2.000 créditos al mes', 'Claude Haiku en el chat', '2 GB de almacenamiento'],
    missing: ['Sin modo Profundo ni motores premium', 'Sin expediente mensual'],
    monthlyCredits: 2000,
    storageGB: 2,
    ads: false,
    engines: [...BASIC_ENGINES, 'claude-haiku-4-5'],
    reports: ['hoy', 'semanal'],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceUSD: 19.99,
    introPriceUSD: 9.99,
    tagline: 'Master Finanzas en serio.',
    benefits: ['Sin anuncios', '8.000 créditos al mes', 'Todos los motores y modo Profundo', 'Expediente mensual y reportes avanzados', 'Más documentos procesados · 10 GB'],
    missing: [],
    monthlyCredits: 8000,
    storageGB: 10,
    ads: false,
    engines: ALL_ENGINES,
    reports: ['hoy', 'semanal', 'mensual'],
    recommended: true,
  },
  {
    id: 'max',
    name: 'Max',
    priceUSD: 79.99,
    introPriceUSD: 34.99,
    tagline: 'Para empresas y uso intensivo.',
    benefits: ['Todo lo de Pro', '30.000 créditos al mes', 'Módulo Empresa y tu equipo (contador, pagos, analista)', '50 GB de almacenamiento', 'Primero en nuevas funciones premium'],
    missing: [],
    monthlyCredits: 30000,
    storageGB: 50,
    ads: false,
    engines: ALL_ENGINES,
    reports: ['hoy', 'semanal', 'mensual'],
  },
];

export const planById = (id: unknown): PlanDef => PLANS.find((p) => p.id === id) ?? PLANS[0];

/** Cheapest plan that allows an engine / report kind — for "Disponible en PRO" hints. */
export const minPlanForEngine = (engine: string) => PLANS.find((p) => p.engines.includes(engine)) ?? PLANS[PLANS.length - 1];
export const minPlanForReport = (kind: string) => PLANS.find((p) => (p.reports as string[]).includes(kind)) ?? PLANS[PLANS.length - 1];

export const formatPlanUSD = (n: number) => (n === 0 ? 'US$0' : `US$${n.toLocaleString('es-CL', { minimumFractionDigits: n % 1 ? 2 : 0 })}`);
export const formatPlanPrice = (p: PlanDef) => formatPlanUSD(p.priceUSD);

/** Credit packs (Emanuel, 2026-10-26 — "súper generoso"): extra credits any plan can buy when the month's run out. Not sold yet (Planes Fase 2). */
export const CREDIT_PACKS: { usd: number; credits: number }[] = [
  { usd: 3, credits: 2000 },
  { usd: 10, credits: 7000 },
  { usd: 20, credits: 15000 },
  { usd: 100, credits: 80000 },
];

/** First day of the current month (UTC) — credits reset monthly. */
export function monthStartISO(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
