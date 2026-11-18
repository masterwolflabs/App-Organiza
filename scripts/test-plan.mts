// Pruebas de la planificación adaptable (Workout Pro). Correr: node --experimental-strip-types scripts/test-plan.mts
import { classify, planOf, estimateMinutes, diffText } from '../components/organiza/planData.ts';
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(ok ? '✅' : '❌', name, ok ? '' : `→ got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); if (!ok) process.exitCode = 1; };
let i = 0;
const ex = (name: string, muscles: string[], key: boolean, sets: number, rest = 90) => ({ id: `e${i++}`, name, muscles, key, sets, reps: '10', rest, weight: null });
// D1 «Pecho a fondo» (como viene de fábrica)
const d1 = [
  ex('Press banca con barra', ['pecho', 'triceps', 'hombros'], true, 4, 120),
  ex('Press inclinado con mancuernas', ['pecho', 'hombros'], true, 4),
  ex('Aperturas en polea', ['pecho'], false, 3, 60),
  ex('Fondos en paralelas', ['pecho', 'triceps'], false, 3),
  ex('Remo con barra', ['dorsales', 'trapecio', 'biceps'], true, 3),
  ex('Elevación de piernas colgado', ['abdominales'], true, 3, 60),
  ex('Plancha', ['abdominales', 'oblicuos'], false, 3, 45),
];
const names = (l: { name: string }[]) => l.map((e) => e.name.split(' ')[0] + (e.name.includes('inclinado') ? 'Inc' : ''));
const sets = (l: { sets: number }[]) => l.reduce((a, e) => a + e.sets, 0);
const c = classify(d1);
eq('principales = los ⭐', c.filter((e) => e.role === 'principal').length, 4);
eq('prioridad vuelve principal un complementario (pecho → aperturas y fondos)', classify(d1, { priorities: ['pecho'] }).filter((e) => e.role === 'principal').length, 6);
eq('completa = igual a la rutina', [planOf(d1, 'completa').length, sets(planOf(d1, 'completa'))], [7, 23]);
const red = planOf(d1, 'reducida');
eq('reducida: 4 principales + 2 de 3 complementarios', red.length, 6);
eq('reducida: complementarios con una serie menos (mín. 2)', red.filter((e) => e.role === 'complementario').map((e) => e.sets), [2, 2]);
const exp = planOf(d1, 'corta');
eq('express: solo principales', names(exp), ['Press', 'PressInc', 'Remo', 'Elevación']);
eq('express: máx. 3 series', exp.map((e) => e.sets), [3, 3, 3, 3]);
const man = planOf(d1, 'mantenimiento');
eq('mantenimiento: principales + complementario de músculo no cubierto (oblicuos no: plancha es abdomen primero)', names(man), ['Press', 'PressInc', 'Remo', 'Elevación']);
eq('mantenimiento: ~60 % de series y sin fallo', [man.map((e) => e.sets), man[0].intensity], [[3, 3, 2, 2], 'Deja 2–3 repeticiones en reserva']);
const dev = planOf(d1, 'desarrollo', { priorities: ['pecho'] });
eq('desarrollo: +1 serie en pecho (prioridad), máx. 5', dev.map((e) => e.sets), [5, 5, 4, 4, 3, 3, 3]);
eq('desarrollo principiante: sin series extra', sets(planOf(d1, 'desarrollo', { priorities: ['pecho'], experience: 'principiante' })), 23);
const rec = planOf(d1, 'recuperacion');
eq('recuperación: principales a 2 series, lejos del fallo', [rec.length, rec.every((e) => e.sets === 2), /3–4/.test(rec[0].intensity ?? '')], [4, true, true]);
eq('menos tiempo: completa > reducida > express (minutos)', [estimateMinutes(planOf(d1, 'completa')) > estimateMinutes(red), estimateMinutes(red) > estimateMinutes(exp)], [true, true]);
eq('nunca toca la rutina original', [d1.length, sets(d1)], [7, 23]);
const home = classify(d1, { equipment: ['mancuernas', 'banco'] });
eq('equipo: avisa barra/polea/paralelas, no quita', [home.filter((e) => e.warn).map((e) => e.name.split(' ')[0]), home.length], [['Press', 'Aperturas', 'Fondos', 'Remo', 'Elevación'], 7]);
eq('equipo desconocido (gimnasio) → sin avisos', classify(d1, { equipment: null }).some((e) => e.warn), false);
eq('rutina sin ⭐: los 2 primeros hacen de principales en express', planOf(d1.map((e) => ({ ...e, key: false })), 'corta').length, 2);
eq('con prioridad pecho, express sigue corta: máx. 4 (primero los ⭐)', names(planOf(d1, 'corta', { priorities: ['pecho'] })), ['Press', 'PressInc', 'Remo', 'Elevación']);
eq('express con prioridad dura bastante menos que la completa', estimateMinutes(planOf(d1, 'corta', { priorities: ['pecho'] })) < estimateMinutes(planOf(d1, 'completa')) * 0.6, true);
eq('explica qué cambia', diffText(d1, 'corta'), '3 complementarios fuera · 12 series en vez de 23.');
