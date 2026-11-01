/**
 * Secciones del menú, el dock, el buscador y la dirección (#clave):
 * las de la app (SECTIONS en app.config.ts) + las que trae la plantilla.
 * Las de la plantilla viven aquí, no en app.config.ts, para que una
 * actualización de la plantilla nunca rompa la configuración de una app.
 */
import { MessagesSquare, Sparkles, StickyNote } from 'lucide-react';
import { SECTIONS, SectionKey } from '@/app.config';

const BUILTIN = [
  { key: 'notas', label: 'Notas', icon: StickyNote, dock: true },
  { key: 'ia', label: 'IA', icon: Sparkles, dock: true },
  { key: 'chat', label: 'Chat', icon: MessagesSquare, dock: true },
] as const;

export type BuiltinSection = (typeof BUILTIN)[number]['key'];
export type AnySection = SectionKey | BuiltinSection;
export const ALL_SECTIONS: readonly { key: AnySection; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; dock: boolean }[] = [
  ...SECTIONS,
  ...BUILTIN,
];
