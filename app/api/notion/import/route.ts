import { admin, userOf } from '@/lib/server/admin';
import { notion, readPage, stageId, type NPage } from '@/lib/server/notion';
import { LABEL_COLORS, modulesFor } from '@/components/organiza/model';

export const maxDuration = 60;

/**
 * Trae una base de Notion. Volver a traerla actualiza lo mismo (cada fila se
 * reconoce por su id de Notion) y conserva lo que se agregó en Organiza.
 */
export async function POST(request: Request) {
  const user = await userOf(request);
  if (!user) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });
  const { databaseId, title, space } = await request.json();
  if (typeof databaseId !== 'string' || !/^[a-f0-9-]{32,36}$/.test(databaseId)) return Response.json({ error: 'Base no válida.' }, { status: 400 });
  const where = space === 'empresa' ? 'empresa' : 'persona';
  const db = admin();
  const { data: c } = await db.from('organiza_connections').select('tokens, state').eq('owner_id', user.id).eq('provider', 'notion').maybeSingle();
  if (!c) return Response.json({ error: 'Conecta Notion primero.' }, { status: 400 });

  const pages: NPage[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion(c.tokens.access_token, `/databases/${databaseId}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    if (!res.ok) return Response.json({ error: 'Notion no dejó leer esa base.' }, { status: 502 });
    const body = await res.json();
    pages.push(...body.results);
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor && pages.length < 2000);

  const rows = pages.map(readPage).filter((r) => r.title);
  const weekly = rows.filter((r) => r.weekday !== null);

  // Base con fechas: al calendario.
  if (weekly.length < rows.length / 2) {
    let n = 0;
    for (const r of rows.filter((x) => x.date)) {
      const allDay = r.date!.start.length === 10;
      const row = { title: r.title, description: r.description || null, starts_at: allDay ? `${r.date!.start}T00:00:00Z` : r.date!.start, ends_at: r.date!.end ?? (allDay ? `${r.date!.start}T23:59:59Z` : r.date!.start), all_day: allDay, space: where };
      const { data: old } = await db.from('calendar_events').select('id').eq('owner_id', user.id).eq('source', 'notion').eq('source_ref', r.notionId).maybeSingle();
      if (old) await db.from('calendar_events').update(row).eq('id', old.id);
      else await db.from('calendar_events').insert({ ...row, owner_id: user.id, owner_scope: user.id, app: 'organiza', kind: 'evento', status: 'confirmado', source: 'notion', source_ref: r.notionId, time_zone: 'America/Santiago' });
      n++;
    }
    return Response.json({ kind: 'calendario', count: n });
  }

  // Base por días: un horario en vista previa.
  const imports = (c.state.imports ?? {}) as Record<string, string>;
  let scheduleId = imports[databaseId];
  if (scheduleId) {
    const { data: still } = await db.from('organiza_schedules').select('id').eq('id', scheduleId).maybeSingle();
    if (!still) scheduleId = '';
  }
  if (!scheduleId) {
    const { data: made } = await db.from('organiza_schedules').insert({ owner_id: user.id, space: where, name: typeof title === 'string' && title ? title : 'Horario de Notion', cover_url: 'grad:amanecer' }).select().single();
    if (!made) return Response.json({ error: 'No se pudo crear el horario.' }, { status: 500 });
    scheduleId = made.id;
    imports[databaseId] = scheduleId;
    await db.from('organiza_connections').update({ state: { ...c.state, imports } }).eq('owner_id', user.id).eq('provider', 'notion');
  }
  const { data: labels } = await db.from('organiza_labels').select('*').eq('owner_id', user.id).eq('space', where);
  const known = new Map((labels ?? []).map((l) => [l.name as string, l.id as string]));
  for (const name of new Set(weekly.map((r) => r.label).filter((x): x is string => !!x))) {
    if (known.has(name)) continue;
    const { data: l } = await db.from('organiza_labels').insert({ owner_id: user.id, space: where, name, color: LABEL_COLORS[known.size % LABEL_COLORS.length] }).select().single();
    if (l) known.set(name, l.id);
  }
  const { data: have } = await db.from('organiza_items').select('id, notion_id').eq('schedule_id', scheduleId);
  const had = new Map((have ?? []).map((i) => [i.notion_id as string, i.id as string]));
  let sort = 0;
  for (const r of weekly) {
    const row = { weekday: r.weekday!, time: r.time ?? '09:00', title: r.title, icon: r.icon, cover_url: r.cover, stage: stageId(r.stage), progress: r.progress, label_id: r.label ? known.get(r.label) ?? null : null, description: r.description, focus: r.focus, sort: sort++ };
    const id = had.get(r.notionId);
    if (id) await db.from('organiza_items').update(row).eq('id', id);
    else await db.from('organiza_items').insert({ ...row, schedule_id: scheduleId, owner_id: user.id, notion_id: r.notionId, alarm: r.alarm ? 'alarma' : 'notificacion', modules: modulesFor(r.title) });
  }
  await db.from('organiza_schedules').update({ updated_at: new Date().toISOString() }).eq('id', scheduleId);
  return Response.json({ kind: 'horario', count: weekly.length, skipped: rows.length - weekly.length, scheduleId });
}
