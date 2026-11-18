'use client';

import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { MUSCLES, muscleLabel, type WorkoutApi } from '@/components/organiza/workoutData';
import { METRICS, useBodyLogs } from '@/components/organiza/bodyData';
import {
  bodySeries, buckets, change, daysBetween, exercises, iso, muscleStimulus, parse, PERIODS, ranges, recordsIn, totals,
  type PeriodId, type Range,
} from '@/components/organiza/progressData';

/**
 * 📈 Centro de Progreso (MODIFICACIÓN 03, 2026-11-18). Todo sale de los entrenos guardados por el Focus y del
 * perfil físico (cálculos en `progressData.ts`). Un color por gráfico (rojo Workout Pro, validado contra el fondo).
 * Lo que es estimación (1RM, estímulo muscular) lo dice en pantalla.
 */

const MARK = '#ef4444';
const n = (x: number, d = 0) => x.toLocaleString('es-CL', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const kg = (x: number) => `${n(x, 1)} kg`;
const shortDay = (s: string) => parse(s).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });

/* ── Gráficos (SVG, con hover) ────────────────────────────────────────────────────── */

type Tip = { x: number; y: number; text: string } | null;

const Bars: React.FC<{ data: { label: string; value: number; tip: string }[]; unit: string; height?: number }> = ({ data, unit, height = 170 }) => {
  const [tip, setTip] = useState<Tip>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const W = 600;
  const H = height;
  const pad = { l: 8, r: 8, t: 14, b: 22 };
  const bw = (W - pad.l - pad.r) / Math.max(1, data.length);
  const every = Math.ceil(data.length / 8);
  return (
    <div className="relative" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Gráfico de barras: ${unit}`}>
        {[0.5, 1].map((f) => <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + (H - pad.t - pad.b) * (1 - f)} y2={pad.t + (H - pad.t - pad.b) * (1 - f)} stroke="rgba(255,255,255,0.07)" />)}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="rgba(255,255,255,0.18)" />
        {data.map((d, i) => {
          const h = ((H - pad.t - pad.b) * d.value) / max;
          const x = pad.l + i * bw + 1;
          const w = Math.max(2, Math.min(36, bw - 2));
          const cx = x + (bw - 2 - w) / 2;
          return (
            <g key={i}>
              {d.value > 0 && <path d={`M ${cx} ${H - pad.b} V ${H - pad.b - h + Math.min(4, h)} Q ${cx} ${H - pad.b - h} ${cx + Math.min(4, w / 2)} ${H - pad.b - h} H ${cx + w - Math.min(4, w / 2)} Q ${cx + w} ${H - pad.b - h} ${cx + w} ${H - pad.b - h + Math.min(4, h)} V ${H - pad.b} Z`} fill={MARK} />}
              {/* zona de hover más grande que la barra */}
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={(e) => setTip({ x: ((pad.l + i * bw + bw / 2) / W) * 100, y: ((H - pad.b - h) / H) * 100, text: d.tip })} onClick={() => setTip({ x: ((pad.l + i * bw + bw / 2) / W) * 100, y: ((H - pad.b - h) / H) * 100, text: d.tip })} />
              {i % every === 0 && <text x={pad.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#a1a1aa">{d.label}</text>}
            </g>
          );
        })}
        <text x={pad.l} y={10} fontSize="10" fill="#71717a">máx. {n(max, 1)} {unit}</text>
      </svg>
      {tip && <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-[#27272a] px-2 py-1 text-[11px] font-semibold text-[#fafafa] shadow-lg ring-1 ring-white/10" style={{ left: `${tip.x}%`, top: `calc(${tip.y}% - 4px)` }}>{tip.text}</span>}
    </div>
  );
};

const Line: React.FC<{ points: { day: string; value: number; tip: string }[]; unit: string; from: string; to: string; base?: { day: string; value: number } | null }> = ({ points, unit, from, to, base }) => {
  const [tip, setTip] = useState<Tip>(null);
  const W = 600;
  const H = 180;
  const pad = { l: 40, r: 12, t: 14, b: 22 };
  const all = [...(base ? [base] : []), ...points];
  const vals = all.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || Math.max(1, hi * 0.1);
  const y0 = lo - span * 0.15;
  const y1 = hi + span * 0.15;
  const t0 = parse(base && base.day < from ? base.day : from).getTime();
  const t1 = parse(to).getTime();
  const X = (d: string) => pad.l + ((parse(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  const path = all.map((p, i) => `${i ? 'L' : 'M'} ${X(p.day).toFixed(1)} ${Y(p.value).toFixed(1)}`).join(' ');
  return (
    <div className="relative" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Gráfico de línea en ${unit}`}>
        {[y0 + (y1 - y0) * 0.25, y0 + (y1 - y0) * 0.75].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={Y(v)} y2={Y(v)} stroke="rgba(255,255,255,0.07)" />
            <text x={pad.l - 6} y={Y(v) + 4} textAnchor="end" fontSize="10" fill="#71717a">{n(v, 1)}</text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="rgba(255,255,255,0.18)" />
        <text x={pad.l} y={H - 6} fontSize="11" fill="#a1a1aa">{shortDay(base && base.day < from ? base.day : from)}</text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" fontSize="11" fill="#a1a1aa">{shortDay(to)}</text>
        {all.length > 1 && <path d={path} fill="none" stroke={MARK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {all.map((p, i) => {
          const isBase = base && i === 0;
          return (
            <g key={i}>
              <circle cx={X(p.day)} cy={Y(p.value)} r={5} fill={isBase ? '#14161b' : MARK} stroke={isBase ? MARK : '#14161b'} strokeWidth={2} />
              <circle cx={X(p.day)} cy={Y(p.value)} r={14} fill="transparent" onMouseEnter={() => setTip({ x: (X(p.day) / W) * 100, y: (Y(p.value) / H) * 100, text: isBase ? `Antes del período · ${shortDay(p.day)}: ${n(p.value, 1)} ${unit}` : (p as unknown as { tip: string }).tip })} onClick={() => setTip({ x: (X(p.day) / W) * 100, y: (Y(p.value) / H) * 100, text: isBase ? `Antes del período · ${shortDay(p.day)}: ${n(p.value, 1)} ${unit}` : (p as unknown as { tip: string }).tip })} />
            </g>
          );
        })}
      </svg>
      {tip && <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-[#27272a] px-2 py-1 text-[11px] font-semibold text-[#fafafa] shadow-lg ring-1 ring-white/10" style={{ left: `${Math.min(85, Math.max(15, tip.x))}%`, top: `calc(${tip.y}% - 8px)` }}>{tip.text}</span>}
    </div>
  );
};

/* ── Piezas ───────────────────────────────────────────────────────────────────────── */

const Card: React.FC<{ title: string; sub?: string; children: React.ReactNode }> = ({ title, sub, children }) => (
  <section className="rounded-3xl bg-white/[0.03] p-4 ring-1 ring-white/10 sm:p-5">
    <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
    {sub && <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>}
    <div className="mt-3">{children}</div>
  </section>
);

const Delta: React.FC<{ now: number; before: number }> = ({ now, before }) => {
  const c = change(now, before);
  if (c === null) return <span className="text-[11px] text-zinc-500">{now ? 'sin datos antes para comparar' : '—'}</span>;
  if (Math.abs(c) < 0.5) return <span className="text-[11px] text-zinc-400">= igual que antes</span>;
  return <span className="text-[11px] font-semibold text-zinc-200">{c > 0 ? '▲' : '▼'} {n(Math.abs(c))}% vs período anterior</span>;
};

/* ── Centro de Progreso ───────────────────────────────────────────────────────────── */

export const ProgressCenter: React.FC<{ api: WorkoutApi; onClose: () => void }> = ({ api, onClose }) => {
  const body = useBodyLogs();
  const today = iso(new Date());
  const [period, setPeriod] = useState<PeriodId>('mes');
  const [custom, setCustom] = useState<Range>({ from: iso(new Date(Date.now() - 59 * 86_400_000)), to: today });
  const { cur, prev } = ranges(period, today, custom.from <= custom.to ? custom : { from: custom.to, to: custom.from });
  const logs = api.logs;

  const t = useMemo(() => totals(logs, cur), [logs, cur.from, cur.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const tp = useMemo(() => totals(logs, prev), [logs, prev.from, prev.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = useMemo(() => buckets(logs, cur), [logs, cur.from, cur.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const ex = useMemo(() => exercises(logs), [logs]);
  const recs = recordsIn(ex, cur);
  const muscles = useMemo(() => muscleStimulus(logs, cur, MUSCLES.map((m) => m.id)), [logs, cur.from, cur.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const inPeriod = ex.filter((x) => x.sessions.some((s) => s.day >= cur.from && s.day <= cur.to)).sort((a, z) => z.sessions.length - a.sessions.length);
  const [exName, setExName] = useState<string>('');
  const chosen = inPeriod.find((x) => x.name === exName) ?? inPeriod[0];
  const metricsWithData = METRICS.filter((m) => body.logs.some((l) => typeof l[m.id] === 'number'));
  const [metric, setMetric] = useState<string>('weight');
  const m = metricsWithData.find((x) => x.id === metric) ?? metricsWithData[0];
  const bs = m ? bodySeries(body.logs as unknown as { day: string }[], m.id, cur) : null;
  const weeks = daysBetween(cur.from, cur.to) / 7;

  // Explicaciones sencillas, armadas solo con los números de arriba.
  const story: string[] = [];
  if (!t.workouts) story.push('No hay entrenos guardados en este período. Cuando termines un entreno en el Focus aparecerá aquí.');
  else {
    story.push(`Entrenaste ${t.days} ${t.days === 1 ? 'día' : 'días'}${weeks >= 1.5 ? ` (unos ${n(t.days / weeks, 1)} por semana)` : ''} e hiciste ${t.sets} series efectivas.`);
    const cv = change(t.volume, tp.volume);
    if (cv !== null && Math.abs(cv) >= 5) story.push(`Tu volumen ${cv > 0 ? 'subió' : 'bajó'} ${n(Math.abs(cv))}% respecto al período anterior${cv < 0 ? ' (puede ser descanso, viaje o una semana liviana: no siempre es malo)' : ''}.`);
    if (recs.length) story.push(`Lograste ${recs.length} ${recs.length === 1 ? 'récord' : 'récords'} de peso: ${recs.slice(0, 3).map((r) => r.name).join(', ')}${recs.length > 3 ? '…' : ''}. 🏆`);
    const trained = muscles.filter((x) => x.score > 0);
    if (trained.length) {
      const low = muscles.filter((x) => x.score === 0).map((x) => muscleLabel(x.id));
      story.push(`Lo que más trabajaste: ${trained.slice(0, 2).map((x) => muscleLabel(x.id)).join(' y ')}.${low.length ? ` Sin estímulo en este período: ${low.slice(0, 3).join(', ')}${low.length > 3 ? '…' : ''}.` : ''}`);
    }
  }

  return (
    <BodyPortal>
      <div role="dialog" aria-label="Centro de progreso" className="theme-fixed fixed inset-0 z-[96] flex flex-col bg-[#0b0c0f] text-left">
        <header className="border-b border-white/10 px-4 pb-3 pt-3">
          <div className="flex items-center gap-2">
            <p className="flex-1 font-display text-xl font-semibold text-white">📈 Centro de progreso</p>
            <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-2 text-zinc-300 hover:bg-white/10"><X className="h-5 w-5" /></button>
          </div>
          <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
            {PERIODS.map((p) => (
              <button key={p.id} type="button" onClick={() => setPeriod(p.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${period === p.id ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-300 ring-white/15 hover:bg-white/[0.06]'}`}>{p.label}</button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <label>Desde <input type="date" value={custom.from} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className="ml-1 rounded-lg bg-white/[0.06] px-2 py-1 text-zinc-100 ring-1 ring-white/10" /></label>
              <label>Hasta <input type="date" value={custom.to} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className="ml-1 rounded-lg bg-white/[0.06] px-2 py-1 text-zinc-100 ring-1 ring-white/10" /></label>
            </div>
          )}
          <p className="mt-2 text-[11px] text-zinc-500">{shortDay(cur.from)} – {shortDay(cur.to)} · comparado con {shortDay(prev.from)} – {shortDay(prev.to)}</p>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl space-y-4 p-4">
            {/* Indicadores */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: 'Días entrenados', now: t.days, before: tp.days, show: n(t.days) },
                { label: 'Series efectivas', now: t.sets, before: tp.sets, show: n(t.sets, 1) },
                { label: 'Volumen', now: t.volume, before: tp.volume, show: `${n(t.volume)} kg` },
                { label: 'Minutos', now: t.minutes, before: tp.minutes, show: n(t.minutes) },
              ].map((k) => (
                <div key={k.label} className="rounded-2xl bg-white/[0.04] px-3 py-3 ring-1 ring-white/10">
                  <p className="text-[11px] text-zinc-400">{k.label}</p>
                  <p className="font-display text-2xl font-semibold tabular-nums text-white">{k.show}</p>
                  <Delta now={k.now} before={k.before} />
                </div>
              ))}
            </div>

            <Card title="🗣️ En simple">
              <ul className="space-y-1.5 text-sm text-zinc-200">{story.map((s, i) => <li key={i}>• {s}</li>)}</ul>
            </Card>

            {t.workouts > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title={`Volumen por ${b.unit}`} sub="Peso × repeticiones de tus series efectivas y descargas (sin aproximación).">
                  <Bars unit="kg" data={b.list.map((x) => ({ label: x.label, value: x.volume, tip: `${x.label}: ${n(x.volume)} kg · ${x.sets} series` }))} />
                </Card>
                <Card title={`Entrenos por ${b.unit}`} sub="Cuántas veces entrenaste (frecuencia).">
                  <Bars unit="entrenos" data={b.list.map((x) => ({ label: x.label, value: x.workouts, tip: `${x.label}: ${x.workouts} ${x.workouts === 1 ? 'entreno' : 'entrenos'}` }))} />
                </Card>
              </div>
            )}

            {/* Récords */}
            <Card title="🏆 Récords" sub="Tu mejor peso de cada ejercicio (de todo tu historial). Los logrados en este período van destacados.">
              {ex.some((x) => x.recordWeight) ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {ex.filter((x) => x.recordWeight).sort((a, z) => (z.recordWeight!.day > a.recordWeight!.day ? 1 : -1)).slice(0, 8).map((x) => {
                    const isNew = recs.includes(x);
                    return (
                      <div key={x.name} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1 ${isNew ? 'bg-red-500/10 ring-red-400/40' : 'bg-white/[0.03] ring-white/10'}`}>
                        <span className="text-xl">{isNew ? '🏆' : '🥇'}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{x.name}</p>
                          <p className="text-[11px] text-zinc-400">{shortDay(x.recordWeight!.day)}{isNew ? ' · ¡en este período!' : ''}</p>
                        </div>
                        <p className="font-display text-lg font-semibold tabular-nums text-white">{kg(x.recordWeight!.weight)}<span className="text-xs font-normal text-zinc-400"> × {x.recordWeight!.reps ?? '—'}</span></p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Aún no hay series con peso anotado.</p>
              )}
            </Card>

            {/* Evolución por ejercicio */}
            <Card title="🏋️ Evolución por ejercicio" sub="El peso más alto de cada sesión (series efectivas).">
              {chosen ? (
                <>
                  <select value={chosen.name} onChange={(e) => setExName(e.target.value)} aria-label="Ejercicio" className="mb-3 w-full rounded-xl bg-white/[0.06] px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/10 sm:w-auto">
                    {inPeriod.map((x) => <option key={x.name} value={x.name}>{x.name} · {x.sessions.filter((s) => s.day >= cur.from && s.day <= cur.to).length} sesiones</option>)}
                  </select>
                  {(() => {
                    const ss = chosen.sessions.filter((s) => s.day >= cur.from && s.day <= cur.to && s.top > 0);
                    const before = chosen.sessions.filter((s) => s.day < cur.from && s.top > 0).at(-1) ?? null;
                    const first = before ?? ss[0];
                    const last = ss.at(-1);
                    const best = Math.max(0, ...ss.map((s) => s.best1rm ?? 0));
                    return (
                      <>
                        {ss.length ? <Line unit="kg" from={cur.from} to={cur.to} base={before ? { day: before.day, value: before.top } : null} points={ss.map((s) => ({ day: s.day, value: s.top, tip: `${shortDay(s.day)}: ${kg(s.top)} × ${s.topReps ?? '—'} · ${s.sets} series` }))} /> : <p className="text-sm text-zinc-500">En este período no hay series con peso para este ejercicio.</p>}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-300">
                          {first && last && first !== last && <span>{last.top >= first.top ? '▲' : '▼'} {kg(Math.abs(last.top - first.top))} desde {shortDay(first.day)}</span>}
                          {best > 0 && <span className="text-zinc-400">1RM estimado: ~{kg(Math.round(best * 2) / 2)} <span className="text-zinc-500">(estimación con la fórmula de Epley, no una medición)</span></span>}
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : (
                <p className="text-sm text-zinc-500">No hay ejercicios registrados en este período.</p>
              )}
            </Card>

            {/* Músculos */}
            <Card title="💪 Estímulo por músculo" sub="Puntaje ESTIMADO: series efectivas, con más peso si quedaste cerca del fallo; el músculo principal del ejercicio cuenta entero y los que ayudan, la mitad.">
              {muscles.some((x) => x.score > 0) ? (
                <ul className="space-y-1.5">
                  {muscles.map((x) => {
                    const max = muscles[0].score || 1;
                    return (
                      <li key={x.id} className="grid grid-cols-[110px_1fr_auto] items-center gap-2 text-xs sm:grid-cols-[140px_1fr_auto]">
                        <span className="truncate text-zinc-200">{muscleLabel(x.id)}</span>
                        <span className="h-3 overflow-hidden rounded-full bg-white/[0.05]">{x.score > 0 && <span className="block h-full rounded-full" style={{ width: `${(x.score / max) * 100}%`, background: MARK }} />}</span>
                        <span className="w-32 text-right tabular-nums text-zinc-400 sm:w-40">{x.score > 0 ? `${x.sets > 0 ? `${n(x.sets, 1)} series` : 'como apoyo'} · ${x.days} ${x.days === 1 ? 'día' : 'días'}${weeks >= 1.5 ? ` (${n(x.perWeek, 1)}/sem)` : ''}` : 'sin estímulo'}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">Sin entrenos en este período.</p>
              )}
            </Card>

            {/* Cuerpo */}
            <Card title="📏 Medidas corporales" sub="De tu perfil físico. El punto hueco es tu último registro antes del período (para ver de dónde partiste).">
              {m && bs ? (
                <>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {metricsWithData.map((x) => <button key={x.id} type="button" onClick={() => setMetric(x.id)} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${m.id === x.id ? 'bg-red-500 text-[#fff] ring-red-400' : 'text-zinc-300 ring-white/15'}`}>{x.label}</button>)}
                  </div>
                  {bs.points.length ? (
                    <>
                      <Line unit={m.unit} from={cur.from} to={cur.to} base={bs.base} points={bs.points.map((p) => ({ ...p, tip: `${shortDay(p.day)}: ${n(p.value, 1)} ${m.unit}` }))} />
                      {(() => {
                        const a = bs.base ?? bs.points[0];
                        const z = bs.points.at(-1)!;
                        const d = +(z.value - a.value).toFixed(1);
                        return a !== z ? <p className="mt-2 text-xs text-zinc-300">{d === 0 ? '= Sin cambio' : `${d > 0 ? '▲' : '▼'} ${n(Math.abs(d), 1)} ${m.unit}`} entre el {shortDay(a.day)} y el {shortDay(z.day)}.</p> : <p className="mt-2 text-xs text-zinc-500">Un solo registro: con el próximo verás el cambio.</p>;
                      })()}
                    </>
                  ) : (
                    <p className="text-sm text-zinc-500">No registraste {m.label.toLowerCase()} en este período.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-zinc-500">Aún no hay registros en tu perfil físico. Haz el primero en Workout Pro → 📏 Tu perfil físico.</p>
              )}
            </Card>

            <p className="pb-4 text-center text-[11px] text-zinc-600">Solo se usan tus entrenos guardados y tus registros del perfil físico. Las estimaciones están marcadas como tales.</p>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
};

