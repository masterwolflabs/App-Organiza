/**
 * Interface preferences from Configuración (per browser, localStorage
 * `mf-ui-prefs`): purely how the app behaves on this device, nothing that
 * needs to sync or be read back by the server.
 */
export interface UiPrefs {
  /** Topbar hides while scrolling down (utils/useEdgeReveal.ts). */
  autoHideHeader: boolean;
  /** Resting the mouse on the left edge opens the sidebar. */
  edgeSidebar: boolean;
}

export const DEFAULT_UI_PREFS: UiPrefs = { autoHideHeader: true, edgeSidebar: true };
const KEY = 'mf-ui-prefs';

export function loadUiPrefs(): UiPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      autoHideHeader: typeof raw.autoHideHeader === 'boolean' ? raw.autoHideHeader : DEFAULT_UI_PREFS.autoHideHeader,
      edgeSidebar: typeof raw.edgeSidebar === 'boolean' ? raw.edgeSidebar : DEFAULT_UI_PREFS.edgeSidebar,
    };
  } catch {
    return DEFAULT_UI_PREFS;
  }
}

export function saveUiPrefs(p: UiPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode — the change still applies for this visit */
  }
}

/** The guided tour's voice switch (same key GuidedTour reads). */
export const TOUR_VOICE_KEY = 'mf-tour-voice';
