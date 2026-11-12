'use client';

import React, { useRef, useState } from 'react';
import { ChevronDown, GripVertical } from 'lucide-react';

/**
 * Recuadros del panel de una acción (Emanuel, 2026-11-03): cada sección en su recuadro, plegable con la
 * flecha y movible con la manija ⋮⋮ (mouse o dedo). El orden y lo plegado se recuerdan en este dispositivo.
 */

/** Arrastrar con la manija dentro de una lista vertical: devuelve dónde iría y el arranque del gesto. */
export function useDragList(onMove: (from: number, to: number) => void) {
  const list = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const start = (e: React.PointerEvent, from: number) => {
    e.preventDefault();
    let to = from;
    setDrag({ from, to });
    const move = (ev: PointerEvent) => {
      const rows = Array.from(list.current?.children ?? []).filter((r) => (r as HTMLElement).dataset.row !== undefined) as HTMLElement[];
      const at = rows.findIndex((r) => ev.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
      to = at === -1 ? rows.length - 1 : at > from ? at - 1 : at;
      setDrag({ from, to });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (to !== from) onMove(from, to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return { list, drag, start };
}

export const moveItem = <T,>(arr: T[], from: number, to: number) => {
  const n = [...arr];
  const [x] = n.splice(from, 1);
  n.splice(to, 0, x);
  return n;
};

const read = (key: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]');
  } catch {
    return [];
  }
};
const write = (key: string, v: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* modo privado */
  }
};

/** Un recuadro con título, flecha para plegar y (opcional) manija para mover. */
export const Box: React.FC<{
  title: React.ReactNode;
  extra?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  onGrip?: (e: React.PointerEvent) => void;
  dragging?: boolean;
  tour?: string;
  /** Ayuda al mantener presionado 2 s (o dejar el mouse quieto) sobre el título. */
  help?: string;
  children: React.ReactNode;
}> = ({ title, extra, open, onToggle, onGrip, dragging, tour, help, children }) => (
  <section data-row="" data-tour={tour} className={`rounded-2xl bg-white/[0.03] ring-1 transition-shadow ${dragging ? 'ring-sky-400/60 shadow-lg shadow-sky-500/10' : 'ring-white/10'}`}>
    <div className="flex items-center gap-1.5 px-3 py-2.5">
      {onGrip && (
        <button type="button" aria-label="Mover sección" data-help="Arrastra para mover" onPointerDown={onGrip} className="cursor-grab touch-none rounded p-0.5 text-zinc-600 hover:text-zinc-300 active:cursor-grabbing"><GripVertical className="h-4 w-4" /></button>
      )}
      {/* Tocar el título pliega; si el título es un campo (nombre del bloque), se edita sin plegar. */}
      <div onClick={(e) => !(e.target as HTMLElement).closest('input, button, select, textarea') && onToggle()} data-help={help} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{title}</span>
      </div>
      {extra}
      <button type="button" onClick={onToggle} aria-label={open ? 'Plegar' : 'Desplegar'} className="rounded p-1 text-zinc-500 hover:text-white"><ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} /></button>
    </div>
    {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
  </section>
);

export type PanelSection = { id: string; title: React.ReactNode; tour?: string; help?: string; extra?: React.ReactNode; body: React.ReactNode };

/** Las secciones del panel en el orden y plegado que dejó la persona. */
export const PanelSections: React.FC<{ sections: PanelSection[]; storage: string }> = ({ sections, storage }) => {
  const [order, setOrder] = useState<string[]>(() => read(`${storage}-orden`));
  const [closed, setClosed] = useState<string[]>(() => read(`${storage}-plegado`));
  const ids = [...order.filter((id) => sections.some((s) => s.id === id)), ...sections.map((s) => s.id).filter((id) => !order.includes(id))];
  const { list, drag, start } = useDragList((from, to) => {
    const next = moveItem(ids, from, to);
    setOrder(next);
    write(`${storage}-orden`, next);
  });
  const shown = drag ? moveItem(ids, drag.from, drag.to) : ids;
  const toggle = (id: string) => {
    const next = closed.includes(id) ? closed.filter((x) => x !== id) : [...closed, id];
    setClosed(next);
    write(`${storage}-plegado`, next);
  };
  return (
    <div ref={list} className="space-y-3">
      {shown.map((id) => {
        const s = sections.find((x) => x.id === id)!;
        return (
          <Box key={id} title={s.title} extra={s.extra} tour={s.tour} help={s.help} open={!closed.includes(id)} onToggle={() => toggle(id)} onGrip={(e) => start(e, ids.indexOf(id))} dragging={drag !== null && ids[drag.from] === id}>
            {s.body}
          </Box>
        );
      })}
    </div>
  );
};
