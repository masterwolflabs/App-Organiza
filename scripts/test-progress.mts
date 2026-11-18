// Pruebas del Centro de Progreso (Workout Pro). Correr: node --experimental-strip-types scripts/test-progress.mts
import { totals, buckets, exercises, recordsIn, muscleStimulus, ranges, change, e1rm, bodySeries } from '../components/organiza/progressData.ts';
const W = (weight: number, reps: number, extra: object = {}) => ({ weight, reps, done: true, ...extra });
const logs: any[] = [
  { id: '1', day: '2026-11-03', minutes: 60, exercises: [{ name: 'Press banca', muscles: ['pecho', 'triceps'], key: true, sets: [W(30, 10, { kind: 'warmup' }), W(60, 10, { rir: 2 }), W(60, 9, { rir: 0 }), { weight: 60, reps: 8, done: false }] }] },
  { id: '2', day: '2026-11-10', minutes: 50, exercises: [{ name: 'Press banca', muscles: ['pecho', 'triceps'], key: true, sets: [W(62.5, 8, { rir: 1 }), W(45, 8, { kind: 'drop' })] }, { name: 'Sentadilla', muscles: ['cuadriceps', 'gluteos'], key: true, sets: [W(80, 5)] }] },
  { id: '3', day: '2026-10-20', minutes: 40, exercises: [{ name: 'press banca ', muscles: ['pecho'], key: true, sets: [W(65, 3, { rir: 4 })] }] },
];
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(ok ? '✅' : '❌', name, ok ? '' : `→ got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); if (!ok) process.exitCode = 1; };
const { cur, prev } = ranges('mes', '2026-11-18');
eq('rango mes', cur, { from: '2026-10-20', to: '2026-11-18' });
eq('rango anterior', prev, { from: '2026-09-20', to: '2026-10-19' });
const t = totals(logs, { from: '2026-11-01', to: '2026-11-18' });
// series que cuentan: 60x10, 60x9, 62.5x8, 45x8 (drop), 80x5 = 5 ; aprox. y no hecha fuera
eq('series', t.sets, 5);
eq('volumen', t.volume, 600 + 540 + 500 + 360 + 400);
eq('reps', t.reps, 10 + 9 + 8 + 8 + 5);
eq('entrenos/días/minutos', [t.workouts, t.days, t.minutes], [2, 2, 110]);
eq('cambio sin base = null', change(10, 0), null);
eq('cambio +50%', change(15, 10), 50);
const b = buckets(logs, { from: '2026-11-01', to: '2026-11-18' });
eq('unidad', b.unit, 'semana');
eq('semanas (lun 27 oct…)', b.list.map((x) => [x.key, x.volume, x.workouts]), [['2026-10-26', 0, 0], ['2026-11-02', 1140, 1], ['2026-11-09', 1260, 1], ['2026-11-16', 0, 0]]);
eq('suma barras = total', b.list.reduce((a, x) => a + x.volume, 0), t.volume);
const ex = exercises(logs);
const pb = ex.find((x) => x.name.toLowerCase() === 'press banca')!;
eq('une nombres con espacios/mayúsculas', ex.length, 2);
eq('récord press banca (65×3 del 20 oct)', pb.recordWeight, { weight: 65, reps: 3, day: '2026-10-20' });
eq('sesiones ordenadas', pb.sessions.map((s) => [s.day, s.top, s.topReps]), [['2026-10-20', 65, 3], ['2026-11-03', 60, 10], ['2026-11-10', 62.5, 8]]);
eq('récords en noviembre: solo sentadilla', recordsIn(ex, { from: '2026-11-01', to: '2026-11-18' }).map((x) => x.name), ['Sentadilla']);
eq('e1rm 60×10', +e1rm(60, 10)!.toFixed(2), 80);
eq('e1rm 20 reps = null', e1rm(50, 20), null);
const m = muscleStimulus(logs, { from: '2026-11-01', to: '2026-11-18' }, ['pecho', 'triceps', 'cuadriceps', 'gluteos', 'femorales']);
// pecho: 60x10 rir2 → .85 ; 60x9 rir0 → 1 ; 62.5x8 rir1 → 1 ; drop → .5*.85 = .425 → 3.275
eq('pecho puntaje', m.find((x) => x.id === 'pecho')!.score, 3.27);
eq('triceps = mitad', m.find((x) => x.id === 'triceps')!.score, 1.64);
eq('pecho series directas / días', [m.find((x) => x.id === 'pecho')!.sets, m.find((x) => x.id === 'pecho')!.days], [3.5, 2]);
eq('femorales 0 al final', m.at(-1)!.id, 'femorales');
const body = [{ day: '2026-10-01', weight: 84 }, { day: '2026-11-01', weight: 82.6 }, { day: '2026-11-15', waist: 88 }];
eq('cuerpo: punto de partida y puntos', bodySeries(body, 'weight', { from: '2026-10-20', to: '2026-11-18' }), { points: [{ day: '2026-11-01', value: 82.6 }], base: { day: '2026-10-01', value: 84 } });
