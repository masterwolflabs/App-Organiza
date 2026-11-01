/**
 * Las vistas de ESTA app: una por cada sección de SECTIONS (app.config.ts).
 * Archivo propio de cada app (la plantilla nunca lo pisa).
 */
import type React from 'react';
import type { SectionKey } from '@/app.config';
import { InicioView } from '@/components/views/InicioView';
import { RegistrosView } from '@/components/views/RegistrosView';
import { BasesView } from '@/components/views/BasesView';

export type ViewProps = { onOpenSettings: () => void; onOpenCloud: () => void };

export const VIEWS: Record<SectionKey, React.FC<ViewProps>> = {
  inicio: InicioView,
  registros: RegistrosView,
  bases: BasesView,
};
