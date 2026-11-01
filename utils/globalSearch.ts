/**
 * Buscador global (Topbar, ⌘K / Ctrl+K — copiado de Finance): una búsqueda
 * sobre toda la app. Lógica pura — app/page.tsx arma los items (acciones,
 * secciones, ajustes y los registros propios de cada app) y GlobalSearch los
 * muestra. Para que algo nuevo sea buscable, agrégalo en getSearchItems.
 *
 * Matching: accents/case don't matter, every word must appear somewhere.
 * Numbers are matched against amounts too: "17.000" finds $17.780 (same
 * number of digits and same leading digits, or within ±10%), and
 * "uber 17000" combines both.
 */

export type SearchKind = 'accion' | 'seccion' | 'registro' | 'ajuste';

export interface SearchItem {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle?: string;
  /** Monto, para buscar por número (opcional). */
  amount?: number;
  /** Extra words that should find this item (synonyms). */
  keywords?: string;
  /** ISO date, newest first among equals. */
  date?: string;
  /** Emoji / short icon text. */
  icon?: string;
  run: () => void;
}

export const KIND_LABEL: Record<SearchKind, string> = {
  accion: 'Acciones',
  seccion: 'Ir a',
  registro: 'Registros',
  ajuste: 'Configuración',
};

const ORDER: SearchKind[] = ['accion', 'seccion', 'registro', 'ajuste'];

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

/** "$17.780" / "17,5" / "17000" → digits as a number; null if it isn't a number token. */
function parseAmountToken(tok: string): number | null {
  const t = tok.replace(/^\$/, '');
  if (!/^\d[\d.,]*$/.test(t)) return null;
  // Chilean format: dots = thousands, comma = decimals.
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function amountMatches(amount: number, q: number): number | null {
  const a = Math.abs(Math.round(amount));
  const qi = Math.round(q);
  if (a === 0) return null;
  const diff = Math.abs(a - qi) / qi;
  const aDigits = String(a);
  const qDigits = String(qi);
  const lead = qDigits.replace(/0+$/, '') || qDigits;
  const sameMagnitude = aDigits.length === qDigits.length && aDigits.startsWith(lead);
  // Typing a partial number ("177") finds 17.780; a round one ("17000") only same-size amounts.
  const prefix = !/0$/.test(qDigits) && aDigits.startsWith(qDigits);
  if (diff <= 0.1 || sameMagnitude || prefix) return diff; // lower = closer
  return null;
}

export interface SearchGroup {
  kind: SearchKind;
  label: string;
  items: SearchItem[];
}

export function searchAll(items: SearchItem[], query: string, perKind = 6): SearchGroup[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const amounts: number[] = [];
  const words: string[] = [];
  for (const t of tokens) {
    const n = parseAmountToken(t);
    if (n !== null) amounts.push(n);
    else words.push(t.replace(/^\$/, ''));
  }

  const scored: { item: SearchItem; score: number }[] = [];
  for (const item of items) {
    const title = normalize(item.title);
    const hay = `${title} ${normalize(item.subtitle ?? '')} ${normalize(item.keywords ?? '')}`;
    let score = 0;

    // Text words: all must appear.
    let ok = true;
    for (const w of words) {
      if (!w) continue;
      if (title.startsWith(w)) score += 30;
      else if (new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(hay)) score += 18;
      else if (hay.includes(w)) score += 8;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    // Number tokens: match the amount, or the text (e.g. "2026", "f29").
    for (const n of amounts) {
      const byAmount = item.amount !== undefined ? amountMatches(item.amount, n) : null;
      if (byAmount !== null) score += 40 - Math.min(30, byAmount * 100);
      else if (hay.includes(String(Math.round(n)))) score += 10;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (item.kind === 'accion' || item.kind === 'seccion') score += 2;
    scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score || (b.item.date ?? '').localeCompare(a.item.date ?? ''));
  return ORDER.map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    items: scored.filter((s) => s.item.kind === kind).slice(0, perKind).map((s) => s.item),
  })).filter((g) => g.items.length > 0);
}
