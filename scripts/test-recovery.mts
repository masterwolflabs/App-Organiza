// Pruebas de la recuperación (Workout Pro). Correr: node --experimental-strip-types scripts/test-recovery.mts
import { advise, legLoad } from '../components/organiza/recoveryData.ts';
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(ok ? '✅' : '❌', name, ok ? '' : `→ got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); if (!ok) process.exitCode = 1; };
const today = '2026-11-18';
const legs = ['cuadriceps', 'gluteos'];
const ok = { energy: 4, soreness: 1, pain: 'no' as const, pain_zone: '', flags: [] };
const base = { today, muscles: legs, checkin: ok, nights: [{ day: today, hours: 7.5, quality: 4 }], activities: [], logs: [] };

eq('todo bien → normal', advise(base).level, 'normal');
eq('sin datos (sin check-in, sin sueño, sin dispositivo) → normal y lo dice', [advise({ ...base, checkin: null, nights: [] }).level, advise({ ...base, checkin: null, nights: [] }).reasons.some((r) => r.text.includes('No hay registro de sueño'))], ['normal', true]);
eq('UNA mala noche con buena energía NO cancela', advise({ ...base, nights: [{ day: today, hours: 4.5, quality: 2 }] }).level, 'normal');
eq('mala noche + energía baja → ajustar', advise({ ...base, checkin: { ...ok, energy: 2 }, nights: [{ day: today, hours: 4.5, quality: 2 }] }).level, 'ajustar');
eq('2 noches cortas seguidas → ajustar', advise({ ...base, nights: [{ day: today, hours: 5, quality: 2 }, { day: '2026-11-17', hours: 5.2, quality: 2 }] }).level, 'ajustar');
eq('energía 1 → suave', advise({ ...base, checkin: { ...ok, energy: 1 } }).level, 'suave');
eq('agujetas fuertes → ajustar (cansancio, no dolor)', advise({ ...base, checkin: { ...ok, soreness: 3 } }).reasons.find((r) => r.kind === 'agujetas')?.level, 'ajustar');
eq('molestia → ajustar', advise({ ...base, checkin: { ...ok, pain: 'molestia', pain_zone: 'rodilla' } }).level, 'ajustar');
eq('dolor agudo → cuidado (puede moverse)', [advise({ ...base, checkin: { ...ok, pain: 'agudo', pain_zone: 'hombro' } }).level, advise({ ...base, checkin: { ...ok, pain: 'agudo', pain_zone: 'hombro' } }).canTrain], ['cuidado', true]);
const alerta = advise({ ...base, checkin: { ...ok, flags: ['pecho'] } });
eq('dolor de pecho → alerta, no entrenar, solo descanso', [alerta.level, alerta.canTrain, alerta.options], ['alerta', false, ['descanso']]);
eq('hinchazón → cuidado (no alerta)', advise({ ...base, checkin: { ...ok, flags: ['hinchazon'] } }).level, 'cuidado');
const bici3h = [{ day: '2026-11-17', kind: 'bici', minutes: 180, intensity: 2 }];
eq('carga de piernas: 3 h bici moderada = 270', legLoad(bici3h, today).load, 270);
eq('3 h de bici ayer + piernas hoy → suave', advise({ ...base, activities: bici3h }).level, 'suave');
eq('1,5 h de bici + piernas hoy → ajustar', advise({ ...base, activities: [{ day: '2026-11-17', kind: 'bici', minutes: 90, intensity: 2 }] }).level, 'ajustar');
eq('3 h de bici pero hoy toca pecho → normal', advise({ ...base, muscles: ['pecho'], activities: bici3h }).level, 'normal');
eq('bici hace 3 días no cuenta', advise({ ...base, activities: [{ day: '2026-11-15', kind: 'bici', minutes: 180, intensity: 3 }] }).level, 'normal');
const heavy = [{ id: 'x', day: '2026-11-17', exercises: [{ name: 'Sentadilla', muscles: ['cuadriceps'], key: true, sets: Array.from({ length: 8 }, () => ({ weight: 80, reps: 8, done: true })) }] }] as never[];
eq('cuádriceps muy cargado ayer → ajustar', advise({ ...base, logs: heavy }).level, 'ajustar');
eq('la peor razón manda (bici suave + pecho)', advise({ ...base, activities: bici3h, checkin: { ...ok, flags: ['pecho'] } }).level, 'alerta');
