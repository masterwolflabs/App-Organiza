'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { APP } from '@/app.config';

/**
 * Where the Notion-like views of the Empresa tables live (Emanuel,
 * 2026-10-15): one row per (app, owner_scope, table) in `app_table_views` (data =
 * {title, views, active}), so the same views show on every computer. Writes
 * are debounced; a copy stays in localStorage so the page works before the
 * migration runs (or offline) and loads instantly.
 */

type Store = { scope: string; ready: boolean; get: (key: string) => unknown; set: (key: string, value: unknown) => void };
const Ctx = createContext<Store | null>(null);

const lsKey = (scope: string, key: string) => `mw-views:${APP.slug}:${scope}:${key}`;

export const TableViewsProvider: React.FC<{ scope: string; children: React.ReactNode }> = ({ scope, children }) => {
  const [rows, setRows] = useState<Record<string, unknown>>({});
  // Latest values, also between renders: two writes in a row (a relation and its mirror,
  // removing a column and its summaries) must each see the other's result.
  const latest = useRef(rows);
  latest.current = rows;
  const [ready, setReady] = useState(false);
  const dbOk = useRef(true);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    let alive = true;
    setReady(false);
    (async () => {
      const { data, error } = await supabase.from('app_table_views').select('table_key, data').eq('app', APP.slug).eq('owner_scope', scope);
      if (!alive) return;
      if (error) dbOk.current = false;
      const next: Record<string, unknown> = {};
      for (const r of (data ?? []) as { table_key: string; data: unknown }[]) next[r.table_key] = r.data;
      latest.current = next;
      setRows(next);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [scope]);

  const get = useCallback(
    (key: string) => {
      if (key in latest.current) return latest.current[key];
      try {
        const v = localStorage.getItem(lsKey(scope, key));
        return v ? JSON.parse(v) : undefined;
      } catch {
        return undefined;
      }
    },
    [rows, scope], // eslint-disable-line react-hooks/exhaustive-deps -- `rows` re-creates `get` so readers re-render
  );

  const set = useCallback(
    (key: string, value: unknown) => {
      latest.current = { ...latest.current, [key]: value };
      setRows((r) => ({ ...r, [key]: value }));
      try {
        localStorage.setItem(lsKey(scope, key), JSON.stringify(value));
      } catch {
        /* ignore */
      }
      if (!dbOk.current) return;
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(async () => {
        const { error } = await supabase
          .from('app_table_views')
          .upsert({ app: APP.slug, owner_scope: scope, table_key: key, data: value, updated_at: new Date().toISOString() }, { onConflict: 'app,owner_scope,table_key' });
        if (error) dbOk.current = false;
      }, 600);
    },
    [scope],
  );

  const value = useMemo(() => ({ scope, ready, get, set }), [scope, ready, get, set]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useTableViewsStore = () => useContext(Ctx);
