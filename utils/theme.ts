/**
 * Appearance (Configuración → Apariencia, Emanuel 2026-10-15): 'system'
 * follows the OS (default), or force 'light' / 'dark'. Stored per browser in
 * localStorage `mf-theme` and applied as <html data-theme="light|dark">; the
 * inline script in app/layout.tsx applies it before the first paint (no dark
 * flash). The colors themselves live in the LIGHT THEME block of globals.css.
 */
export type ThemePref = 'system' | 'light' | 'dark';

export const THEME_KEY = 'mf-theme';

/** Same logic as THEME_BOOT_SCRIPT, for runtime changes. */
export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function loadThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
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
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');var l=t==='light'||(t!=='dark'&&window.matchMedia('(prefers-color-scheme: light)').matches);document.documentElement.dataset.theme=l?'light':'dark';}catch(e){document.documentElement.dataset.theme='dark';}})();`;
