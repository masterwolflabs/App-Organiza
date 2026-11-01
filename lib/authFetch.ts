'use client';

import { supabase } from '@/lib/supabaseClient';

/**
 * fetch() for this app's own API routes that require a signed-in user (every
 * AI route): adds the current Supabase access token as `Authorization: Bearer`.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session?.access_token) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}
