/**
 * Appearance (Configuración → Apariencia, Emanuel 2026-10-15): 'system'
 * follows the OS (default), or force 'light' / 'dark'. Stored per browser in
 * localStorage `mf-theme` and applied as <html data-theme="light|dark">; the
 * inline script in app/layout.tsx applies it before the first paint (no dark
 * flash). The colors themselves live in the LIGHT THEME block of globals.css.
 */
import { isNightNow } from '@/utils/appClock';

export type ThemePref = 'system' | 'light' | 'dark' | 'hora';

export const THEME_KEY = 'mf-theme';

/** Same logic as THEME_BOOT_SCRIPT, for runtime changes. */
export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  // «Según la hora» (Emanuel, 2026-11-05): mañana y tarde claro; noche y madrugada oscuro (hora de la app + Partes del día).
  if (pref === 'hora') return isNightNow() ? 'dark' : 'light';
  if (pref !== 'system') return pref;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function loadThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' || v === 'hora' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(pref: ThemePref) {
  document.documentElement.dataset.theme = resolveTheme(pref);
}

export function saveThemePref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* private mode — applies for this visit only */
  }
  applyTheme(pref);
}

/** Runs in <head> before paint. Keep in sync with resolveTheme. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');var l;if(t==='hora'){var c=JSON.parse(localStorage.getItem('organiza-app-clock')||'null');var d=new Date();if(c&&c.mode==='manual'){var s=new Date(c.date+'T'+c.time+':00').getTime();if(isFinite(s))d=new Date(s+(Date.now()-c.setAt));}var p=JSON.parse(localStorage.getItem('organiza-day-parts')||'{}');var f=function(x){return Number(x.slice(0,2))*60+Number(x.slice(3,5));};var n=d.getHours()*60+d.getMinutes();l=!(n<f(p.manana||'06:00')||n>=f(p.noche||'19:00'));}else{l=t==='light'||(t!=='dark'&&window.matchMedia('(prefers-color-scheme: light)').matches);}document.documentElement.dataset.theme=l?'light':'dark';}catch(e){document.documentElement.dataset.theme='dark';}})();`;
