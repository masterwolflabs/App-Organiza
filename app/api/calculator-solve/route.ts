import { APP } from '@/app.config';

// Calculadora de las notas ("Calcular" con una frase). El editor de notas es
// el de Finance tal cual y llama a esta ruta; la IA vive en App Master Cloud,
// así que aquí solo se reenvía allá con la sesión de la persona y el `app` de
// esta app (créditos de la app). Sin llaves de IA en esta app.
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > 50000) return Response.json({ error: 'La solicitud es demasiado grande.' }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Cuerpo de solicitud inválido.' }, { status: 400 });
  }
  try {
    const res = await fetch(`${APP.cloudUrl.replace(/\/$/, '')}/api/calculator-solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: request.headers.get('authorization') ?? '' },
      body: JSON.stringify({ transcript: body.transcript, app: APP.slug }),
    });
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return Response.json({ error: 'No se pudo conectar con la IA de App Master Cloud.' }, { status: 502 });
  }
}
