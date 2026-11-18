// Pruebas del entrenador visual (MOD 10). Correr: node --experimental-strip-types --import ./scripts/ts-ext.mjs scripts/test-trainer.mts
import { templateFor, phaseAt, poseAt, repSeconds, narration, full, STAND, TEMPLATES } from '../components/organiza/trainerData.ts';
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(ok ? '✅' : '❌', name, ok ? '' : `→ got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); if (!ok) process.exitCode = 1; };
const id = (n: string) => templateFor(n)?.id ?? null;
eq('nombres → plantilla', ['Sentadilla', 'Sentadilla búlgara', 'Zancadas', 'Prensa de piernas', 'Press banca con barra', 'Press inclinado con mancuernas', 'Press militar', 'Press Arnold', 'Dominadas o jalón al pecho', 'Remo con barra', 'Remo con mancuerna a una mano', 'Remo al mentón', 'Peso muerto rumano', 'Buenos días con barra', 'Hip thrust', 'Fondos en paralelas', 'Fondos en banco', 'Curl con barra', 'Curl martillo', 'Curl femoral', 'Curl de muñeca', 'Elevaciones laterales', 'Pájaros (deltoide posterior)', 'Elevaciones frontales', 'Press francés', 'Plancha', 'Plancha lateral', 'Flexiones de brazos'].map(id),
  ['sentadilla', 'bulgara', 'bulgara', null, 'banca', 'banca', 'militar', 'militar', 'dominadas', 'remo', 'remo', null, 'rumano', 'rumano', 'hipthrust', 'fondos', 'fondos', 'curl', 'curl', null, null, 'laterales', 'laterales', 'frontales', 'frances', 'plancha', null, 'flexiones']);
eq('atajos simétricos', [full({ sh: 90, el: 10 }).shL, full({ sh: 90 }).shR, full({ el: 10 }).elR, full({ hipL: 30 }).hipR], [90, 90, 10, 0]);
const sq = templateFor('Sentadilla')!;
eq('final hereda lo que no cambia (brazos)', [sq.end.abdL, sq.end.stance], [72, 12]);
eq('rep sentadilla 4,2 s', repSeconds(sq), 4.2);
eq('fases', [0, 1, 2.2, 3, 4, 4.2 + 1].map((s) => phaseAt(sq, s).name), ['ida', 'ida', 'pausa_final', 'vuelta', 'pausa_inicio', 'ida']);
eq('respiración: baja inhala, sube exhala', [phaseAt(sq, 0.5).breath, phaseAt(sq, 3).breath], ['inhala', 'exhala']);
eq('k: 0 al inicio, 1 en la pausa, mitad a la mitad', [phaseAt(sq, 0).k, phaseAt(sq, 2.2).k, phaseAt(sq, 1).k], [0, 1, 0.5]);
eq('pose a la mitad', poseAt(sq, 0.5).kneeL, 64);
eq('pose en los extremos', [poseAt(sq, 0).hipL, poseAt(sq, 1).hipL, poseAt(sq, 2).hipL], [0, 133, 133]);
eq('tobillo null se mantiene plano', poseAt(sq, 0.3).ankleL, null);
eq('narración nombra inicio, final y errores', ['Inicio:', 'Final:', 'Evita:', 'tomando aire'].every((w) => narration(sq).includes(w)), true);
eq('todas las plantillas con textos', TEMPLATES.every((t) => t.cues.length && t.errors.length && t.startText && t.endText), true);
eq('STAND de pie', [STAND.pitch, STAND.hipL, STAND.kneeL], [0, 0, 0]);
