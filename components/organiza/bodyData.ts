'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDb } from '@/components/organiza/db';
import { useSpace } from '@/components/organiza/space';
import { supabase } from '@/lib/supabaseClient';
import { authFetch } from '@/lib/authFetch';
import { compressImageForNote } from '@/utils/image';

/**
 * 📏 Perfil físico de Workout Pro (Emanuel, 2026-11-18) — SQL 50.
 * Cada registro es una medición NUEVA en `organiza_body_logs` (el historial nunca se sobrescribe al registrar;
 * corregir un registro puntual sí se puede). Todo es opcional y nada se estima. Las fotos van al bucket PRIVADO
 * `organiza-body` (carpeta <uid>/<registro>/) y se ven con permisos firmados por nuestro servidor por 10 minutos.
 * Frecuencia y recordatorio en `organiza_prefs.body_check`.
 */

export type View = 'frontal' | 'lateral' | 'posterior';
export const VIEWS: { id: View; label: string }[] = [
  { id: 'frontal', label: 'Frontal' },
  { id: 'lateral', label: 'Lateral' },
  { id: 'posterior', label: 'Posterior' },
];

export type Metric = 'weight' | 'height' | 'age' | 'waist' | 'chest' | 'arm' | 'leg' | 'hip' | 'body_fat' | 'muscle_mass';
export type BodyLog = { id: string; day: string; notes: string; photos: Partial<Record<View, string>>; created_at?: string } & Partial<Record<Metric, number | null>>;

export const METRICS: { id: Metric; label: string; unit: string; group: 'base' | 'medidas' | 'composicion'; help?: string; step: number; min: number; max: number }[] = [
  { id: 'weight', label: 'Peso', unit: 'kg', group: 'base', step: 0.1, min: 20, max: 300 },
  { id: 'height', label: 'Estatura', unit: 'cm', group: 'base', step: 0.5, min: 100, max: 240 },
  { id: 'age', label: 'Edad', unit: 'años', group: 'base', step: 1, min: 10, max: 110 },
  { id: 'waist', label: 'Cintura', unit: 'cm', group: 'medidas', help: 'A la altura del ombligo', step: 0.5, min: 30, max: 250 },
  { id: 'chest', label: 'Pecho', unit: 'cm', group: 'medidas', help: 'Por la parte más ancha', step: 0.5, min: 40, max: 250 },
  { id: 'arm', label: 'Brazo', unit: 'cm', group: 'medidas', help: 'Al medio del brazo', step: 0.5, min: 10, max: 80 },
  { id: 'leg', label: 'Pierna (muslo)', unit: 'cm', group: 'medidas', help: 'Por la parte más ancha del muslo', step: 0.5, min: 20, max: 120 },
  { id: 'hip', label: 'Cadera', unit: 'cm', group: 'medidas', help: 'Por la parte más ancha de los glúteos', step: 0.5, min: 40, max: 250 },
  { id: 'body_fat', label: 'Grasa corporal', unit: '%', group: 'composicion', help: 'Solo si tienes una medición (bioimpedancia, DEXA, nutricionista…)', step: 0.1, min: 2, max: 70 },
  { id: 'muscle_mass', label: 'Masa muscular', unit: 'kg', group: 'composicion', help: 'Solo si tienes una medición', step: 0.1, min: 5, max: 150 },
];

export type BodyCheck = { every: 15 | 30; remind: boolean };
export const DEFAULT_CHECK: BodyCheck = { every: 15, remind: true };

export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayMs = 86_400_000;
const parseDay = (s: string) => new Date(`${s}T12:00:00`);

/** Cuándo toca el próximo registro y si ya toca (sin registros: toca hoy). */
export function nextCheck(logs: BodyLog[], check: BodyCheck, today = new Date()) {
  const last = logs[0]?.day ?? null;
  if (!last) return { last: null, next: null as Date | null, due: true, days: 0 };
  const next = new Date(parseDay(last).getTime() + check.every * dayMs);
  const days = Math.round((next.getTime() - parseDay(isoDay(today)).getTime()) / dayMs);
  return { last, next, due: days <= 0, days };
}

export const fmt = (n: number | null | undefined, unit = '') => (n === null || n === undefined ? '—' : `${String(+n.toFixed(1)).replace('.', ',')}${unit ? ` ${unit}` : ''}`);
export const fmtDay = (s: string, long = false) => parseDay(s).toLocaleDateString('es-CL', long ? { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' });

/* ── Fotos (privadas) ─────────────────────────────────────────────────────────────── */

const BUCKET = 'organiza-body';
const signed = new Map<string, { url: string; until: number }>();

/** Permisos de 10 minutos para ver tus fotos (los firma nuestro servidor; solo tus propias rutas). */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const need = paths.filter((p) => {
    const hit = signed.get(p);
    if (hit && hit.until > now) out[p] = hit.url;
    return !(hit && hit.until > now);
  });
  if (need.length) {
    const r = await authFetch('/api/body/photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: need }) });
    const j = (await r.json().catch(() => ({}))) as { urls?: Record<string, string> };
    for (const [p, u] of Object.entries(j.urls ?? {})) {
      signed.set(p, { url: u, until: now + 540_000 });
      out[p] = u;
    }
  }
  return out;
}

async function uploadPhoto(uid: string, logId: string, view: View, file: File): Promise<string | null> {
  let blob: Blob = file;
  let ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  try {
    const c = await compressImageForNote(file, 1400); // ~200 KB: liviana y suficiente para comparar
    blob = c.blob;
    ext = c.ext;
  } catch {}
  const path = `${uid}/${logId}/${view}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  return error ? null : path;
}

async function removePhotos(paths: string[]) {
  if (!paths.length) return;
  await authFetch('/api/body/photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remove: paths }) }).catch(() => {});
}

/* ── Datos ────────────────────────────────────────────────────────────────────────── */

export type Draft = { day: string; notes: string; values: Partial<Record<Metric, number | null>>; photos: Partial<Record<View, File | 'keep' | null>> };

export function useBodyLogs() {
  const db = useDb();
  const { userId } = useSpace();
  const uid = userId ?? 'local';
  const [logs, setLogs] = useState<BodyLog[]>([]);
  const [check, setCheck] = useState<BodyCheck>(DEFAULT_CHECK);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const rows = await db.select<BodyLog>('organiza_body_logs') // RLS: solo las tuyas;
    const [p] = await db.select<{ body_check?: Partial<BodyCheck> }>('organiza_prefs', { owner_id: uid });
    setLogs(rows.sort((a, b) => (a.day === b.day ? ((a.created_at ?? '') < (b.created_at ?? '') ? 1 : -1) : a.day < b.day ? 1 : -1)));
    setCheck({ ...DEFAULT_CHECK, ...(p?.body_check ?? {}) } as BodyCheck);
    setReady(true);
  }, [db, uid]);
  useEffect(() => {
    load();
  }, [load]);

  const saveCheck = useCallback(async (c: BodyCheck) => {
    setCheck(c);
    await db.upsert('organiza_prefs', { owner_id: uid, body_check: c, updated_at: new Date().toISOString() }, 'owner_id');
  }, [db, uid]);

  /** Guarda un registro: nuevo (sin `id`) o corrige uno existente. Devuelve un error legible si algo falla. */
  const save = useCallback(async (d: Draft, id?: string): Promise<string | null> => {
    const values = Object.fromEntries(METRICS.map((m) => [m.id, d.values[m.id] ?? null]));
    const prev = id ? logs.find((l) => l.id === id) : null;
    let logId = id;
    if (!logId) {
      const [made] = await db.insert<BodyLog>('organiza_body_logs', { day: d.day, notes: d.notes, ...values, photos: {} });
      if (!made) return 'No se pudo guardar el registro. Revisa tu conexión.';
      logId = made.id;
    }
    const photos: Partial<Record<View, string>> = { ...(prev?.photos ?? {}) };
    const drop: string[] = [];
    let failed = 0;
    for (const v of VIEWS) {
      const f = d.photos[v.id];
      if (f === 'keep' || f === undefined) continue;
      if (photos[v.id]) drop.push(photos[v.id]!);
      delete photos[v.id];
      if (f) {
        const path = await uploadPhoto(uid, logId, v.id, f);
        if (path) photos[v.id] = path;
        else failed++;
      }
    }
    const ok = await db.update('organiza_body_logs', { id: logId }, { day: d.day, notes: d.notes, ...values, photos, updated_at: new Date().toISOString() });
    await removePhotos(drop);
    await load();
    if (!ok) return 'No se pudo guardar el registro. Revisa tu conexión.';
    return failed ? `Se guardaron tus datos, pero ${failed === 1 ? 'una foto no se pudo subir' : `${failed} fotos no se pudieron subir`}. Inténtalo de nuevo editando el registro.` : null;
  }, [db, load, logs, uid]);

  const remove = useCallback(async (id: string) => {
    const l = logs.find((x) => x.id === id);
    setLogs((x) => x.filter((y) => y.id !== id));
    await db.remove('organiza_body_logs', { id });
    await removePhotos(Object.values(l?.photos ?? {}).filter(Boolean) as string[]);
  }, [db, logs]);

  return { logs, check, ready, saveCheck, save, remove, reload: load };
}
export type BodyApi = ReturnType<typeof useBodyLogs>;
