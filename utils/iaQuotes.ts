// Plantilla: frases generales (las de Finance hablan de dinero). Cada app puede cambiarlas.
// Motivational phrases for the IA home ("Master Wolf IA"). The word in
// [brackets] is highlighted in brand blue. A different one is shown every
// time the IA section is opened (never the same as the previous visit —
// see pickQuote). To add more, just append to the list.
export const IA_QUOTES: string[] = [
  '[Disciplina] hoy, libertad mañana.',
  'La [constancia] le gana al talento que no se presenta.',
  'Tu [futuro] se construye con decisiones pequeñas y repetidas.',
  'Lo que no se [mide], no se mejora.',
  'El mejor momento para [empezar] fue ayer. El segundo mejor es hoy.',
  'Invierte en [conocimiento]: paga los mejores intereses.',
  'El lobo [solitario] sobrevive; la manada prospera.',
  'Cada [meta] cumplida empezó como un plan escrito.',
  '[Enfoque]: menos ruido, más decisiones conscientes.',
  'Tu [yo del futuro] te está mirando. Hazlo sentir orgulloso.',
  'Una idea [anotada] vale más que diez recordadas.',
  'El [orden] es la forma más rápida de avanzar.',
  'Hecho es mejor que [perfecto].',
  'Divide lo grande en [pasos] pequeños.',
  'La [claridad] empieza por escribirlo.',
  'Pequeños [hábitos], grandes resultados.',
];

export interface QuoteParts {
  before: string;
  highlight: string;
  after: string;
}

export function splitQuote(q: string): QuoteParts {
  const m = q.match(/^(.*?)\[(.+?)\](.*)$/);
  if (!m) return { before: q, highlight: '', after: '' };
  return { before: m[1], highlight: m[2], after: m[3] };
}

const LAST_KEY = 'mw-ia-last-quote';

/** A random quote, never the same as the one shown last time (per browser). */
export function pickQuote(): string {
  let last = -1;
  try {
    last = Number(localStorage.getItem(LAST_KEY) ?? -1);
  } catch {
    /* private mode */
  }
  let i = Math.floor(Math.random() * IA_QUOTES.length);
  if (IA_QUOTES.length > 1 && i === last) i = (i + 1 + Math.floor(Math.random() * (IA_QUOTES.length - 1))) % IA_QUOTES.length;
  try {
    localStorage.setItem(LAST_KEY, String(i));
  } catch {
    /* private mode */
  }
  return IA_QUOTES[i];
}
