/**
 * ⚙️ CONFIGURACIÓN DE LA APP — lo primero que se cambia al crear una app nueva
 * desde la plantilla. Todo lo que dice "Mi App" sale de aquí.
 */
import { Database, Home, Table2 } from 'lucide-react';
import type { AccentId } from '@/utils/appearance';

export const APP = {
  /** Identificador en la nube: el `slug` de la fila de esta app en hub_apps. */
  slug: 'mi-app',
  /** Nombre visible (barra superior, menú, pestaña del navegador). */
  name: 'Mi App',
  /** Línea bajo el nombre en el logo ("MASTER WOLF" / "Finance"). */
  brandTop: 'MASTER WOLF',
  brandBottom: 'Mi App',
  description: 'Una app de Master Wolf Labs.',
  /** Color de acento por defecto. Cada usuario lo puede cambiar en Configuración. */
  accent: 'sky' as AccentId,
  /** Dirección de App Master Cloud (login compartido y botón "Abrir la nube"). */
  cloudUrl: 'https://app-master-cloud.vercel.app',
  /** Saludo de la barra superior. {nombre} = primer nombre del usuario. */
  greeting: 'Hola, {nombre}',
  subtitle: 'Bienvenido de vuelta',
} as const;

/**
 * Secciones de la app: aparecen en el menú lateral, en el dock (dock: true),
 * en el buscador ⌘K y en la dirección (#slug). Agrega aquí las de tu app y
 * su vista en components/views/index.ts (VIEWS). El Chat lo agrega la
 * plantilla sola (utils/sections.ts).
 */
export const SECTIONS = [
  { key: 'inicio', label: 'Inicio', icon: Home, dock: true },
  { key: 'registros', label: 'Registros', icon: Table2, dock: true },
  { key: 'bases', label: 'Bases de datos', icon: Database, dock: true },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['key'];
