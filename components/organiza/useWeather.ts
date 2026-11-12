'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { cityOfTz, forecast, type Forecast, type Place } from '@/utils/weather';

/**
 * Clima compartido (Emanuel, 2026-11-12): una sola carga para el cielo del Horario, las tarjetas y la
 * pestaña Tiempo. Ubicación: pide permiso del GPS una vez; si no lo das, usa la ciudad de respaldo
 * (por defecto Santiago). Tus ciudades y el respaldo se guardan en la cuenta (organiza_prefs.weather, SQL 40).
 */
export type WeatherPrefs = { cities: Place[]; fallback: Place | null; geo: 'si' | 'no' | null };
type State = { prefs: WeatherPrefs; here: Forecast | null; hereIsGps: boolean; loading: boolean; error: string | null };

export const SANTIAGO: Place = { name: 'Santiago', country: 'Chile', lat: -33.45, lon: -70.66 };
let state: State = { prefs: { cities: [], fallback: null, geo: null }, here: null, hereIsGps: false, loading: false, error: null };
const subs = new Set<() => void>();
const set = (p: Partial<State>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
};
let started = false;
let userId: string | null = null;

async function savePrefs(prefs: WeatherPrefs) {
  set({ prefs });
  if (!userId) return;
  await supabase.from('organiza_prefs').upsert({ owner_id: userId, weather: prefs, updated_at: new Date().toISOString() });
}

const gps = () =>
  new Promise<Place | null>((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ name: 'Mi ubicación', lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: 10_000, maximumAge: 30 * 60_000 },
    );
  });

async function refresh(force = false) {
  set({ loading: true, error: null });
  try {
    let place: Place | null = null;
    let isGps = false;
    if (state.prefs.geo !== 'no') {
      place = await gps();
      isGps = !!place;
      const geo = place ? 'si' : 'no';
      if (state.prefs.geo !== geo) void savePrefs({ ...state.prefs, geo });
    }
    place ??= state.prefs.fallback ?? SANTIAGO;
    const f = await forecast(place, force);
    // Con GPS, el nombre sale de la zona horaria («Santiago»).
    if (isGps) f.place = { ...f.place, name: cityOfTz(f.tz) };
    set({ here: f, hereIsGps: isGps, loading: false });
  } catch (e) {
    set({ loading: false, error: (e as Error).message });
  }
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  void (async () => {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
    if (userId) {
      const { data: row } = await supabase.from('organiza_prefs').select('weather').eq('owner_id', userId).maybeSingle();
      const w = (row?.weather ?? {}) as Partial<WeatherPrefs>;
      set({ prefs: { cities: w.cities ?? [], fallback: w.fallback ?? null, geo: w.geo ?? null } });
    }
    await refresh();
    setInterval(() => document.visibilityState === 'visible' && void refresh(), 15 * 60_000);
  })();
}

export function useWeather() {
  useEffect(start, []);
  const s = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => state,
    () => state,
  );
  return {
    ...s,
    refresh: (force = true) => refresh(force),
    addCity: (p: Place) => savePrefs({ ...s.prefs, cities: [...s.prefs.cities.filter((c) => !(c.lat === p.lat && c.lon === p.lon)), p] }),
    removeCity: (p: Place) => savePrefs({ ...s.prefs, cities: s.prefs.cities.filter((c) => !(c.lat === p.lat && c.lon === p.lon)) }),
    setFallback: async (p: Place | null) => {
      await savePrefs({ ...s.prefs, fallback: p });
      await refresh(true);
    },
    /** Volver a pedir el GPS (si antes se negó). */
    retryGps: async () => {
      await savePrefs({ ...s.prefs, geo: null });
      await refresh(true);
    },
  };
}
