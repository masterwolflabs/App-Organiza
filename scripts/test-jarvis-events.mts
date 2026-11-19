// Pruebas del detector de eventos de Jarvis (J6). Correr: node --experimental-strip-types --import ./scripts/ts-ext.mjs scripts/test-jarvis-events.mts
import { detectClashes } from '../components/organiza/jarvisEvents.ts';
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(ok ? '✅' : '❌', name, ok ? '' : `→ got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); if (!ok) process.exitCode = 1; };
const today = new Date(2026, 10, 19, 9, 0);
const it = (id: string, title: string, time: string, minutes: number, flex = 'flexible') => ({ id, title, time, minutes, flex, weekday: 3, schedule_id: 's', icon: null, label_id: null, focus: false, alarm: 'no', priority: 2 }) as any;
const at = (h: number, m: number, d = 19) => new Date(2026, 10, d, h, m);
const occ = [{ ev: { title: 'Dentista', all_day: false }, start: at(18, 0), end: at(19, 0), key: 'e1' }, { ev: { title: 'Feriado', all_day: true }, start: at(0, 0, 20), end: at(23, 59, 20), key: 'e2' }];
const items = (d: Date) => (d.getDate() === 19 ? [it('a', 'Entrenar', '18:30', 60), it('b', 'Leer', '21:00', 30)] : [it('c', 'Entrenar', '18:30', 60)]);
const ev = detectClashes({ today, days: 3, itemsOn: items, planOf: () => null, occ });
eq('un choque hoy (entrenar vs dentista); el día completo no cuenta', ev.map((e) => e.title), ['Entrenar choca con Dentista hoy']);
eq('trae el arreglo del Horario (mover Entrenar)', Object.keys(ev[0].moves), ['a']);
eq('clave estable', ev[0].key, 'choque:2026-11-19:a');
eq('si el plan ya lo movió, no hay choque', detectClashes({ today, days: 1, itemsOn: items, planOf: () => ({ day: '2026-11-19', schedule_id: null, moves: { a: { time: '19:15' } }, extras: [] }), occ }).length, 0);
eq('si ya está apagado ese día, no hay choque', detectClashes({ today, days: 1, itemsOn: items, planOf: () => ({ day: '2026-11-19', schedule_id: null, moves: { a: { off: true } }, extras: [] }), occ }).length, 0);
eq('sin eventos, nada', detectClashes({ today, days: 3, itemsOn: items, planOf: () => null, occ: [] }).length, 0);
