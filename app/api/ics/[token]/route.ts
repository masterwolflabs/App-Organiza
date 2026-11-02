import { admin } from '@/lib/server/admin';

/**
 * El calendario de Organiza como suscripción .ics: lo lee el Calendario del
 * iPhone o del Mac. La dirección es privada (un token largo) y solo se lee.
 */
const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d+/, '');
const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, '');
  if (!/^[a-f0-9]{48}$/.test(token)) return new Response('No encontrado', { status: 404 });
  const db = admin();
  const { data: feed } = await db.from('organiza_feeds').select('owner_id').eq('token', token).maybeSingle();
  if (!feed) return new Response('No encontrado', { status: 404 });
  const { data } = await db.from('calendar_events').select('*').eq('owner_id', feed.owner_id).eq('app', 'organiza').neq('status', 'cancelado').limit(2000);
  const { data: items } = await db.from('organiza_items').select('id, alarm, alarm_before').eq('owner_id', feed.owner_id);
  const alarmOf = new Map((items ?? []).map((i) => [i.id as string, i]));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Master Wolf Labs//Organiza//ES', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Organiza', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H'];
  for (const e of data ?? []) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@organiza`, `DTSTAMP:${stamp(new Date().toISOString())}`, `SUMMARY:${esc(e.title || 'Sin título')}`);
    if (e.all_day) lines.push(`DTSTART;VALUE=DATE:${e.starts_at.slice(0, 10).replace(/-/g, '')}`);
    else lines.push(`DTSTART:${stamp(new Date(e.starts_at).toISOString())}`, `DTEND:${stamp(new Date(e.ends_at).toISOString())}`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    for (const d of e.exdates ?? []) lines.push(`EXDATE;VALUE=DATE:${d.replace(/-/g, '')}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    const a = alarmOf.get(e.source_ref);
    if (a && a.alarm !== 'no') lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title || 'Organiza')}`, `TRIGGER:-PT${a.alarm_before}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.join('\r\n'), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=900' } });
}
