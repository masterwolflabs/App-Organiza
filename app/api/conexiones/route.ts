import { admin, userOf } from '@/lib/server/admin';

/** Desconectar: borra las llaves guardadas. Los eventos quedan donde están. */
export async function DELETE(request: Request) {
  const user = await userOf(request);
  if (!user) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });
  const provider = new URL(request.url).searchParams.get('provider');
  if (provider !== 'google' && provider !== 'notion') return Response.json({ error: 'No válido.' }, { status: 400 });
  await admin().from('organiza_connections').delete().eq('owner_id', user.id).eq('provider', provider);
  return Response.json({ ok: true });
}
