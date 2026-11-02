import { signState, siteUrl, userOf } from '@/lib/server/admin';

/** Dirección de permiso de Google para la persona con sesión. */
export async function POST(request: Request) {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return Response.json({ error: 'pending' }, { status: 503 });
  const user = await userOf(request);
  if (!user) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });
  const q = new URLSearchParams({
    client_id: id,
    redirect_uri: siteUrl('/api/google/callback'),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
    state: signState(user.id, secret),
  });
  return Response.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
}
