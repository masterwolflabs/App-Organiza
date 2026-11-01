import { evaluateMathExpression } from '@/utils/mathExpression';

// Helpers for "smart calculation" inside notes: turning typed lines
// ("2500 + 1.300 =") or dictated phrases ("dos más dos") into a number using
// the same safe recursive-descent evaluator as the calculator — never eval.

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Chilean number conventions: "." groups thousands, "," is the decimal mark.
function normalizeTypedMath(input: string): string {
  let s = input
    .replace(/[×✕]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/(\d)\s*x\s*(?=[\d(])/gi, '$1*');
  // "1.500.000" -> "1500000" (but never touch "0.125"-style decimals)
  s = s.replace(/(?<![\d.,])(\d{1,3})((?:\.\d{3})+)(?![\d])/g, (match, head: string, rest: string) =>
    head.startsWith('0') ? match : head + rest.replace(/\./g, '')
  );
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  return s;
}

const PURE_MATH = /^[\d.\s+\-*/^()%]+$/;
// At least one *binary* operator between operands — a lone "5" isn't a calculation.
const HAS_BINARY_OP = /[\d)%]\s*[-+*/^]\s*[-\d(]/;

/** Evaluates `text` if — and only if — it is a plain arithmetic expression. */
export function tryEvaluate(text: string): number | null {
  const s = normalizeTypedMath(text).trim();
  if (!s || !PURE_MATH.test(s) || !HAS_BINARY_OP.test(s)) return null;
  try {
    const value = evaluateMathExpression(s);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Finds the arithmetic expression at the END of a line ("Compras: 2500 + 1300")
 * and evaluates it. Returns the expression text as typed plus its value.
 */
export function trailingExpression(line: string): { text: string; value: number } | null {
  const tail = line.match(/[\d.,\s+\-*/×÷^()%x]*$/)?.[0] ?? '';
  let candidate = tail;
  for (let guard = 0; guard < 8; guard++) {
    const trimmed = candidate.replace(/^[\s.,x*/×÷^%+)]+/i, '').trimEnd();
    if (!trimmed) return null;
    const value = tryEvaluate(trimmed);
    if (value !== null) return { text: trimmed, value };
    // Drop the first operand and retry ("Total 5 2+2" -> "2+2").
    const next = trimmed.replace(/^[\d.,()%-]+\s*/, '');
    if (next === trimmed || !next) return null;
    candidate = next;
  }
  return null;
}

/** Chilean formatting: 1500000 -> "1.500.000", 2.5 -> "2,5". */
export function formatMathValue(value: number): string {
  const rounded = parseFloat(value.toFixed(6));
  const raw = String(rounded);
  if (raw.includes('e')) return raw;
  const negative = raw.startsWith('-');
  const [int, dec] = (negative ? raw.slice(1) : raw).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped}${dec ? ',' + dec : ''}`;
}

// --- Spoken Spanish -------------------------------------------------------

const UNITS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
  veintinueve: 29,
};
const TENS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
};
const HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
  cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600,
  seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
  novecientos: 900, novecientas: 900,
};

const isNumberWord = (w: string) => w in UNITS || w in TENS || w in HUNDREDS || w === 'mil' || w === 'millon' || w === 'millones';

// Words are already accent-stripped and lowercase; "y" glue words are skipped.
function wordsToNumber(words: string[]): number {
  let total = 0;
  let chunk = 0;
  for (const w of words) {
    if (w === 'y') continue;
    if (w === 'millon' || w === 'millones') {
      total += (chunk || 1) * 1_000_000;
      chunk = 0;
    } else if (w === 'mil') {
      total += (chunk || 1) * 1000;
      chunk = 0;
    } else if (w in UNITS) chunk += UNITS[w];
    else if (w in TENS) chunk += TENS[w];
    else if (w in HUNDREDS) chunk += HUNDREDS[w];
  }
  return total + chunk;
}

// Division goes first so "dividido por" isn't half-eaten by the plain "por" (multiply) rule.
const OPERATORS: [RegExp, string][] = [
  [/\bdividido por\b|\bdividido entre\b|\bdividido\b|\bentre\b/g, ' / '],
  [/\bmultiplicado por\b|\bmultiplicado\b|\bveces\b|\bpor\b/g, ' * '],
  [/\belevado a\b|\belevado al\b/g, ' ^ '],
  [/\bal cuadrado\b/g, ' ^ 2 '],
  [/\bal cubo\b/g, ' ^ 3 '],
  [/\bmas\b|\bsumado a\b|\bsumar\b/g, ' + '],
  [/\bmenos\b|\brestar\b/g, ' - '],
  [/\bpor ciento\b/g, ' % '],
];

/**
 * Turns a dictated phrase that is *entirely* arithmetic ("dos más dos",
 * "mil quinientos por tres", "2 + 2") into a display string and its value.
 * Anything with leftover words returns null — it's probably ordinary text.
 */
export function spokenToMath(phrase: string): { display: string; value: number } | null {
  let text = ` ${stripAccents(phrase.toLowerCase()).replace(/[¿?¡!.;]/g, ' ')} `;
  // "por ciento" must be consumed before the plain "por" (multiply) rule.
  text = text.replace(/\bpor ciento\b/g, ' % ');
  for (const [re, sym] of OPERATORS) text = text.replace(re, sym);
  text = text.replace(/\bigual a\b|\bigual\b|\bresultado\b/g, ' ');

  const parts = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length) {
      out.push(String(wordsToNumber(run)));
      run = [];
    }
  };

  for (let i = 0; i < parts.length; i++) {
    const w = parts[i];
    if (isNumberWord(w) || (w === 'y' && run.length && i + 1 < parts.length && isNumberWord(parts[i + 1]))) {
      run.push(w);
      continue;
    }
    flush();
    if (w === 'coma' || w === 'punto') {
      out.push('.');
      continue;
    }
    out.push(w);
  }
  flush();

  // Glue decimals: "2 . 5" -> "2.5"
  const joined = out.join(' ').replace(/(\d)\s*\.\s*(\d)/g, '$1.$2').replace(/\s+/g, ' ').trim();
  if (!/^[\d.\s+\-*/^()%]+$/.test(joined) || !/\d/.test(joined) || !/[-+*/^]/.test(joined)) return null;
  const value = tryEvaluate(joined);
  if (value === null) return null;
  const display = joined.replace(/\*/g, '×').replace(/\//g, '÷');
  return { display, value };
}
