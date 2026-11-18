// Pruebas del cuerpo 3D (MOD 09). Correr: node --experimental-strip-types --import ./scripts/ts-ext.mjs scripts/test-muscle-state.mts
import { muscleStates, stimulusLevel, shapeAt, timeline } from '../components/organiza/muscleState.ts';
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(ok ? '✅' : '❌', name, ok ? '' : `→ got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); if (!ok) process.exitCode = 1; };
const S = (n: number, extra: object = {}) => Array.from({ length: n }, () => ({ weight: 50, reps: 10, done: true, ...extra }));
const logs: any[] = [
  // Pecho: 4 series el lunes 16 (1 al fallo) + 1 de aproximación que no cuenta; tríceps de apoyo.
  { id: 'a', day: '2026-11-16', exercises: [{ name: 'Press banca', muscles: ['pecho', 'triceps'], sets: [...S(1, { kind: 'warmup' }), ...S(3, { rir: 2 }), ...S(1, { rir: 0 })] }] },
  // Piernas: 9 series el martes 17 (sesión muy cargada → 72 h).
  { id: 'b', day: '2026-11-17', exercises: [{ name: 'Sentadilla', muscles: ['cuadriceps', 'gluteos'], sets: S(9) }] },
  // Espalda hace 20 días (no entra en 7 días; sí en 28).
  { id: 'c', day: '2026-10-29', exercises: [{ name: 'Remo', muscles: ['dorsales'], sets: S(4) }] },
  // Bíceps: solo 2 series (no cuenta para recuperación).
  { id: 'd', day: '2026-11-18', exercises: [{ name: 'Curl', muscles: ['biceps'], sets: S(2) }] },
];
const ids = ['pecho', 'triceps', 'cuadriceps', 'dorsales', 'biceps', 'pantorrillas'];
const now = new Date('2026-11-18T20:00:00').getTime(); // miércoles 20:00
const st = Object.fromEntries(muscleStates(logs, '2026-11-18', ids, now).map((m) => [m.id, m]));
eq('pecho: 4 series directas, nivel bajo', [st.pecho.sets, st.pecho.level], [4, 1]);
eq('pecho: puntaje 3×0,85 + 1×1', st.pecho.score, 3.55);
eq('tríceps de apoyo: puntaje a la mitad, 0 series directas', [st.triceps.score, st.triceps.sets, st.triceps.level], [1.77, 0, 0]);
eq('pecho: 56 h desde el lunes a mediodía → listo (48 h)', [st.pecho.hoursSince, st.pecho.recovery], [56, 'listo']);
eq('cuádriceps: 9 series → necesita 72 h; van 32 → recuperando, faltan 40', [st.cuadriceps.hoursSince, st.cuadriceps.recovery, st.cuadriceps.hoursLeft], [32, 'recuperando', 40]);
eq('cuádriceps nivel medio', st.cuadriceps.level, 2);
eq('espalda: nada en 7 días pero sí en 28', [st.dorsales.sets, st.dorsales.perWeek, st.dorsales.recovery], [0, 0.3, 'listo']);
eq('bíceps: 2 series no cuentan para recuperación', st.biceps.recovery, 'sin_dato');
eq('pantorrillas sin datos', [st.pantorrillas.score, st.pantorrillas.perWeek, st.pantorrillas.recovery], [0, 0, 'sin_dato']);
// Mirar una fecha pasada: el 16 a fin de día el pecho estaba recuperando.
const past = Object.fromEntries(muscleStates(logs, '2026-11-16', ids).map((m) => [m.id, m]));
eq('16 nov: pecho recuperando, sin las piernas del 17', [past.pecho.recovery, past.cuadriceps.sets], ['recuperando', 0]);
eq('niveles 0/1–4/5–10/>10', [0, 1, 4, 5, 10, 11].map(stimulusLevel), [0, 1, 1, 2, 2, 3]);
// Una sesión con 3 al fallo (aunque sean pocas series) también pide 72 h.
const fail = muscleStates([{ id: 'x', day: '2026-11-17', exercises: [{ name: 'Fondos', muscles: ['triceps'], sets: S(3, { rir: 0 }) }] }] as any, '2026-11-18', ['triceps'], now)[0];
eq('3 al fallo → 72 h', [fail.recovery, fail.hoursLeft], ['recuperando', 40]);

// Proporciones
const rows = [
  { day: '2026-11-01', height: 180, waist: 90, chest: 100 },
  { day: '2026-11-15', waist: 84.6, arm: 40, leg: 70 },
];
const sh = shapeAt(rows, '2026-11-18');
eq('cintura 84,6 / (0,47×180) = 1', sh.ratios.waist, 1);
eq('pecho 100 / 99 = 1,01', sh.ratios.chest, 1.01);
eq('brazo 40 / 34,2 → tope 1,17', sh.ratios.arm, 1.17);
eq('muslo 70 / 55,8 → tope 1,2', sh.ratios.leg, 1.2);
eq('cadera sin medir → estándar y estimada', [sh.ratios.hip, sh.estimated], [1, ['hip']]);
eq('cada medida con su fecha', sh.measured.map((m) => `${m.key}@${m.day}`), ['height@2026-11-01', 'chest@2026-11-01', 'waist@2026-11-15', 'arm@2026-11-15', 'leg@2026-11-15']);
const early = shapeAt(rows, '2026-11-10');
eq('al 10 nov: cintura de entonces (90 → 1,064)', early.ratios.waist, 1.064);
eq('sin estatura → todo estándar', shapeAt([{ day: '2026-11-01', waist: 120 }], '2026-11-18').ratios.waist, 1);
eq('tope inferior 0,85', shapeAt([{ day: '2026-11-01', height: 180, waist: 40 }], '2026-11-18').ratios.waist, 0.85);

// Línea de tiempo (hoy miércoles 18 nov)
const tl = timeline('2026-11-18', ['2026-11-15', '2026-11-10', '2026-07-01'], 3);
eq('domingos + medición + hoy, sin la medición vieja', tl.map((s) => [s.day, s.body]), [['2026-11-01', false], ['2026-11-08', false], ['2026-11-10', true], ['2026-11-15', true], ['2026-11-18', false]]);
eq('etiquetas', tl.map((s) => s.label), ['Semana al 1 nov', 'Semana al 8 nov', '📏 10 nov', '📏 15 nov', 'Hoy']);
