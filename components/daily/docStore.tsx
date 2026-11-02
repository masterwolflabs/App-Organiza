'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

/**
 * La Daily se guarda en `table_views`, la misma fila que usaba la Mente Maestra
 * y que escribe scripts/daily.sh, en la cuenta de quien la abre.
 */
type Store = { ready: boolean; get: (key: string) => unknown; set: (key: string, value: unknown) => void; reload: (key: string) => void };
const Ctx = createContext<Store | null>(null);
export const useDocStore = () => useContext(Ctx);

export const DocStoreProvider: React.FC<{ scope: string; keys: string[]; children: React.ReactNode }> = ({ scope, keys, children }) => {
  const [docs, setDocs] = useState<Record<string, unknown>>({});
  const [ready, setReady] = useState(false);
  const latest = useRef(docs);
  latest.current = docs;
  const pending = useRef(new Set<string>());
  const list = keys.join('|');

  useEffect(() => {
    let alive = true;
    setReady(false);
    supabase.from('table_views').select('table_key, data').eq('owner_scope', scope).in('table_key', list.split('|')).then(({ data }) => {
      if (!alive) return;
      const next: Record<string, unknown> = {};
      for (const r of (data ?? []) as { table_key: string; data: unknown }[]) next[r.table_key] = r.data;
      latest.current = next;
      setDocs(next);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [scope, list]);

  const get = useCallback((key: string) => latest.current[key] ?? null, []);
  const set = useCallback((key: string, value: unknown) => {
    latest.current = { ...latest.current, [key]: value };
    setDocs(latest.current);
    pending.current.add(key);
    supabase.from('table_views').upsert({ owner_scope: scope, table_key: key, data: value, updated_at: new Date().toISOString() }, { onConflict: 'owner_scope,table_key' }).then(() => pending.current.delete(key));
  }, [scope]);
  const reload = useCallback((key: string) => {
    if (pending.current.has(key)) return;
    supabase.from('table_views').select('data').eq('owner_scope', scope).eq('table_key', key).maybeSingle().then(({ data }) => {
      if (!data || pending.current.has(key)) return;
      if (JSON.stringify(data.data) === JSON.stringify(latest.current[key])) return; // nada cambió: no se repinta
      latest.current = { ...latest.current, [key]: data.data };
      setDocs(latest.current);
    });
  }, [scope]);

  // `docs` cambia la identidad del valor para que quienes leen se vuelvan a pintar.
  const value = useMemo(() => ({ ready, get, set, reload }), [ready, get, set, reload, docs]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
