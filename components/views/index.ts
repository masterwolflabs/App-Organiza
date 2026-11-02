/**
 * Las vistas de ESTA app: una por cada sección de SECTIONS (app.config.ts).
 * Archivo propio de cada app (la plantilla nunca lo pisa).
 */
import type React from 'react';
import type { SectionKey } from '@/app.config';
import { HoyView } from '@/components/views/HoyView';
import { CalendarioView } from '@/components/views/CalendarioView';
import { HorarioView } from '@/components/views/HorarioView';
import { AcomodarView } from '@/components/views/AcomodarView';
import { BasesView } from '@/components/views/BasesView';
import { DailyPage } from '@/components/views/DailyPage';
import { ChecklistView } from '@/components/views/ChecklistView';
import { RutaView } from '@/components/views/RutaView';
import { ConexionesView } from '@/components/views/ConexionesView';
import { AvisosView } from '@/components/views/AvisosView';

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
  avisos: AvisosView,
  conexiones: ConexionesView,
};
