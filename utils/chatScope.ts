/**
 * Chat compartido con la nube, con canales por app (App Master Cloud,
 * supabase/09-chat-por-app.sql). Usa las MISMAS tablas del chat de Finance;
 * `direct_messages.app` y `chat_groups.app` dicen desde qué app se creó cada
 * cosa (null = Finance, así Finance no tiene que cambiar nada).
 *
 * - En una app: filter = send = su slug → ve y escribe solo lo de esa app.
 * - En la nube: filter = la app elegida, o null = todas; send = null → se
 *   responde en la app de la conversación.
 */
export type ChatScope = { filter: string | null; send: string | null };

export const FINANCE = 'finanzas';
export const appOf = (app?: string | null) => app ?? FINANCE;
export const appMatches = (app: string | null | undefined, filter: string | null) => filter === null || appOf(app) === filter;
/** Cómo se guarda: Finance escribe null. */
export const toStored = (slug: string) => (slug === FINANCE ? null : slug);

/** Agrega el filtro por app a una consulta de supabase-js. */
export function scopeQuery<T>(query: T, filter: string | null): T {
  if (filter === null) return query;
  const q = query as unknown as { or: (f: string) => T; eq: (c: string, v: string) => T };
  return filter === FINANCE ? q.or(`app.is.null,app.eq.${FINANCE}`) : q.eq('app', filter);
}

/** App con la que se guarda un mensaje o grupo nuevo. */
export function sendAppFor(scope: ChatScope, lastApp?: string | null): string | null {
  return toStored(scope.send ?? scope.filter ?? appOf(lastApp));
}
