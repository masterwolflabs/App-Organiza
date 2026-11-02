import webpush from 'web-push';
import { admin, isCron } from '@/lib/server/admin';

/**
 * El reloj de los avisos: lo llama un cron cada minuto. Busca tareas de
 * horarios publicados que tocan ahora, en la zona horaria de cada persona, y
 * avisa a sus teléfonos. `organiza_push_sent` evita repetir.
 */
export const maxDuration = 60;
const KEYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function localNow(zone: string, shift: number) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(Date.now() + shift * 60_000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { weekday: KEYS.indexOf(get('weekday')), time: `${get('hour').replace('24', '00')}:${get('minute')}` };
}

export async function POST(request: Request) {
  if (!isCron(request)) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const { NEXT_PUBLIC_VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv } = process.env;
  if (!pub || !priv) return Response.json({ error: 'Faltan las llaves VAPID.' }, { status: 503 });
  webpush.setVapidDetails('mailto:masterwolf.labs@gmail.com', pub, priv);

  const db = admin();
  const { data: schedules } = await db.from('organiza_schedules').select('id, owner_id, alarms, days').eq('status', 'publicado').neq('alarms', 'ninguna');
  if (!schedules?.length) return Response.json({ sent: 0 });
  const { data: items } = await db.from('organiza_items').select('*').in('schedule_id', schedules.map((s) => s.id));
  const { data: events } = await db.from('calendar_events').select('source_ref, time_zone').eq('source', 'horario').in('source_ref', (items ?? []).map((i) => i.id));
  const zoneOf = new Map((events ?? []).map((e) => [e.source_ref as string, e.time_zone as string]));
  // Lo que cambió solo ese día manda: otro horario, una hora movida o una actividad quitada.
  const { data: plans } = await db.from('organiza_day_plans').select('owner_id, day, schedule_id, moves').gte('day', new Date(Date.now() - 864e5).toISOString().slice(0, 10));
  const planOf = (owner: string, zone: string) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(new Date());
    return (plans ?? []).find((p) => p.owner_id === owner && p.day === day);
  };
  let sent = 0;
  for (const s of schedules) {
    for (const i of (items ?? []).filter((x) => x.schedule_id === s.id && (s.days ?? [0, 1, 2, 3, 4, 5, 6]).includes(x.weekday))) {
      const kind = s.alarms === 'todas' && i.alarm === 'no' ? 'notificacion' : i.alarm;
      if (kind === 'no') continue;
      const zone = zoneOf.get(i.id) || 'America/Santiago';
      const now = localNow(zone, i.alarm_before);
      const plan = planOf(s.owner_id, zone);
      const move = plan?.moves?.[i.id] as { time?: string; off?: boolean } | undefined;
      if (now.weekday !== i.weekday || now.time !== (move?.time ?? i.time) || move?.off || (plan?.schedule_id && plan.schedule_id !== s.id)) continue;
      const at = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
      const { error: repeated } = await db.from('organiza_push_sent').insert({ owner_id: s.owner_id, ref: i.id, at });
      if (repeated) continue;
      const { data: subs } = await db.from('organiza_push').select('*').eq('owner_id', s.owner_id);
      const payload = JSON.stringify({ title: `${i.icon} ${i.title}`.trim(), body: i.alarm_before ? `En ${i.alarm_before} minutos` : `Son las ${i.time}`, alarm: kind === 'alarma' });
      for (const sub of subs ?? []) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { urgency: 'high' });
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await db.from('organiza_push').delete().eq('id', sub.id);
        }
      }
    }
  }
  return Response.json({ sent });
}
