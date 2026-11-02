import { admin, userOf } from '@/lib/server/admin';
import { notion } from '@/lib/server/notion';

/** Las bases que la persona le dio a Organiza al conectar Notion. */
export async function GET(request: Request) {
  const user = await userOf(request);
  if (!user) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });
  const { data: c } = await admin().from('organiza_connections').select('tokens').eq('owner_id', user.id).eq('provider', 'notion').maybeSingle();
  if (!c) return Response.json({ databases: [] });
  const res = await notion(c.tokens.access_token, '/search', { filter: { value: 'database', property: 'object' }, page_size: 50 });
  if (!res.ok) return Response.json({ error: 'Notion no respondió.' }, { status: 502 });
  const body = await res.json();
  return Response.json({ databases: (body.results ?? []).map((d: { id: string; title?: { plain_text: string }[] }) => ({ id: d.id, title: d.title?.map((t) => t.plain_text).join('') || 'Sin nombre' })) });
}
