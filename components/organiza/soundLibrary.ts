/**
 * Mi lista de sonidos (Daily sonidos-elegir-ranking, 2026-11-11): cada persona elimina con ✕ los sonidos que
 * no le gustan (solo de SU lista, se pueden restaurar) y los que más usa salen primero. Se guarda en su
 * cuenta (organiza_sound_library, SQL 36): sirve en todos sus dispositivos. Sin el SQL queda en este
 * navegador. Pieza pensada para copiarse tal cual a la plantilla cuando otras apps tengan sonidos.
 */
import { supabase } from '@/lib/supabaseClient';

type Lib = { hidden: string[]; uses: Record<string, number> };
const LOCAL = 'organiza-sound-library';
let lib: Lib = { hidden: [], uses: {} };
let inited = false;
// Cambios hechos antes de que llegue la lista de la cuenta: se suman a ella, no se pierden.
let early: Lib | null = null;
let fetching = false;
let owner: string | null = null;
let loaded: Promise<void> | null = null;
let saving: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function onSoundLibrary(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}

const readLocal = (): Lib => {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL) ?? 'null');
    if (v && Array.isArray(v.hidden) && v.uses && typeof v.uses === 'object') return v;
  } catch {
    /* modo privado */
  }
  return { hidden: [], uses: {} };
};

const ensure = () => {
  if (inited) return;
  inited = true;
  lib = readLocal();
};

export function loadSoundLibrary(userId: string | null | undefined): Promise<void> {
  if (loaded && owner === (userId ?? null)) return loaded;
  owner = userId ?? null;
  ensure();
  early = null;
  loaded = (async () => {
    if (!userId) return;
    fetching = true;
    const { data, error } = await supabase.from('organiza_sound_library').select('hidden, uses').maybeSingle();
    fetching = false;
    if (!error && data) {
      const server: Lib = { hidden: data.hidden ?? [], uses: (data.uses as Record<string, number>) ?? {} };
      const e = early as Lib | null;
      lib = e
        ? { hidden: [...new Set([...server.hidden, ...e.hidden])], uses: Object.fromEntries([...new Set([...Object.keys(server.uses), ...Object.keys(e.uses)])].map((k) => [k, Math.max(server.uses[k] ?? 0, e.uses[k] ?? 0)])) }
        : server;
      try {
        localStorage.setItem(LOCAL, JSON.stringify(lib));
      } catch {
        /* modo privado */
      }
    }
    early = null;
    emit();
  })();
  emit();
  return loaded;
}

function save() {
  // Mientras no llega la lista de la cuenta, se anota aparte para sumarla.
  if (fetching) early = { hidden: [...lib.hidden], uses: { ...lib.uses } };
  try {
    localStorage.setItem(LOCAL, JSON.stringify(lib));
  } catch {
    /* modo privado */
  }
  emit();
  if (!owner) return;
  clearTimeout(saving);
  const who = owner;
  // Junta varios cambios seguidos en una sola escritura, y nunca antes de leer la de la cuenta.
  saving = setTimeout(() => {
    void (loaded ?? Promise.resolve()).then(() => supabase.from('organiza_sound_library').upsert({ owner_id: who, hidden: lib.hidden, uses: lib.uses, updated_at: new Date().toISOString() }));
  }, 800);
}

export const isHidden = (id: string) => (ensure(), lib.hidden.includes(id));
export const hiddenCount = (ids: string[]) => ids.filter(isHidden).length;
export const usesOf = (id: string) => (ensure(), lib.uses[id] ?? 0);

export function hideSound(id: string) {
  ensure();
  if (isHidden(id)) return;
  lib = { ...lib, hidden: [...lib.hidden, id] };
  save();
}
/** Devuelve a la lista los eliminados de estos ids (o todos). */
export function restoreSounds(ids?: string[]) {
  ensure();
  lib = { ...lib, hidden: ids ? lib.hidden.filter((h) => !ids.includes(h)) : [] };
  save();
}
/** Suma un uso: al elegirlo o cuando suena de verdad un aviso/alarma. */
export function countUse(id: string) {
  ensure();
  lib = { ...lib, uses: { ...lib.uses, [id]: (lib.uses[id] ?? 0) + 1 } };
  save();
}

/** La lista de una persona: sin los eliminados y con los más usados primero (empates: el orden de siempre). */
export function arrange<T extends { id: string }>(list: T[]): T[] {
  return list
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !isHidden(s.id))
    .sort((a, b) => usesOf(b.s.id) - usesOf(a.s.id) || a.i - b.i)
    .map(({ s }) => s);
}
