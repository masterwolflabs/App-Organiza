// Para las pruebas con `node --experimental-strip-types --import ./scripts/ts-ext.mjs`: permite importar
// archivos .ts sin la extensión y con el alias «@/» (como lo hace Next), así un motor puede usar otro motor.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
const ROOT = pathToFileURL(new URL('..', import.meta.url).pathname).href;
register('data:text/javascript,' + encodeURIComponent(`
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@/')) spec = ROOT + spec.slice(2);
  try { return await next(spec, ctx); }
  catch (e) {
    if ((spec.startsWith('.') || spec.startsWith('file:')) && !/\\.[mc]?[jt]sx?$/.test(spec)) {
      for (const ext of ['.ts', '.tsx', '/index.ts']) { try { return await next(spec + ext, ctx); } catch {} }
    }
    throw e;
  }
}`));
