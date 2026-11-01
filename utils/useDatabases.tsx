'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { APP } from '@/app.config';
import type { CellValue, DbProperty, DbRow, UserDatabase } from '@/utils/databases';

/**
 * Data layer of the Notion-style databases. `DatabaseStore` is an interface
 * so the UI can be previewed with an in-memory store; the real one is
 * `supabaseDatabaseStore(ownerScope)`, over `app_databases` / `app_database_rows`
 * filtered by this app (App Master Cloud supabase/05-bases-de-datos-apps.sql). A single store is provided app-wide by
 * `DatabaseStoreProvider` (app/page.tsx), so a database embedded deep inside a
 * note's editor reaches the same store without prop threading.
 */
export interface DatabaseStore {
  list(): Promise<UserDatabase[]>;
  create(input: { title: string; icon: string | null; properties: DbProperty[]; rows: Record<string, CellValue>[] }): Promise<UserDatabase | null>;
  get(id: string): Promise<{ db: UserDatabase; rows: DbRow[] } | null>;
  updateDb(id: string, patch: Partial<Pick<UserDatabase, 'title' | 'icon' | 'properties'>>): Promise<boolean>;
  addRow(databaseId: string, values: Record<string, CellValue>, position: number): Promise<DbRow | null>;
  updateRow(id: string, values: Record<string, CellValue>): Promise<boolean>;
  deleteRow(id: string): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  /** owner_scope of these databases (their views are saved in table_views under it). */
  scope?: string;
}

type DbRecord = { id: string; title: string; icon: string | null; properties: DbProperty[]; updated_at: string };
const toDb = (r: DbRecord): UserDatabase => ({ id: r.id, title: r.title, icon: r.icon, properties: Array.isArray(r.properties) ? r.properties : [], updatedAt: r.updated_at });
type RowRecord = { id: string; values: Record<string, CellValue>; position: number };
const toRow = (r: RowRecord): DbRow => ({ id: r.id, values: r.values ?? {}, position: r.position });

export function supabaseDatabaseStore(ownerScope: string): DatabaseStore {
  const now = () => new Date().toISOString();
  return {
    scope: ownerScope,
    async list() {
      const { data, error } = await supabase
        .from('app_databases')
        .select('id, title, icon, properties, updated_at')
        .eq('app', APP.slug)
        .eq('owner_scope', ownerScope)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      return error || !data ? [] : (data as DbRecord[]).map(toDb);
    },
    async create({ title, icon, properties, rows }) {
      const { data, error } = await supabase
        .from('app_databases')
        .insert({ app: APP.slug, owner_scope: ownerScope, title, icon, properties })
        .select('id, title, icon, properties, updated_at')
        .single();
      if (error || !data) return null;
      if (rows.length) {
        await supabase.from('app_database_rows').insert(rows.map((values, i) => ({ database_id: data.id, app: APP.slug, owner_scope: ownerScope, values, position: i + 1 })));
      }
      return toDb(data as DbRecord);
    },
    async get(id) {
      const [{ data: db }, { data: rows }] = await Promise.all([
        supabase.from('app_databases').select('id, title, icon, properties, updated_at').eq('id', id).is('deleted_at', null).maybeSingle(),
        supabase.from('app_database_rows').select('id, values, position').eq('database_id', id).order('position'),
      ]);
      if (!db) return null;
      return { db: toDb(db as DbRecord), rows: ((rows ?? []) as RowRecord[]).map(toRow) };
    },
    async updateDb(id, patch) {
      const { error } = await supabase.from('app_databases').update({ ...patch, updated_at: now() }).eq('id', id);
      return !error;
    },
    async addRow(databaseId, values, position) {
      // The row keeps the database's own scope (a shared note can embed someone else's).
      const { data: db } = await supabase.from('app_databases').select('owner_scope').eq('id', databaseId).maybeSingle();
      const { data, error } = await supabase
        .from('app_database_rows')
        .insert({ database_id: databaseId, app: APP.slug, owner_scope: (db as { owner_scope?: string } | null)?.owner_scope ?? ownerScope, values, position })
        .select('id, values, position')
        .single();
      if (error || !data) return null;
      await supabase.from('app_databases').update({ updated_at: now() }).eq('id', databaseId);
      return toRow(data as RowRecord);
    },
    async updateRow(id, values) {
      const { error } = await supabase.from('app_database_rows').update({ values, updated_at: now() }).eq('id', id);
      return !error;
    },
    async deleteRow(id) {
      const { error } = await supabase.from('app_database_rows').delete().eq('id', id);
      return !error;
    },
    async remove(id) {
      const { error } = await supabase.from('app_databases').update({ deleted_at: now() }).eq('id', id);
      return !error;
    },
  };
}

const Ctx = createContext<DatabaseStore | null>(null);
const OpenCtx = createContext<((id: string) => void) | undefined>(undefined);
export const DatabaseStoreProvider: React.FC<{ store: DatabaseStore; onOpenFull?: (id: string) => void; children: React.ReactNode }> = ({ store, onOpenFull, children }) => (
  <Ctx.Provider value={store}>
    <OpenCtx.Provider value={onOpenFull}>{children}</OpenCtx.Provider>
  </Ctx.Provider>
);
export const useDatabaseStore = () => useContext(Ctx);
/** Opens a database in the "Bases de datos" section (used by the note embed). */
export const useOpenDatabase = () => useContext(OpenCtx);

/** One database (definition + rows) with optimistic edits. */
export function useDatabaseDoc(id: string | null) {
  const store = useDatabaseStore();
  const [db, setDb] = useState<UserDatabase | null>(null);
  const [rows, setRows] = useState<DbRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [saveError, setSaveError] = useState(false);
  const dbRef = useRef<UserDatabase | null>(null);
  dbRef.current = db;

  useEffect(() => {
    if (!id || !store) {
      setStatus(store ? 'missing' : 'error');
      return;
    }
    let alive = true;
    setStatus('loading');
    store
      .get(id)
      .then((r) => {
        if (!alive) return;
        if (!r) return setStatus('missing');
        setDb(r.db);
        setRows(r.rows);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [id, store]);

  const track = (p: Promise<boolean | unknown>) => p.then((ok) => setSaveError(ok === false || ok === null)).catch(() => setSaveError(true));

  const patchDb = useCallback(
    (patch: Partial<Pick<UserDatabase, 'title' | 'icon' | 'properties'>>) => {
      if (!store || !dbRef.current) return;
      setDb((d) => (d ? { ...d, ...patch } : d));
      track(store.updateDb(dbRef.current.id, patch));
    },
    [store],
  );

  const rowsRef = useRef<DbRow[]>([]);
  rowsRef.current = rows;
  const setCell = useCallback(
    (rowId: string, propId: string, value: CellValue) => {
      if (!store) return;
      const row = rowsRef.current.find((r) => r.id === rowId);
      if (!row) return;
      const values = { ...row.values, [propId]: value };
      setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, values } : r)));
      track(store.updateRow(rowId, values));
    },
    [store],
  );

  const addRow = useCallback(
    async (values: Record<string, CellValue> = {}) => {
      if (!store || !dbRef.current) return null;
      const position = (rows[rows.length - 1]?.position ?? 0) + 1;
      const row = await store.addRow(dbRef.current.id, values, position);
      if (row) setRows((rs) => [...rs, row]);
      else setSaveError(true);
      return row;
    },
    [store, rows],
  );

  const deleteRow = useCallback(
    (rowId: string) => {
      if (!store) return;
      setRows((rs) => rs.filter((r) => r.id !== rowId));
      track(store.deleteRow(rowId));
    },
    [store],
  );

  return { db, rows, status, saveError, patchDb, setCell, addRow, deleteRow };
}
