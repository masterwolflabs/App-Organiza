'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Copia de utils/useSupabaseCollection.ts de Finance, sin el "viaje en el tiempo" (writePaused).

interface WithId {
  id: string;
}

/**
 * Keeps a Supabase table's rows (filtered by owner_scope) in sync with React
 * state. `ownerScope` is either 'mw' (shared Master Wolf data) or a user's
 * uuid (their private data) — switching it re-fetches from scratch.
 */
export function useSupabaseCollection<T extends WithId>(table: string, ownerScope: string | null) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const refetch = useCallback(async () => {
    if (!ownerScope) {
      setItems([]);
      setLoading(false);
      return;
    }
    const myRequest = ++requestId.current;
    setLoading(true);
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('owner_scope', ownerScope)
      .order('created_at', { ascending: false });

    if (myRequest !== requestId.current) return; // a newer scope switch superseded this fetch
    if (!error && data) setItems(data as T[]);
    setLoading(false);
  }, [table, ownerScope]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const add = useCallback(
    async (row: Omit<T, 'id'>): Promise<T | null> => {
      if (!ownerScope) return null;
      const { data, error } = await supabase
        .from(table)
        .insert({ ...row, owner_scope: ownerScope })
        .select()
        .single();
      if (error || !data) return null;
      setItems((prev) => [data as T, ...prev]);
      return data as T;
    },
    [table, ownerScope]
  );

  // Resolves true when the row was actually written — most callers ignore it,
  // but the notes editor uses it to show "couldn't save" instead of failing silently.
  const update = useCallback(
    async (id: string, patch: Partial<T>): Promise<boolean> => {
      const { data, error } = await supabase
        .from(table)
        .update(patch as Record<string, unknown>)
        .eq('id', id)
        .select()
        .single();
      if (error || !data) return false;
      setItems((prev) => prev.map((it) => (it.id === id ? (data as T) : it)));
      return true;
    },
    [table]
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) return;
      setItems((prev) => prev.filter((it) => it.id !== id));
    },
    [table]
  );

  return { items, loading, add, update, remove, refetch, setItems };
}
