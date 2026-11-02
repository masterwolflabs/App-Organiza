import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * SOLO SERVIDOR: cliente con la llave de servicio (se salta RLS). Lo usan las
 * conexiones y los avisos, porque las llaves de Google y Notion nunca llegan
 * al navegador. Nunca importar desde un archivo 'use client'.
 */
const URL = 'https://uxozatzegnoczgiilvvc.supabase.co';

export function admin(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en Vercel.');
  return createClient(URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** La persona que llama, según su sesión. */
export async function userOf(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return null;
  const { data } = await admin().auth.getUser(token);
  return data.user ?? null;
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://app-organiza-six.vercel.app';
export const siteUrl = (path: string) => `${SITE}${path}`;

/** `state` de OAuth firmado: amarra la vuelta de Google o Notion a quien la pidió. */
export function signState(userId: string, secret: string) {
  const body = `${userId}.${Date.now()}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('hex')}`;
}
export function readState(state: string, secret: string) {
  const [userId, at, sig] = state.split('.');
  if (!userId || !at || !sig) return null;
  const good = createHmac('sha256', secret).update(`${userId}.${at}`).digest('hex');
  if (good.length !== sig.length || !timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  return Date.now() - Number(at) < 15 * 60_000 ? userId : null;
}

export const isCron = (request: Request) => !!process.env.CRON_SECRET && request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
