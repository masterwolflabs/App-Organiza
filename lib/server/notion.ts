/**
 * Lee bases de Notion y las trae a Organiza. Una base agrupada por día de la
 * semana entra como horario, y una base con fechas entra al calendario. Los
 * nombres de las columnas se reconocen solos, porque cada Notion es distinto.
 */
export const NOTION_VERSION = '2022-06-28';
export type NProp = { type: string; [k: string]: unknown };
export type NPage = { id: string; properties: Record<string, NProp>; icon?: { type: string; emoji?: string } | null; cover?: { type: string; external?: { url: string }; file?: { url: string } } | null };

export const notion = (token: string, path: string, body?: unknown) =>
  fetch(`https://api.notion.com/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

export function textOf(p?: NProp): string {
  if (!p) return '';
  const rich = (p.title ?? p.rich_text) as { plain_text: string }[] | undefined;
  if (Array.isArray(rich)) return rich.map((r) => r.plain_text).join('');
  const sel = (p.select ?? p.status) as { name?: string } | null | undefined;
  if (sel?.name) return sel.name;
  if (p.type === 'multi_select') return ((p.multi_select as { name: string }[]) ?? [])[0]?.name ?? '';
  if (p.type === 'date') return (p.date as { start?: string } | null)?.start ?? '';
  if (p.type === 'number') return p.number == null ? '' : String(p.number);
  if (p.type === 'formula') {
    const f = p.formula as { string?: string; number?: number };
    return f.string ?? (f.number == null ? '' : String(f.number));
  }
  return '';
}

const DAYS: [RegExp, number][] = [[/monday|lunes/i, 0], [/tuesday|martes/i, 1], [/wednesday|mi[eé]rcoles/i, 2], [/thursday|jueves/i, 3], [/friday|viernes/i, 4], [/saturday|s[aá]bado/i, 5], [/sunday|domingo/i, 6]];
export const weekdayIn = (t: string) => DAYS.find(([r]) => r.test(t))?.[1] ?? null;
export const timeIn = (t: string) => {
  const m = t.match(/\b(\d{1,2}):(\d{2})\b/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};

const named = (page: NPage, re: RegExp) => Object.entries(page.properties).find(([k]) => re.test(k))?.[1];
const SKIP_LABEL = /etapa|estado|status|avance|progress|d[ií]a|day/i;

/** Una página de Notion en palabras de Organiza. */
export function readPage(page: NPage) {
  const props = Object.entries(page.properties);
  const title = textOf(props.find(([, p]) => p.type === 'title')?.[1]);
  const dayProp = props.find(([k, p]) => ['select', 'status', 'multi_select'].includes(p.type) && (/d[ií]a|day/i.test(k) || weekdayIn(textOf(p)) !== null));
  const weekday = dayProp ? weekdayIn(textOf(dayProp[1])) : null;
  const time = timeIn(textOf(named(page, /hora|time|inicio/i))) ?? props.map(([, p]) => (p.type === 'date' ? null : timeIn(textOf(p)))).find(Boolean) ?? null;
  const date = props.find(([, p]) => p.type === 'date' && textOf(p))?.[1];
  const stage = textOf(named(page, /etapa|estado|status/i));
  const labelEntry = props.find(([k, p]) => ['select', 'multi_select'].includes(p.type) && !SKIP_LABEL.test(k) && textOf(p));
  const check = (re: RegExp) => { const p = named(page, re); return p?.type === 'checkbox' ? !!p.checkbox : false; };
  const num = named(page, /avance|progress/i);
  const cover = page.cover?.external?.url ?? page.cover?.file?.url ?? null;
  return {
    notionId: page.id, title, weekday, time, stage, label: labelEntry ? textOf(labelEntry[1]) : null, description: textOf(named(page, /descrip/i)),
    alarm: check(/alarma|notific/i), focus: check(/focus/i), progress: Math.max(0, Math.min(100, Math.round(Number(num?.number ?? 0) * (Number(num?.number ?? 0) <= 1 ? 100 : 1)))),
    icon: page.icon?.type === 'emoji' ? page.icon.emoji ?? '' : '', cover, date: date ? (date.date as { start: string; end?: string | null }) : null,
  };
}
export const stageId = (t: string) => (/revis/i.test(t) ? 'revision' : /apunte/i.test(t) ? 'apuntes' : /curso|progress|avance/i.test(t) ? 'en_curso' : /list|hech|done|complet/i.test(t) ? 'listo' : 'sin_empezar');
