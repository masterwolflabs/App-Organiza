import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Sincronía con Google Calendar, en los dos sentidos, con el calendario
 * principal. Hacia Google van los eventos sin `google_event_id` y los que
 * cambiaron desde la última vez; desde Google se piden solo los cambios
 * (`syncToken`). Si los dos cambiaron, gana el más reciente.
 */
type Tokens = { access_token: string; refresh_token?: string; expires_at?: number };
type Conn = { owner_id: string; tokens: Tokens; state: { syncToken?: string; pushedAt?: string } };
type GEvent = {
  id: string; status?: string; summary?: string; description?: string; location?: string; hangoutLink?: string; updated?: string; recurrence?: string[]; recurringEventId?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string }; end?: { date?: string; dateTime?: string; timeZone?: string };
};
type Row = { id: string; owner_id: string; owner_scope: string; title: string; description: string | null; location: string | null; starts_at: string; ends_at: string; all_day: boolean; time_zone: string; rrule: string | null; exdates: string[] | null; google_event_id: string | null; status: string; updated_at: string; source: string };

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

async function accessToken(db: SupabaseClient, c: Conn) {
  if (c.tokens.expires_at && c.tokens.expires_at > Date.now() + 60_000) return c.tokens.access_token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: c.tokens.refresh_token ?? '', grant_type: 'refresh_token' }),
  });
  if (!res.ok) throw new Error('google-auth');
  const t = await res.json();
  c.tokens = { ...c.tokens, access_token: t.access_token, expires_at: Date.now() + t.expires_in * 1000 };
  await db.from('organiza_connections').update({ tokens: c.tokens }).eq('owner_id', c.owner_id).eq('provider', 'google');
  return c.tokens.access_token;
}

const dateOnly = (iso: string) => iso.slice(0, 10);
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Un evento de Organiza como Google lo espera (fin de día completo = exclusivo). */
export function toGoogle(e: Row) {
  const base = { summary: e.title, description: e.description ?? undefined, location: e.location ?? undefined };
  const when = e.all_day
    ? { start: { date: dateOnly(e.starts_at) }, end: { date: addDay(dateOnly(e.ends_at), 1) } }
    : { start: { dateTime: e.starts_at, timeZone: e.time_zone }, end: { dateTime: e.ends_at, timeZone: e.time_zone } };
  const recurrence = e.rrule
    ? [`RRULE:${e.rrule}`, ...(e.exdates?.length ? [`EXDATE;VALUE=DATE:${e.exdates.map((d) => d.replace(/-/g, '')).join(',')}`] : [])]
    : undefined;
  return { ...base, ...when, ...(recurrence ? { recurrence } : {}) };
}

/** Un evento de Google como fila de `calendar_events`. */
export function fromGoogle(g: GEvent, fallbackZone: string) {
  const allDay = !!g.start?.date;
  const starts = allDay ? `${g.start!.date}T00:00:00Z` : new Date(g.start?.dateTime ?? Date.now()).toISOString();
  const ends = allDay ? `${addDay(g.end?.date ?? g.start!.date!, -1)}T23:59:59Z` : new Date(g.end?.dateTime ?? g.start?.dateTime ?? Date.now()).toISOString();
  const rule = g.recurrence?.find((r) => r.startsWith('RRULE:'))?.slice(6) ?? null;
  const ex = g.recurrence?.filter((r) => r.startsWith('EXDATE')).flatMap((r) => r.split(':')[1].split(',')).map((d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`) ?? [];
  return { title: g.summary || 'Sin título', description: g.description ?? null, location: g.location ?? null, meeting_url: g.hangoutLink ?? null, starts_at: starts, ends_at: ends, all_day: allDay, time_zone: g.start?.timeZone || fallbackZone, rrule: rule, exdates: ex, google_event_id: g.id };
}

export async function syncGoogle(db: SupabaseClient, conn: Conn) {
  const token = await accessToken(db, conn);
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const report = { sent: 0, received: 0, removed: 0 };

  // 1. Lo que cambió en Google.
  const { data: mine } = await db.from('calendar_events').select('*').eq('owner_id', conn.owner_id).eq('app', 'organiza');
  const local = (mine ?? []) as Row[];
  const byGoogle = new Map(local.filter((e) => e.google_event_id).map((e) => [e.google_event_id!, e]));
  const zone = local[0]?.time_zone || 'America/Santiago';
  let pageToken: string | undefined;
  let syncToken = conn.state.syncToken;
  const pulled = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ maxResults: '250', singleEvents: 'false', showDeleted: 'true' });
    if (syncToken) q.set('syncToken', syncToken);
    else q.set('timeMin', new Date(Date.now() - 30 * 86_400_000).toISOString());
    if (pageToken) q.set('pageToken', pageToken);
    const res = await fetch(`${API}?${q}`, { headers: auth });
    if (res.status === 410) {
      // Google olvidó el punto de partida: se vuelve a pedir todo.
      syncToken = undefined;
      pageToken = undefined;
      continue;
    }
    if (!res.ok) throw new Error(`google-list-${res.status}`);
    const body = await res.json();
    for (const g of (body.items ?? []) as GEvent[]) {
      if (g.recurringEventId) continue; // cambios de un solo día de una serie: se ven en Google
      const here = byGoogle.get(g.id);
      if (g.status === 'cancelled') {
        pulled.add(g.id);
        if (here) {
          await db.from('calendar_events').delete().eq('id', here.id);
          report.removed++;
        }
        continue;
      }
      if (here) {
        if (Date.parse(here.updated_at) > Date.parse(g.updated ?? '0') && conn.state.pushedAt && Date.parse(here.updated_at) > Date.parse(conn.state.pushedAt)) continue;
        pulled.add(g.id);
        await db.from('calendar_events').update(fromGoogle(g, zone)).eq('id', here.id);
      } else {
        await db.from('calendar_events').insert({ ...fromGoogle(g, zone), owner_id: conn.owner_id, owner_scope: conn.owner_id, app: 'organiza', kind: 'evento', source: 'google', status: 'confirmado', space: 'persona' });
      }
      report.received++;
    }
    pageToken = body.nextPageToken;
    if (body.nextSyncToken) conn.state.syncToken = body.nextSyncToken;
    if (!pageToken) break;
  }

  // 2. Lo que cambió aquí.
  const since = conn.state.pushedAt ? Date.parse(conn.state.pushedAt) : 0;
  for (const e of local) {
    if (e.status === 'cancelado' || (e.google_event_id && pulled.has(e.google_event_id))) continue;
    if (e.google_event_id && Date.parse(e.updated_at) <= since) continue;
    const res = await fetch(e.google_event_id ? `${API}/${e.google_event_id}` : API, { method: e.google_event_id ? 'PATCH' : 'POST', headers: auth, body: JSON.stringify(toGoogle(e)) });
    if (!res.ok) continue;
    if (!e.google_event_id) {
      const made = (await res.json()) as GEvent;
      await db.from('calendar_events').update({ google_event_id: made.id }).eq('id', e.id);
    }
    report.sent++;
  }

  // Al final: lo que este mismo cruce escribió aquí no debe volver a Google.
  conn.state.pushedAt = new Date().toISOString();
  await db.from('organiza_connections').update({ state: conn.state, updated_at: new Date().toISOString() }).eq('owner_id', conn.owner_id).eq('provider', 'google');
  return report;
}
