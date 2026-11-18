// Pruebas de seguridad durante el entreno (MOD 11). Correr: node --experimental-strip-types --import ./scripts/ts-ext.mjs scripts/test-safety.mts
import { evaluate, EMPTY, loadsZone, cautionFor, withCaution, activeCautions, proposal, incidentText } from '../components/organiza/safetyData.ts';
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(ok ? '✅' : '❌', name, ok ? '' : `→ got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); if (!ok) process.exitCode = 1; };
const R = (x: object) => ({ ...EMPTY, ...x });

// Alarma: nunca ofrece seguir.
const chest = evaluate(R({ what: 'fatiga', flags: ['pecho'] }));
eq('pecho → alarma', chest.level, 'alarma');
eq('alarma: solo llamar o terminar', chest.actions, ['llamar', 'terminar']);
eq('alarma menciona SAMU 131', chest.why.some((w) => w.includes('131')), true);
eq('mareo (qué pasó) → alarma', evaluate(R({ what: 'mareo' })).level, 'alarma');
eq('hormigueo en un dolor de hombro → alarma (gana a zona)', evaluate(R({ what: 'dolor', zone: 'hombro', feel: 'punzante', flags: ['hormigueo'] })).level, 'alarma');
eq('ninguna alarma ofrece seguir', [R({ flags: ['falta_aire'] }), R({ flags: ['palpitaciones'] }), R({ flags: ['vista'] })].map((r) => evaluate(r).actions.includes('seguir')), [false, false, false]);

// Zona
const pinch = evaluate(R({ what: 'dolor', zone: 'hombro', feel: 'punzante', intensity: 5, worse: false, passes: true }));
eq('pinchazo en hombro → zona', [pinch.level, pinch.zone, pinch.proposeCaution], ['zona', 'hombro', true]);
eq('zona: no ofrece seguir ni variante', [pinch.actions.includes('seguir'), pinch.actions.includes('variante')], [false, false]);
eq('molestia que no se pasa al parar → zona', evaluate(R({ what: 'articulacion', zone: 'rodilla', feel: 'sordo', intensity: 3, worse: false, passes: false })).level, 'zona');
eq('empeora al moverlo → zona', evaluate(R({ what: 'articulacion', zone: 'codo', feel: 'sordo', intensity: 2, worse: true, passes: true })).level, 'zona');
eq('intensidad 6 → zona', evaluate(R({ what: 'dolor', zone: 'muneca', feel: 'sordo', intensity: 6, worse: false, passes: true })).level, 'zona');
eq('hinchazón → zona', evaluate(R({ what: 'articulacion', zone: 'tobillo', flags: ['hinchazon'] })).level, 'zona');
eq('articulación sin detalles → lado seguro (zona)', evaluate(R({ what: 'articulacion', zone: 'rodilla' })).level, 'zona');
const tear = evaluate(R({ what: 'dolor', zone: 'musculo', feel: 'tiron', intensity: 4 }));
eq('tirón en el músculo → zona y proponer cuidar', [tear.level, tear.proposeCaution], ['zona', true]);

// Leve
const burn = evaluate(R({ what: 'dolor', zone: 'musculo', feel: 'quemazon', intensity: 4, worse: false, passes: true }));
eq('quemazón muscular → leve (normal)', [burn.level, burn.title.includes('normal')], ['leve', true]);
const mild = evaluate(R({ what: 'articulacion', zone: 'hombro', feel: 'sordo', intensity: 2, worse: false, passes: true }));
eq('molestia sorda leve que se pasa → leve con alternativas', [mild.level, mild.actions.includes('variante'), mild.zone], ['leve', true, 'hombro']);

// Cansancio
eq('sin energía → cansancio con versión recuperación', [evaluate(R({ what: 'sin_energia' })).level, evaluate(R({ what: 'sin_energia' })).actions[0]], ['cansancio', 'version_recuperacion']);
eq('no me recupero → descanso largo primero', evaluate(R({ what: 'no_recupero' })).actions[0], 'descanso_largo');

// Zonas y ejercicios
eq('press banca carga el hombro', loadsZone(['pecho', 'triceps'], 'hombro'), true);
eq('sentadilla no carga el hombro', loadsZone(['cuadriceps', 'gluteos'], 'hombro'), false);
eq('«el músculo» = mismo principal', [loadsZone(['pecho'], 'musculo', ['pecho', 'triceps']), loadsZone(['triceps'], 'musculo', ['pecho', 'triceps'])], [true, false]);

// Cuidar en los próximos días
const c = proposal('rodilla', '2026-11-18', 'pinchazo');
eq('propuesta 7 días', [c.since, c.until], ['2026-11-18', '2026-11-25']);
const list = withCaution([{ zone: 'rodilla', since: '2026-11-01', until: '2026-11-08', reason: 'x' }, { zone: 'hombro', since: '2026-11-15', until: '2026-11-20', reason: 'y' }], c, '2026-11-18');
eq('reemplaza la misma zona y limpia vencidas', list.map((x) => `${x.zone}@${x.until}`), ['hombro@2026-11-20', 'rodilla@2026-11-25']);
eq('aviso para sentadilla', cautionFor(['cuadriceps'], list, '2026-11-19')?.zone, 'rodilla');
eq('vencida no avisa', cautionFor(['hombros'], list, '2026-11-21'), null);
const pec = withCaution([], proposal('musculo', '2026-11-18', 'tirón', 'pecho'), '2026-11-18');
eq('cuidar un músculo: avisa solo si es su principal', [cautionFor(['pecho', 'triceps'], pec, '2026-11-19')?.muscle, cautionFor(['triceps', 'pecho'], pec, '2026-11-19')], ['pecho', null]);
eq('activas', activeCautions(list, '2026-11-26').length, 0);
eq('texto del incidente', incidentText(R({ what: 'dolor', zone: 'hombro', feel: 'punzante', intensity: 5 }), pinch, 'Press banca', 'saltó lo que carga el hombro'), '🛟 Dolor repentino (hombro) en Press banca · punzante / pinchazo · 5/10 → zona: saltó lo que carga el hombro.');
