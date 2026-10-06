// Kill-switch do service worker legado (PWA/Workbox de uma versão antiga).
// O app atual NÃO registra service worker. Este arquivo existe só para que os
// service workers ainda presos no navegador de usuários antigos, ao checarem
// atualização, peguem este script novo, se autodestruam, limpem os caches e
// recarreguem a página — entregando a versão fresca do servidor.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    } catch (e) { /* noop */ }
    try {
      await self.registration.unregister()
    } catch (e) { /* noop */ }
    try {
      const clients = await self.clients.matchAll({ type: 'window' })
      for (const client of clients) {
        try { client.navigate(client.url) } catch (e) { /* noop */ }
      }
    } catch (e) { /* noop */ }
  })())
})

// Nunca intercepta/serve do cache — tudo vai direto para a rede.
self.addEventListener('fetch', () => {})
