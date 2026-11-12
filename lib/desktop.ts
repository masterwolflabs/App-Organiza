/**
 * Organiza para Mac (Tauri, carpeta desktop/): cuando la página corre DENTRO de la app de Mac, le pide
 * lo propio del Mac — aviso nativo, ventana al frente, modo focus encima de todo. En el navegador no hace nada.
 */
type TauriGlobal = { core?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } };
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
};
