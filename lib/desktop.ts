/**
 * Organiza para Mac (Tauri, carpeta desktop/): cuando la página corre DENTRO de la app de Mac, le pide
 * lo propio del Mac — aviso nativo, ventana al frente, modo focus encima de todo. En el navegador no hace nada.
 */
type TauriGlobal = {
  core?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
  event?: { listen: (name: string, cb: (e: { payload: unknown }) => void) => Promise<() => void> };
};
const tauri = (): TauriGlobal | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__);

export const isDesktop = () => !!tauri()?.core;

const call = (cmd: string, args?: Record<string, unknown>) => {
  const t = tauri();
  if (!t?.core) return Promise.resolve(false);
  return t.core.invoke(cmd, args).then(
    () => true,
    () => false,
  );
};

export const desktop = {
  /** Aviso del Mac (sale aunque la ventana esté escondida). */
  notify: (title: string, body: string) => call('notify', { title, body }),
  /** Modo focus: ventana al frente y encima de las demás apps (on) o normal (off). */
  focusMode: (on: boolean) => call('focus_mode', { on }),
  /** Trae la ventana al frente (alarma). */
  front: () => call('bring_to_front'),
  /** 🎵 Canción bloqueada (2026-11-17, app 1.0.3): la abre en una ventana de YouTube escondida. */
  ytOpen: (label: string, video: string, start: number, volume: number) => call('yt_open', { label, video, start, volume }),
  ytCmd: (label: string, action: 'play' | 'pause' | 'seek' | 'volume' | 'mute', value = 0) => call('yt_cmd', { label, action, value }),
  ytShow: (label: string, show: boolean) => call('yt_show', { label, show }),
  ytClose: (label: string) => call('yt_close', { label }),
};

export type YtState = { label: string; t: number; dur: number; state: number };
const ytListeners = new Map<string, (s: YtState) => void>();
let ytListening = false;
/** Escucha lo que cuenta una ventanita de música (dónde va, cuánto dura, si suena). Devuelve cómo dejar de escuchar. */
export function onYtState(label: string, cb: (s: YtState) => void): () => void {
  ytListeners.set(label, cb);
  if (!ytListening && tauri()?.event) {
    ytListening = true;
    tauri()!.event!.listen('yt-state', (e) => {
      const s = e.payload as YtState;
      ytListeners.get(s.label)?.(s);
    });
  }
  return () => ytListeners.delete(label);
}

