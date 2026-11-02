'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Pencil, RotateCcw, SlidersHorizontal } from 'lucide-react';

/**
 * Sections of Finanzas de empresa (Emanuel, 2026-10-15). Each one can, per
 * browser (localStorage `mf-sec:<id>`):
 * - move up / down (order lives in the parent: `SectionOrder` + `mf-sec-order`),
 *   its number follows its position;
 * - fold in three steps: solo título · a la mitad (content scrolls inside) · completa;
 * - be personalized: background color, glass or solid, number color, border
 *   (sutil / sólido / neón + color).
 */

/** false = everything inside is read-only (a team member whose role can't change this part). Lives here so the
 * shared table files don't depend on Empresa's editable.tsx (which re-exports it). */
export const CanEditCtx = createContext(true);

export type Fold = 'title' | 'half' | 'full';
type LineStyle = 'default' | 'none' | 'solid' | 'neon';
type Look = { bg: string | null; mode: 'glass' | 'solid' | null; num: string | null; numStyle: LineStyle; numGlow: number; border: LineStyle; borderColor: string; borderGlow: number };
type Prefs = { fold: Fold; look: Look; name?: string | null };
const DEFAULT_LOOK: Look = { bg: null, mode: null, num: null, numStyle: 'default', numGlow: 50, border: 'default', borderColor: '#38bdf8', borderGlow: 50 };
const DEFAULT: Prefs = { fold: 'full', look: DEFAULT_LOOK };

/** Look every section starts with when it has none of its own ("Aplicar a todas"). */
const GLOBAL_LOOK_KEY = 'mf-sec-look-default';
const APPLY_EVENT = 'mf-sec-apply-look';
const readGlobalLook = (): Look => {
  try {
    const g = JSON.parse(localStorage.getItem(GLOBAL_LOOK_KEY) || 'null');
    return g ? { ...DEFAULT_LOOK, ...g } : DEFAULT_LOOK;
  } catch {
    return DEFAULT_LOOK;
  }
};

function useSectionPrefs(id?: string, startFold: Fold = 'full') {
  const [prefs, setPrefs] = useState<Prefs>({ ...DEFAULT, fold: startFold });
  const save = useCallback(
    (next: Prefs) => {
      setPrefs(next);
      try {
        if (id) localStorage.setItem(`mf-sec:${id}`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [id],
  );
  useEffect(() => {
    if (!id) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`mf-sec:${id}`) || 'null');
      const base = readGlobalLook();
      setPrefs(saved ? { ...DEFAULT, ...saved, look: { ...base, ...(saved.look ?? {}) } } : { ...DEFAULT, fold: startFold, look: base });
    } catch {
      /* ignore */
    }
  }, [id, startFold]);
  // "Aplicar a todas las secciones": every mounted section takes the look (keeps its own fold).
  useEffect(() => {
    if (!id) return;
    const onApply = (e: Event) => {
      const look = (e as CustomEvent<Look>).detail;
      setPrefs((cur) => {
        const next = { ...cur, look };
        try {
          localStorage.setItem(`mf-sec:${id}`, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    };
    window.addEventListener(APPLY_EVENT, onApply);
    return () => window.removeEventListener(APPLY_EVENT, onApply);
  }, [id]);
  return [prefs, save] as const;
}

const applyLookToAll = (look: Look) => {
  try {
    localStorage.setItem(GLOBAL_LOOK_KEY, JSON.stringify(look));
    // Sections saved before but not on screen right now get it too.
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('mf-sec:')) continue;
      const v = JSON.parse(localStorage.getItem(k) || 'null');
      if (v) localStorage.setItem(k, JSON.stringify({ ...v, look }));
    }
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(APPLY_EVENT, { detail: look }));
};

// ── Plantillas de apariencia ───────────────────────────────────────────────
type LookTemplate = { id: string; name: string; look: Look; builtIn?: boolean };
const T = (p: Partial<Look>): Look => ({ ...DEFAULT_LOOK, ...p });
const BUILT_IN_TEMPLATES: LookTemplate[] = [
  { id: 'original', name: 'Original', look: DEFAULT_LOOK, builtIn: true },
  { id: 'neon-azul', name: 'Neón azul', look: T({ border: 'neon', borderColor: '#38bdf8', borderGlow: 50, numStyle: 'neon', numGlow: 35 }), builtIn: true },
  { id: 'neon-verde', name: 'Neón verde', look: T({ border: 'neon', borderColor: '#34d399', borderGlow: 55, num: '#6ee7b7', numStyle: 'neon', numGlow: 40 }), builtIn: true },
  { id: 'violeta', name: 'Violeta', look: T({ bg: '#1e1b4b', border: 'neon', borderColor: '#a78bfa', borderGlow: 60, num: '#c4b5fd', numStyle: 'neon', numGlow: 45 }), builtIn: true },
  { id: 'grafito', name: 'Grafito sólido', look: T({ mode: 'solid', border: 'solid', borderColor: '#3f3f46', numStyle: 'solid' }), builtIn: true },
  { id: 'minimal', name: 'Minimal', look: T({ border: 'none', numStyle: 'none' }), builtIn: true },
];
const TEMPLATES_KEY = 'mf-look-templates';
const TEMPLATES_EVENT = 'mf-look-templates-changed';

function useLookTemplates() {
  const [mine, setMine] = useState<LookTemplate[]>([]);
  useEffect(() => {
    const load = () => {
      try {
        const v = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]');
        setMine(Array.isArray(v) ? v.map((t: LookTemplate) => ({ ...t, look: { ...DEFAULT_LOOK, ...t.look } })) : []);
      } catch {
        setMine([]);
      }
    };
    load();
    window.addEventListener(TEMPLATES_EVENT, load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener(TEMPLATES_EVENT, load);
      window.removeEventListener('storage', load);
    };
  }, []);
  const write = (next: LookTemplate[]) => {
    try {
      localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(TEMPLATES_EVENT));
  };
  return {
    mine,
    add: (name: string, look: Look) => write([...mine, { id: `t-${Date.now().toString(36)}`, name, look }]),
    remove: (id: string) => write(mine.filter((t) => t.id !== id)),
  };
}

const sameLook = (a: Look, b: Look) => JSON.stringify({ ...DEFAULT_LOOK, ...a }) === JSON.stringify({ ...DEFAULT_LOOK, ...b });

const TemplatesPicker: React.FC<{ look: Look; onPick: (l: Look) => void }> = ({ look, onPick }) => {
  const { mine, add, remove } = useLookTemplates();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);
  const [done, setDone] = useState(false);
  const chip = (t: LookTemplate) => {
    const active = sameLook(look, t.look);
    const dot = t.look.border === 'neon' || t.look.border === 'solid' ? t.look.borderColor : t.look.num ?? '#a1a1aa';
    return (
      <span key={t.id} className={`group inline-flex items-center rounded-lg border text-[11px] font-semibold ${active ? 'border-sky-400 bg-sky-500/15 text-sky-200' : 'border-white/10 text-zinc-300 hover:bg-white/[0.06]'}`}>
        <button type="button" onClick={() => onPick(t.look)} className="inline-flex items-center gap-1.5 py-1 pl-2 pr-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot, boxShadow: t.look.border === 'neon' ? `0 0 6px ${dot}` : undefined }} />
          {t.name}
        </button>
        {!t.builtIn && (
          <button type="button" onClick={() => remove(t.id)} aria-label={`Borrar plantilla ${t.name}`} title="Borrar plantilla" className="-ml-1 pr-1.5 text-zinc-500 hover:text-rose-300">
            ×
          </button>
        )}
      </span>
    );
  };
  const saveTemplate = () => {
    const n = name.trim();
    if (!n) return;
    add(n.slice(0, 30), look);
    setName('');
    setNaming(false);
  };
  return (
    <div className="space-y-2">
      <span className="font-semibold">Plantillas</span>
      <div className="flex flex-wrap gap-1.5">
        {BUILT_IN_TEMPLATES.map(chip)}
        {mine.map(chip)}
      </div>
      {naming ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTemplate();
              if (e.key === 'Escape') setNaming(false);
            }}
            placeholder="Nombre de la plantilla"
            maxLength={30}
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/[0.04] px-2 py-1 text-[11px] text-white placeholder:text-zinc-500 focus:border-sky-400 focus:outline-none"
          />
          <button type="button" onClick={saveTemplate} disabled={!name.trim()} className="rounded-lg bg-sky-500 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40">
            Guardar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" onClick={() => setNaming(true)} className="text-[11px] font-semibold text-sky-300 hover:text-sky-200">
            + Guardar como plantilla
          </button>
          {confirmAll ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-300">
              ¿Aplicar a todas?
              <button
                type="button"
                onClick={() => {
                  applyLookToAll(look);
                  setConfirmAll(false);
                  setDone(true);
                  setTimeout(() => setDone(false), 2000);
                }}
                className="font-semibold text-emerald-300 hover:text-emerald-200"
              >
                Sí
              </button>
              <button type="button" onClick={() => setConfirmAll(false)} className="font-semibold text-zinc-400 hover:text-white">
                No
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmAll(true)} className="text-[11px] font-semibold text-sky-300 hover:text-sky-200">
              {done ? '✓ Aplicado a todas' : 'Aplicar a todas las secciones'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ── Order of the sections (parent) ─────────────────────────────────────────
type OrderApi = { position: (id: string) => number; count: number; move: (id: string, dir: -1 | 1) => void };
const OrderCtx = createContext<OrderApi | null>(null);

/** Renders `blocks` in the saved order and lets each Section move itself. */
export const SectionOrder: React.FC<{ storageKey: string; ids: string[]; blocks: Record<string, React.ReactNode> }> = ({ storageKey, ids, blocks }) => {
  const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => {
    try {
      setSaved(JSON.parse(localStorage.getItem(storageKey) || '[]'));
    } catch {
      /* ignore */
    }
  }, [storageKey]);
  // Saved order; a new section goes right after its neighbour in the default order.
  const order = saved.filter((k) => ids.includes(k));
  ids.forEach((k, i) => {
    if (order.includes(k)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const p = order.indexOf(ids[j]);
      if (p >= 0) {
        at = p + 1;
        break;
      }
    }
    order.splice(at, 0, k);
  });
  const api: OrderApi = {
    position: (id) => order.indexOf(id),
    count: order.length,
    move: (id, dir) => {
      const i = order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return;
      const next = [...order];
      [next[i], next[j]] = [next[j], next[i]];
      setSaved(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      // Keep the moved section in view.
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' }));
    },
  };
  return (
    <OrderCtx.Provider value={api}>
      {order.map((k) => (
        <React.Fragment key={k}>{blocks[k]}</React.Fragment>
      ))}
    </OrderCtx.Provider>
  );
};

// ── Look ───────────────────────────────────────────────────────────────────
const BG_SWATCHES = ['#16191f', '#0f172a', '#111827', '#1e1b4b', '#3b0764', '#172554', '#052e16', '#422006', '#450a0a', '#f4f4f5', '#e0f2fe', '#fef3c7'];
const COLOR_SWATCHES = ['#ffffff', '#e4e4e7', '#38bdf8', '#409ffe', '#34d399', '#a3e635', '#facc15', '#fb923c', '#f87171', '#f472b6', '#a78bfa', '#18181b'];

/** Text-shadow for neon numbers at a given intensity (0–100). */
const numNeon = (v: number | undefined) => {
  const k = glowK(v);
  if (k === 0) return 'text-shadow:none!important';
  const c = (pct: number) => `color-mix(in srgb, currentColor ${Math.min(100, Math.round(pct * k))}%, transparent)`;
  return `text-shadow:0 0 1px ${c(100)},0 0 ${Math.round(8 * (0.5 + k / 2))}px ${c(90)},0 0 ${Math.round(18 * (0.5 + k / 2))}px ${c(70)}!important`;
};

/** Neon intensity 0–100 → multiplier (50 = 1, the original look). */
const glowK = (v: number | undefined) => Math.max(0, Math.min(100, v ?? 50)) / 50;

const hexA = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const GLASS_CLS =
  'border border-white/[0.13] bg-[linear-gradient(145deg,rgba(255,255,255,0.09)_0%,rgba(255,255,255,0.025)_38%,rgba(255,255,255,0.015)_70%,rgba(255,255,255,0.05)_100%),linear-gradient(160deg,rgba(20,29,46,0.58),rgba(10,14,22,0.68))] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-[48px]';
const SOLID_CLS = 'border border-white/[0.1] bg-[#16191f] shadow-[0_24px_50px_-30px_rgba(0,0,0,0.9)]';

/** Perceived lightness 0…1 of a #hex color. */
const lightness = (hex: string) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

/** Lightness of what's behind the section: the chosen color, else the app theme's page. */
const bgLightness = (look: Look) => (look.bg ? lightness(look.bg) : typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 0.95 : 0.1);
/** The chosen number color is too close to the background to read. */
const numContrastLow = (look: Look) => !!look.num && Math.abs(lightness(look.num) - bgLightness(look)) < 0.35;

function lookStyle(look: Look, solidDefault: boolean): { className: string; style: React.CSSProperties } {
  const mode = look.mode ?? (solidDefault ? 'solid' : 'glass');
  const custom = look.bg || look.mode || look.border !== 'default';
  if (!custom) return { className: mode === 'solid' ? SOLID_CLS : GLASS_CLS, style: {} };
  const style: React.CSSProperties = {};
  let className = '';
  if (look.bg) {
    // Text follows the chosen background, whatever the app theme is.
    // Base text too: cells without their own color inherit it (in the light theme
    // the page's ink is dark, which vanished on a dark custom background).
    const light = lightness(look.bg) > 0.6;
    className += light ? ' mf-ink-light' : ' theme-fixed';
    style.color = light ? '#0f1115' : '#f4f4f5';
    if (mode === 'solid') style.background = look.bg;
    else {
      style.background = `linear-gradient(145deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02) 40%,rgba(255,255,255,0.04)),linear-gradient(160deg,${hexA(look.bg, 0.62)},${hexA(look.bg, 0.78)})`;
      className += ' backdrop-blur-[48px]';
    }
  } else className += mode === 'solid' ? ' bg-[#16191f]' : ' bg-[linear-gradient(145deg,rgba(255,255,255,0.09)_0%,rgba(255,255,255,0.025)_38%,rgba(255,255,255,0.015)_70%,rgba(255,255,255,0.05)_100%),linear-gradient(160deg,rgba(20,29,46,0.58),rgba(10,14,22,0.68))] backdrop-blur-[48px]';
  if (look.border === 'none') style.border = '1px solid transparent';
  else if (look.border === 'solid') style.border = `2px solid ${look.borderColor}`;
  else if (look.border === 'neon') {
    style.border = `1px solid ${look.borderColor}`;
    const k = glowK(look.borderGlow);
    const a = (x: number) => hexA(look.borderColor, Math.min(1, x * k));
    style.boxShadow = `0 0 0 1px ${a(0.35)}, 0 0 ${Math.round(22 * (0.5 + k / 2))}px ${a(0.45)}, inset 0 0 ${Math.round(18 * (0.5 + k / 2))}px ${a(0.12)}`;
  } else className += ' border border-white/[0.12]';
  return { className, style };
}

const Swatches: React.FC<{ colors: string[]; value: string | null; onPick: (c: string | null) => void; auto?: string }> = ({ colors, value, onPick, auto }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    {auto && (
      <button type="button" onClick={() => onPick(null)} className={`h-6 rounded-md border px-1.5 text-[10px] font-semibold ${value === null ? 'border-sky-400 text-sky-300' : 'border-white/15 text-zinc-400 hover:text-white'}`}>
        {auto}
      </button>
    )}
    {colors.map((c) => (
      <button key={c} type="button" onClick={() => onPick(c)} aria-label={c} style={{ background: c }} className={`h-6 w-6 rounded-md border ${value?.toLowerCase() === c ? 'border-sky-400 ring-2 ring-sky-400/50' : 'border-white/20'}`} />
    ))}
    <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-md border border-dashed border-white/30 text-center text-[13px] leading-6 text-zinc-400" title="Otro color">
      +
      <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={value ?? '#38bdf8'} onChange={(e) => onPick(e.target.value)} />
    </label>
  </div>
);

const Seg = <T extends string>({ options, value, onPick }: { options: [T, string][]; value: T; onPick: (v: T) => void }) => (
  <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5 text-[11px] font-semibold">
    {options.map(([v, l]) => (
      <button key={v} type="button" onClick={() => onPick(v)} className={`rounded-md px-2 py-0.5 ${value === v ? 'bg-sky-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
        {l}
      </button>
    ))}
  </div>
);

const GlowSlider: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <label className="flex items-center gap-2 text-[11px] text-zinc-400">
    <span className="w-16 shrink-0">Intensidad</span>
    <input type="range" min={0} max={100} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-1 w-full cursor-pointer accent-sky-400" aria-label="Intensidad del neón" />
    <span className="w-8 shrink-0 text-right tabular-nums text-zinc-300">{value}%</span>
  </label>
);

/** Background / number color / border controls (used inside the table settings menu). */
const LookControls: React.FC<{ look: Look; solidDefault: boolean; onChange: (l: Look) => void }> = ({ look, solidDefault, onChange }) => {
  const set = (p: Partial<Look>) => onChange({ ...look, ...p });
  return (
    <div className="space-y-3">
      <TemplatesPicker look={look} onPick={onChange} />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold">Fondo</span>
          <Seg options={[['glass', 'Vidrio'], ['solid', 'Sólido']]} value={look.mode ?? (solidDefault ? 'solid' : 'glass')} onPick={(v) => set({ mode: v })} />
        </div>
        <Swatches colors={BG_SWATCHES} value={look.bg} onPick={(c) => set({ bg: c })} auto="Original" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="whitespace-nowrap font-semibold">Números</span>
          <Seg options={[['default', 'Sutil'], ['none', 'Sin'], ['solid', 'Sólido'], ['neon', 'Neón']]} value={look.numStyle} onPick={(v) => set({ numStyle: v })} />
        </div>
        <Swatches colors={COLOR_SWATCHES} value={look.num} onPick={(c) => set({ num: c })} auto="Original" />
        {look.numStyle === 'neon' && <GlowSlider value={look.numGlow} onChange={(v) => set({ numGlow: v })} />}
        {numContrastLow(look) && <p className="text-[11px] text-amber-300">Ese color casi no se ve sobre este fondo: le agrego un contorno para que se lea. Mejor elige uno más contrastado.</p>}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">Borde</span>
          <Seg options={[['default', 'Sutil'], ['none', 'Sin'], ['solid', 'Sólido'], ['neon', 'Neón']]} value={look.border} onPick={(v) => set({ border: v })} />
        </div>
        {(look.border === 'solid' || look.border === 'neon') && <Swatches colors={COLOR_SWATCHES} value={look.borderColor} onPick={(c) => set({ borderColor: c ?? '#38bdf8' })} />}
        {look.border === 'neon' && <GlowSlider value={look.borderGlow} onChange={(v) => set({ borderGlow: v })} />}
      </div>
      <button type="button" onClick={() => onChange(DEFAULT_LOOK)} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-300 hover:text-sky-200">
        <RotateCcw className="h-3 w-3" /> Restablecer apariencia
      </button>
    </div>
  );
};

/** Floating menu anchored under a button, rendered in a portal (glass sections trap fixed overlays). */
export const FloatingPanel: React.FC<{ anchor: DOMRect; width?: number; onClose: () => void; children: React.ReactNode }> = ({ anchor, width = 300, onClose, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
  const below = window.innerHeight - anchor.bottom - 16;
  const maxH = Math.max(240, below > 320 ? below : window.innerHeight - 32);
  const top = below > 320 ? anchor.bottom + 6 : Math.max(16, window.innerHeight - maxH - 16);
  return createPortal(
    <>
      <div className="fixed inset-0 z-[80]" onClick={onClose} />
      <div style={{ top, left, width, maxHeight: maxH }} className="mf-noscroll fixed z-[81] overflow-y-auto rounded-2xl border border-white/10 bg-[#151922] p-3 text-xs text-zinc-300 shadow-2xl">
        {children}
      </div>
    </>,
    document.body,
  );
};

/** Right-click menu with "Cambiar nombre" (and optional extra items), at the cursor. */
export type NameMenuItem = { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean };
export const NameMenu: React.FC<{ x: number; y: number; items: NameMenuItem[]; onClose: () => void }> = ({ x, y, items, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const w = 200;
  const left = Math.max(8, Math.min(x, window.innerWidth - w - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - 40 * items.length - 16));
  return createPortal(
    <>
      <div className="fixed inset-0 z-[90]" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div role="menu" style={{ left, top, width: w }} className="fixed z-[91] rounded-xl border border-white/10 bg-[#151922] p-1.5 text-xs shadow-2xl" onContextMenu={(e) => e.preventDefault()}>
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              it.onClick();
            }}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.06] ${it.danger ? 'text-rose-300' : 'text-zinc-200'}`}
          >
            {it.icon ?? <Pencil className="h-3.5 w-3.5" />} {it.label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
};

/** Inline name field: Enter / blur saves, Esc cancels. */
export const NameInput: React.FC<{ value: string; onSave: (v: string) => void; onCancel: () => void; className?: string }> = ({ value, onSave, onCancel, className }) => (
  <input
    autoFocus
    defaultValue={value}
    onFocus={(e) => e.currentTarget.select()}
    onBlur={(e) => onSave(e.target.value.trim())}
    onKeyDown={(e) => {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }}
    className={className ?? 'w-full max-w-md rounded-lg border border-sky-500 bg-zinc-900 px-2 py-1 text-white focus:outline-none'}
  />
);

// ── Section ────────────────────────────────────────────────────────────────
const FOLDS: [Fold, string][] = [
  ['title', 'Solo título'],
  ['half', 'A la mitad'],
  ['full', 'Completa'],
];
const FoldIcon: React.FC<{ f: Fold }> = ({ f }) => (
  <span className="flex h-3.5 w-3.5 flex-col justify-start gap-[2px]">
    <i className="h-[3px] rounded-sm bg-current" />
    <i className={`h-[3px] rounded-sm bg-current ${f === 'title' ? 'opacity-20' : ''}`} />
    <i className={`h-[3px] rounded-sm bg-current ${f === 'full' ? '' : 'opacity-20'}`} />
  </span>
);

/** What a table inside a section needs to show the section's settings in its own menu. */
export type SectionApi = {
  title: string;
  canUp: boolean;
  canDown: boolean;
  move: ((dir: -1 | 1) => void) | null;
  fold: Fold;
  setFold: (f: Fold) => void;
  look: Look;
  setLook: (l: Look) => void;
  solidDefault: boolean;
};
export const SectionCtx = createContext<SectionApi | null>(null);

/** Mover · Tamaño · Apariencia of a section (inside a settings menu). */
export const SectionSettings: React.FC<{ api: SectionApi; only?: ('move' | 'fold' | 'look')[] }> = ({ api, only = ['move', 'fold', 'look'] }) => {
  const btn = 'inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] font-semibold text-zinc-300 hover:bg-white/[0.06] disabled:opacity-30';
  return (
    <div className="space-y-3">
      {api.move && only.includes('move') && (
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">Mover sección</span>
          <div className="flex gap-1">
            <button type="button" className={btn} disabled={!api.canUp} onClick={() => api.move?.(-1)}>
              <ChevronUp className="h-3.5 w-3.5" /> Subir
            </button>
            <button type="button" className={btn} disabled={!api.canDown} onClick={() => api.move?.(1)}>
              <ChevronDown className="h-3.5 w-3.5" /> Bajar
            </button>
          </div>
        </div>
      )}
      {only.includes('fold') && (
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Tamaño</span>
        <div className="flex gap-1">
          {FOLDS.map(([f, l]) => (
            <button key={f} type="button" onClick={() => api.setFold(f)} title={l} className={`${btn} ${api.fold === f ? 'border-sky-400 text-sky-300' : ''}`}>
              <FoldIcon f={f} /> {l === 'Solo título' ? 'Título' : l === 'A la mitad' ? 'Mitad' : 'Completa'}
            </button>
          ))}
        </div>
      </div>
      )}
      {only.includes('look') && <LookControls look={api.look} solidDefault={api.solidDefault} onChange={api.setLook} />}
    </div>
  );
};

export const Section: React.FC<{ n: number; title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; id?: string; solid?: boolean; /** Replaces the number and the title (a database shows its icon and editable name). */ head?: React.ReactNode; /** How it starts until the person changes it. */ defaultFold?: Fold }> = ({ n, title: baseTitle, description, actions, children, id, solid, head, defaultFold }) => {
  const canEdit = useContext(CanEditCtx); // team members whose role can't change this section: no action buttons
  const order = useContext(OrderCtx);
  const [prefs, save] = useSectionPrefs(id, defaultFold);
  const [panel, setPanel] = useState<DOMRect | null>(null);
  // Right-click on the title → "Cambiar nombre" (Moisés, 2026-10-18). Saved per browser like the rest of the section.
  const [nameMenu, setNameMenu] = useState<{ x: number; y: number } | null>(null);
  const [naming, setNaming] = useState(false);
  const title = prefs.name || baseTitle;
  const pos = id && order ? order.position(id) : -1;
  const num = pos >= 0 ? pos + 1 : n;
  const { className, style } = lookStyle(prefs.look, !!solid);
  // Number color reaches every amount (.mf-num) and number cell (.font-mono). If it
  // would barely show on this background, it gets a contrasting halo so it stays readable.
  const numLow = numContrastLow(prefs.look);
  const halo = numLow ? (lightness(prefs.look.num!) < 0.5 ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)') : null;
  // (numNeon: intensity scales both the glow size and its opacity; 50 = the original.)
  // Number style (same options as the border): Sutil = as designed · Sin = no glow ·
  // Sólido = bold · Neón = glow in the numbers' own color.
  const ns = prefs.look.numStyle;
  const numDecl = [
    prefs.look.num ? `color:${prefs.look.num}!important` : '',
    ns === 'neon'
      ? numNeon(prefs.look.numGlow)
      : ns === 'none'
        ? 'text-shadow:none!important'
        : halo
          ? `text-shadow:0 0 1px ${halo},0 0 1px ${halo},0 0 6px ${halo}`
          : '',
    ns === 'solid' ? 'font-weight:800!important' : '',
  ].filter(Boolean).join(';');
  const css = id && numDecl ? `#${id} :is(.font-mono,.mf-num){${numDecl}}` : '';
  const api: SectionApi | null = id
    ? {
        title,
        canUp: pos > 0,
        canDown: !!order && pos < order.count - 1,
        move: order ? (dir) => order.move(id, dir) : null,
        fold: prefs.fold,
        setFold: (fold) => save({ ...prefs, fold }),
        look: prefs.look,
        setLook: (look) => save({ ...prefs, look }),
        solidDefault: !!solid,
      }
    : null;

  return (
    <section id={id} style={style} className={`relative scroll-mt-24 rounded-3xl p-5 sm:p-6 ${className}`}>
      {css && <style>{css}</style>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-white sm:text-2xl">
            {head ? head : <>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sm font-black text-sky-300">{num}</span>
            {naming ? (
              <NameInput
                value={title}
                onSave={(v) => {
                  save({ ...prefs, name: v && v !== baseTitle ? v : null });
                  setNaming(false);
                }}
                onCancel={() => setNaming(false)}
                className="min-w-0 flex-1 rounded-lg border border-sky-500 bg-zinc-900 px-2 py-0.5 text-xl font-bold text-white focus:outline-none sm:text-2xl"
              />
            ) : (
              <span
                onContextMenu={(e) => {
                  if (!id) return;
                  e.preventDefault();
                  setNameMenu({ x: e.clientX, y: e.clientY });
                }}
                onDoubleClick={() => id && setNaming(true)}
                title={id ? 'Clic derecho o doble clic para cambiar el nombre' : undefined}
              >
                {title}
              </span>
            )}
            </>}
          </h2>
          {prefs.fold !== 'title' && description && <p className="mt-1 text-sm text-zinc-400">{description}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {prefs.fold !== 'title' && canEdit && actions}
          {/* Folded to its title the tables (and their menus) are hidden: the settings live here then. */}
          {api && prefs.fold === 'title' && (
            <button type="button" onClick={(e) => setPanel(panel ? null : e.currentTarget.getBoundingClientRect())} title="Configuración" aria-label="Configuración" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.08] hover:text-white">
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {prefs.fold !== 'title' && (
        <SectionCtx.Provider value={api}>
          <div className={`mt-5 ${prefs.fold === 'half' ? 'mf-noscroll max-h-[440px] overflow-y-auto overscroll-contain' : ''}`}>{children}</div>
        </SectionCtx.Provider>
      )}
      {nameMenu && (
        <NameMenu
          x={nameMenu.x}
          y={nameMenu.y}
          onClose={() => setNameMenu(null)}
          items={[
            { label: 'Cambiar nombre', onClick: () => setNaming(true) },
            ...(prefs.name ? [{ label: `Volver a “${baseTitle}”`, icon: <RotateCcw className="h-3.5 w-3.5" />, onClick: () => save({ ...prefs, name: null }) }] : []),
          ]}
        />
      )}
      {panel && api && (
        <FloatingPanel anchor={panel} onClose={() => setPanel(null)}>
          <p className="mb-3 text-sm font-bold text-white">Configuración de la sección</p>
          <SectionSettings api={api} />
        </FloatingPanel>
      )}
    </section>
  );
};
