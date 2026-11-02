/**
 * The page behind each Daily task's "ABRIR" (Emanuel, 2026-10-27): a gray note of the Sistema de Notas,
 * written "a prueba de bobos" — what it is, step by step (checkboxes), what Claude needs and how long it
 * takes, with bold and emojis. These are only the STARTING text: once the note exists, it's the team's
 * (edit it, attach files). Tasks without a page here get one built from their own fields.
 */
import type { DailyPage as Page, DailyTask } from '@/utils/daily';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** **bold** in the texts below → <strong>. */
const md = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const p = (t: string) => `<p>${md(t)}</p>`;
const checks = (items: string[]) => `<ul data-type="taskList">${items.map((i) => `<li data-type="taskItem" data-checked="false"><p>${md(i)}</p></li>`).join('')}</ul>`;

const PAGES: Record<string, Page> = {
  accesos: {
    goal: 'Que cada persona del equipo entre a **su empresa** con **su usuario y contraseña**, y vea solo lo de **su rol**.',
    why: 'Así el contador, el que paga y el analista trabajan sin tocar lo que no les corresponde. 🔒',
    steps: [
      'Abre **Finanzas → Configuración → Equipo de la empresa**.',
      'Crea el **código de la empresa** (ej. master-wolf). Te da un **link** para tu equipo.',
      'Agrega un usuario de prueba con rol **Contador** → copia el mensaje que aparece.',
      'Abre el link en una **ventana de incógnito** y entra con ese usuario. Te pide **crear su contraseña**.',
      'Revisa que entre **directo a Empresa** y que **Contable** lo deje editar.',
      'Repite con un usuario **Pagos**: al entrar te pide el **autenticador** (Google Authenticator). Prueba también **"Ahora no"** → queda en **solo lectura**.',
      'Cuéntame en la nota qué pasó en cada paso. ✍️',
    ],
    needs: 'Tu **celular** con Google Authenticator y **15 minutos**.',
    time: 'Tú 10–15 min.',
    done: '✅ Las partes 1 y 2 ya están hechas y publicadas. Solo falta tu prueba real.',
  },
  quincena: {
    goal: 'Dejar listo el **Reporte quincenal**: el cierre de cada 15 días, paso a paso, para que **nadie se pierda**.',
    why: 'Es la rutina que ordena el dinero de la empresa: revisar cuentas, pagar comisiones, IVA y separar lo que corresponde. 🧭',
    steps: [
      'Abre **Finanzas → Empresa** → botón verde **"Iniciar reporte quincenal"**.',
      'Elige **Tour** primero (solo mira los 11 pasos, no guarda nada).',
      'Anota en esta nota **qué sobra, qué falta o qué está confuso** en cada paso. 📝',
      'Hagamos juntos una quincena real con **Paso a paso**.',
      'Yo ajusto los pasos con lo que me digas.',
    ],
    needs: 'Una **sesión de 30–45 min** conmigo, con datos reales.',
    time: 'Tú 30–45 min · yo 2–3 h.',
  },
  'vistas-rol': {
    goal: 'Que cada rol (**Contador, Pagos, Analista**) vea arriba de Empresa **"Lo que te falta por hacer"**, con sus tareas reales.',
    why: 'Así cada persona entra y sabe **al tiro** qué le toca, sin preguntar. 🎯',
    steps: [
      'La **base ya está hecha** (el recuadro arriba de Empresa).',
      'Responde en esta nota, para cada rol: **¿qué revisa?, ¿qué paga o declara?, ¿cada cuánto?** 🗣️ (puedes dictarlo).',
      'Yo lo paso a **Conceptos** y ajusto la lista de cada rol.',
    ],
    needs: '**20 minutos** respondiendo por rol.',
    time: 'Tú 20 min · yo 2–3 h.',
  },
  'visor-suscripciones': {
    goal: 'Saber **cuánto deja de verdad** cada plan y pack de créditos, y **hasta dónde bajar un precio** sin perder.',
    steps: [
      'Abre **Finanzas → Contable** → baja hasta **"Visor de suscripciones 🔭"**.',
      'Cambia la **comisión de la tarjeta** por la real de la pasarela (% + monto fijo).',
      'Pon tus **costos fijos del mes** (servidores, herramientas).',
      'Mira si algún plan queda en **rojo** y me cuentas qué decides. 💸',
    ],
    needs: 'La **comisión real** de la pasarela y tus **costos fijos**.',
    time: 'Tú 5 min.',
    done: '✅ El visor ya está hecho; solo faltan tus números reales.',
  },
  tutoriales: {
    goal: 'El botón **"Aprende a usarme"** de cada sección de Empresa: un **tutorial animado con voz**.',
    steps: ['Abre cualquier sección de Empresa → **Resumen → Aprende a usarme**.', 'Mira el tutorial y anota aquí **qué texto cambiarías**. 🎬'],
    done: '✅ Hecho en las 8 secciones.',
    time: 'Tú 5–10 min para revisarlo.',
  },
  'sync-apps': {
    goal: 'Que las mejoras de Finanzas lleguen a la **nube**, la **plantilla** y **Project**.',
    steps: ['Ya se pasaron: ayudas de 2 segundos, formato de secciones, desplegables, menús que se esconden.', 'Dale una mirada a Project y a la nube y cuéntame si algo se ve raro. 👀'],
    done: '✅ Hecho y publicado.',
    time: 'Tú 5 min.',
  },
  menu: {
    goal: 'Ordenar el **menú lateral de Finanzas** como tú quieras.',
    steps: ['Escribe aquí la **lista de secciones de arriba hacia abajo** (ej. Dashboard, Transferencias, Empresa…). 📋', 'Yo lo cambio en 15 minutos.'],
    needs: 'Solo **la lista en orden**.',
    time: 'Tú 10 min · yo 15 min.',
  },
  banners: {
    goal: 'Subir los **banners** de la app (las imágenes de publicidad del dashboard).',
    steps: ['Créalos con ChatGPT o Canva. 🎨', 'Entra a **Mente Maestra de Finanzas → Master Finanzas Edit**.', 'Toca **"Editar banner"** en cada espacio y sube la imagen.'],
    needs: 'Nada de mí: **no requieren código**.',
    time: 'Tú (a tu ritmo).',
  },
};

/** Revisión tasks (IA, Inversiones, Time Testing…): same shape, one sentence changes. */
const review = (where: string, how: string): Page => ({
  goal: `**Revisar ${where}** y decirme qué no te gusta o qué cambiarías.`,
  why: 'Tú la usas como cliente real: lo que te moleste a ti, le molestará a otros. 🧐',
  steps: [`Abre **${where}** en Finanzas.`, how, 'Anota en esta nota **qué cambiarías** (puedes dictarlo 🎙️ o pegar capturas 📎).', 'Yo hago los cambios.'],
  needs: '**Tus comentarios** en esta nota.',
});
Object.assign(PAGES, {
  ia: review('IA (chat, reporte y dato random)', 'Prueba **los tres botones**: pide un reporte, haz una pregunta y pide un dato random.'),
  inversiones: review('Inversiones', 'Mira **Mercados hoy** y agrega una inversión de prueba.'),
  timetesting: review('Time Testing', 'Enciéndelo, **viaja al futuro** moviendo las palancas y apágalo para ver la conversación final.'),
  credito: review('el Simulador de crédito', 'Simula **un crédito real** y compáralo con lo que te dice el banco.'),
  robot: review('el robot (asistente de voz)', 'Tócalo, habla con él y pídele que te lleve a una sección.'),
  voz: review('el Registro por voz', 'Dicta **2 o 3 movimientos** de verdad.'),
  boleta: review('Importar boleta', 'Sube **una boleta real** (foto o PDF).'),
  calculadora: review('la Calculadora', 'Úsala en modo básico, científico y conversor.'),
});

/** "Usar plantilla" under a blank task page (Emanuel, 2026-11-02). */
export const TASK_TEMPLATE = {
  label: 'Tarea',
  html: [`<h2>🎯 Qué hay que hacer</h2>`, p('Escribe aquí **qué hay que hacer** y **por qué**.'), `<h2>✅ Paso a paso</h2>`, checks(['Primer paso…', 'Segundo paso…']), `<h2>📎 Archivos y notas</h2>`, p('Adjunta aquí capturas, PDFs o lo que sirva.')].join(''),
};

/** The starting page of a task (HTML for the note). */
export function dailyPageHtml(t: DailyTask): string {
  const page = t.page ?? PAGES[t.id];
  const h = (emoji: string, title: string) => `<h2>${emoji} ${esc(title)}</h2>`;
  // No page of its own: it opens blank, with the gray hint, and the template is one click away.
  if (!page) return (t.description || '').split(/\n+/).filter(Boolean).map(p).join('');
  return [
    page.done ? p(page.done) : '',
    h('🎯', 'Qué hay que hacer'),
    p(page.goal),
    page.why ? p(page.why) : '',
    h('✅', 'Paso a paso'),
    checks(page.steps),
    page.needs ? h('🙋', 'Qué necesito de ti') + p(page.needs) : '',
    page.time ? h('⏱️', 'Tiempo') + p(page.time) : '',
    h('📎', 'Tus notas y archivos'),
    p('Escribe, dicta o adjunta aquí lo que quieras. Lo leo cuando lleguemos a esta tarea.'),
  ].join('');
}
