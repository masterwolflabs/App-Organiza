'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, PlayCircle, X } from 'lucide-react';
import { formatCLP } from '@/utils/formatters';

/** Shared building blocks of Finanzas de empresa / Master Cloud. */

export const fmt = (n: number | null | undefined, currency = 'CLP') => {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (currency === 'CLP') return formatCLP(n);
  return `${n.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
};
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');
export const newId = () => crypto.randomUUID();

/** Same as inputCls but without full width (fixed-width amount boxes). */
export const inputBase = 'rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none disabled:opacity-60';
export const inputCls = 'w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none disabled:opacity-60';
/** Compact control for filter bars (no full width). */
export const filterCls = 'rounded-full border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs text-zinc-100 focus:border-sky-500 focus:outline-none [&>option]:bg-zinc-900 [&>option]:text-white';
export const tileCls = 'rounded-2xl border border-white/[0.09] bg-[#141922]/80';
export const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50';
export const btnGhost = 'inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-white/25 disabled:opacity-40';
export const btnTiny = 'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-zinc-400 hover:bg-white/[0.06] hover:text-white';

// The window (Modal) lives in its own file so table views can use it too (no import cycle).
export { Modal } from '@/components/tables/window';

export const Field: React.FC<{ label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ label, hint, children, className }) => (
  <label className={`block ${className ?? ''}`}>
    <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span>}
  </label>
);

export const ErrorBox: React.FC<{ msg: string | null }> = ({ msg }) => (msg ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{msg}</p> : null);

const TONE: Record<string, string> = {
  pagado: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  parcial: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
  pendiente: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  vencido: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  por_configurar: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
  sin_verificar: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
  no_aplica: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
};
export const Pill: React.FC<{ tone: string; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE[tone] ?? TONE.no_aplica}`}>{children}</span>
);

export { Section, SectionOrder } from '@/components/tables/section';
export { Table, Td, DataTable, amt } from '@/components/tables/table';
export type { Col, ViewDef } from '@/components/tables/table';

export const Expand: React.FC<{ open: boolean; onClick: () => void }> = ({ open, onClick }) => (
  <button type="button" onClick={onClick} aria-label={open ? 'Ocultar detalle' : 'Ver detalle'} className="rounded-md p-0.5 text-zinc-500 hover:bg-white/[0.06] hover:text-white">
    <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
  </button>
);

/** "Por configurar" chip for amounts that can't be computed yet. */
export const Unset: React.FC<{ label?: string }> = ({ label = 'Por configurar' }) => <span className="text-xs font-semibold text-violet-300">{label}</span>;

export const LinkBtn: React.FC<{ onClick: () => void; children: React.ReactNode; title?: string }> = ({ onClick, children, title }) => (
  <button type="button" onClick={onClick} title={title} className="text-left text-sky-300 underline-offset-2 hover:underline">
    {children}
  </button>
);

/**
 * "Resumen" fold of a section (Emanuel, 2026-10-22 / 26). Inside: on the left `about` — what
 * this database is for and what you can do in it, in plain words —, on the right
 * "Aprende a usarme" (the animated tutorial), then the summary tiles. Open / closed is
 * remembered per browser in localStorage `mf-stats:<id>`. This is the format for EVERY
 * Empresa section from now on.
 */
export const StatGroup: React.FC<{ id: string; className?: string; about?: React.ReactNode; onLearn?: () => void; children?: React.ReactNode }> = ({ id, className = 'mb-4', about, onLearn, children }) => {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem(`mf-stats:${id}`) === '0') setOpen(false); } catch { /* private mode */ }
  }, [id]);
  const toggle = () => {
    setOpen((v) => {
      try { localStorage.setItem(`mf-stats:${id}`, v ? '0' : '1'); } catch { /* private mode */ }
      return !v;
    });
  };
  return (
    <div className={className}>
      <button type="button" onClick={toggle} aria-expanded={open} data-help-title="Resumen" data-help="Abre o cierra la explicación y los totales de esta sección." className="mb-2 inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-white">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} /> Resumen
      </button>
      {open && (
        <>
          {(about || onLearn) && (
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              {about && <div className="max-w-3xl space-y-2 text-sm leading-relaxed text-zinc-300 [&_b]:text-white">{about}</div>}
              {onLearn && (
                <button type="button" onClick={onLearn} data-help-title="Aprende a usarme" data-help="Un tutorial animado y narrado que te muestra cómo usar esta tabla, paso a paso." className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-violet-400/40 bg-violet-500/15 px-4 py-2 text-sm font-semibold text-violet-100 shadow-[0_0_18px_rgba(139,92,246,0.25)] hover:bg-violet-500/25">
                  <PlayCircle className="h-4 w-4" /> Aprende a usarme
                </button>
              )}
            </div>
          )}
          {children}
        </>
      )}
    </div>
  );
};

export const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: string; help?: string }> = ({ label, value, hint, tone, help }) => (
  <div className={`${tileCls} p-3.5`} data-help={help} data-help-title={help ? label : undefined}>
    <p className="text-[11px] text-zinc-400">{label}</p>
    <p className={`mt-1 font-mono text-lg font-bold ${tone ?? 'text-white'}`}>{value}</p>
    {hint && <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{hint}</p>}
  </div>
);
