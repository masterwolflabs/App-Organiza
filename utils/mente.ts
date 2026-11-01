'use client';

/**
 * Mente Singular: la administración de ESTA app, conectada al núcleo de la
 * nube (supabase/03-nucleo-nube.sql en App Master Cloud). La Mente Maestra
 * (en la nube) ve lo mismo para todas las apps. La seguridad vive en la base
 * de datos: rol en cloud_roles + sesión con 2FA (aal2); aquí solo está la UI.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { APP } from '@/app.config';

export type CloudRole = 'owner' | 'admin' | 'support';
export const ROLE_LABEL: Record<CloudRole, string> = { owner: 'Propietario', admin: 'Administrador', support: 'Soporte' };
const RANK: Record<CloudRole, number> = { support: 1, admin: 2, owner: 3 };

export interface MyRole {
  role: CloudRole;
  /** true = el rol viene de la Mente Maestra (todas las apps). */
  master: boolean;
}

/** El mejor rol del usuario para esta app (propio de la app o de la Mente Maestra), o null. */
export function useMyRole(userId: string | null) {
  const [role, setRole] = useState<MyRole | null>(null);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    supabase.rpc('cloud_my_roles').then(({ data }) => {
      if (!alive) return;
      const rows = ((data ?? []) as { app: string | null; role: CloudRole }[]).filter((r) => r.app === null || r.app === APP.slug);
      const best = rows.sort((a, b) => RANK[b.role] - RANK[a.role])[0];
      setRole(best ? { role: best.role, master: best.app === null } : null);
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  return role;
}

export const canManage = (r: MyRole | null) => r?.role === 'owner' || r?.role === 'admin';

export class ReauthRequired extends Error {
  constructor() {
    super('Confirma con tu código de verificación para continuar.');
  }
}

/** Llama una función cloud_* y traduce los rechazos de la base de datos. */
export async function cloudRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const m = error.message;
    if (m.includes('reautenticacion')) throw new ReauthRequired();
    if (m.includes('no autorizado')) throw new Error('No tienes permiso o tu verificación en dos pasos expiró. Vuelve a entrar a la Mente.');
    if (m.includes('Could not find the function')) throw new Error('Falta el núcleo de la nube en Supabase (03-nucleo-nube.sql de App Master Cloud).');
    throw new Error(m.replace(/^cloud:\s*/, '') || 'No se pudo completar la acción.');
  }
  return data as T;
}

// --- 2FA (TOTP) --------------------------------------------------------------

export async function mfaState(): Promise<{ level: string | null; factorId: string | null }> {
  const [{ data: aal }, { data: factors }] = await Promise.all([supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.mfa.listFactors()]);
  const verified = factors?.totp?.[0] ?? null;
  return { level: aal?.currentLevel ?? null, factorId: verified?.id ?? null };
}

/** Inicia el registro TOTP (limpia antes los que quedaron a medias). */
export async function mfaEnroll(): Promise<{ factorId: string; qr: string; secret: string }> {
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Master Wolf ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) throw new Error('No se pudo iniciar la verificación en dos pasos. ¿Está activado MFA (TOTP) en Supabase?');
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Verifica el código de 6 dígitos; si es correcto la sesión pasa a aal2. */
export async function mfaVerify(factorId: string, code: string) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
  if (error) throw new Error('Código incorrecto o vencido. Revisa tu app de autenticación e intenta de nuevo.');
}

export const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// --- Formatos y planes (los mismos de la Mente Maestra de la nube) -----------

export const usd = (n: number, digits = 2) =>
  `US$${(Number(n) || 0).toLocaleString('es-CL', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export function formatBytes(n: number) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toLocaleString('es-CL', { maximumFractionDigits: i ? 1 : 0 })} ${u[i]}`;
}

/** Planes de Finance (por ahora los planes viven en Finance). */
export const PLANS = [
  { id: 'free', name: 'Free', priceUSD: 0 },
  { id: 'go', name: 'Go', priceUSD: 4.99 },
  { id: 'pro', name: 'Pro', priceUSD: 9.99 },
  { id: 'max', name: 'Max', priceUSD: 19.99 },
] as const;
export const planName = (id: string) => PLANS.find((p) => p.id === id)?.name ?? id;
export const mrrFrom = (plans: Record<string, number>) =>
  Object.entries(plans).reduce((s, [id, n]) => s + (PLANS.find((p) => p.id === id)?.priceUSD ?? 0) * n, 0);

export type AppInfo = { slug: string; name: string; icon: string | null; color: string | null };
