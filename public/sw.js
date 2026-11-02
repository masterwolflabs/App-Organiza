// Organiza: recibe los avisos con la app cerrada. No guarda páginas en caché.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title || 'Organiza', { body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', requireInteraction: !!d.alarm, tag: d.title }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((l) => (l[0] ? l[0].focus() : self.clients.openWindow('/#checklist'))));
});
