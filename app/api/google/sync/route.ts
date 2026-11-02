import { admin, isCron, userOf } from '@/lib/server/admin';
import { syncGoogle } from '@/lib/server/google';

export const maxDuration = 60;

/** Con sesión sincroniza a esa persona; el reloj de los avisos sincroniza a todos. */
export async function POST(request: Request) {
  const cron = isCron(request);
  const user = cron ? null : await userOf(request);
  if (!cron && !user) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });
  const db = admin();
  let q = db.from('organiza_connections').select('owner_id, tokens, state').eq('provider', 'google');
  if (user) q = q.eq('owner_id', user.id);
  const { data } = await q;
  const reports = [];
  for (const conn of data ?? []) {
    try {
      reports.push(await syncGoogle(db, conn));
    } catch {
      reports.push({ error: true });
    }
  }
  return Response.json({ reports });
}
