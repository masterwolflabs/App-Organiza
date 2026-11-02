'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSpace } from '@/components/organiza/space';
import { toDateInput, type CalEvent, type Occurrence } from './model';

export type Who = { id: string; name: string; avatar_url: string | null };
export type CalApp = { slug: string; name: string; icon: string | null };

export type Directory = { users: Who[]; people: Who[]; clients: Who[]; apps: CalApp[] };

/** The apps an event can belong to: the hub's apps plus the cloud itself. */
const NUBE: CalApp = { slug: 'nube', name: 'Nube', icon: '☁️' };

/**
 * Events in [from, to) (plus every recurring one, expanded on screen) for the
 * signed-in person. RLS decides what they see: their own, the ones they're
 * invited to and, for Master Wolf members, the 'mw' ones. Reloads on focus and
 * every 30 s so what another app adds shows up by itself.
 */
export function useCalendar(from: Date, to: Date, enabled = true) {
  const { space } = useSpace();
  const [userId, setUserId] = useState<string | null>(null);
  const [isMw, setIsMw] = useState(false);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'signed-out'>('loading');
  const [dir, setDir] = useState<Directory>({ users: [], people: [], clients: [], apps: [NUBE] });
  const range = useRef({ from, to });
  range.current = { from, to };

  useEffect(() => {
    if (!enabled) return;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return setStatus('signed-out');
      setUserId(data.user.id);
      const [mw, users, people, clients, apps] = await Promise.all([
        supabase.rpc('is_mw_member'),
        supabase.from('profiles').select('id, "displayName", "avatarUrl"'),
        supabase.from('mc_people').select('id, name, avatar_url, archived_at').order('name'),
        supabase.from('mc_clients').select('id, name, avatar_url, archived_at').order('name'),
        supabase.from('hub_apps').select('slug, name, icon').eq('is_active', true).order('sort_order'),
      ]);
      setIsMw(mw.data === true);
      const live = (r: { archived_at?: string | null }) => !r.archived_at;
      setDir({
        users: ((users.data ?? []) as { id: string; displayName: string | null; avatarUrl: string | null }[])
          .map((u) => ({ id: u.id, name: u.displayName || 'Sin nombre', avatar_url: u.avatarUrl }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        people: ((people.data ?? []) as (Who & { archived_at: string | null })[]).filter(live),
        clients: ((clients.data ?? []) as (Who & { archived_at: string | null })[]).filter(live),
        apps: [NUBE, ...((apps.data ?? []) as CalApp[]).filter((a) => a.slug !== 'mi-app')],
      });
    })();
  }, [enabled]);

  const load = useCallback(async () => {
    const { from: f, to: t } = range.current;
    const { data, error } = await supabase
      .from('calendar_events')
      .select('*')
      .or(`rrule.not.is.null,and(ends_at.gte.${f.toISOString()},starts_at.lt.${t.toISOString()})`)
      .eq('space', space)
      .neq('status', 'cancelado');
    if (error) return setStatus('error');
    const next = (data ?? []) as CalEvent[];
    setEvents((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next)); // nada cambió: no se repinta
    setStatus('ready');
  }, [space]);

  const fromKey = from.getTime();
  const toKey = to.getTime();
  useEffect(() => {
    if (!userId) return;
    load();
  }, [userId, fromKey, toKey, load]);

  useEffect(() => {
    if (!userId) return;
    const onFocus = () => document.visibilityState === 'visible' && load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const t = setInterval(onFocus, 30_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      clearInterval(t);
    };
  }, [userId, load]);

  const save = useCallback(
    async (patch: Partial<CalEvent> & { id?: string }): Promise<CalEvent | null> => {
      if (!userId) return null;
      const { id, ...rest } = patch;
      if (id && !id.startsWith('new:')) {
        // Optimistic: the grid moves at once; the reload fixes anything off.
        setEvents((list) => list.map((e) => (e.id === id ? { ...e, ...rest } : e)));
        const { data, error } = await supabase.from('calendar_events').update(rest).eq('id', id).select().single();
        if (error) { load(); return null; }
        setEvents((list) => list.map((e) => (e.id === id ? (data as CalEvent) : e)));
        return data as CalEvent;
      }
      const row = { owner_scope: userId, space, ...rest };
      const { data, error } = await supabase.from('calendar_events').insert(row).select().single();
      if (error) return null;
      setEvents((list) => [...list, data as CalEvent]);
      return data as CalEvent;
    },
    [userId, load, space],
  );

  const remove = useCallback(async (id: string) => {
    setEvents((list) => list.filter((e) => e.id !== id));
    const { error } = await supabase.from('calendar_events').delete().eq('id', id);
    if (error) load();
    return !error;
  }, [load]);

  /** La serie salta ese día (SQL 25). */
  const skipOne = useCallback(
    async (o: Occurrence) => !!(await save({ id: o.ev.id, exdates: [...(o.ev.exdates ?? []), toDateInput(o.start)] })),
    [save],
  );

  /** Mueve solo esa repetición: la serie salta el día y nace un evento suelto. */
  const moveOne = useCallback(
    async (o: Occurrence, start: Date, end: Date) => {
      if (!(await skipOne(o))) return false;
      const { id, rrule: _rrule, exdates, google_event_id: _google, created_at: _c, updated_at: _u, ...rest } = o.ev as CalEvent & { created_at?: string; updated_at?: string };
      const copy = await save({ ...rest, series_id: id, starts_at: start.toISOString(), ends_at: end.toISOString() });
      if (copy) return true;
      await save({ id, exdates: exdates ?? [] });
      return false;
    },
    [save, skipOne],
  );

  return { userId, isMw, events, status, dir, save, remove, skipOne, moveOne, reload: load };
}

export type CalendarSource = ReturnType<typeof useCalendar>;
