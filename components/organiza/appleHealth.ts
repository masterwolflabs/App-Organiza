'use client';

/**
 * 🍎 Apple Salud (MODIFICACIÓN 05, 2026-11-18). Apple Salud SOLO se puede leer desde una app nativa del iPhone con
 * permiso de HealthKit (una página web no puede). Este adaptador usa el plugin `@capgo/capacitor-health` a través
 * del puente de Capacitor de la app del iPhone (`ios-app/`), igual que los avisos usan LocalNotifications.
 * - En la web, el Mac o un iPhone sin la app actualizada: dice que no está disponible (no se finge nada).
 * - Pide permiso solo para LEER pasos, distancia y entrenamientos. No escribe nada en Salud.
 * - No asume Apple Watch: si no hay datos, simplemente no llega nada.
 * - Los entrenamientos de fuerza de Salud se omiten (son los que ya registras en Workout Pro: no duplicar).
 * Pasos para activarlo: docs/TRASPASO.md → «Apple Salud».
 */

type HealthPlugin = {
  isAvailable: () => Promise<{ available: boolean; platform: string; reason: string }>;
  requestAuthorization: (o: { read: string[]; write: string[] }) => Promise<{ readAuthorized: string[]; readDenied: string[] }>;
  queryAggregated: (o: { dataType: string; startDate: string; endDate: string; bucket: 'day'; aggregation: 'sum' }) => Promise<{ samples: { startDate: string; value: number; unit: string }[] }>;
  queryWorkouts: (o: { startDate: string; endDate: string; limit?: number }) => Promise<{ workouts: { workoutType: string; duration: number; totalDistance: number; startDate: string; platformId: string; sourceName: string }[] }>;
};

type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: { Health?: HealthPlugin } };
const cap = (): Cap | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: Cap }).Capacitor);

export type HealthState =
  | { kind: 'web'; text: string }
  | { kind: 'no_plugin'; text: string }
  | { kind: 'unavailable'; text: string }
  | { kind: 'ready'; text: string };

/** ¿Se puede usar Apple Salud aquí? (no pide permisos) */
export async function healthState(): Promise<HealthState> {
  const c = cap();
  if (!c?.isNativePlatform?.() || c.getPlatform?.() !== 'ios') return { kind: 'web', text: 'Apple Salud solo se puede leer desde la app de Master Planner para iPhone. Aquí puedes anotar tu actividad a mano.' };
  const h = c.Plugins?.Health;
  if (!h) return { kind: 'no_plugin', text: 'Tu app del iPhone todavía no trae la conexión con Apple Salud. Llega con la próxima versión de la app.' };
  try {
    const a = await h.isAvailable();
    return a.available ? { kind: 'ready', text: 'Apple Salud disponible.' } : { kind: 'unavailable', text: `Apple Salud no está disponible en este equipo${a.reason ? ` (${a.reason})` : ''}.` };
  } catch {
    return { kind: 'unavailable', text: 'No se pudo consultar Apple Salud en este equipo.' };
  }
}

/** Pide permiso de lectura (pasos, distancia, entrenamientos). Devuelve qué aceptó la persona. */
export async function connectHealth(): Promise<{ ok: boolean; granted: string[]; denied: string[]; text: string }> {
  const h = cap()?.Plugins?.Health;
  if (!h) return { ok: false, granted: [], denied: [], text: 'Apple Salud no está disponible aquí.' };
  try {
    const r = await h.requestAuthorization({ read: ['steps', 'distance', 'workouts'], write: [] });
    // iOS no siempre revela un «no» (por privacidad): si no llega nada al sincronizar, revisa Salud → Fuentes → Master Planner.
    return { ok: true, granted: r.readAuthorized ?? [], denied: r.readDenied ?? [], text: r.readDenied?.length ? `No diste permiso para: ${r.readDenied.join(', ')}.` : 'Permiso listo.' };
  } catch {
    return { ok: false, granted: [], denied: [], text: 'No se pudo pedir el permiso de Apple Salud.' };
  }
}

const KIND: [RegExp, string][] = [
  [/cycl|bik/i, 'bici'],
  [/hik|climb|stair/i, 'cerro'],
  [/walk/i, 'caminata'],
  [/run/i, 'correr'],
  [/swim/i, 'nadar'],
  [/soccer|tennis|basket|volley|padel|squash|badminton|rugby|hockey|martial|box/i, 'deporte'],
];
const SKIP = /strength|weight|crossTraining|coreTraining|highIntensityIntervalTraining/i; // lo de fuerza ya está en Workout Pro

export type HealthRow = { day: string; kind: string; minutes: number | null; intensity: number | null; distance_km: number | null; steps: number | null; source: 'apple_health'; external_id: string; notes: string };
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Lee los últimos `days` días: pasos y distancia por día + entrenamientos (menos los de fuerza). */
export async function readHealth(days = 7): Promise<{ rows: HealthRow[]; text: string }> {
  const h = cap()?.Plugins?.Health;
  if (!h) return { rows: [], text: 'Apple Salud no está disponible aquí.' };
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1));
  const range = { startDate: start.toISOString(), endDate: end.toISOString() };
  const rows: HealthRow[] = [];
  const byDay = new Map<string, { steps: number | null; km: number | null }>();
  try {
    const st = await h.queryAggregated({ dataType: 'steps', ...range, bucket: 'day', aggregation: 'sum' }).catch(() => ({ samples: [] }));
    for (const s of st.samples) byDay.set(isoLocal(new Date(s.startDate)), { steps: Math.round(s.value), km: null });
    const di = await h.queryAggregated({ dataType: 'distance', ...range, bucket: 'day', aggregation: 'sum' }).catch(() => ({ samples: [] }));
    for (const s of di.samples) {
      const d = isoLocal(new Date(s.startDate));
      const km = /km/i.test(s.unit) ? s.value : s.value / 1000;
      byDay.set(d, { steps: byDay.get(d)?.steps ?? null, km: Math.round(km * 100) / 100 });
    }
    for (const [day, v] of byDay) if ((v.steps ?? 0) > 0 || (v.km ?? 0) > 0) rows.push({ day, kind: 'pasos', minutes: null, intensity: null, distance_km: v.km, steps: v.steps, source: 'apple_health', external_id: `ah-steps:${day}`, notes: '' });
    const w = await h.queryWorkouts({ ...range, limit: 100 }).catch(() => ({ workouts: [] }));
    for (const x of w.workouts) {
      if (SKIP.test(x.workoutType)) continue;
      const kind = KIND.find(([re]) => re.test(x.workoutType))?.[1] ?? 'otro';
      rows.push({ day: isoLocal(new Date(x.startDate)), kind, minutes: Math.round(x.duration / 60), intensity: null, distance_km: x.totalDistance ? Math.round((x.totalDistance / 1000) * 100) / 100 : null, steps: null, source: 'apple_health', external_id: `ah-w:${x.platformId}`, notes: x.sourceName ? `Desde ${x.sourceName}` : '' });
    }
    return { rows, text: rows.length ? `Llegaron ${rows.length} ${rows.length === 1 ? 'registro' : 'registros'} de Apple Salud.` : 'Apple Salud no tiene pasos ni actividades de estos días (o falta el permiso en Salud → Fuentes → Master Planner).' };
  } catch {
    return { rows: [], text: 'No se pudo leer Apple Salud. Revisa el permiso en Salud → Fuentes → Master Planner.' };
  }
}
