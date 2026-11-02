import { admin, readState, siteUrl } from '@/lib/server/admin';

export async function GET(request: Request) {
  const back = (s: string) => Response.redirect(siteUrl(`/?conexion=${s}#conexiones`));
  const url = new URL(request.url);
  const secret = process.env.GOOGLE_CLIENT_SECRET ?? '';
  const userId = readState(url.searchParams.get('state') ?? '', secret);
  const code = url.searchParams.get('code');
  if (!userId || !code) return back('error');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: secret, redirect_uri: siteUrl('/api/google/callback'), grant_type: 'authorization_code' }),
  });
  if (!res.ok) return back('error');
  const t = await res.json();
  const who = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()).catch(() => ({}));
  const { error } = await admin().from('organiza_connections').upsert({ owner_id: userId, provider: 'google', account: who.email ?? '', tokens: { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + t.expires_in * 1000 }, state: {}, updated_at: new Date().toISOString() });
  return back(error ? 'error' : 'google');
}
