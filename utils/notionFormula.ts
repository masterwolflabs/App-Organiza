/**
 * Formula engine with Notion's formula language (Formulas 2.0) — Emanuel,
 * 2026-10-16: "que se maneje bajo el mismo código de Notion". Pure, no eval.
 *
 * Supports:
 *  - references: prop("Nombre") (Notion) and {Nombre} (our older syntax);
 *  - literals: 12, 1.5, "texto", 'texto', true, false, [lista, de, valores];
 *  - operators: + - * / % ^, ==, !=, >, >=, <, <=, and / &&, or / ||, not / !,
 *    cond ? a : b, list[i]; "+" joins text when either side is text;
 *  - Notion's dot style: prop("Monto").round() == round(prop("Monto"));
 *  - functions: logic (if, ifs, empty, and, or, not), math, text, dates,
 *    lists (map / filter / find / some / every with `current` and `index`),
 *    let / lets — see FORMULA_FUNCTIONS.
 * Values: number | string | boolean | Date | list | null (empty).
 */

export type FVal = number | string | boolean | Date | FVal[] | null;
export class FormulaError extends Error {}

// ── Tokenizer ────────────────────────────────────────────────────────────
type Tok =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'id'; v: string }
  | { k: 'brace'; v: string }
  | { k: 'op'; v: string }
  | { k: 'eof' };

const OPS = ['==', '!=', '>=', '<=', '&&', '||', '+', '-', '*', '/', '%', '^', '>', '<', '!', '?', ':', '(', ')', ',', '.', '[', ']', '='];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(src.slice(i))!;
      out.push({ k: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'" || c === '“' || c === '”') {
      const close = c === '“' ? '”' : c;
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== close && !(close === '"' && src[j] === '”')) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const n = src[j + 1];
          s += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          j += 2;
        } else s += src[j++];
      }
      if (j >= src.length) throw new FormulaError('Falta cerrar las comillas de un texto.');
      out.push({ k: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (c === '{') {
      const j = src.indexOf('}', i);
      if (j < 0) throw new FormulaError('Falta cerrar una llave }.');
      out.push({ k: 'brace', v: src.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_À-ɏ]/.test(c)) {
      const m = /^[A-Za-z_À-ɏ][A-Za-z0-9_À-ɏ]*/.exec(src.slice(i))!;
      out.push({ k: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new FormulaError(`No entiendo el símbolo “${c}”.`);
    out.push({ k: 'op', v: op });
    i += op.length;
  }
  out.push({ k: 'eof' });
  return out;
}

// ── Parser ───────────────────────────────────────────────────────────────
export type Node =
  | { t: 'lit'; v: FVal }
  | { t: 'list'; items: Node[] }
  | { t: 'ref'; name: string }
  | { t: 'var'; name: string }
  | { t: 'call'; name: string; args: Node[] }
  | { t: 'bin'; op: string; l: Node; r: Node }
  | { t: 'un'; op: string; e: Node }
  | { t: 'cond'; c: Node; a: Node; b: Node }
  | { t: 'idx'; e: Node; i: Node };

function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek().k === 'op' && (peek() as { v: string }).v === v;
  const isWord = (v: string) => peek().k === 'id' && (peek() as { v: string }).v.toLowerCase() === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new FormulaError(`Se esperaba “${v}”.`);
    p++;
  };

  const args = (): Node[] => {
    expect('(');
    const list: Node[] = [];
    if (!isOp(')')) {
      do list.push(ternary());
      while (isOp(',') && ++p);
    }
    expect(')');
    return list;
  };

  const primary = (): Node => {
    const t = peek();
    if (t.k === 'num') return p++, { t: 'lit', v: t.v };
    if (t.k === 'str') return p++, { t: 'lit', v: t.v };
    if (t.k === 'brace') return p++, { t: 'ref', name: t.v };
    if (t.k === 'op' && t.v === '(') {
      p++;
      const e = ternary();
      expect(')');
      return e;
    }
    if (t.k === 'op' && t.v === '[') {
      p++;
      const items: Node[] = [];
      if (!isOp(']')) {
        do items.push(ternary());
        while (isOp(',') && ++p);
      }
      expect(']');
      return { t: 'list', items };
    }
    if (t.k === 'id') {
      p++;
      const low = t.v.toLowerCase();
      if (low === 'true' || low === 'verdadero') return { t: 'lit', v: true };
      if (low === 'false' || low === 'falso') return { t: 'lit', v: false };
      if (isOp('(')) {
        const a = args();
        if (low === 'prop') {
          if (a.length !== 1 || a[0].t !== 'lit' || typeof a[0].v !== 'string') throw new FormulaError('prop() necesita el nombre entre comillas: prop("Monto").');
          return { t: 'ref', name: a[0].v };
        }
        return { t: 'call', name: low, args: a };
      }
      return { t: 'var', name: t.v };
    }
    if (t.k === 'eof') throw new FormulaError('La fórmula está incompleta.');
    throw new FormulaError(`No esperaba “${(t as { v: string }).v}” aquí.`);
  };

  const postfix = (): Node => {
    let e = primary();
    for (;;) {
      if (isOp('.')) {
        p++;
        const t = peek();
        if (t.k !== 'id') throw new FormulaError('Después del punto va una función, por ejemplo .round().');
        p++;
        const a = isOp('(') ? args() : [];
        e = { t: 'call', name: t.v.toLowerCase(), args: [e, ...a] };
      } else if (isOp('[')) {
        p++;
        const i = ternary();
        expect(']');
        e = { t: 'idx', e, i };
      } else return e;
    }
  };
  const power = (): Node => {
    const b = postfix();
    if (isOp('^')) {
      p++;
      return { t: 'bin', op: '^', l: b, r: unary() };
    }
    return b;
  };
  const unary = (): Node => {
    if (isOp('-')) return p++, { t: 'un', op: '-', e: unary() };
    if (isOp('+')) return p++, unary();
    return power();
  };
  const mul = (): Node => {
    let l = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = (toks[p++] as { v: string }).v;
      l = { t: 'bin', op, l, r: unary() };
    }
    return l;
  };
  const add = (): Node => {
    let l = mul();
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as { v: string }).v;
      l = { t: 'bin', op, l, r: mul() };
    }
    return l;
  };
  const cmp = (): Node => {
    let l = add();
    while (isOp('==') || isOp('!=') || isOp('>') || isOp('>=') || isOp('<') || isOp('<=') || isOp('=')) {
      let op = (toks[p++] as { v: string }).v;
      if (op === '=') op = '==';
      l = { t: 'bin', op, l, r: add() };
    }
    return l;
  };
  const not = (): Node => {
    if (isOp('!') || isWord('not')) return p++, { t: 'un', op: 'not', e: not() };
    return cmp();
  };
  const and = (): Node => {
    let l = not();
    while (isOp('&&') || isWord('and')) {
      p++;
      l = { t: 'bin', op: 'and', l, r: not() };
    }
    return l;
  };
  const or = (): Node => {
    let l = and();
    while (isOp('||') || isWord('or')) {
      p++;
      l = { t: 'bin', op: 'or', l, r: and() };
    }
    return l;
  };
  function ternary(): Node {
    const c = or();
    if (isOp('?')) {
      p++;
      const a = ternary();
      expect(':');
      return { t: 'cond', c, a, b: ternary() };
    }
    return c;
  }

  const ast = ternary();
  if (peek().k !== 'eof') throw new FormulaError(`Sobra algo al final: “${(peek() as { v: string }).v}”.`);
  return ast;
}

const cache = new Map<string, { ast?: Node; error?: string }>();
/** Parses once per text (cached). */
export function compileFormula(src: string): { ast?: Node; error?: string } {
  const hit = cache.get(src);
  if (hit) return hit;
  let res: { ast?: Node; error?: string };
  try {
    res = { ast: parse(src) };
  } catch (e) {
    res = { error: e instanceof Error ? e.message : 'Fórmula no válida' };
  }
  if (cache.size > 500) cache.clear();
  cache.set(src, res);
  return res;
}

// ── Values ───────────────────────────────────────────────────────────────
const isDate = (v: FVal): v is Date => v instanceof Date;
const isList = (v: FVal): v is FVal[] => Array.isArray(v);
const typeName = (v: FVal) => (v === null ? 'vacío' : isDate(v) ? 'fecha' : isList(v) ? 'lista' : typeof v === 'number' ? 'número' : typeof v === 'string' ? 'texto' : 'casilla');

export function isEmptyVal(v: FVal): boolean {
  return v === null || v === '' || v === 0 || v === false || (isList(v) && v.length === 0) || (typeof v === 'number' && Number.isNaN(v));
}
const truthy = (v: FVal) => !isEmptyVal(v);

const num = (v: FVal, fn: string): number => {
  if (typeof v === 'number') return v;
  if (v === null) return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isDate(v)) return v.getTime();
  throw new FormulaError(`${fn} espera un número y recibió ${typeName(v)}.`);
};
const str = (v: FVal): string => formatValue(v);
const list = (v: FVal, fn: string): FVal[] => {
  if (isList(v)) return v;
  if (v === null) return [];
  throw new FormulaError(`${fn} espera una lista y recibió ${typeName(v)}.`);
};
const date = (v: FVal, fn: string): Date => {
  if (isDate(v)) return v;
  if (typeof v === 'string') {
    const d = parseDateText(v);
    if (d) return d;
  }
  if (typeof v === 'number') return new Date(v);
  throw new FormulaError(`${fn} espera una fecha y recibió ${typeName(v)}.`);
};

/** "2026-10-16", "16-10-2026" or "16/10/2026" (optionally with HH:mm) → local Date. */
export function parseDateText(s: string): Date | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(t);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(t);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0));
  return null;
}

/** Text for a parsed number like "$ 1.200.000", "1,5" or "1200" (Chilean format). */
export function parseNumberText(s: string): number | null {
  const t = s.replace(/US\$|\$|CLP|USD|%|\s/gi, '');
  if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  let n: string;
  if (t.includes(',') && t.includes('.')) n = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) n = t.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) n = t.replace(/\./g, '');
  else n = t;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const pad = (n: number, l = 2) => String(n).padStart(l, '0');

export function formatDate(d: Date, fmt?: string): string {
  if (!fmt) {
    const base = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
    return d.getHours() || d.getMinutes() ? `${base} ${pad(d.getHours())}:${pad(d.getMinutes())}` : base;
  }
  const h12 = d.getHours() % 12 || 12;
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    YY: String(d.getFullYear()).slice(-2),
    MMMM: MONTHS[d.getMonth()],
    MMM: MONTHS[d.getMonth()].slice(0, 3),
    MM: pad(d.getMonth() + 1),
    M: String(d.getMonth() + 1),
    DD: pad(d.getDate()),
    D: String(d.getDate()),
    dddd: DAYS[d.getDay()],
    ddd: DAYS[d.getDay()].slice(0, 3),
    HH: pad(d.getHours()),
    H: String(d.getHours()),
    hh: pad(h12),
    h: String(h12),
    mm: pad(d.getMinutes()),
    A: d.getHours() < 12 ? 'AM' : 'PM',
  };
  return fmt.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|A/g, (tok, lit) => (lit !== undefined ? lit : map[tok]));
}

/** Text of any value (Notion's format()). Numbers without thousands separators, like Notion. */
export function formatValue(v: FVal): string {
  if (v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1e10) / 1e10) : '';
  if (isDate(v)) return formatDate(v);
  return v.map(formatValue).join(', ');
}

function equal(a: FVal, b: FVal): boolean {
  if (isDate(a) && isDate(b)) return a.getTime() === b.getTime();
  if (isList(a) && isList(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  return a === b;
}
function compare(a: FVal, b: FVal): number {
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, 'es');
  return num(a, 'Comparar') - num(b, 'Comparar');
}

// ── Dates ────────────────────────────────────────────────────────────────
const UNIT: Record<string, string> = {
  year: 'years', years: 'years', año: 'years', años: 'years', y: 'years',
  quarter: 'quarters', quarters: 'quarters', trimestre: 'quarters', trimestres: 'quarters',
  month: 'months', months: 'months', mes: 'months', meses: 'months', M: 'months',
  week: 'weeks', weeks: 'weeks', semana: 'weeks', semanas: 'weeks', w: 'weeks',
  day: 'days', days: 'days', día: 'days', días: 'days', dia: 'days', dias: 'days', d: 'days',
  hour: 'hours', hours: 'hours', hora: 'hours', horas: 'hours', h: 'hours',
  minute: 'minutes', minutes: 'minutes', minuto: 'minutes', minutos: 'minutes', m: 'minutes',
};
const unitOf = (v: FVal) => {
  const u = UNIT[String(v)] ?? UNIT[String(v).toLowerCase()];
  if (!u) throw new FormulaError(`Unidad de tiempo desconocida: “${str(v)}” (usa "days", "months", "years"…).`);
  return u;
};
function addTime(d: Date, n: number, unit: string): Date {
  const r = new Date(d.getTime());
  if (unit === 'years' || unit === 'quarters' || unit === 'months') {
    const months = unit === 'years' ? n * 12 : unit === 'quarters' ? n * 3 : n;
    const day = r.getDate();
    r.setDate(1);
    r.setMonth(r.getMonth() + Math.trunc(months));
    const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(day, last));
    return r;
  }
  const ms = { weeks: 7 * 864e5, days: 864e5, hours: 36e5, minutes: 6e4 }[unit]!;
  if (unit === 'days' || unit === 'weeks') r.setDate(r.getDate() + Math.trunc(n * (unit === 'weeks' ? 7 : 1)));
  else r.setTime(r.getTime() + n * ms);
  return r;
}
function between(a: Date, b: Date, unit: string): number {
  if (unit === 'years' || unit === 'quarters' || unit === 'months') {
    let m = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
    const rest = a.getDate() * 864e5 + (a.getTime() % 864e5) - (b.getDate() * 864e5 + (b.getTime() % 864e5));
    if (m > 0 && rest < 0) m--;
    if (m < 0 && rest > 0) m++;
    return unit === 'years' ? Math.trunc(m / 12) : unit === 'quarters' ? Math.trunc(m / 3) : m;
  }
  const ms = { weeks: 7 * 864e5, days: 864e5, hours: 36e5, minutes: 6e4 }[unit]!;
  // Calendar days ignore daylight-saving shifts.
  const diff = unit === 'days' || unit === 'weeks' ? Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) : a.getTime() - b.getTime();
  return Math.trunc(diff / ms);
}
const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y.getTime()) / 864e5 + 1) / 7);
};

// ── Evaluation ───────────────────────────────────────────────────────────
type Env = { prop: (name: string) => FVal | undefined; vars: Map<string, FVal>; steps: { n: number } };
const flatNums = (vals: FVal[], fn: string) => vals.flatMap((v) => (isList(v) ? v : [v])).filter((v) => v !== null).map((v) => num(v, fn));
const safeRegex = (p: FVal) => {
  try {
    return new RegExp(str(p));
  } catch {
    throw new FormulaError(`Patrón no válido: “${str(p)}”.`);
  }
};

/** Functions that receive unevaluated arguments (logic, lists with `current`, let). */
const LAZY = new Set(['if', 'ifs', 'and', 'or', 'map', 'filter', 'find', 'findindex', 'some', 'every', 'let', 'lets', 'count']);

function evalNode(n: Node, env: Env): FVal {
  if (++env.steps.n > 200000) throw new FormulaError('La fórmula es demasiado larga de calcular.');
  switch (n.t) {
    case 'lit':
      return n.v;
    case 'list':
      return n.items.map((x) => evalNode(x, env));
    case 'ref': {
      const v = env.prop(n.name);
      if (v === undefined) throw new FormulaError(`No existe la propiedad “${n.name}”.`);
      return v;
    }
    case 'var': {
      if (env.vars.has(n.name)) return env.vars.get(n.name)!;
      const low = n.name.toLowerCase();
      if (low === 'current' || low === 'index') throw new FormulaError(`“${n.name}” solo existe dentro de map(), filter()…`);
      throw new FormulaError(`No conozco “${n.name}”. ¿Quisiste decir prop("${n.name}")?`);
    }
    case 'idx': {
      const l = evalNode(n.e, env);
      const i = num(evalNode(n.i, env), 'El índice');
      if (typeof l === 'string') return l[i < 0 ? l.length + i : i] ?? null;
      const arr = list(l, 'El índice');
      return arr[i < 0 ? arr.length + i : i] ?? null;
    }
    case 'cond':
      return truthy(evalNode(n.c, env)) ? evalNode(n.a, env) : evalNode(n.b, env);
    case 'un': {
      const v = evalNode(n.e, env);
      return n.op === 'not' ? !truthy(v) : -num(v, 'El signo menos');
    }
    case 'bin': {
      if (n.op === 'and') return truthy(evalNode(n.l, env)) && truthy(evalNode(n.r, env));
      if (n.op === 'or') return truthy(evalNode(n.l, env)) || truthy(evalNode(n.r, env));
      const a = evalNode(n.l, env);
      const b = evalNode(n.r, env);
      return binary(n.op, a, b);
    }
    case 'call':
      return call(n.name, n.args, env);
  }
}

function binary(op: string, a: FVal, b: FVal): FVal {
  switch (op) {
    case '+':
      if (typeof a === 'string' || typeof b === 'string') return str(a) + str(b);
      if (isList(a) && isList(b)) return [...a, ...b];
      return num(a, 'Sumar') + num(b, 'Sumar');
    case '-':
      if (isDate(a) && isDate(b)) return a.getTime() - b.getTime();
      return num(a, 'Restar') - num(b, 'Restar');
    case '*':
      return num(a, 'Multiplicar') * num(b, 'Multiplicar');
    case '/': {
      const d = num(b, 'Dividir');
      if (d === 0) throw new FormulaError('División por cero');
      return num(a, 'Dividir') / d;
    }
    case '%': {
      const d = num(b, 'El módulo');
      if (d === 0) throw new FormulaError('División por cero');
      return num(a, 'El módulo') % d;
    }
    case '^':
      return Math.pow(num(a, 'La potencia'), num(b, 'La potencia'));
    case '==':
      return equal(a, b);
    case '!=':
      return !equal(a, b);
    case '>':
      return compare(a, b) > 0;
    case '>=':
      return compare(a, b) >= 0;
    case '<':
      return compare(a, b) < 0;
    case '<=':
      return compare(a, b) <= 0;
  }
  throw new FormulaError(`Operador desconocido ${op}`);
}

function withVars(env: Env, vars: Record<string, FVal>): Env {
  const m = new Map(env.vars);
  for (const [k, v] of Object.entries(vars)) m.set(k, v);
  return { ...env, vars: m };
}

function call(name: string, argNodes: Node[], env: Env): FVal {
  const need = (min: number, max = min) => {
    if (argNodes.length < min || argNodes.length > max)
      throw new FormulaError(`${name}() recibe ${min === max ? min : `de ${min} a ${max === Infinity ? 'varios' : max}`} argumento${max === 1 ? '' : 's'}.`);
  };
  if (LAZY.has(name)) {
    const ev = (i: number, e: Env = env) => evalNode(argNodes[i], e);
    switch (name) {
      case 'if':
        need(3);
        return truthy(ev(0)) ? ev(1) : ev(2);
      case 'ifs': {
        if (argNodes.length < 2) throw new FormulaError('ifs() necesita al menos una condición y un valor.');
        for (let i = 0; i + 1 < argNodes.length; i += 2) if (truthy(ev(i))) return ev(i + 1);
        return argNodes.length % 2 === 1 ? ev(argNodes.length - 1) : null;
      }
      case 'and':
        return argNodes.every((_, i) => truthy(ev(i)));
      case 'or':
        return argNodes.some((_, i) => truthy(ev(i)));
      case 'let':
      case 'lets': {
        if (argNodes.length < 3 || argNodes.length % 2 === 0) throw new FormulaError(`${name}() va así: ${name}(nombre, valor, …, resultado).`);
        let e = env;
        for (let i = 0; i + 1 < argNodes.length; i += 2) {
          const v = argNodes[i];
          if (v.t !== 'var') throw new FormulaError(`En ${name}() el nombre va sin comillas, por ejemplo ${name}(total, 10, total * 2).`);
          e = withVars(e, { [v.name]: evalNode(argNodes[i + 1], e) });
        }
        return evalNode(argNodes[argNodes.length - 1], e);
      }
      default: {
        // map / filter / find / findIndex / some / every / count(list, condición)
        if (name === 'count' && argNodes.length === 1) return list(ev(0), 'count').filter((x) => !isEmptyVal(x)).length;
        need(2);
        const arr = list(ev(0), name);
        const at = (x: FVal, i: number) => evalNode(argNodes[1], withVars(env, { current: x, index: i }));
        if (name === 'map') return arr.map(at);
        if (name === 'filter') return arr.filter((x, i) => truthy(at(x, i)));
        if (name === 'find') return arr.find((x, i) => truthy(at(x, i))) ?? null;
        if (name === 'findindex') return arr.findIndex((x, i) => truthy(at(x, i)));
        if (name === 'some') return arr.some((x, i) => truthy(at(x, i)));
        if (name === 'every') return arr.every((x, i) => truthy(at(x, i)));
        return arr.filter((x, i) => truthy(at(x, i))).length; // count
      }
    }
  }

  const a = argNodes.map((x) => evalNode(x, env));
  const A = (i: number) => a[i] ?? null;
  switch (name) {
    // Logic / types
    case 'empty':
      need(1);
      return isEmptyVal(A(0));
    case 'not':
      need(1);
      return !truthy(A(0));
    case 'equal':
      need(2);
      return equal(A(0), A(1));
    case 'unequal':
      need(2);
      return !equal(A(0), A(1));
    case 'larger':
      need(2);
      return compare(A(0), A(1)) > 0;
    case 'largereq':
      need(2);
      return compare(A(0), A(1)) >= 0;
    case 'smaller':
      need(2);
      return compare(A(0), A(1)) < 0;
    case 'smallereq':
      need(2);
      return compare(A(0), A(1)) <= 0;
    case 'typeof':
      need(1);
      return typeName(A(0));

    // Math
    case 'add':
      need(2);
      return binary('+', A(0), A(1));
    case 'subtract':
      need(2);
      return binary('-', A(0), A(1));
    case 'multiply':
      need(2);
      return binary('*', A(0), A(1));
    case 'divide':
      need(2);
      return binary('/', A(0), A(1));
    case 'mod':
      need(2);
      return binary('%', A(0), A(1));
    case 'pow':
      need(2);
      return binary('^', A(0), A(1));
    case 'unaryminus':
      need(1);
      return -num(A(0), name);
    case 'unaryplus':
    case 'tonumber': {
      need(1);
      const v = A(0);
      if (typeof v === 'number') return v;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (isDate(v)) return v.getTime();
      if (v === null) return null;
      if (typeof v === 'string') return parseNumberText(v);
      return null;
    }
    case 'abs':
      need(1);
      return Math.abs(num(A(0), name));
    case 'ceil':
      need(1);
      return Math.ceil(num(A(0), name));
    case 'floor':
      need(1);
      return Math.floor(num(A(0), name));
    case 'round': {
      need(1, 2);
      const f = Math.pow(10, a.length > 1 ? num(A(1), name) : 0);
      return Math.round(num(A(0), name) * f) / f;
    }
    case 'sqrt':
      need(1);
      return Math.sqrt(num(A(0), name));
    case 'cbrt':
      need(1);
      return Math.cbrt(num(A(0), name));
    case 'exp':
      need(1);
      return Math.exp(num(A(0), name));
    case 'ln':
      need(1);
      return Math.log(num(A(0), name));
    case 'log10':
      need(1);
      return Math.log10(num(A(0), name));
    case 'log2':
      need(1);
      return Math.log2(num(A(0), name));
    case 'sign':
      need(1);
      return Math.sign(num(A(0), name));
    case 'pi':
      need(0);
      return Math.PI;
    case 'e':
      need(0);
      return Math.E;
    case 'min':
    case 'max': {
      const ns = flatNums(a, name);
      if (!ns.length) return null;
      return name === 'min' ? Math.min(...ns) : Math.max(...ns);
    }
    case 'sum':
      return flatNums(a, name).reduce((s, x) => s + x, 0);
    case 'mean':
    case 'average': {
      const ns = flatNums(a, name);
      return ns.length ? ns.reduce((s, x) => s + x, 0) / ns.length : null;
    }
    case 'median': {
      const ns = flatNums(a, name).sort((x, y) => x - y);
      if (!ns.length) return null;
      const m = Math.floor(ns.length / 2);
      return ns.length % 2 ? ns[m] : (ns[m - 1] + ns[m]) / 2;
    }
    case 'percent':
      // Ours: percent(parte, total) → % (e.g. 25 of 200 = 12.5)
      need(2);
      return binary('/', num(A(0), name) * 100, A(1));

    // Text
    case 'format':
    case 'totext':
      need(1);
      return str(A(0));
    case 'concat':
      if (a.every((v) => isList(v) || v === null)) return a.flatMap((v) => (isList(v) ? v : []));
      return a.map(str).join('');
    case 'join': {
      need(1, 2);
      return list(A(0), name).map(str).join(a.length > 1 ? str(A(1)) : '');
    }
    case 'length': {
      need(1);
      const v = A(0);
      if (isList(v)) return v.length;
      return str(v).length;
    }
    case 'contains':
      need(2);
      return isList(A(0)) ? (A(0) as FVal[]).some((x) => equal(x, A(1))) : str(A(0)).includes(str(A(1)));
    case 'includes':
      need(2);
      return isList(A(0)) ? (A(0) as FVal[]).some((x) => equal(x, A(1))) : str(A(0)).includes(str(A(1)));
    case 'test':
      need(2);
      return safeRegex(A(1)).test(str(A(0)));
    case 'match': {
      need(2);
      return str(A(0)).match(new RegExp(safeRegex(A(1)).source, 'g')) ?? [];
    }
    case 'replace':
      need(3);
      return str(A(0)).replace(safeRegex(A(1)), str(A(2)));
    case 'replaceall':
      need(3);
      return str(A(0)).replace(new RegExp(safeRegex(A(1)).source, 'g'), str(A(2)));
    case 'lower':
      need(1);
      return str(A(0)).toLowerCase();
    case 'upper':
      need(1);
      return str(A(0)).toUpperCase();
    case 'trim':
      need(1);
      return str(A(0)).trim();
    case 'slice':
    case 'substring': {
      need(2, 3);
      const v = A(0);
      const s0 = num(A(1), name);
      const e0 = a.length > 2 ? num(A(2), name) : undefined;
      return isList(v) ? v.slice(s0, e0) : str(v).slice(s0, e0);
    }
    case 'split':
      need(2);
      return str(A(0)).split(str(A(1)));
    case 'repeat':
      need(2);
      return str(A(0)).repeat(Math.max(0, Math.min(1000, num(A(1), name))));
    case 'padstart':
      need(3);
      return str(A(0)).padStart(num(A(1), name), str(A(2)));
    case 'padend':
      need(3);
      return str(A(0)).padEnd(num(A(1), name), str(A(2)));
    case 'startswith':
      need(2);
      return str(A(0)).startsWith(str(A(1)));
    case 'endswith':
      need(2);
      return str(A(0)).endsWith(str(A(1)));
    case 'style':
    case 'unstyle':
    case 'link':
      // Notion styling: the text is kept (styles are visual only).
      return str(A(0));

    // Dates
    case 'now':
      need(0);
      return new Date();
    case 'today': {
      need(0);
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    case 'dateadd':
      need(3);
      return addTime(date(A(0), name), num(A(1), name), unitOf(A(2)));
    case 'datesubtract':
      need(3);
      return addTime(date(A(0), name), -num(A(1), name), unitOf(A(2)));
    case 'datebetween':
      need(3);
      return between(date(A(0), name), date(A(1), name), unitOf(A(2)));
    case 'datestart':
    case 'dateend':
      need(1);
      return date(A(0), name);
    case 'daterange':
      need(2);
      return [date(A(0), name), date(A(1), name)];
    case 'formatdate':
      need(1, 2);
      return formatDate(date(A(0), name), a.length > 1 ? str(A(1)) : undefined);
    case 'parsedate': {
      need(1);
      const d = parseDateText(str(A(0)));
      if (!d) throw new FormulaError(`No entiendo la fecha “${str(A(0))}” (usa "2026-10-16").`);
      return d;
    }
    case 'year':
      need(1);
      return date(A(0), name).getFullYear();
    case 'month':
      need(1);
      return date(A(0), name).getMonth() + 1;
    case 'date':
      need(1);
      return date(A(0), name).getDate();
    case 'day': {
      need(1);
      return date(A(0), name).getDay() || 7; // Notion: 1 = lunes … 7 = domingo
    }
    case 'week':
      need(1);
      return isoWeek(date(A(0), name));
    case 'hour':
      need(1);
      return date(A(0), name).getHours();
    case 'minute':
      need(1);
      return date(A(0), name).getMinutes();
    case 'timestamp':
      need(1);
      return date(A(0), name).getTime();
    case 'fromtimestamp':
      need(1);
      return new Date(num(A(0), name));

    // Lists
    case 'at': {
      need(2);
      const arr = list(A(0), name);
      const i = num(A(1), name);
      return arr[i < 0 ? arr.length + i : i] ?? null;
    }
    case 'first':
      need(1);
      return list(A(0), name)[0] ?? null;
    case 'last': {
      need(1);
      const arr = list(A(0), name);
      return arr[arr.length - 1] ?? null;
    }
    case 'sort': {
      need(1);
      return [...list(A(0), name)].sort((x, y) => (x === null ? 1 : y === null ? -1 : compare(x, y)));
    }
    case 'reverse':
      need(1);
      return [...list(A(0), name)].reverse();
    case 'unique': {
      need(1);
      const out: FVal[] = [];
      for (const x of list(A(0), name)) if (!out.some((y) => equal(x, y))) out.push(x);
      return out;
    }
    case 'flat':
      need(1);
      return list(A(0), name).flatMap((x) => (isList(x) ? x : [x]));
    case 'list':
      return a;
  }
  throw new FormulaError(`No existe la función ${name}().`);
}

export type FormulaRun = { value: FVal; error?: string };

/** Runs a formula; `prop(name)` returns a property's value (undefined = doesn't exist). */
export function runFormula(src: string, prop: (name: string) => FVal | undefined): FormulaRun {
  if (!src.trim()) return { value: null };
  const c = compileFormula(src);
  if (c.error || !c.ast) return { value: null, error: c.error ?? 'Fórmula no válida' };
  try {
    const v = evalNode(c.ast, { prop, vars: new Map(), steps: { n: 0 } });
    if (typeof v === 'number' && !Number.isFinite(v)) return { value: null, error: 'Resultado no válido' };
    return { value: v };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : 'Fórmula no válida' };
  }
}

/** Property names a formula uses (for the editor and to detect cycles). */
export function formulaRefs(src: string): string[] {
  const c = compileFormula(src);
  const out = new Set<string>();
  const walk = (n?: Node) => {
    if (!n) return;
    if (n.t === 'ref') out.add(n.name);
    if (n.t === 'list') n.items.forEach(walk);
    if (n.t === 'call') n.args.forEach(walk);
    if (n.t === 'bin') (walk(n.l), walk(n.r));
    if (n.t === 'un') walk(n.e);
    if (n.t === 'cond') (walk(n.c), walk(n.a), walk(n.b));
    if (n.t === 'idx') (walk(n.e), walk(n.i));
  };
  walk(c.ast);
  return [...out];
}

// ── Catalog for the editor (same names as Notion) ─────────────────────────
export type FnDoc = { name: string; group: string; sig: string; desc: string; ex: string };
export const FORMULA_FUNCTIONS: FnDoc[] = [
  { name: 'prop', group: 'Propiedades', sig: 'prop("Nombre")', desc: 'El valor de otra columna de esta fila.', ex: 'prop("Monto") * 0.19' },
  { name: 'if', group: 'Lógica', sig: 'if(condición, siVerdadero, siFalso)', desc: 'Devuelve un valor u otro según la condición.', ex: 'if(prop("Monto") > 1000000, "Grande", "Normal")' },
  { name: 'ifs', group: 'Lógica', sig: 'ifs(cond1, valor1, cond2, valor2, …, otro)', desc: 'Varias condiciones en orden; la primera que se cumple gana.', ex: 'ifs(prop("Atraso") > 30, "Crítico", prop("Atraso") > 0, "Atrasado", "Al día")' },
  { name: 'empty', group: 'Lógica', sig: 'empty(valor)', desc: 'Verdadero si está vacío (texto vacío, 0, lista vacía).', ex: 'empty(prop("Cliente"))' },
  { name: 'and', group: 'Lógica', sig: 'a and b · and(a, b)', desc: 'Verdadero si ambas se cumplen.', ex: 'prop("Pagado") and prop("Monto") > 0' },
  { name: 'or', group: 'Lógica', sig: 'a or b · or(a, b)', desc: 'Verdadero si alguna se cumple.', ex: 'prop("Estado") == "Enviado" or prop("Estado") == "Borrador"' },
  { name: 'not', group: 'Lógica', sig: 'not valor · !valor', desc: 'Invierte verdadero / falso.', ex: 'not prop("Pagado")' },
  { name: 'let', group: 'Lógica', sig: 'let(nombre, valor, resultado)', desc: 'Guarda un valor con un nombre para reutilizarlo.', ex: 'let(neto, prop("Monto") / 1.19, round(neto))' },
  { name: 'lets', group: 'Lógica', sig: 'lets(a, valor, b, valor, resultado)', desc: 'Como let, con varios nombres.', ex: 'lets(neto, prop("Monto") / 1.19, iva, prop("Monto") - neto, round(iva))' },
  { name: 'round', group: 'Matemática', sig: 'round(número, decimales?)', desc: 'Redondea.', ex: 'round(prop("Monto") * 0.1)' },
  { name: 'floor', group: 'Matemática', sig: 'floor(número)', desc: 'Redondea hacia abajo.', ex: 'floor(4.7)' },
  { name: 'ceil', group: 'Matemática', sig: 'ceil(número)', desc: 'Redondea hacia arriba.', ex: 'ceil(4.2)' },
  { name: 'abs', group: 'Matemática', sig: 'abs(número)', desc: 'Valor absoluto.', ex: 'abs(-500)' },
  { name: 'min', group: 'Matemática', sig: 'min(a, b, …)', desc: 'El menor.', ex: 'min(prop("Monto"), 500000)' },
  { name: 'max', group: 'Matemática', sig: 'max(a, b, …)', desc: 'El mayor.', ex: 'max(prop("Monto") - prop("Pagado"), 0)' },
  { name: 'sum', group: 'Matemática', sig: 'sum(a, b, …)', desc: 'Suma (también una lista).', ex: 'sum(prop("A"), prop("B"))' },
  { name: 'mean', group: 'Matemática', sig: 'mean(a, b, …)', desc: 'Promedio.', ex: 'mean(10, 20, 30)' },
  { name: 'median', group: 'Matemática', sig: 'median(a, b, …)', desc: 'Mediana.', ex: 'median(1, 5, 9)' },
  { name: 'percent', group: 'Matemática', sig: 'percent(parte, total)', desc: 'Qué porcentaje es la parte del total (extra nuestro).', ex: 'percent(prop("Pagado"), prop("Monto"))' },
  { name: 'mod', group: 'Matemática', sig: 'a % b · mod(a, b)', desc: 'Resto de una división.', ex: '10 % 3' },
  { name: 'pow', group: 'Matemática', sig: 'a ^ b · pow(a, b)', desc: 'Potencia.', ex: '(1 + 0.05) ^ 12' },
  { name: 'sqrt', group: 'Matemática', sig: 'sqrt(número)', desc: 'Raíz cuadrada.', ex: 'sqrt(144)' },
  { name: 'sign', group: 'Matemática', sig: 'sign(número)', desc: '1, 0 o -1 según el signo.', ex: 'sign(prop("Saldo"))' },
  { name: 'toNumber', group: 'Matemática', sig: 'toNumber(valor)', desc: 'Convierte texto ("1.200"), fecha o casilla a número.', ex: 'toNumber("1.200")' },
  { name: 'ln', group: 'Matemática', sig: 'ln(n) · log10(n) · log2(n) · exp(n)', desc: 'Logaritmos y exponencial.', ex: 'log10(1000)' },
  { name: 'pi', group: 'Matemática', sig: 'pi() · e()', desc: 'Constantes.', ex: 'pi() * 2' },
  { name: 'format', group: 'Texto', sig: 'format(valor)', desc: 'Convierte cualquier valor a texto.', ex: 'format(prop("Monto")) + " CLP"' },
  { name: 'concat', group: 'Texto', sig: 'concat(a, b, …)', desc: 'Une textos (o listas). También sirve "+".', ex: 'concat(prop("Cliente"), " · ", prop("Proyecto"))' },
  { name: 'length', group: 'Texto', sig: 'length(texto o lista)', desc: 'Cantidad de letras o de elementos.', ex: 'length(prop("Proyecto"))' },
  { name: 'contains', group: 'Texto', sig: 'contains(texto, buscar)', desc: 'Verdadero si contiene el texto.', ex: 'contains(prop("Cliente"), "SpA")' },
  { name: 'test', group: 'Texto', sig: 'test(texto, patrón)', desc: 'Verdadero si calza con el patrón (expresión regular).', ex: 'test(prop("Correo"), "@gmail")' },
  { name: 'match', group: 'Texto', sig: 'match(texto, patrón)', desc: 'Lista con todo lo que calza.', ex: 'match("a1b22", "[0-9]+")' },
  { name: 'replace', group: 'Texto', sig: 'replace(texto, patrón, por)', desc: 'Reemplaza la primera coincidencia.', ex: 'replace(prop("Proyecto"), "Web", "Sitio")' },
  { name: 'replaceAll', group: 'Texto', sig: 'replaceAll(texto, patrón, por)', desc: 'Reemplaza todas.', ex: 'replaceAll("1.200.000", "\\\\.", "")' },
  { name: 'lower', group: 'Texto', sig: 'lower(texto) · upper(texto)', desc: 'Minúsculas / mayúsculas.', ex: 'upper(prop("Cliente"))' },
  { name: 'trim', group: 'Texto', sig: 'trim(texto)', desc: 'Quita espacios al inicio y al final.', ex: 'trim("  hola ")' },
  { name: 'slice', group: 'Texto', sig: 'slice(texto, inicio, fin?)', desc: 'Una parte del texto o lista.', ex: 'slice(prop("Proyecto"), 0, 3)' },
  { name: 'split', group: 'Texto', sig: 'split(texto, separador)', desc: 'Divide un texto en una lista.', ex: 'split("a,b,c", ",")' },
  { name: 'repeat', group: 'Texto', sig: 'repeat(texto, veces)', desc: 'Repite un texto.', ex: 'repeat("★", 3)' },
  { name: 'padStart', group: 'Texto', sig: 'padStart(texto, largo, relleno)', desc: 'Rellena al inicio.', ex: 'padStart(format(7), 3, "0")' },
  { name: 'now', group: 'Fecha', sig: 'now() · today()', desc: 'Ahora mismo / hoy a las 00:00.', ex: 'today()' },
  { name: 'dateAdd', group: 'Fecha', sig: 'dateAdd(fecha, cantidad, "days")', desc: 'Suma tiempo (years, quarters, months, weeks, days, hours, minutes).', ex: 'dateAdd(prop("Fecha"), 30, "days")' },
  { name: 'dateSubtract', group: 'Fecha', sig: 'dateSubtract(fecha, cantidad, "days")', desc: 'Resta tiempo.', ex: 'dateSubtract(today(), 1, "months")' },
  { name: 'dateBetween', group: 'Fecha', sig: 'dateBetween(fecha1, fecha2, "days")', desc: 'Cuánto hay entre dos fechas (fecha1 − fecha2).', ex: 'dateBetween(today(), prop("Vence"), "days")' },
  { name: 'formatDate', group: 'Fecha', sig: 'formatDate(fecha, "DD/MM/YYYY")', desc: 'Fecha como texto (YYYY, MM, MMMM, DD, dddd, HH:mm…).', ex: 'formatDate(prop("Fecha"), "D [de] MMMM")' },
  { name: 'parseDate', group: 'Fecha', sig: 'parseDate("2026-10-16")', desc: 'Texto a fecha.', ex: 'parseDate("2026-12-31")' },
  { name: 'year', group: 'Fecha', sig: 'year(f) · month(f) · date(f)', desc: 'Año, mes (1-12) y día del mes.', ex: 'month(prop("Fecha"))' },
  { name: 'day', group: 'Fecha', sig: 'day(fecha)', desc: 'Día de la semana (1 lunes … 7 domingo).', ex: 'day(today())' },
  { name: 'week', group: 'Fecha', sig: 'week(f) · hour(f) · minute(f)', desc: 'Semana del año, hora y minuto.', ex: 'week(today())' },
  { name: 'timestamp', group: 'Fecha', sig: 'timestamp(f) · fromTimestamp(n)', desc: 'Fecha ↔ milisegundos.', ex: 'timestamp(now())' },
  { name: 'map', group: 'Listas', sig: 'map(lista, expresión con current)', desc: 'Transforma cada elemento (current = el elemento, index = su posición).', ex: 'map([1, 2, 3], current * 2)' },
  { name: 'filter', group: 'Listas', sig: 'filter(lista, condición con current)', desc: 'Deja los elementos que cumplen.', ex: 'filter(prop("Etiquetas"), current != "Interno")' },
  { name: 'find', group: 'Listas', sig: 'find(lista, condición)', desc: 'El primer elemento que cumple.', ex: 'find([5, 12, 30], current > 10)' },
  { name: 'some', group: 'Listas', sig: 'some(lista, condición) · every(…)', desc: 'Si alguno / todos cumplen.', ex: 'some(prop("Etiquetas"), current == "Urgente")' },
  { name: 'count', group: 'Listas', sig: 'count(lista, condición?)', desc: 'Cuántos elementos (o cuántos cumplen).', ex: 'count([1, 0, 3])' },
  { name: 'at', group: 'Listas', sig: 'at(lista, índice) · lista[i]', desc: 'Elemento en una posición (0 = el primero, -1 = el último).', ex: 'at(split("a,b", ","), 1)' },
  { name: 'first', group: 'Listas', sig: 'first(lista) · last(lista)', desc: 'Primer / último elemento.', ex: 'first(prop("Etiquetas"))' },
  { name: 'join', group: 'Listas', sig: 'join(lista, separador)', desc: 'Une una lista en un texto.', ex: 'join(prop("Etiquetas"), " / ")' },
  { name: 'sort', group: 'Listas', sig: 'sort(lista) · reverse(lista) · unique(lista)', desc: 'Ordena, invierte o quita repetidos.', ex: 'unique([1, 1, 2])' },
  { name: 'includes', group: 'Listas', sig: 'includes(lista, valor)', desc: 'Si la lista contiene el valor.', ex: 'includes(prop("Etiquetas"), "VIP")' },
];
