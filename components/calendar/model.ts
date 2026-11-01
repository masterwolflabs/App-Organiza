/**
 * Calendario maestro del ecosistema (Emanuel, 2026-10-29): un solo calendario
 * para todas las apps, como el chat. Cada evento dice de qué app es; la nube
 * ve todo y cada app solo lo suyo. Tabla `calendar_events`
 * (supabase/21-calendario.sql). Las repeticiones usan el idioma de Google
 * Calendar (RRULE) para sincronizar 1:1 más adelante.
 */

export type EventKind = 'evento' | 'reunion' | 'trabajo' | 'proyecto' | 'pago' | 'personal' | 'recordatorio';
export type EventMode = 'presencial' | 'online';

export type CalEvent = {
  id: string;
  owner_id: string;
  owner_scope: string;
  app: string;
  kind: EventKind;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  time_zone: string;
  mode: EventMode | null;
  location: string | null;
  meeting_url: string | null;
  rrule: string | null;
  color: string | null;
  status: 'confirmado' | 'tentativo' | 'cancelado';
  attendee_users: string[];
  attendee_people: string[];
  attendee_clients: string[];
  attendee_emails: string[];
  source: string;
  source_ref: string | null;
  google_event_id: string | null;
  /** Organiza (SQL 24): área de vida y meta de la que nació. */
  area_id?: string | null;
  goal_id?: string | null;
  /** Excepciones (SQL 25): días en que la serie no ocurre, y serie de origen de un evento suelto. */
  exdates?: string[] | null;
  series_id?: string | null;
};

/** One drawn occurrence (a recurring event shows up many times). */
export type Occurrence = { ev: CalEvent; start: Date; end: Date; key: string };

export const KINDS: { id: EventKind; label: string; emoji: string; color: string }[] = [
  { id: 'reunion', label: 'Reunión', emoji: '🤝', color: '#38bdf8' },
  { id: 'trabajo', label: 'Trabajo', emoji: '💼', color: '#a78bfa' },
  { id: 'proyecto', label: 'Proyecto', emoji: '📐', color: '#f472b6' },
  { id: 'pago', label: 'Pago', emoji: '💸', color: '#34d399' },
  { id: 'personal', label: 'Personal', emoji: '🌿', color: '#fbbf24' },
  { id: 'recordatorio', label: 'Recordatorio', emoji: '🔔', color: '#fb923c' },
  { id: 'evento', label: 'Evento', emoji: '📅', color: '#94a3b8' },
];
export const kindOf = (k: string) => KINDS.find((x) => x.id === k) ?? KINDS[KINDS.length - 1];
/** Color y nombre de las áreas de Organiza; lo llena useOrganiza. */
export const AREA_INFO = new Map<string, { color: string; label: string }>();
const areaOf = (ev: CalEvent) => (ev.area_id ? AREA_INFO.get(ev.area_id) : undefined);
export const colorOf = (ev: CalEvent) => ev.color || areaOf(ev)?.color || kindOf(ev.kind).color;
export const labelOf = (ev: CalEvent) => areaOf(ev)?.label ?? `${kindOf(ev.kind).emoji} ${kindOf(ev.kind).label}`;

export const COLORS = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#94a3b8'];

/* ── Fechas (hora local del computador) ─────────────────────────────── */

export const DAY = 86_400_000;
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), 28));
/** Semana parte el lunes. */
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
export const atMinutes = (day: Date, min: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, min);

const pad = (n: number) => String(n).padStart(2, '0');
export const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fromInputs = (date: string, time: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = (time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
};

export const fmtTime = (d: Date) => d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtDay = (d: Date) => d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
export const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* ── Repeticiones (subconjunto de RRULE que usa Google) ─────────────── */

export const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export type RepeatPreset = '' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
export const REPEATS: { id: RepeatPreset; label: (d: Date) => string }[] = [
  { id: '', label: () => 'No se repite' },
  { id: 'daily', label: () => 'Todos los días' },
  { id: 'weekdays', label: () => 'Días hábiles (lun a vie)' },
  { id: 'weekly', label: () => 'Cada semana' },
  { id: 'monthly', label: (d) => `Cada mes el día ${d.getDate()}` },
  { id: 'yearly', label: (d) => `Cada año el ${d.getDate()} de ${MONTHS[d.getMonth()]}` },
];
export function presetToRrule(p: RepeatPreset, start: Date, days: string[] = []): string | null {
  switch (p) {
    case 'daily': return 'FREQ=DAILY';
    case 'weekdays': return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'weekly': return `FREQ=WEEKLY;BYDAY=${(days.length ? days : [BYDAY[start.getDay()]]).join(',')}`;
    case 'monthly': return 'FREQ=MONTHLY';
    case 'yearly': return 'FREQ=YEARLY';
    default: return null;
  }
}
export function rruleToPreset(r: string | null): RepeatPreset {
  if (!r) return '';
  const p = parseRrule(r);
  if (p.freq === 'DAILY') return 'daily';
  if (p.freq === 'WEEKLY') return p.byday.length === 5 && !p.byday.includes('SA') && !p.byday.includes('SU') ? 'weekdays' : 'weekly';
  if (p.freq === 'MONTHLY') return 'monthly';
  if (p.freq === 'YEARLY') return 'yearly';
  return '';
}

export const rruleDays = (r: string | null | undefined) => (r ? parseRrule(r).byday : []);

type Rrule = { freq: string; interval: number; byday: string[]; count: number | null; until: Date | null };
function parseRrule(r: string): Rrule {
  const out: Rrule = { freq: '', interval: 1, byday: [], count: null, until: null };
  for (const part of r.replace(/^RRULE:/, '').split(';')) {
    const [k, v] = part.split('=');
    if (k === 'FREQ') out.freq = v;
    else if (k === 'INTERVAL') out.interval = Math.max(1, Number(v) || 1);
    else if (k === 'BYDAY') out.byday = v.split(',').map((x) => x.slice(-2));
    else if (k === 'COUNT') out.count = Number(v) || null;
    else if (k === 'UNTIL') {
      const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
      if (m) out.until = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59);
    }
  }
  return out;
}

/** Every occurrence of the events that touches [from, to). */
export function expand(events: CalEvent[], from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const ev of events) {
    if (ev.status === 'cancelado') continue;
    const s0 = new Date(ev.starts_at);
    const e0 = new Date(ev.ends_at);
    const len = Math.max(0, e0.getTime() - s0.getTime());
    const push = (s: Date) => {
      if (ev.exdates?.includes(toDateInput(s))) return;
      const e = new Date(s.getTime() + len);
      if (s < to && (e > from || (len === 0 && s >= from))) out.push({ ev, start: s, end: e, key: `${ev.id}@${s.getTime()}` });
    };
    if (!ev.rrule) { push(s0); continue; }
    const r = parseRrule(ev.rrule);
    let n = 0;
    const done = (s: Date) => (r.count != null && n >= r.count) || (r.until != null && s > r.until) || s >= to;
    const at = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), s0.getHours(), s0.getMinutes());
    if (r.freq === 'DAILY' || r.freq === 'WEEKLY') {
      const days = r.freq === 'WEEKLY' && r.byday.length ? r.byday : null;
      const step = r.freq === 'DAILY' ? r.interval : 1;
      const week0 = startOfWeek(s0).getTime();
      for (let d = startOfDay(s0); ; d = addDays(d, step)) {
        const s = at(d);
        if (done(s)) break;
        if (r.freq === 'WEEKLY') {
          const wk = Math.round((startOfWeek(d).getTime() - week0) / (7 * DAY));
          if (wk % r.interval !== 0) continue;
          if (days ? !days.includes(BYDAY[d.getDay()]) : d.getDay() !== s0.getDay()) continue;
        }
        n++;
        push(s);
      }
    } else if (r.freq === 'MONTHLY' || r.freq === 'YEARLY') {
      const months = r.freq === 'MONTHLY' ? r.interval : 12 * r.interval;
      for (let i = 0; ; i += months) {
        const s = new Date(s0.getFullYear(), s0.getMonth() + i, s0.getDate(), s0.getHours(), s0.getMinutes());
        if (done(s)) break;
        if (s.getDate() !== s0.getDate()) continue; // 31 de un mes de 30 días: se salta (como Google)
        n++;
        push(s);
      }
    } else push(s0);
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
}

/* ── Logística: choques, márgenes y traslados ───────────────────────── */

/** Minimum gap between two online meetings. */
export const ONLINE_GAP = 10;
/** Without a maps API yet: what we assume a move between two places takes. */
export const TRAVEL_GAP = 30;

export type Warning = { level: 'choque' | 'margen' | 'traslado'; text: string; other: Occurrence };

const placeOf = (ev: CalEvent) => (ev.mode === 'presencial' && ev.location?.trim() ? ev.location.trim() : null);
const samePlace = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, ' ') === b.toLowerCase().replace(/\s+/g, ' ');

/**
 * What to tell the person about an event given everything else that day:
 * overlaps, no breathing room between online meetings, and "¿alcanzas a
 * llegar de A a B?" between in-person events in different places.
 */
export function logistics(target: { id?: string; start: Date; end: Date; mode: EventMode | null; location: string | null; all_day: boolean }, others: Occurrence[]): Warning[] {
  if (target.all_day) return [];
  const out: Warning[] = [];
  const here = target.mode === 'presencial' && target.location?.trim() ? target.location.trim() : null;
  for (const o of others) {
    if (o.ev.id === target.id || o.ev.all_day || o.ev.kind === 'recordatorio') continue;
    if (o.start < target.end && o.end > target.start) {
      out.push({ level: 'choque', text: `Se cruza con «${o.ev.title || 'Sin título'}» (${fmtTime(o.start)}–${fmtTime(o.end)}).`, other: o });
      continue;
    }
    const before = o.end <= target.start;
    const gap = Math.round((before ? target.start.getTime() - o.end.getTime() : o.start.getTime() - target.end.getTime()) / 60_000);
    if (gap > 120) continue;
    const there = placeOf(o.ev);
    if (here && there && !samePlace(here, there) && gap < TRAVEL_GAP) {
      const [a, b] = before ? [there, here] : [here, there];
      out.push({ level: 'traslado', text: `Cuidado con la logística: vas de «${a}» a «${b}» en ${gap} min. ¿Te alcanza?`, other: o });
    } else if ((here || there) && !(here && there) && (target.mode === 'online' || o.ev.mode === 'online') && gap < ONLINE_GAP) {
      out.push({ level: 'traslado', text: `Pasas de una reunión online a una presencial (o al revés) con ${gap} min entre medio.`, other: o });
    } else if (target.mode === 'online' && o.ev.mode === 'online' && gap < ONLINE_GAP) {
      out.push({ level: 'margen', text: gap === 0 ? `Pegada a «${o.ev.title || 'Sin título'}»: sin margen para respirar.` : `Solo ${gap} min entre esta y «${o.ev.title || 'Sin título'}».`, other: o });
    }
  }
  return out;
}

/* ── Columnas para eventos que se cruzan (vista semana / día) ───────── */

export type Placed = Occurrence & { col: number; cols: number };
export function layoutDay(occ: Occurrence[]): Placed[] {
  const placed: Placed[] = [];
  let group: Placed[] = [];
  let groupEnd = 0;
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1));
    for (const g of group) g.cols = cols;
    group = [];
  };
  for (const o of occ) {
    const s = o.start.getTime();
    const e = Math.max(o.end.getTime(), s + 20 * 60_000);
    if (group.length && s >= groupEnd) flush();
    const used = new Set(group.filter((g) => Math.max(g.end.getTime(), g.start.getTime() + 20 * 60_000) > s).map((g) => g.col));
    let col = 0;
    while (used.has(col)) col++;
    const p: Placed = { ...o, col, cols: 1 };
    group.push(p);
    placed.push(p);
    groupEnd = Math.max(groupEnd, e);
  }
  flush();
  return placed;
}
