// Pruebas de la comparación de experimentos (Workout Pro). Correr: node --experimental-strip-types scripts/test-experiment.mts
import { compare } from '../components/organiza/experimentData.ts';
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(ok ? '✅' : '❌', name, ok ? '' : `→ got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); if (!ok) process.exitCode = 1; };
const S = (weight: number, reps: number, extra: object = {}) => ({ weight, reps, done: true, ...extra });
const log = (day: string, name: string, muscles: string[], sets: object[], extra: object = {}) => ({ id: day + name, routine_id: null, day, title: '', core: false, version: 'completa', quality_done: 0, quality_total: 0, minutes: 40, feel: 'bien', notes: '', exercises: [{ name, muscles, key: true, sets }], ...extra });
const logs = [
  // habitual (antes del 15 nov): tríceps 2 veces
  log('2026-11-04', 'Press francés', ['triceps'], [S(20, 10), S(20, 9), S(20, 8)]),
  log('2026-11-11', 'Press francés', ['triceps'], [S(22.5, 8, { rir: 2 }), S(22.5, 8, { rir: 1 })], { feel: 'duro' }),
  log('2026-11-12', 'Sentadilla', ['cuadriceps'], [S(80, 5)]),
  // experimento (desde 15 nov)
  log('2026-11-15', 'JM press', ['triceps'], [S(30, 8, { kind: 'warmup' }), S(40, 8, { rir: 2 }), S(40, 7, { rir: 1 }), S(30, 10, { kind: 'drop' })], { experiment_id: 'x1', feel: 'bien' }),
  log('2026-11-18', 'JM press', ['triceps'], [S(42.5, 8, { rir: 2 }), S(42.5, 8, { rir: 2 }), S(42.5, 7, { rir: 1 })], { experiment_id: 'x1', feel: 'facil' }),
  log('2026-11-16', 'Curl', ['biceps'], [S(12, 10)], { experiment_id: 'x1' }),
] as never[];
const checkins = [{ day: '2026-11-15', enjoyment: 5, effort: 3, pain: 'no', notes: '', soreness_next: 2 }, { day: '2026-11-18', enjoyment: 4, effort: 2, pain: 'molestia', notes: 'codo', soreness_next: null }] as never[];
const c = compare({ logs, experimentId: 'x1', muscles: ['triceps'], started: '2026-11-15', ends: '2026-12-13', today: '2026-11-18', checkins });
eq('período de prueba hasta hoy', c.trial, { from: '2026-11-15', to: '2026-11-18' });
eq('habitual = mismo largo (4 días) justo antes', c.habitual, { from: '2026-11-11', to: '2026-11-14' });
eq('experimento: 2 sesiones de tríceps (curl no cuenta, otro músculo)', c.exp.sessions, 2);
eq('experimento: series 2 + descarga 0,5 + 3 = 5,5 (menos de 1 semana: no se extrapola)', c.exp.setsPerWeek, 5.5);
eq('experimento: mejor carga (no cuenta aproximación ni descarga)', c.exp.best, { name: 'JM press', weight: 42.5, reps: 8 });
eq('experimento: RIR promedio (2,1,2,2,1)', c.exp.avgRir, 1.6);
eq('experimento: disfrute y agujetas y molestias', [c.exp.enjoyment, c.exp.sorenessNext, c.exp.painSessions], [4.5, 2, 1]);
eq('habitual: 1 sesión de tríceps en su ventana (11 nov), sin experimentos', [c.hab.sessions, c.hab.best], [1, { name: 'Press francés', weight: 22.5, reps: 8 }]);
eq('habitual: esfuerzo «duro» = 3', c.hab.feel, 3);
eq('aviso de período corto', c.notes.some((n) => n.includes('menos de 2 semanas')), true);
const sinHab = compare({ logs, experimentId: 'x1', muscles: ['pecho'], started: '2026-11-15', ends: null, today: '2026-11-18', checkins: [] });
eq('sin datos de esos músculos → lo dice, no inventa', [sinHab.exp.sessions, sinHab.hab.sessions, sinHab.enoughData, sinHab.notes.length >= 2], [0, 0, false, true]);
