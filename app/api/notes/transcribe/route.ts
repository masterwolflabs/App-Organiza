import { APP } from '@/app.config';

// Notas (transcribe). La IA vive en App Master Cloud: aquí solo se reenvía allá con la sesión de la persona
// y el `app` de esta app (créditos de la app). Sin llaves de IA en esta app.
export const maxDuration = 120;

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > 200000) return Response.json({ error: 'La solicitud es demasiado grande.' }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Cuerpo de solicitud inválido.' }, { status: 400 });
  }
  try {
    const res = await fetch(`${APP.cloudUrl.replace(/\/$/, '')}/api/notes/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: request.headers.get('authorization') ?? '' },
      body: JSON.stringify({ ...body, app: APP.slug }),
    });
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return Response.json({ error: 'No se pudo conectar con la IA de App Master Cloud.' }, { status: 502 });
  }
}
