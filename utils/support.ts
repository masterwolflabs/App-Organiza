// SOPORTE Fase 1 — shared constants. A support ticket is a chat conversation
// with the Master Finanzas support side (tables support_tickets /
// support_messages, see supabase/schema.sql "2026-09-29, soporte").

/**
 * The future Cuenta Maestra (central admin account) that will receive and
 * answer every support conversation. Not built yet: today support replies
 * are just messages with sender_role = 'support'. When it exists, it gets its
 * own RLS policies (or a server role) over support_tickets/support_messages
 * and `assigned_to` starts being filled in.
 */
export const MASTER_SUPPORT_ACCOUNT = {
  key: 'MASTER_SUPPORT_ACCOUNT',
  displayName: 'Soporte Master Finanzas',
} as const;

export type SupportCategory = 'problema' | 'duda' | 'error' | 'mejora';
export type SupportStatus = 'abierto' | 'en_revision' | 'resuelto';

export const SUPPORT_CATEGORIES: { key: SupportCategory; label: string; hint: string; emoji: string }[] = [
  { key: 'problema', label: 'Tengo un problema', hint: 'Algo no funciona como esperabas', emoji: '🛠️' },
  { key: 'duda', label: 'Tengo una duda', hint: 'Cómo usar algo de la app', emoji: '💬' },
  { key: 'error', label: 'Reportar un error', hint: 'Viste un fallo o algo roto', emoji: '🐞' },
  { key: 'mejora', label: 'Sugerir una mejora', hint: 'Una idea para Master Finanzas', emoji: '💡' },
];

export const STATUS_LABEL: Record<SupportStatus, string> = { abierto: 'Abierto', en_revision: 'En revisión', resuelto: 'Resuelto' };

export const ticketCode = (n: number) => `#MF-${String(n).padStart(6, '0')}`;

/** Chat conversation id for a ticket (like REAL_DM_PREFIX for real DMs). */
export const SUPPORT_PREFIX = 'support-';
