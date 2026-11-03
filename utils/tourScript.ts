// Guion del tour de Organiza: el texto de cada paso y lo que lee la voz.
// La voz vive en App Master Cloud, que tiene una copia exacta de este archivo
// (src/utils/organizaTour.ts): solo puede leer estos textos, nada más.
// Cambiar un texto cambia su `voiceVersion`, y el audio guardado se renueva.

export interface TourScriptStep {
  id: string;
  title: string;
  body: string;
  /** Sección que abre este paso. */
  section?: string;
  /** Elemento que se ilumina (data-tour); sin él, la tarjeta va al centro. */
  target?: string;
}

export const TOUR_SCRIPT: TourScriptStep[] = [
  { id: 'intro', title: 'Bienvenido a Organiza', body: 'En un par de minutos te muestro cómo ordenar tu tiempo acá. Puedes retroceder, saltarte el tutorial o acelerar mi voz cuando quieras.', section: 'inicio' },
  { id: 'espacio', title: 'Persona y Empresa', body: 'Organiza tiene dos bases. Persona es para tu vida, y Empresa es para tu trabajo. Cambias de una a otra aquí arriba, y cada una guarda lo suyo.', section: 'inicio', target: 'espacio' },
  { id: 'daily', title: 'Tus pendientes, primero', body: 'Esta es tu Daily. Lo primero que ves al entrar es lo que tienes pendiente, con su prioridad y su entrega. Es tuya: cambia lo que quieras.', section: 'inicio', target: 'daily' },
  { id: 'horario', title: 'Tu horario', body: 'Aquí armas tu semana. Puedes partir desde una plantilla o en blanco, y verla como tablero, semana, galería o lista.', section: 'horario', target: 'horario' },
  { id: 'mundo', title: 'Cada tarea es un mundo', body: 'Toca una tarea y se abre. Puedes darle portada, color, nota y alarma, marcar si la hiciste, ver tu racha, y agregarle microhábitos, tu sueño o un plan de entrenamiento o de comidas.', section: 'horario' },
  { id: 'publicar', title: 'Publica tu horario', body: 'Lo que armas queda en vista previa. Cuando te guste, tocas publicar y eliges si quieres alarmas en todo o solo en algunas tareas. Recién ahí llega a tu calendario y a tus avisos.', section: 'horario', target: 'publicar' },
  { id: 'checklist', title: 'Cierra tu día', body: 'Al final del día repasas todo lo que tocaba: esto lo hice, esto no. Así mañana sabes exactamente en qué mejorar.', section: 'checklist', target: 'checklist' },
  { id: 'ruta', title: 'Tu Ruta', body: 'Cada cosa que cumples te da experiencia. Subes de rango y desbloqueas beneficios, como portadas nuevas.', section: 'ruta', target: 'ruta' },
  { id: 'ia', title: 'Tu asistente', body: 'En IA tienes un chat abierto para hablar de orden y planificación. Pídele ayuda para armar tu semana, o un dato curioso sobre hábitos.', section: 'ia' },
  { id: 'conexiones', title: 'Conecta tus calendarios', body: 'En Conexiones unes Organiza con Google Calendar, con el calendario de tu iPhone y con Notion.', section: 'conexiones' },
  { id: 'fin', title: 'Listo, a ordenarse', body: 'Ya conoces lo importante. Empieza publicando tu primer horario. Puedes volver a ver este tutorial desde el menú de tu perfil.', section: 'inicio' },
];

/** Tour de una acción del Horario: se abre con el botón 🧭 Tour dentro del panel del bloque. */
export const HABIT_TOUR: TourScriptStep[] = [
  { id: 'h-intro', title: 'Tu acción, parte por parte', body: 'Cada bloque de tu horario es una acción: algo que haces en tu día. Te muestro cada parte para que la armes a tu medida.' },
  { id: 'h-registro', title: '¿Lo hiciste hoy?', body: 'Cada día marcas si cumpliste. Cada cuadrito es un día: verde lo hiciste, rojo no. Mientras más días seguidos, más grande tu racha.', target: 'registro' },
  { id: 'h-cuando', title: 'Cuándo', body: 'Elige los días en que se repite, la hora y cuánto dura. Lo que cambias aquí cambia en todos sus días.', target: 'hab-cuando' },
  { id: 'h-importancia', title: 'Importancia', body: 'No negociable es lo que sostiene tu vida, como dormir, levantarte o entrenar: se bloquea en tu horario. Modificable se hace sí o sí, pero puede cambiar de hora. Flexible suma si alcanza, y es lo primero que se suelta cuando el día se complica.', target: 'hab-importancia' },
  { id: 'h-categoria', title: 'Categoría', body: 'Agrupa tus acciones por área de tu vida, con emoji y color, y crea las tuyas con Nueva. Lo personal sostiene lo laboral: cuida eso primero. Si tienes varios horarios, aquí eliges a cuál pertenece.', target: 'hab-categoria' },
  { id: 'h-aviso', title: 'Aviso', body: 'Notificación es un aviso suave. Alarma suena más y deja un cartel hasta que lo cierras. Elige cuántos minutos antes te avisa y el sonido que más te guste.', target: 'hab-aviso' },
  { id: 'h-focus', title: 'Modo focus', body: 'Para el trabajo profundo: pone la acción a pantalla completa con su cuenta regresiva. Para que el teléfono tampoco te distraiga, crea un modo Concentración a esta misma hora.', target: 'hab-focus' },
  { id: 'h-dentro', title: 'Dentro de esta tarea', body: 'Aquí van tus herramientas. El paso a paso es tu checklist del momento, como cinco flexiones, lavarte la cara o tomar tus pastillas. Las reglas son lo que no haces, como no revisar el teléfono al despertar. También puedes sumar tu sueño, un plan de entrenamiento, de comidas o una base de datos.', target: 'mundo' },
  { id: 'h-nota', title: 'Descripción y nota', body: 'Anota los detalles en la descripción, o abre su nota para escribir con calma y pegar fotos o archivos.', target: 'hab-nota' },
  { id: 'h-fin', title: 'Listo', body: 'Ya sabes armar una acción a tu medida. Repite este tour cuando quieras con el botón Tour, arriba del panel.' },
];

export const tourStep = (id: string) => TOUR_SCRIPT.find((s) => s.id === id) ?? HABIT_TOUR.find((s) => s.id === id) ?? null;
export const spokenText = (s: TourScriptStep) => `${s.title}. ${s.body}`;

/** Cambia cuando cambia el texto (hace que el audio guardado se renueve). */
export function voiceVersion(s: TourScriptStep) {
  let h = 0;
  for (const c of spokenText(s)) h = (h * 31 + c.codePointAt(0)!) | 0;
  return (h >>> 0).toString(36);
}
