/**
 * "Mejorar redacción" / "Mejorar visual" for notes (Emanuel, 2026-10-28): a dictated note reads like a
 * flat transcript; these two buttons rewrite it. Shared by the server routes (prompts + schema) and the
 * editor (protecting embedded tables). Pure — no imports — so the same file is copied to every app.
 */
export type ImproveMode = 'redaccion' | 'visual';

export const IMPROVE_LABEL: Record<ImproveMode, { title: string; hint: string; done: string }> = {
  redaccion: { title: 'Mejorar redacción', hint: 'Corrige puntuación, quita muletillas y repeticiones del dictado. Mantiene lo que dijiste.', done: 'Redacción mejorada ✍️' },
  visual: { title: 'Mejorar visual', hint: 'Títulos con emojis, negritas, listas y checklist para los pasos. Más claro de un vistazo.', done: 'Nota con más power ✨' },
};

export const IMPROVE_SCHEMA = {
  type: 'object',
  properties: { html: { type: 'string', description: 'La nota reescrita, en HTML con solo las etiquetas permitidas.' } },
  required: ['html'],
  additionalProperties: false,
};

const RULES = `Reglas que NUNCA se rompen:
- No inventes nada: ni datos, ni cifras, ni nombres, ni fechas, ni pasos que la persona no dijo. No quites información.
- Mantén el idioma y la voz de la persona (español de Chile, cercano). No la vuelvas formal ni "corporativa".
- Montos, números, nombres propios, links y fechas quedan exactamente iguales.
- Las marcas [[TABLA:…]] son tablas incrustadas: déjalas tal cual, cada una sola en su propio <p>, en el mismo orden.
- Si hay <span style="color: …">, consérvalos alrededor del mismo texto.
- Responde SOLO con HTML usando estas etiquetas: <h2> <h3> <p> <strong> <em> <u> <s> <ul> <ol> <li> <blockquote> <hr> <a href="…"> <span style="color: …"> y la lista de tareas: <ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>texto</p></li></ul> (si un ítem ya venía marcado, data-checked="true"). Nada de <h1>, <div>, <br> sueltos, clases ni estilos inventados.`;

export const IMPROVE_SYSTEM: Record<ImproveMode, string> = {
  redaccion: `Eres el editor de notas de Master Finanzas. La nota casi siempre viene de un DICTADO por voz: frases largas sin puntos, muletillas ("eh", "o sea", "verdad", "¿se entiende?", "cachai"), repeticiones ("sí o sí o sí"), ideas que se cortan y vuelven.
Tu trabajo: MEJORAR LA REDACCIÓN.
- Corrige puntuación, mayúsculas, tildes y gramática.
- Quita muletillas, repeticiones y vueltas, y separa en párrafos cortos por idea.
- Ordena frases enredadas para que se entiendan a la primera, sin cambiar lo que se quiso decir.
- No agregues emojis, títulos ni listas nuevas (si ya existían, respétalos). Las groserías leves puedes suavizarlas solo si no cambian el tono.
${RULES}`,
  visual: `Eres el diseñador de notas de Master Finanzas. La nota casi siempre viene de un DICTADO por voz y se ve plana, como transcripción.
Tu trabajo: MEJORAR LO VISUAL para que se entienda de un vistazo y tenga "power".
- Arregla también la redacción (puntuación, muletillas, repeticiones), sin cambiar lo que se dijo.
- Divide en secciones con <h2> o <h3> que empiecen con un emoji que calce (🎯 💡 ✅ 📌 ⚠️ 🗓️ 💰 🔊 📱 …). Pocos títulos, solo los que ayudan.
- Pon en <strong> las palabras clave e ideas importantes (no todo; 1–3 por párrafo).
- Si hay pasos, tareas o cosas por hacer → lista de tareas (checklist) con data-checked="false". Si hay varias ideas sueltas → viñetas. Si hay un orden → lista numerada.
- Si hay una idea central o conclusión, puedes destacarla en un <blockquote>.
- Párrafos cortos. Emojis con criterio (que sume, no que sature).
${RULES}`,
};

const EMBED_RE = /<div[^>]*data-database-embed="([^"]+)"[^>]*>(?:\s*<\/div>)?/g;

/** Embedded tables → [[TABLA:id]] so the model can't drop or break them. */
export function protectEmbeds(html: string): { html: string; ids: string[] } {
  const ids: string[] = [];
  const out = html.replace(EMBED_RE, (_m, id: string) => {
    ids.push(id);
    return `<p>[[TABLA:${id}]]</p>`;
  });
  return { html: out, ids };
}

/** Puts the tables back (any the model lost go at the end). */
export function restoreEmbeds(html: string, ids: string[]): string {
  const seen = new Set<string>();
  let out = html.replace(/<p>\s*\[\[TABLA:([^\]]+)\]\]\s*<\/p>|\[\[TABLA:([^\]]+)\]\]/g, (_m, a?: string, b?: string) => {
    const id = (a || b || '').trim();
    if (!ids.includes(id) || seen.has(id)) return '';
    seen.add(id);
    return `<div data-database-embed="${id}"></div>`;
  });
  for (const id of ids) if (!seen.has(id)) out += `<div data-database-embed="${id}"></div>`;
  return out;
}

export const MAX_IMPROVE_CHARS = 40000;
