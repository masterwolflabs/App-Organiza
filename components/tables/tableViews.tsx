'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@/components/tables/window';
import { ChevronLeft, ChevronRight, Copy, Maximize2, MoreHorizontal, Pencil, X } from 'lucide-react';

/**
 * Galería y Calendario for every Empresa database (Emanuel, 2026-10-21 —
 * "somos la competencia de Notion"). The table engine (table.tsx) keeps
 * rendering the real table (hidden) so filters / sort / search keep working
 * on the cells' text; these views receive the rows it shows, already
 * filtered and sorted, each as a list of properties (label + the SAME cell
 * content, so double-click editing still works) and the cell text.
 */

export type ViewType = 'table' | 'gallery' | 'calendar' | 'timeline' | 'dashboard' | 'feed';
export type CardPrefs = { size: 's' | 'm' | 'l'; layout: 'compact' | 'list' };
export const DEFAULT_CARD: CardPrefs = { size: 'm', layout: 'list' };
export type Prop = { key: string; label: string; node: React.ReactNode; text: string };
export type Item = { key: string; props: Prop[]; all: Prop[] };

const isEmpty = (t: string) => ['', '—', '-'].includes(t.trim());
const SIZE: Record<CardPrefs['size'], string> = { s: 'minmax(190px,1fr)', m: 'minmax(250px,1fr)', l: 'minmax(330px,1fr)' };

/** One property in a card: the value, and its name in a tooltip on hover (like Notion). */
const PropLine: React.FC<{ p: Prop; inline: boolean }> = ({ p, inline }) => (
  <div className={`group/p relative min-w-0 ${inline ? 'max-w-full' : ''}`}>
    <div className={`min-w-0 text-sm text-zinc-200 ${inline ? '' : '[&_.line-clamp-2]:line-clamp-1'}`}>{p.node}</div>
    <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 hidden w-max max-w-[220px] rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs shadow-xl ring-1 ring-white/10 group-hover/p:block">
      <div className="font-semibold text-white">{p.label}</div>
      <div className="truncate text-zinc-400">{p.text.trim() || '—'}</div>
    </div>
  </div>
);

const copyText = (it: Item) => it.all.map((p) => `${p.label}: ${p.text.trim() || '—'}`).join('\n');

export const Gallery: React.FC<{ items: Item[]; card: CardPrefs; onOpen: (key: string) => void; empty: string }> = ({ items, card, onOpen, empty }) => {
  const [menu, setMenu] = useState<string | null>(null);
  if (!items.length) return <p className="rounded-2xl border border-white/[0.08] px-3 py-8 text-center text-sm text-zinc-500">{empty}</p>;
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill,${SIZE[card.size]})` }}>
      {items.map((it) => {
        const [title, ...rest] = it.props;
        const shown = rest.filter((p) => !isEmpty(p.text));
        return (
          <div
            key={it.key}
            // A click anywhere on the card (not on a value / button) opens it (Emanuel, 2026-10-22).
            onClick={(e) => !(e.target as HTMLElement).closest('button,a,input,select,textarea,label,[data-editable]') && onOpen(it.key)}
            className="group/card relative flex min-h-[120px] cursor-pointer flex-col gap-2.5 rounded-2xl border border-white/10 bg-[#141922] p-4 transition-colors hover:border-white/20"
          >
            {/* Hover actions (Notion): open the row · more */}
            <div className={`absolute right-2 top-2 z-20 flex overflow-hidden rounded-lg border border-white/10 bg-[#1b212c] shadow-lg ${menu === it.key ? 'flex' : 'hidden group-hover/card:flex'}`}>
              <button type="button" onClick={() => onOpen(it.key)} className="p-1.5 text-zinc-300 hover:bg-white/10 hover:text-white" aria-label="Abrir" title="Abrir">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setMenu((m) => (m === it.key ? null : it.key))} className="border-l border-white/10 p-1.5 text-zinc-300 hover:bg-white/10 hover:text-white" aria-label="Más opciones">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
            {menu === it.key && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />
                <div className="absolute right-2 top-10 z-30 w-44 rounded-xl border border-white/10 bg-[#11151c] p-1 text-sm shadow-2xl">
                  <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-zinc-200 hover:bg-white/[0.06]" onClick={() => (setMenu(null), onOpen(it.key))}>
                    <Maximize2 className="h-3.5 w-3.5" /> Abrir
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-zinc-200 hover:bg-white/[0.06]"
                    onClick={() => {
                      setMenu(null);
                      navigator.clipboard?.writeText(copyText(it)).catch(() => {});
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copiar datos
                  </button>
                </div>
              </>
            )}
            {title && <div className="pr-14 text-base font-bold leading-snug text-white [&_.line-clamp-2]:line-clamp-2">{title.node}</div>}
            <div className={card.layout === 'compact' ? 'flex flex-wrap items-center gap-x-3 gap-y-1.5' : 'flex flex-col gap-2'}>
              {shown.map((p) => (
                <PropLine key={p.key} p={p} inline={card.layout === 'compact'} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Calendar ───────────────────────────────────────────────────────────────
const MONTHS: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12 };
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** "6 oct 26" · "2026-10-06" · "06-10-2026" → "2026-10-06" (null if it isn't a date). */
export function dateOf(text: string): string | null {
  const t = text.trim();
  const pad = (n: number) => String(n).padStart(2, '0');
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /(\d{1,2}) (ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)\.? (\d{2,4})/i.exec(t);
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(Number(m[1]))}`;
  }
  m = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(t);
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return null;
}

export const Calendar: React.FC<{ items: Item[]; dateKey: string | null; onOpen: (key: string) => void }> = ({ items, dateKey, onOpen }) => {
  const today = new Date();
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  if (!dateKey) return <p className="rounded-2xl border border-white/[0.08] px-3 py-8 text-center text-sm text-zinc-500">Esta tabla no tiene una columna de fecha para armar el calendario.</p>;
  const byDay = new Map<string, Item[]>();
  for (const it of items) {
    const p = it.all.find((x) => x.key === dateKey);
    const d = p ? dateOf(p.text) : null;
    if (d) byDay.set(d, [...(byDay.get(d) ?? []), it]);
  }
  const first = new Date(ym.y, ym.m, 1);
  const lead = (first.getDay() + 6) % 7; // weeks start on Monday
  const days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => i - lead + 1);
  const iso = (d: number) => `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const move = (n: number) => setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  // Chip text: the first property with words that isn't the date itself (e.g. the project, not "1 oct 26").
  const titleProp = (it: Item) => [...it.props, ...it.all].find((x) => x.key !== dateKey && !isEmpty(x.text) && !dateOf(x.text) && /\p{L}/u.test(x.text));
  const titleOf = (it: Item) => (titleProp(it)?.text ?? '—').trim();
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08]">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2">
        <span className="text-sm font-bold capitalize text-white">
          {MONTH_NAMES[ym.m]} {ym.y}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => move(-1)} className="rounded-lg p-1 text-zinc-400 hover:bg-white/[0.08] hover:text-white" aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setYm({ y: today.getFullYear(), m: today.getMonth() })} className="rounded-lg px-2 py-0.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.08]">
            Hoy
          </button>
          <button type="button" onClick={() => move(1)} className="rounded-lg p-1 text-zinc-400 hover:bg-white/[0.08] hover:text-white" aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-white/[0.08] text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const inMonth = d >= 1 && d <= days;
          const list = inMonth ? byDay.get(iso(d)) ?? [] : [];
          return (
            <div key={i} className={`min-h-[92px] border-b border-r border-white/[0.06] p-1.5 ${inMonth ? '' : 'bg-white/[0.015]'}`}>
              {inMonth && (
                <div className={`mb-1 text-right text-[11px] ${iso(d) === todayIso ? 'font-bold text-sky-300' : 'text-zinc-500'}`}>{d}</div>
              )}
              <div className="space-y-1">
                {list.slice(0, 3).map((it) => (
                  // The cell itself (first line only), not clickable inside: the chip opens the row.
                  <div
                    key={it.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(it.key)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(it.key)}
                    className="cursor-pointer overflow-hidden rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-sky-100 hover:bg-sky-500/25 [&_*]:pointer-events-none [&_*]:!text-[11px]"
                    title={titleOf(it)}
                  >
                    <div className="line-clamp-1 max-h-[1.4em] overflow-hidden">{titleProp(it)?.node ?? '—'}</div>
                  </div>
                ))}
                {list.length > 3 && <div className="px-1 text-[10px] text-zinc-500">+{list.length - 3} más</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** A row opened as a page: every property, label on the left (like Notion). The values keep their double-click editing. */
export const RowPeek: React.FC<{ item: Item; onClose: () => void; extra?: React.ReactNode; hide?: string[]; z?: number }> = ({ item, onClose, extra, hide = [], z = 72 }) => {
  const [title, ...all] = item.all;
  const rest = all.filter((p) => !hide.includes(p.key));
  const propRow = (p: Prop) => (
    <div key={p.key} className="grid grid-cols-[140px_1fr] items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
      <span className="truncate text-sm text-zinc-500">{p.label}</span>
      <div className="min-w-0 text-sm text-zinc-100">{isEmpty(p.text) && !React.isValidElement(p.node) ? <span className="text-zinc-600">Vacío</span> : p.node}</div>
    </div>
  );
  // Same window as every Empresa popup (Emanuel, 2026-10-22): maximize, lateral / flotante / completa, resize.
  return (
    <Modal z={z} size={extra ? 'xl' : undefined} title={title ? <span className="text-xl">{title.node}</span> : ''} onClose={onClose}>
      <div className="space-y-1">{rest.map(propRow)}</div>
      <p className="mt-4 text-[11px] text-zinc-500">Clic en un valor para cambiarlo.</p>
      {extra && <div className="mt-6 border-t border-white/[0.08] pt-6">{extra}</div>}
    </Modal>
  );
};

/** Small previews for the "Diseño de tarjeta" choice (Notion's Compacto / Lista). */
export const CardLayoutPicker: React.FC<{ value: CardPrefs['layout']; onChange: (v: CardPrefs['layout']) => void }> = ({ value, onChange }) => (
  <div className="grid grid-cols-2 gap-2">
    {(['compact', 'list'] as const).map((l) => (
      <button key={l} type="button" onClick={() => onChange(l)} className={`rounded-xl border p-2 text-center ${value === l ? 'border-sky-400 bg-sky-500/10' : 'border-white/10 hover:border-white/25'}`}>
        <div className="mb-1.5 rounded-lg bg-white/[0.04] p-2">
          <div className="mb-1.5 h-2.5 w-2.5 rounded-full bg-white/25" />
          {l === 'compact' ? (
            <div className="flex flex-wrap gap-1">
              {[10, 10, 10, 12, 10].map((w, i) => (
                <span key={i} className="h-1.5 rounded bg-white/20" style={{ width: w * 2 }} />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {[36, 22, 28].map((w, i) => (
                <span key={i} className="block h-1.5 rounded bg-white/20" style={{ width: w * 2 }} />
              ))}
            </div>
          )}
        </div>
        <span className={`text-xs font-semibold ${value === l ? 'text-white' : 'text-zinc-400'}`}>{l === 'compact' ? 'Compacto' : 'Lista'}</span>
      </button>
    ))}
  </div>
);
