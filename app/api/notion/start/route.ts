import { signState, siteUrl, userOf } from '@/lib/server/admin';

export async function POST(request: Request) {
  const id = process.env.NOTION_CLIENT_ID;
  const secret = process.env.NOTION_CLIENT_SECRET;
  if (!id || !secret) return Response.json({ error: 'pending' }, { status: 503 });
  const user = await userOf(request);
  if (!user) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });
  const q = new URLSearchParams({ client_id: id, response_type: 'code', owner: 'user', redirect_uri: siteUrl('/api/notion/callback'), state: signState(user.id, secret) });
  return Response.json({ url: `https://api.notion.com/v1/oauth/authorize?${q}` });
}
