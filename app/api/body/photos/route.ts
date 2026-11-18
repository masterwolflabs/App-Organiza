import { admin, userOf } from '@/lib/server/admin';

/**
 * 📏 Fotos del perfil físico (bucket PRIVADO organiza-body, SQL 50). Solo rutas de la propia persona (<uid>/…).
 * - `{ paths }`  → permisos firmados de 10 minutos para verlas.
 * - `{ remove }` → las borra (al cambiar una foto o borrar un registro).
 */
export const maxDuration = 15;

export async function POST(request: Request) {
  const user = await userOf(request);
  if (!user) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { paths?: unknown; remove?: unknown };
  const mine = (list: unknown) => (Array.isArray(list) ? list : []).map(String).filter((p) => p.startsWith(`${user.id}/`) && !p.includes('..')).slice(0, 60);
  const bucket = admin().storage.from('organiza-body');

  const drop = mine(body.remove);
  if (drop.length) {
    const { error } = await bucket.remove(drop);
    return error ? Response.json({ error: 'No se pudieron borrar las fotos.' }, { status: 500 }) : Response.json({ ok: true });
  }

  const paths = mine(body.paths);
  if (!paths.length) return Response.json({ urls: {} });
  const { data } = await bucket.createSignedUrls(paths, 600);
  const urls = Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
  return Response.json({ urls }, { headers: { 'Cache-Control': 'no-store' } });
}
