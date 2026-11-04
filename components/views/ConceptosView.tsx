'use client';

import React from 'react';

/**
 * Conceptos guardados (Emanuel, 2026-11-04): lo que no se entendía o no se usaba sale de la vista,
 * pero queda anotado aquí. Puede que nunca vuelva, o que vuelva mucho mejor. Para traer uno de vuelta:
 * pídeselo a Claude y lo rehace desde esta idea. (El código viejo sigue en el historial de git.)
 */
type Concepto = { emoji: string; title: string; where: string; what: string; why: string; since: string };

export const CONCEPTOS: Concepto[] = [
  {
    emoji: '🗓️', title: 'Tu semana', where: 'Horario', since: '2026-11-04',
    what: 'Una fila Lunes…Domingo para elegir qué horario usa cada día.',
    why: 'Con las variantes (otra hora por día) casi nunca hace falta más de un horario a la vez.',
  },
  {
    emoji: '🖼️', title: 'Portada del horario', where: 'Horario', since: '2026-11-04',
    what: 'Una imagen grande arriba de cada horario.',
    why: 'Demasiado: ya hay portadas en cada acción.',
  },
  {
    emoji: '📁', title: 'Modalidad', where: 'Horario', since: '2026-11-04',
    what: 'Carpetas para agrupar horarios («Base», «Vacaciones», «Exámenes»).',
    why: 'No se entendía para qué servía.',
  },
  {
    emoji: '🪜', title: 'Fases (Fase, Nueva fase, Usar esta fase)', where: 'Horario', since: '2026-11-04',
    what: 'Versiones de un mismo horario para ir avanzando de a poco (Fase 1: me levanto 8:00 → Fase 2: 6:00).',
    why: 'No se entendía. Si vuelve, mejor como algo que la IA proponga sola.',
  },
  {
    emoji: '📤', title: 'Publicar cambios', where: 'Horario', since: '2026-11-04',
    what: 'Volver a publicar un horario activo después de editarlo.',
    why: 'Un horario activo ahora guarda cada cambio al tiro (y se deshace con ↶).',
  },
];

export const ConceptosView: React.FC = () => (
  <div className="space-y-4">
    <p className="text-sm text-zinc-400">Ideas que sacamos de la vista para que no hagan ruido. Quedan guardadas aquí por si algún día vuelven, mejor hechas. Para traer una de vuelta, pídesela a Claude.</p>
    <div className="space-y-2">
      {CONCEPTOS.map((c) => (
        <div key={c.title} className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="font-semibold text-white">{c.emoji} {c.title}</p>
            <span className="text-xs text-zinc-500">{c.where} · guardado el {c.since.split('-').reverse().join('-')}</span>
          </div>
          <p className="mt-1 text-sm text-zinc-300">{c.what}</p>
          <p className="mt-1 text-sm text-zinc-500">Por qué salió: {c.why}</p>
        </div>
      ))}
    </div>
  </div>
);
