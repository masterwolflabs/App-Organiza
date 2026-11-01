'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
export type PairSide = 'left' | 'right';
type Side = PairSide;

/**
 * Two sections side by side (≥1280px), each one half. Expanding one makes it
 * grow sideways and pushes the other to the edge, where it keeps peeking (a
 * slice stays visible, clipped at its normal width, without reflowing);
 * clicking that slice expands it instead. Below 1280px they're stacked.
 * Used by Deudas | Deudores and Herramientas | Cuentas. ONE round control sits
 * in the gap between them, like a splitter (› grows the left one, ‹ the right
 * one; when one is open it slides with the border and shows a single arrow
 * back). The sections themselves have no handles.
 */
export const ExpandPair: React.FC<{
  render: (side: Side, expanded: boolean, toggle: () => void) => React.ReactNode;
  labels: Record<Side, string>;
}> = ({ render, labels }) => {
  const [open, setOpen] = useState<Side | null>(null);
  const toggle = (side: Side) => () => setOpen((o) => (o === side ? null : side));

  const panel = (side: Side) => {
    const expanded = open === side;
    const peeking = open !== null && !expanded;
    // The left panel peeks from the left edge (its right part shows), the right one from the right edge.
    const peekFromLeft = side === 'left';
    return (
      <div
        key={side}
        className={`relative min-w-0 overflow-hidden rounded-3xl transition-[flex-basis] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none min-[1280px]:shrink-0 ${
          expanded ? 'min-[1280px]:basis-[calc(100%-184px)]' : peeking ? 'min-[1280px]:basis-[160px]' : 'min-[1280px]:basis-[calc(50%-12px)]'
        }`}
      >
        {/* While peeking, the content keeps its normal width and is just clipped, so it doesn't squash. */}
        <div className={`flex h-full ${peeking && peekFromLeft ? 'min-[1280px]:justify-end' : ''}`}>
          <div className={`h-full w-full ${peeking ? 'min-[1280px]:w-[600px] min-[1280px]:shrink-0' : ''}`}>{render(side, expanded, toggle(side))}</div>
        </div>
        {peeking && (
          <button
            type="button"
            onClick={() => setOpen(side)}
            aria-label={`Expandir ${labels[side]}`}
            className={`absolute inset-0 z-20 hidden items-start rounded-3xl pt-7 text-sm font-semibold text-white transition-colors hover:bg-white/[0.03] min-[1280px]:flex ${
              peekFromLeft
                ? 'justify-end bg-gradient-to-r from-[#09090b]/80 via-[#09090b]/30 to-transparent pr-4'
                : 'justify-start bg-gradient-to-l from-[#09090b]/80 via-[#09090b]/30 to-transparent pl-4'
            }`}
          >
            <span className="flex items-center gap-1 rounded-full border border-white/15 bg-[#0c0f15]/90 px-3 py-1.5 text-xs shadow-lg">
              {peekFromLeft && <ChevronRight className="h-3.5 w-3.5" />}
              {labels[side]}
              {!peekFromLeft && <ChevronLeft className="h-3.5 w-3.5" />}
            </span>
          </button>
        )}
      </div>
    );
  };

  // Center of the gap between the panels (gap = 24px): 50% · 100%−172px · 172px.
  const splitAt = open === 'left' ? 'calc(100% - 172px)' : open === 'right' ? '172px' : '50%';
  const btn =
    'flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70';

  return (
    <div className="relative flex flex-col gap-5 sm:gap-6 min-[1280px]:flex-row">
      {[panel('left'), panel('right')]}
      <div
        className="absolute top-1/2 z-30 hidden -translate-x-1/2 -translate-y-1/2 transition-[left] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none min-[1280px]:block"
        style={{ left: splitAt }}
      >
        <div className="flex flex-col items-center gap-0.5 rounded-full border border-white/15 bg-[#0c0f15]/95 p-0.5 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.8)] backdrop-blur">
          {open !== 'right' && (
            <button
              type="button"
              onClick={() => setOpen(open === 'left' ? null : 'left')}
              aria-label={open === 'left' ? `Contraer ${labels.left}` : `Expandir ${labels.left}`}
              title={open === 'left' ? 'Volver a la mitad' : `Expandir ${labels.left}`}
              className={btn}
            >
              {open === 'left' ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
          {open !== 'left' && (
            <button
              type="button"
              onClick={() => setOpen(open === 'right' ? null : 'right')}
              aria-label={open === 'right' ? `Contraer ${labels.right}` : `Expandir ${labels.right}`}
              title={open === 'right' ? 'Volver a la mitad' : `Expandir ${labels.right}`}
              className={btn}
            >
              {open === 'right' ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
