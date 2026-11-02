/**
 * ⚙️ CONFIGURACIÓN DE LA APP — lo primero que se cambia al crear una app nueva
 * desde la plantilla. Todo lo que dice "Mi App" sale de aquí.
 */
import { CalendarDays, CalendarClock, CalendarRange, Database, ListChecks, ListTodo, Plug, Sun, Trophy } from 'lucide-react';
import type { AccentId } from '@/utils/appearance';

export const APP = {
  /** Identificador en la nube: el `slug` de la fila de esta app en hub_apps. */
  slug: 'organiza',
  /** Nombre visible (barra superior, menú, pestaña del navegador). */
  name: 'Organiza',
  /** Línea bajo el nombre en el logo ("MASTER WOLF" / "Finance"). */
  brandTop: 'MASTER WOLF',
  brandBottom: 'Organiza',
  description: 'Tu calendario y tu horario hablando el mismo idioma.',
  /** Color de acento por defecto. Cada usuario lo puede cambiar en Configuración. */
  accent: 'amber' as AccentId,
  /** Dirección de App Master Cloud (login compartido y botón "Abrir la nube"). */
  cloudUrl: 'https://app-master-cloud.vercel.app',
  /** Saludo de la barra superior. {nombre} = primer nombre del usuario. */
  greeting: 'Hola, {nombre}',
  subtitle: 'Así viene tu tiempo',
} as const;

/**
 * Secciones de la app: aparecen en el menú lateral, en el dock (dock: true),
 * en el buscador ⌘K y en la dirección (#slug). Agrega aquí las de tu app y
 * su vista en components/views/index.ts (VIEWS). El Chat lo agrega la
 * plantilla sola (utils/sections.ts).
 */
export const SECTIONS = [
  { key: 'inicio', label: 'Hoy', icon: Sun, dock: true },
  { key: 'calendario', label: 'Calendario', icon: CalendarDays, dock: true },
  { key: 'horario', label: 'Horario', icon: CalendarClock, dock: true },
  { key: 'daily', label: 'Daily', icon: ListTodo, dock: false },
  { key: 'checklist', label: 'Cierre del día', icon: ListChecks, dock: false },
  { key: 'ruta', label: 'Tu Ruta', icon: Trophy, dock: false },
  { key: 'acomodar', label: 'Por acomodar', icon: CalendarRange, dock: false },
  { key: 'bases', label: 'Bases de datos', icon: Database, dock: false },
  { key: 'conexiones', label: 'Conexiones', icon: Plug, dock: false },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['key'];
