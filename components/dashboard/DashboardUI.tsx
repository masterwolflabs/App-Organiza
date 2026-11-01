'use client';

import React from 'react';
import { Plus } from 'lucide-react';

/**
 * Shared building blocks of the dashboard redesign (Canva mockup, 2026-10-12):
 * one container per section (no more horizontal divider lines), big titles
 * with a short description underneath, secondary header actions and the
 * dashed "+" tile that lives at the end of a grid (Agregar cuenta / nota).
 */

export type ShellVariant = 'neon' | 'assistant' | 'glass';

const SHELL: Record<ShellVariant, string> = {
  // Destacada (en Finance: Patrimonio). Sigue el color de acento: solid graphite body with a faint cold tint + thin blue neon edge.
  neon:
    'border border-sky-400/70 bg-[linear-gradient(160deg,#15181e_0%,#121419_55%,#101216_100%)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-sky-400)_12%,transparent),0_0_22px_-6px_color-mix(in_oklab,var(--color-sky-400)_55%,transparent)]',
  // Asistente Financiero: opaque blue gradient, slightly brighter neon than the glass blocks.
  assistant:
    'border border-blue-400/60 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--color-blue-900)_75%,#0b0f17)_0%,color-mix(in_oklab,var(--color-blue-950)_70%,#0b0f17)_45%,#0D1727_100%)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-blue-400)_12%,transparent),0_0_26px_-8px_color-mix(in_oklab,var(--color-blue-400)_60%,transparent)]',
  // Cuentas / Notas / Herramientas: soft glass. Without backdrop-filter support the
  // translucent body falls back to a solid dark blue so text stays legible.
  glass:
    'border border-white/[0.13] bg-[linear-gradient(145deg,rgba(255,255,255,0.09)_0%,rgba(255,255,255,0.025)_38%,rgba(255,255,255,0.015)_70%,rgba(255,255,255,0.05)_100%),linear-gradient(160deg,rgba(20,29,46,0.58),rgba(10,14,22,0.68))] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-1px_0_rgba(255,255,255,0.03),0_30px_60px_-30px_rgba(0,0,0,0.85)] backdrop-blur-[48px] backdrop-saturate-[1.6] supports-[not(backdrop-filter:blur(1px))]:bg-[#121a27]',
};

export const SectionShell: React.FC<{
  variant: ShellVariant;
  id?: string;
  className?: string;
  children: React.ReactNode;
  'data-tour'?: string;
  /** Marks the section as expanded ("Ver todas") so a parent grid can react with `has-[[data-expanded]]`. */
  expanded?: boolean;
}> = ({ variant, id, className = '', children, expanded, ...rest }) => (
  <section id={id} data-tour={rest['data-tour']} data-expanded={expanded || undefined} className={`relative rounded-3xl p-5 sm:p-7 lg:p-8 ${SHELL[variant]} ${className}`}>
    {children}
  </section>
);

export const SectionHeader: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Small counter pill next to the title (e.g. number of notes). */
  count?: number;
  /** 'xl' ≈ 38px (default), 'lg' ≈ 32px (patrimonio). */
  size?: 'xl' | 'lg';
  actions?: React.ReactNode;
  className?: string;
  /** Actions always go under the title (for narrow, side-by-side sections). */
  stacked?: boolean;
}> = ({ title, description, count, size = 'xl', actions, className = '', stacked }) => (
  <div className={`flex flex-col gap-4 ${stacked ? '' : 'sm:flex-row sm:items-start sm:justify-between'} ${className}`}>
    <div className="min-w-0">
      <h2
        className={`flex items-center gap-3 font-bold leading-[1.1] tracking-tight text-white ${
          size === 'xl' ? 'text-[28px] sm:text-[34px] lg:text-[38px]' : 'text-[24px] sm:text-[28px] lg:text-[32px]'
        }`}
      >
        <span className="min-w-0">{title}</span>
        {typeof count === 'number' && count > 0 && (
          <span className="rounded-lg bg-white/[0.08] px-2 py-1 text-xs font-semibold leading-none text-zinc-300">{count}</span>
        )}
      </h2>
      {description && <p className="mt-2 text-sm text-zinc-400">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">{actions}</div>}
  </div>
);

/** Secondary header action: dark surface, icon + label. */
export const actionClass =
  'inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#0c0f15]/85 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:border-white/25 hover:bg-[#141922] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none';

export const HeaderAction = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ComponentType<{ className?: string }>; active?: boolean }
>(({ icon: Icon, active, className = '', children, ...props }, ref) => (
  <button ref={ref} type="button" {...props} className={`${actionClass} ${active ? 'border-sky-400/50 text-sky-200' : ''} ${className}`}>
    {Icon && <Icon className="h-4 w-4 shrink-0" />}
    {children}
  </button>
));
HeaderAction.displayName = 'HeaderAction';

/** Dashed "+" tile placed after the last card of a grid. */
export const AddTile: React.FC<{
  label: string;
  onClick: () => void;
  className?: string;
  'data-tour'?: string;
}> = ({ label, onClick, className = '', ...rest }) => (
  <button
    type="button"
    onClick={onClick}
    data-tour={rest['data-tour']}
    aria-label={label}
    className={`group flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[rgba(229,234,240,0.24)] bg-[rgba(229,234,240,0.055)] text-[#BFC8D4] transition-colors duration-200 ease-out hover:border-sky-400/70 hover:bg-sky-400/[0.12] hover:text-sky-300 focus-visible:border-sky-400/70 focus-visible:bg-sky-400/[0.12] focus-visible:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 motion-reduce:transition-none ${className}`}
  >
    <Plus className="h-12 w-12" strokeWidth={1.5} />
    <span className="text-sm font-medium">{label}</span>
  </button>
);

/** Labeled select used inside the "Filtros" popovers. */
export const FilterSelect: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
}> = ({ label, value, onChange, options, allLabel = 'Todos' }) => (
  <label className="block px-3 py-1.5">
    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-white/10 bg-[#0f1116] px-2.5 py-2 text-xs text-zinc-200 focus:border-sky-500/50 focus:outline-none"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);
