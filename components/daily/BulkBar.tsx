'use client';

import React, { useState } from 'react';
import { Archive, ArchiveRestore, CalendarDays, Trash2, User, X } from 'lucide-react';
import { BodyPortal } from '@/components/ui/BodyPortal';
import { EntityMenu, type Entity } from '@/components/calendar/EntityPicker';
import type { DailyStatus, DailyTag, DailyTask } from '@/utils/daily';

/**
 * Acciones múltiples de la Daily (Emanuel, 2026-11-12): con una o más tareas marcadas aparece esta barra
 * abajo al centro. Cambia a todas juntas el estado, la aplicación (traspasar), el ejecutor, la etiqueta o
 * la entrega; archiva o borra (borrar pide dos confirmaciones, como una sola tarea).
 */
type Opt = { value: string; label: string };
const sel =
  'rounded-lg border border-white/10 bg-[#1c1f26] px-2 py-1.5 text-xs font-semibold text-zinc-100 focus:border-sky-500 focus:outline-none [&>option]:bg-zinc-900';
const btn = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-xs font-semibold text-zinc-100 hover:border-white/25';

export const BulkBar: React.FC<{
  count: number;
  archivedView: boolean;
  statusOptions: Opt[];
  tagOptions: Opt[];
  appOptions: Opt[];
  appLabel: string;
  entities: Entity[];
  onCreatePerson: (name: string) => Promise<string | null>;
  onClear: () => void;
  onPatch: (p: Partial<DailyTask>) => void;
  onExecutor: (name: string, mode: 'agregar' | 'reemplazar') => void;
  onArchive: () => void;
  onDelete: () => void;
}> = ({ count, archivedView, statusOptions, tagOptions, appOptions, appLabel, entities, onCreatePerson, onClear, onPatch, onExecutor, onArchive, onDelete }) => {
  const [who, setWho] = useState<{ anchor: DOMRect; mode: 'agregar' | 'reemplazar' } | null>(null);
  return (
    <BodyPortal lockScroll={false}>
      <div className="fixed bottom-24 left-1/2 z-[60] flex w-max max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-white/15 bg-[#12151b]/95 px-3 py-2 shadow-2xl backdrop-blur">
        <span className="whitespace-nowrap rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-bold text-[#fff]">
          {count} seleccionada{count === 1 ? '' : 's'}
        </span>
        <select value="" onChange={(e) => e.target.value && onPatch({ status: e.target.value as DailyStatus })} className={sel} data-help="Cambiar el estado de todas">
          <option value="">Estado…</option>
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select value="" onChange={(e) => e.target.value && onPatch({ app: e.target.value })} className={sel} data-help={`Traspasar todas a otra ${appLabel.toLowerCase()}`}>
          <option value="">Traspasar a…</option>
          {appOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select value="" onChange={(e) => e.target.value && onPatch({ tag: e.target.value as DailyTag })} className={sel} data-help="Cambiar la etiqueta de todas">
          <option value="">Etiqueta…</option>
          {tagOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={(e) => setWho({ anchor: e.currentTarget.getBoundingClientRect(), mode: 'reemplazar' })} className={btn} data-help="Poner este ejecutor en todas (reemplaza a los que tenían)">
          <User className="h-3.5 w-3.5" /> Ejecutor
        </button>
        <button type="button" onClick={(e) => setWho({ anchor: e.currentTarget.getBoundingClientRect(), mode: 'agregar' })} className={btn} data-help="Sumar un ejecutor a todas (sin quitar a los que ya tenían)">
          + Ejecutor
        </button>
        <label className={`${btn} cursor-pointer`} data-help="Misma fecha de entrega para todas">
          <CalendarDays className="h-3.5 w-3.5" /> Entrega
          <input type="date" onChange={(e) => e.target.value && onPatch({ due: e.target.value })} className="w-[7.5rem] bg-transparent text-xs text-zinc-100 [color-scheme:dark] focus:outline-none" />
        </label>
        <button type="button" onClick={onArchive} className={btn}>
          {archivedView ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />} {archivedView ? 'Desarchivar' : 'Archivar'}
        </button>
        <button type="button" onClick={onDelete} className={`${btn} border-rose-500/40 text-rose-300 hover:border-rose-400`}>
          <Trash2 className="h-3.5 w-3.5" /> Borrar
        </button>
        <button type="button" onClick={onClear} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Quitar la selección" data-help="Quitar la selección">
          <X className="h-4 w-4" />
        </button>
      </div>
      {who && (
        <EntityMenu
          anchor={who.anchor}
          items={entities}
          value={null}
          newLabel="Nuevo ejecutor"
          directory={{ label: 'Ejecutores', tab: 'personal' }}
          onCreate={onCreatePerson}
          onPick={(id) => {
            if (id) onExecutor(id, who.mode);
            setWho(null);
          }}
          onClose={() => setWho(null)}
        />
      )}
    </BodyPortal>
  );
};
