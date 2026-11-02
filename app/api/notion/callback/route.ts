import { admin, readState, siteUrl } from '@/lib/server/admin';

export async function GET(request: Request) {
  const back = (s: string) => Response.redirect(siteUrl(`/?conexion=${s}#conexiones`));
  const url = new URL(request.url);
  const secret = process.env.NOTION_CLIENT_SECRET ?? '';
  const userId = readState(url.searchParams.get('state') ?? '', secret);
  const code = url.searchParams.get('code');
  if (!userId || !code) return back('error');
  const res = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.NOTION_CLIENT_ID}:${secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: siteUrl('/api/notion/callback') }),
  });
  if (!res.ok) return back('error');
  const t = await res.json();
  const { error } = await admin().from('organiza_connections').upsert({ owner_id: userId, provider: 'notion', account: t.workspace_name ?? 'Notion', tokens: { access_token: t.access_token }, state: {}, updated_at: new Date().toISOString() });
  return back(error ? 'error' : 'notion');
}
