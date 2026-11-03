/**
 * Las vistas de ESTA app: una por cada sección de SECTIONS (app.config.ts).
 * Archivo propio de cada app (la plantilla nunca lo pisa).
 */
import type React from 'react';
import { Plug } from 'lucide-react';
import type { SectionKey } from '@/app.config';
import type { SettingsPage } from '@/components/user/UserCenter';
import { HoyView } from '@/components/views/HoyView';
import { CalendarioView } from '@/components/views/CalendarioView';
import { HorarioView } from '@/components/views/HorarioView';
import { AcomodarView } from '@/components/views/AcomodarView';
import { BasesView } from '@/components/views/BasesView';
import { DailyPage } from '@/components/views/DailyPage';
import { ChecklistView } from '@/components/views/ChecklistView';
import { RutaView } from '@/components/views/RutaView';
import { ConexionesView } from '@/components/views/ConexionesView';
import { AlimentacionView, EntrenamientoView } from '@/components/organiza/Planner';

export type ViewProps = { onOpenSettings: () => void; onOpenCloud: () => void };

export const VIEWS: Record<SectionKey, React.FC<ViewProps>> = {
  inicio: HoyView,
  calendario: CalendarioView,
  horario: HorarioView,
  acomodar: AcomodarView,
  bases: BasesView,
  daily: DailyPage,
  checklist: ChecklistView,
  ruta: RutaView,
  conexiones: ConexionesView,
  alimentacion: AlimentacionView,
  entrenamiento: EntrenamientoView,
};

/** Páginas propias de Organiza dentro de Configuración. */
export const SETTINGS_PAGES: SettingsPage[] = [{ key: 'conexiones', label: 'Conexiones', icon: Plug, View: ConexionesView }];
