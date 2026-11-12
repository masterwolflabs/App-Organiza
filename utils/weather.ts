/**
 * Clima real (Emanuel, 2026-11-12): Open-Meteo (gratis, sin llave). Actual, por hora (48 h) y 10 días.
 * Se guarda 15 min en el navegador para no pedirlo a cada rato. Los códigos WMO se traducen a una
 * escena (para el cielo del Horario), un emoji y un texto en español.
 */

export type Place = { name: string; country?: string; lat: number; lon: number };
export type Scene = 'despejado' | 'calor' | 'parcial' | 'nublado' | 'niebla' | 'llovizna' | 'lluvia' | 'nieve' | 'tormenta';
export type Hour = { time: string; temp: number; code: number; rain: number; uv: number; day: boolean };
export type Day = { date: string; code: number; max: number; min: number; rain: number; uv: number; sunrise: string; sunset: string };
export type Forecast = {
  place: Place;
  tz: string;
  at: number;
  now: { temp: number; feels: number; code: number; day: boolean; time: string };
  hours: Hour[];
  days: Day[];
};

const CODES: Record<number, { label: string; emoji: string; night?: string; scene: Scene }> = {
  0: { label: 'Despejado', emoji: '☀️', night: '🌙', scene: 'despejado' },
  1: { label: 'Mayormente despejado', emoji: '🌤️', night: '🌙', scene: 'despejado' },
  2: { label: 'Parcialmente nublado', emoji: '⛅', night: '☁️', scene: 'parcial' },
  3: { label: 'Nublado', emoji: '☁️', scene: 'nublado' },
  45: { label: 'Niebla', emoji: '🌫️', scene: 'niebla' },
  48: { label: 'Niebla con escarcha', emoji: '🌫️', scene: 'niebla' },
  51: { label: 'Llovizna débil', emoji: '🌦️', scene: 'llovizna' },
  53: { label: 'Llovizna', emoji: '🌦️', scene: 'llovizna' },
  55: { label: 'Llovizna intensa', emoji: '🌧️', scene: 'llovizna' },
  56: { label: 'Llovizna helada', emoji: '🌧️', scene: 'llovizna' },
  57: { label: 'Llovizna helada', emoji: '🌧️', scene: 'llovizna' },
  61: { label: 'Lluvia débil', emoji: '🌦️', scene: 'lluvia' },
  63: { label: 'Lluvia', emoji: '🌧️', scene: 'lluvia' },
  65: { label: 'Lluvia fuerte', emoji: '🌧️', scene: 'lluvia' },
  66: { label: 'Lluvia helada', emoji: '🌧️', scene: 'lluvia' },
  67: { label: 'Lluvia helada fuerte', emoji: '🌧️', scene: 'lluvia' },
  71: { label: 'Nieve débil', emoji: '🌨️', scene: 'nieve' },
  73: { label: 'Nieve', emoji: '🌨️', scene: 'nieve' },
  75: { label: 'Nieve fuerte', emoji: '❄️', scene: 'nieve' },
  77: { label: 'Granizo fino', emoji: '🌨️', scene: 'nieve' },
  80: { label: 'Chubascos', emoji: '🌦️', scene: 'lluvia' },
  81: { label: 'Chubascos', emoji: '🌧️', scene: 'lluvia' },
  82: { label: 'Chubascos fuertes', emoji: '⛈️', scene: 'lluvia' },
  85: { label: 'Chubascos de nieve', emoji: '🌨️', scene: 'nieve' },
  86: { label: 'Chubascos de nieve', emoji: '❄️', scene: 'nieve' },
  95: { label: 'Tormenta', emoji: '⛈️', scene: 'tormenta' },
  96: { label: 'Tormenta con granizo', emoji: '⛈️', scene: 'tormenta' },
  99: { label: 'Tormenta con granizo', emoji: '⛈️', scene: 'tormenta' },
};
const info = (code: number) => CODES[code] ?? CODES[3];
export const weatherLabel = (code: number) => info(code).label;
export const weatherEmoji = (code: number, day = true) => (day ? info(code).emoji : (info(code).night ?? info(code).emoji));
/** Escena del cielo: despejado y 28 °C o más = «calor» (sol fuerte). */
export const sceneOf = (code: number, temp: number): Scene => {
  const s = info(code).scene;
  return s === 'despejado' && temp >= 28 ? 'calor' : s;
};

const CACHE = 'organiza-clima:';
const TTL = 15 * 60 * 1000;
const key = (p: Place) => `${CACHE}${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;

/** Nombre de la ciudad a partir de la zona horaria («America/Santiago» → «Santiago»). */
export const cityOfTz = (tz: string) => tz.split('/').pop()?.replace(/_/g, ' ') || 'Mi ubicación';

export async function forecast(place: Place, force = false): Promise<Forecast> {
  if (!force) {
    try {
      const c = JSON.parse(localStorage.getItem(key(place)) || 'null') as Forecast | null;
      if (c && Date.now() - c.at < TTL) return { ...c, place: { ...c.place, ...place } };
    } catch {
      /* sin caché */
    }
  }
  const q = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    current: 'temperature_2m,apparent_temperature,weather_code,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability,uv_index,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max',
    timezone: 'auto',
    forecast_days: '10',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!res.ok) throw new Error('No se pudo leer el clima. Revisa internet.');
  const j = await res.json();
  const h = j.hourly ?? {};
  const d = j.daily ?? {};
  const out: Forecast = {
    place,
    tz: j.timezone ?? '',
    at: Date.now(),
    now: { temp: j.current?.temperature_2m ?? 0, feels: j.current?.apparent_temperature ?? 0, code: j.current?.weather_code ?? 0, day: j.current?.is_day !== 0, time: j.current?.time ?? '' },
    hours: (h.time ?? []).map((t: string, i: number) => ({ time: t, temp: h.temperature_2m?.[i] ?? 0, code: h.weather_code?.[i] ?? 0, rain: h.precipitation_probability?.[i] ?? 0, uv: h.uv_index?.[i] ?? 0, day: h.is_day?.[i] !== 0 })),
    days: (d.time ?? []).map((t: string, i: number) => ({ date: t, code: d.weather_code?.[i] ?? 0, max: d.temperature_2m_max?.[i] ?? 0, min: d.temperature_2m_min?.[i] ?? 0, rain: d.precipitation_probability_max?.[i] ?? 0, uv: d.uv_index_max?.[i] ?? 0, sunrise: d.sunrise?.[i] ?? '', sunset: d.sunset?.[i] ?? '' })),
  };
  try {
    localStorage.setItem(key(place), JSON.stringify(out));
  } catch {
    /* sin caché */
  }
  return out;
}

/** Buscador de ciudades (Open-Meteo geocoding, en español). */
export async function searchCity(q: string): Promise<Place[]> {
  if (q.trim().length < 2) return [];
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: q.trim(), count: '8', language: 'es', format: 'json' })}`);
  if (!res.ok) return [];
  const j = await res.json();
  return ((j.results ?? []) as { name: string; country?: string; admin1?: string; latitude: number; longitude: number }[]).map((r) => ({
    name: r.admin1 && r.admin1 !== r.name ? `${r.name}, ${r.admin1}` : r.name,
    country: r.country,
    lat: r.latitude,
    lon: r.longitude,
  }));
}

/** La hora del pronóstico que corresponde a «YYYY-MM-DD» + «HH:MM» (hora local de la ciudad). */
export const hourAt = (f: Forecast, date: string, time: string) => f.hours.find((x) => x.time === `${date}T${time.slice(0, 2)}:00`);

/**
 * Aviso corto para una acción del horario a esa hora (Emanuel: «lleva paraguas a las 18:00»).
 * Solo lo importante; si no hay nada que decir, nada.
 */
export function hintFor(f: Forecast | null, date: string, time: string): { emoji: string; text: string } | null {
  if (!f) return null;
  const h = hourAt(f, date, time);
  if (!h) return null;
  if (info(h.code).scene === 'tormenta') return { emoji: '⛈️', text: `Tormenta a esa hora (${Math.round(h.temp)}°)` };
  if (h.rain >= 50 || ['lluvia', 'llovizna'].includes(info(h.code).scene)) return { emoji: '🌂', text: `Lleva paraguas: ${h.rain}% de lluvia` };
  if (h.temp >= 30) return { emoji: '🥵', text: `Calor fuerte: ${Math.round(h.temp)}°` };
  if (h.day && h.uv >= 7) return { emoji: '🧴', text: `UV alto (${Math.round(h.uv)}): bloqueador` };
  if (h.temp <= 8) return { emoji: '🧥', text: `Frío: ${Math.round(h.temp)}°, abrígate` };
  return null;
}
