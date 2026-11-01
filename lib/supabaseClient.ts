'use client';

import { createClient } from '@supabase/supabase-js';

/**
 * Supabase de App Master Cloud (el mismo de Finance y de todas las apps).
 * La URL y la clave anon son PÚBLICAS por diseño (viajan al navegador de cada
 * usuario; la seguridad está en RLS), así que van escritas aquí: una app nueva
 * funciona sin configurar nada en Vercel. Si Vercel trae una variable válida,
 * manda esa; si viene mal escrita (ej. ".supabase.com") se ignora.
 * Nunca poner aquí la clave service_role / secret.
 */
const CLOUD_SUPABASE_URL = 'https://uxozatzegnoczgiilvvc.supabase.co';
const CLOUD_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4b3phdHplZ25vY3pnaWlsdnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxNDM0NTIsImV4cCI6MjEwMTcxOTQ1Mn0.wXfiwE-1U1xMb8POYYpXUrAz8OAuGSTT_apbgM_bowg';

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const supabaseUrl = envUrl && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(envUrl) ? envUrl : CLOUD_SUPABASE_URL;
const supabaseAnonKey = envKey && /^(eyJ|sb_publishable_)/.test(envKey) ? envKey : CLOUD_SUPABASE_ANON_KEY;

/**
 * Cliente con la configuración normal de supabase-js (sesión en el navegador y
 * lectura automática del #access_token): así la nube puede abrir esta app con
 * la sesión ya iniciada. No cambiar a cookies/PKCE sin revisar docs/NUBE.md.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
