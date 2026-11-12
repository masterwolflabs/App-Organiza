'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, LocateFixed, MapPin, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useWeather } from '@/components/organiza/useWeather';
import { useHorario } from '@/components/organiza/useHorario';
import { forecast, hintFor, sceneOf, searchCity, weatherEmoji, weatherLabel, type Forecast, type Place, type Scene } from '@/utils/weather';

/**
 * 🌡️ Tiempo (Emanuel, 2026-11-12: «como la app Tiempo de Apple»): la misma estructura — ciudad, temperatura
 * gigante, estado, máx/mín, la franja por hora, los próximos 10 días con su barra de temperaturas — con el
 * diseño de Organiza. Varias ciudades (se guardan en la cuenta) y «Hoy en tu horario»: los avisos del clima
 * para tus acciones de hoy (paraguas, bloqueador, calor, frío).
 */

const BG: Record<Scene, string> = {
  despejado: 'from-sky-500/40 via-sky-700/30 to-indigo-900/40',
  calor: 'from-orange-400/50 via-amber-500/30 to-rose-700/40',
  parcial: 'from-sky-400/30 via-slate-600/30 to-slate-800/40',
  nublado: 'from-slate-400/30 via-slate-600/30 to-slate-800/50',
  niebla: 'from-zinc-300/25 via-zinc-500/25 to-zinc-800/40',
  llovizna: 'from-slate-500/40 via-sky-900/30 to-slate-900/50',
  lluvia: 'from-slate-600/50 via-sky-950/40 to-slate-950/60',
  nieve: 'from-slate-200/30 via-sky-200/20 to-slate-600/40',
  tormenta: 'from-indigo-800/50 via-slate-900/50 to-black/60',
};
const NIGHT = 'from-indigo-950/70 via-slate-900/60 to-black/60';

const dayName = (iso: string, i: number) => (i === 0 ? 'Hoy' : new Date(`${iso}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', ''));
const hh = (iso: string) => iso.slice(11, 13);
const t = (n: number) => `${Math.round(n)}°`;

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <section className={`theme-fixed rounded-2xl bg-black/25 p-4 ring-1 ring-white/10 backdrop-blur ${className}`}>
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-white/60">{title}</p>
    {children}
  </section>
);

const Pane: React.FC<{ f: Forecast; gps?: boolean }> = ({ f, gps }) => {
  const h = useHorario();
  const nowIdx = Math.max(0, f.hours.findIndex((x) => x.time.slice(0, 13) === f.now.time.slice(0, 13)));
  const next = f.hours.slice(nowIdx, nowIdx + 25);
  const lo = Math.min(...f.days.map((d) => d.min));
  const hi = Math.max(...f.days.map((d) => d.max));
  const today = f.days[0];
  // Avisos del clima para tus acciones de hoy (solo con tu ubicación: es donde estás).
  const todayIso = f.now.time.slice(0, 10);
  const items = h.itemsOn(new Date()).filter((i) => i.time >= f.now.time.slice(11, 16));
  const hints = items.map((i) => ({ i, hint: hintFor(f, todayIso, i.time) })).filter((x) => x.hint);
  return (
    <div className="space-y-4 text-white">
      <div className="py-6 text-center">
        <p className="flex items-center justify-center gap-1.5 text-2xl font-semibold">
          {gps && <LocateFixed className="h-4 w-4 text-white/70" />}
          {f.place.name}
        </p>
        <p className="font-display text-8xl font-extralight leading-none tracking-tight">{t(f.now.temp)}</p>
        <p className="mt-1 text-lg text-white/80">
          {weatherEmoji(f.now.code, f.now.day)} {weatherLabel(f.now.code)}
        </p>
        {today && (
          <p className="text-base text-white/80">
            Máx.: {t(today.max)} · Mín.: {t(today.min)}
          </p>
        )}
        <p className="text-sm text-white/60">Sensación térmica {t(f.now.feels)}</p>
      </div>

      <Card title="🕐 Por hora">
        <div className="flex gap-5 overflow-x-auto pb-1">
          {next.map((x, i) => (
            <div key={x.time} className="flex shrink-0 flex-col items-center gap-1.5 text-sm">
              <span className="font-semibold text-white/80">{i === 0 ? 'Ahora' : hh(x.time)}</span>
              <span className="text-2xl">{weatherEmoji(x.code, x.day)}</span>
              {x.rain >= 20 ? <span className="text-[11px] font-semibold text-sky-300">{x.rain}%</span> : <span className="text-[11px]">&nbsp;</span>}
              <span className="font-semibold">{t(x.temp)}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title="📅 Próximos 10 días">
          <ul className="divide-y divide-white/10">
            {f.days.map((d, i) => {
              const left = ((d.min - lo) / Math.max(1, hi - lo)) * 100;
              const width = ((d.max - d.min) / Math.max(1, hi - lo)) * 100;
              return (
                <li key={d.date} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-12 font-semibold capitalize">{dayName(d.date, i)}</span>
                  <span className="flex w-12 flex-col items-center text-xl leading-none">
                    {weatherEmoji(d.code)}
                    {d.rain >= 20 && <span className="mt-0.5 text-[10px] font-semibold text-sky-300">{d.rain}%</span>}
                  </span>
                  <span className="w-9 text-right text-white/60">{t(d.min)}</span>
                  <span className="relative h-1.5 flex-1 rounded-full bg-white/15">
                    <span className="absolute h-full rounded-full bg-gradient-to-r from-sky-300 via-amber-300 to-orange-400" style={{ left: `${left}%`, width: `${Math.max(4, width)}%` }} />
                  </span>
                  <span className="w-9 font-semibold">{t(d.max)}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="📋 Hoy en tu horario">
          {hints.length ? (
            <ul className="space-y-2">
              {hints.map(({ i, hint }) => (
                <li key={i.id} className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2 text-sm">
                  <span className="text-xl">{hint!.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <b className="tabular-nums">{i.time}</b> {i.title}
                    <span className="block text-xs text-white/70">{hint!.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-white/70">Nada que avisar para lo que te queda de hoy. 👌</p>
          )}
          {today && (
            <p className="mt-4 text-xs text-white/60">
              🌅 Sale el sol {today.sunrise.slice(11, 16)} · 🌇 se pone {today.sunset.slice(11, 16)}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
};

export const TiempoView: React.FC = () => {
  const w = useWeather();
  const [sel, setSel] = useState<number>(-1); // -1 = mi ubicación
  const [other, setOther] = useState<Forecast | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [fallbackMode, setFallbackMode] = useState(false);

  const city = sel >= 0 ? w.prefs.cities[sel] : null;
  useEffect(() => {
    if (!city) return setOther(null);
    let alive = true;
    forecast(city).then((f) => alive && setOther(f)).catch(() => alive && setOther(null));
    return () => {
      alive = false;
    };
  }, [city]);
  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const id = setTimeout(() => void searchCity(q).then(setFound), 300);
    return () => clearTimeout(id);
  }, [q]);

  const f = sel >= 0 ? other : w.here;
  const scene = f ? sceneOf(f.now.code, f.now.temp) : 'despejado';
  const bg = f && !f.now.day ? NIGHT : BG[scene];
  const names = useMemo(() => w.prefs.cities.map((c) => c.name.split(',')[0]), [w.prefs.cities]);

  const pick = async (p: Place) => {
    setBusy(true);
    if (fallbackMode) await w.setFallback(p);
    else await w.addCity(p);
    setBusy(false);
    setAdding(false);
    setFallbackMode(false);
    setQ('');
    if (!fallbackMode) setSel(w.prefs.cities.length);
  };

  return (
    <div className={`theme-fixed relative mx-auto max-w-[1100px] overflow-hidden rounded-3xl bg-gradient-to-b p-4 sm:p-6 ${bg} bg-[#0b0f16]`}>
      {/* Ciudades: «Mi ubicación» primero y tus guardadas; se cambia tocando. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setSel(-1)} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ${sel === -1 ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}>
          {w.hereIsGps ? <LocateFixed className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />} {w.here?.place.name ?? 'Mi ubicación'}
        </button>
        {w.prefs.cities.map((c, i) => (
          <span key={`${c.lat},${c.lon}`} className={`inline-flex items-center gap-1 rounded-full py-1.5 pl-3 pr-1.5 text-xs font-semibold ${sel === i ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}>
            <button type="button" onClick={() => setSel(i)}>
              {names[i]}
            </button>
            <button type="button" onClick={() => { void w.removeCity(c); setSel(-1); }} aria-label={`Quitar ${c.name}`} className="rounded-full p-0.5 opacity-60 hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <button type="button" onClick={() => { setAdding((o) => !o); setFallbackMode(false); }} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
          <Plus className="h-3.5 w-3.5" /> Ciudad
        </button>
        <button type="button" onClick={() => void w.refresh(true)} className="ml-auto rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Actualizar" data-help="Actualizar el clima">
          {w.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {adding && (
        <div className="mt-3 space-y-2 rounded-2xl bg-black/30 p-3 ring-1 ring-white/10">
          <label className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
            <Search className="h-4 w-4 text-white/60" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={fallbackMode ? 'Ciudad de respaldo (si no das tu ubicación)…' : 'Buscar ciudad…'} className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none" />
          </label>
          {found.map((p) => (
            <button key={`${p.lat},${p.lon}`} type="button" disabled={busy} onClick={() => void pick(p)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/10">
              <MapPin className="h-4 w-4 text-white/50" /> {p.name}
              {p.country && <span className="text-white/50">· {p.country}</span>}
            </button>
          ))}
        </div>
      )}

      {w.error && sel === -1 && <p className="mt-3 rounded-xl bg-rose-500/20 px-3 py-2 text-sm text-rose-100">{w.error}</p>}
      {f ? (
        <Pane f={f} gps={sel === -1 && w.hereIsGps} />
      ) : (
        <div className="flex h-72 items-center justify-center text-white/70">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Leyendo el clima…
        </div>
      )}

      {sel === -1 && (
        <p className="mt-4 text-center text-xs text-white/60">
          {w.hereIsGps ? (
            'Con tu ubicación.'
          ) : (
            <>
              Sin permiso de ubicación: usando {w.prefs.fallback?.name ?? 'Santiago'}.{' '}
              <button type="button" onClick={() => void w.retryGps()} className="underline underline-offset-2 hover:text-white">
                Usar mi ubicación
              </button>
            </>
          )}{' '}
          ·{' '}
          <button type="button" onClick={() => { setAdding(true); setFallbackMode(true); }} className="underline underline-offset-2 hover:text-white">
            Cambiar ciudad de respaldo
          </button>{' '}
          · Datos: Open-Meteo
        </p>
      )}
    </div>
  );
};
