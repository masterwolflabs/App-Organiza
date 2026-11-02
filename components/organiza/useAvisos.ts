'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useSpace } from '@/components/organiza/space';

export type Notice = { id: string; kind: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string };
export type Invite = { event_id: string; status: 'pendiente' | 'aceptada' | 'rechazada'; title: string; starts_at: string; who: string };
export type Prefs = { notifications: boolean; reminders: boolean; sounds: boolean; sound: string };
export const DEFAULT_PREFS: Prefs = { notifications: true, reminders: true, sounds: true, sound: 'suave' };
export const SOUNDS = [
  { id: 'suave', label: 'Suave', notes: [660] },
  { id: 'campana', label: 'Campana', notes: [880, 660] },
  { id: 'alarma', label: 'Alarma', notes: [880, 660, 880, 660] },
];

export function playSound(id: string) {
  const notes = SOUNDS.find((s) => s.id === id)?.notes ?? SOUNDS[0].notes;
  try {
    const ctx = new AudioContext();
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = f;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.35);
      osc.stop(ctx.currentTime + i * 0.35 + 0.25);
    });
  } catch {
    /* sin audio */
  }
}

/** Invitaciones, centro de notificaciones y preferencias de la persona. RLS deja ver solo lo suyo. */
export function useAvisos() {
  const { userId } = useSpace();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);

  const load = useCallback(async () => {
    if (!userId) return;
    const [n, i, p] = await Promise.all([
      supabase.from('organiza_notifications').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('organiza_invites').select('event_id, status, invited_by').eq('user_id', userId).eq('status', 'pendiente'),
      supabase.from('organiza_prefs').select('notifications, reminders, sounds, sound').maybeSingle(),
    ]);
    const rows = (i.data ?? []) as { event_id: string; status: Invite['status']; invited_by: string | null }[];
    const [ev, who] = rows.length
      ? await Promise.all([
          supabase.from('calendar_events').select('id, title, starts_at').in('id', rows.map((r) => r.event_id)),
          supabase.from('profiles').select('id, "displayName"').in('id', rows.map((r) => r.invited_by ?? '').filter(Boolean)),
        ])
      : [{ data: [] }, { data: [] }];
    const evs = (ev.data ?? []) as { id: string; title: string; starts_at: string }[];
    const people = (who.data ?? []) as { id: string; displayName: string | null }[];
    setNotices((n.data ?? []) as Notice[]);
    setInvites(rows.flatMap((r) => {
      const e = evs.find((x) => x.id === r.event_id);
      return e ? [{ event_id: r.event_id, status: r.status, title: e.title, starts_at: e.starts_at, who: people.find((x) => x.id === r.invited_by)?.displayName ?? 'Alguien' }] : [];
    }));
    if (p.data) setPrefsState(p.data as Prefs);
  }, [userId]);
  useEffect(() => {
    load();
  }, [load]);

  const answer = useCallback(async (eventId: string, status: 'aceptada' | 'rechazada') => {
    setInvites((l) => l.filter((x) => x.event_id !== eventId));
    await supabase.from('organiza_invites').update({ status, responded_at: new Date().toISOString() }).eq('event_id', eventId).eq('user_id', userId ?? '');
  }, [userId]);
  const readAll = useCallback(async () => {
    const at = new Date().toISOString();
    setNotices((l) => l.map((n) => ({ ...n, read_at: n.read_at ?? at })));
    await supabase.from('organiza_notifications').update({ read_at: at }).is('read_at', null);
  }, []);
  const setPrefs = useCallback(async (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p };
    setPrefsState(next);
    await supabase.from('organiza_prefs').upsert({ ...next, owner_id: userId, updated_at: new Date().toISOString() });
  }, [prefs, userId]);

  return { notices, invites, prefs, setPrefs, answer, readAll, reload: load };
}
