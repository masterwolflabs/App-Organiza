import { APP } from '@/app.config';

// Tipos de cambio para el conversor de la calculadora (components/calculator,
// copia de Finance que llama a esta ruta). Las APIs externas pasan por App
// Master Cloud: aquí solo se reenvía allá.
export async function GET() {
  try {
    const res = await fetch(`${APP.cloudUrl.replace(/\/$/, '')}/api/currency-rates`, { cache: 'no-store' });
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return Response.json({ error: 'No se pudieron obtener las tasas de cambio.' }, { status: 502 });
  }
}
