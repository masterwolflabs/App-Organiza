'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';

/** Acceso a datos de Organiza: Supabase en la app y memoria en las pruebas. */
export type Row = Record<string, unknown>;
export type Db = {
  select: <T>(table: string, match?: Row) => Promise<T[]>;
  insert: <T>(table: string, rows: Row | Row[]) => Promise<T[]>;
  update: (table: string, match: Row, patch: Row) => Promise<boolean>;
  upsert: (table: string, row: Row, onConflict: string) => Promise<boolean>;
  remove: (table: string, match: Row) => Promise<boolean>;
};

export const supabaseDb: Db = {
  select: async <T,>(table: string, match: Row = {}) => {
    const { data } = await supabase.from(table).select('*').match(match);
    return (data ?? []) as T[];
  },
  insert: async <T,>(table: string, rows: Row | Row[]) => {
    const { data } = await supabase.from(table).insert(rows).select();
    return (data ?? []) as T[];
  },
  update: async (table, match, patch) => !(await supabase.from(table).update(patch).match(match)).error,
  upsert: async (table, row, onConflict) => !(await supabase.from(table).upsert(row, { onConflict })).error,
  remove: async (table, match) => !(await supabase.from(table).delete().match(match)).error,
};

export function memoryDb(seed: Record<string, Row[]> = {}): Db {
  const tables = new Map(Object.entries(seed));
  const list = (t: string) => tables.get(t) ?? (tables.set(t, []), tables.get(t)!);
  const hit = (r: Row, m: Row) => Object.entries(m).every(([k, v]) => r[k] === v);
  return {
    select: async <T,>(t: string, m: Row = {}) => list(t).filter((r) => hit(r, m)).map((r) => ({ ...r })) as T[],
    insert: async <T,>(t: string, rows: Row | Row[]) => {
      const made = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ id: Math.random().toString(36).slice(2), ...r }));
      list(t).push(...made);
      return made as T[];
    },
    update: async (t, m, p) => (list(t).forEach((r) => hit(r, m) && Object.assign(r, p)), true),
    upsert: async (t, row, on) => {
      const keys = on.split(',');
      const found = list(t).find((r) => keys.every((k) => r[k] === row[k]));
      if (found) Object.assign(found, row);
      else list(t).push({ id: Math.random().toString(36).slice(2), ...row });
      return true;
    },
    remove: async (t, m) => (tables.set(t, list(t).filter((r) => !hit(r, m))), true),
  };
}

const Ctx = createContext<Db>(supabaseDb);
export const useDb = () => useContext(Ctx);
export const DbProvider: React.FC<{ db: Db; children: React.ReactNode }> = ({ db, children }) => {
  const value = useMemo(() => db, [db]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
