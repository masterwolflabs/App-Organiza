/**
 * Notificación del navegador para los avisos del Horario (Emanuel, 2026-11-10: «que en el navegador salga
 * la notificación»). Pide permiso solo cuando tú tocas algo (Aviso/Alarma, un sonido, el botón Activar):
 * los navegadores bloquean el pedido si no viene de un toque. Se muestra con el service worker (funciona
 * también en Android) y si no, con `new Notification`. Misma `tag` que el push del servidor: no se duplica.
 */
export type NotifState = 'granted' | 'denied' | 'default' | 'unsupported';

export const notifState = (): NotifState => (typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported');

/** Llamar dentro de un clic. Devuelve el estado final. */
export async function askNotifications(): Promise<NotifState> {
  const s = notifState();
  if (s !== 'default') return s;
  try {
    return await Notification.requestPermission();
  } catch {
    return notifState();
  }
}

async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  } catch {
    return null;
  }
}

export async function notify(title: string, body: string, alarm = false) {
  if (notifState() !== 'granted') return;
  const opts: NotificationOptions = { body, icon: '/icon-192.png', badge: '/icon-192.png', tag: title, requireInteraction: alarm };
  const reg = await registration();
  if (reg) {
    try {
      await reg.showNotification(title, opts);
      return;
    } catch {
      /* sigue abajo */
    }
  }
  try {
    new Notification(title, opts);
  } catch {
    /* sin notificaciones */
  }
}
