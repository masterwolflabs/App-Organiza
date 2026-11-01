/**
 * Paleta y luces configurables (Configuración → Apariencia). Por navegador,
 * igual que el tema: localStorage `mw-accent` / `mw-lights`, aplicados como
 * <html data-accent="…" data-lights="…"> antes del primer pintado
 * (APPEARANCE_BOOT_SCRIPT en app/layout.tsx). Los colores viven en el bloque
 * "APARIENCIA CONFIGURABLE" al final de app/globals.css.
 */
import { APP } from '@/app.config';

export type AccentId = 'sky' | 'violet' | 'emerald' | 'amber' | 'rose' | 'cyan';
export type LightsId = 'accent' | AccentId | 'off';

export const ACCENTS: { id: AccentId; label: string; swatch: string }[] = [
  { id: 'sky', label: 'Azul cielo', swatch: '#38bdf8' },
  { id: 'violet', label: 'Violeta', swatch: '#a78bfa' },
  { id: 'emerald', label: 'Esmeralda', swatch: '#34d399' },
  { id: 'amber', label: 'Ámbar', swatch: '#fbbf24' },
  { id: 'rose', label: 'Rosa', swatch: '#fb7185' },
  { id: 'cyan', label: 'Cian', swatch: '#22d3ee' },
];

const ACCENT_KEY = 'mw-accent';
const LIGHTS_KEY = 'mw-lights';
const isAccent = (v: unknown): v is AccentId => ACCENTS.some((a) => a.id === v);

export function loadAccent(): AccentId {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    return isAccent(v) ? v : APP.accent;
  } catch {
    return APP.accent;
  }
}

export function loadLights(): LightsId {
  try {
    const v = localStorage.getItem(LIGHTS_KEY);
    return v === 'off' || isAccent(v) ? v : 'accent';
  } catch {
    return 'accent';
  }
}

export function applyAppearance(accent: AccentId, lights: LightsId) {
  const el = document.documentElement;
  if (accent === 'sky') delete el.dataset.accent;
  else el.dataset.accent = accent;
  if (lights === 'accent') delete el.dataset.lights;
  else el.dataset.lights = lights;
}

export function saveAppearance(accent: AccentId, lights: LightsId) {
  try {
    localStorage.setItem(ACCENT_KEY, accent);
    if (lights === 'accent') localStorage.removeItem(LIGHTS_KEY);
    else localStorage.setItem(LIGHTS_KEY, lights);
  } catch {
    /* modo privado: aplica solo en esta visita */
  }
  applyAppearance(accent, lights);
}

/** Corre en <head> antes de pintar. Mantener en sync con loadAccent/loadLights. */
export const APPEARANCE_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;var a=localStorage.getItem('${ACCENT_KEY}')||'${APP.accent}';if(a&&a!=='sky')d.dataset.accent=a;var l=localStorage.getItem('${LIGHTS_KEY}');if(l)d.dataset.lights=l;}catch(e){}})();`;
