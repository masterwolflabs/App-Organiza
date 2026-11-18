// Para las pruebas con `node --experimental-strip-types --import ./scripts/ts-ext.mjs`: permite importar
// archivos .ts sin la extensión (como lo hace Next), así un motor puede usar otro motor.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); }
  catch (e) { if (spec.startsWith('.') && !/\\.[mc]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx); throw e; }
}`));
