'use client';

import React from 'react';
import { muscleLabel, type MuscleId } from '@/components/organiza/workoutData';

/**
 * 🧍 La figura de Workout Pro (2026-11-17): de frente y de espalda, hombre o mujer (del perfil; si no lo
 * dice, la de hombre). Cada músculo se pinta por cuántas veces lo trabajaste en los entrenos TERMINADOS de
 * los últimos 7 días: 2 o más = rojo intenso · 1 = rojo suave · 0 = transparente (solo el contorno).
 */

type Shape = { m: MuscleId; d?: string; e?: [number, number, number, number, number?] };

const fill = (n: number) => (n >= 2 ? 'rgba(239,68,68,0.92)' : n === 1 ? 'rgba(248,113,113,0.42)' : 'rgba(255,255,255,0.03)');
const stroke = (n: number) => (n >= 2 ? 'rgba(254,202,202,0.9)' : n === 1 ? 'rgba(252,165,165,0.7)' : 'rgba(255,255,255,0.22)');

/** Medidas de la silueta (en unidades del dibujo, centro x = 100). */
const BUILD = {
  hombre: { sh: 40, waist: 27, hip: 31, chest: 1 },
  mujer: { sh: 33, waist: 22, hip: 35, chest: 0.85 },
};

function silhouette(b: (typeof BUILD)['hombre']) {
  const { sh, waist, hip } = b;
  // Torso: hombros → cintura → cadera.
  const torso = `M ${100 - sh} 66 Q 100 56 ${100 + sh} 66 L ${100 + sh - 4} 112 Q ${100 + waist + 2} 150 ${100 + waist} 168 Q ${100 + hip} 186 ${100 + hip} 204 L ${100 - hip} 204 Q ${100 - hip} 186 ${100 - waist} 168 Q ${100 - waist - 2} 150 ${100 - sh + 4} 112 Z`;
  return torso;
}

function shapes(view: 'frente' | 'espalda', b: (typeof BUILD)['hombre']): Shape[] {
  const { sh, waist, hip, chest } = b;
  const arm = sh + 9;
  const both = (m: MuscleId, x: number, y: number, rx: number, ry: number, rot = 0): Shape[] => [
    { m, e: [100 - x, y, rx, ry, -rot] },
    { m, e: [100 + x, y, rx, ry, rot] },
  ];
  const common: Shape[] = [
    ...both('hombros', sh - 3, 74, 11, 10),
    ...both('antebrazos', arm + 4, 166, 6.5, 21, -6),
    ...both('pantorrillas', 21, 340, 8.5, 26),
  ];
  if (view === 'frente')
    return [
      ...common,
      ...both('pecho', 15 * chest + 1, 92, 16 * chest, 12),
      ...both('biceps', arm, 112, 7.5, 17, -4),
      { m: 'abdominales', d: `M 89 108 Q 100 104 111 108 L 110 164 Q 100 170 90 164 Z` },
      ...both('oblicuos', waist - 3, 140, 5.5, 18),
      ...both('cuadriceps', hip - 12, 254, 13.5, 40, 4),
    ];
  return [
    ...common,
    { m: 'trapecio', d: `M 100 60 L ${100 + sh - 12} 72 L 100 104 L ${100 - sh + 12} 72 Z` },
    ...both('dorsales', sh - 18, 116, 14, 26, 10),
    { m: 'lumbares', d: `M 90 148 L 110 148 L 111 172 Q 100 176 89 172 Z` },
    ...both('triceps', arm, 114, 7.5, 18, -4),
    ...both('gluteos', hip - 15, 206, 16, 17),
    ...both('femorales', hip - 12, 262, 13, 34, 4),
  ];
}

const Figure: React.FC<{ view: 'frente' | 'espalda'; body: 'hombre' | 'mujer'; counts: Record<string, number>; onPick?: (m: MuscleId) => void }> = ({ view, body, counts, onPick }) => {
  const b = BUILD[body];
  const base = 'rgba(255,255,255,0.07)';
  const arm = b.sh + 9;
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox="0 0 200 400" className="h-auto w-full max-w-[170px]" role="img" aria-label={`Cuerpo de ${view}`}>
        {/* Silueta */}
        <circle cx={100} cy={30} r={17} fill={base} />
        <rect x={93} y={44} width={14} height={16} rx={5} fill={base} />
        <path d={silhouette(b)} fill={base} />
        {[-1, 1].map((s) => (
          <g key={s} stroke={base} strokeLinecap="round" fill="none">
            <path d={`M ${100 + s * (b.sh - 2)} 72 L ${100 + s * arm} 128 L ${100 + s * (arm + 5)} 192`} strokeWidth={15} />
            <path d={`M ${100 + s * (b.hip - 12)} 206 L ${100 + s * (b.hip - 13)} 300 L ${100 + s * 21} 378`} strokeWidth={26} />
          </g>
        ))}
        {/* Músculos */}
        {shapes(view, b).map((s, i) => {
          const n = counts[s.m] ?? 0;
          const common = { fill: fill(n), stroke: stroke(n), strokeWidth: 1, className: onPick ? 'cursor-pointer transition-opacity hover:opacity-80' : undefined, onClick: onPick ? () => onPick(s.m) : undefined };
          const title = <title>{`${muscleLabel(s.m)}: ${n === 0 ? 'sin entrenar esta semana' : `${n} ${n === 1 ? 'vez' : 'veces'} en 7 días`}`}</title>;
          if (s.d) return <path key={i} d={s.d} {...common}>{title}</path>;
          const [cx, cy, rx, ry, rot = 0] = s.e!;
          return <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} transform={rot ? `rotate(${rot} ${cx} ${cy})` : undefined} {...common}>{title}</ellipse>;
        })}
      </svg>
      <figcaption className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{view === 'frente' ? 'Frente' : 'Espalda'}</figcaption>
    </figure>
  );
};

export const BodyMap: React.FC<{ body: 'hombre' | 'mujer' | null; counts: Record<string, number>; onPick?: (m: MuscleId) => void }> = ({ body, counts, onPick }) => (
  <div>
    <div className="grid grid-cols-2 gap-2">
      <Figure view="frente" body={body ?? 'hombre'} counts={counts} onPick={onPick} />
      <Figure view="espalda" body={body ?? 'hombre'} counts={counts} onPick={onPick} />
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[11px] text-zinc-400">
      <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full" style={{ background: fill(2) }} /> 2 o más</span>
      <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full" style={{ background: fill(1) }} /> 1 vez</span>
      <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-full ring-1 ring-white/30" /> sin entrenar</span>
      <span className="w-full text-center text-zinc-500">Últimos 7 días, solo entrenos terminados.</span>
    </div>
  </div>
);
