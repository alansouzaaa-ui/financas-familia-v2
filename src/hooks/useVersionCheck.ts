import { useEffect } from 'react'

// Auto-update: compara o build em execução (__BUILD_ID__, injetado no bundle) com
// o /version.json do servidor. Se houver versão nova, recarrega numa URL com
// cache-buster (?v=<id>) — que escapa de um index.html preso no cache do navegador.
// Guarda por sessão para nunca entrar em loop de reload.
export function useVersionCheck() {
  useEffect(() => {
    async function check() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as { id?: string }
        const serverId = data?.id
        if (!serverId || typeof __BUILD_ID__ === 'undefined' || serverId === __BUILD_ID__) return

        const KEY = 'ff_reloaded_for'
        if (sessionStorage.getItem(KEY) === serverId) return // já recarregamos p/ esta versão
        sessionStorage.setItem(KEY, serverId)

        // URL nova (query diferente) → navegador busca HTML fresco, ignorando o cache.
        location.replace(`${location.pathname}?v=${encodeURIComponent(serverId)}${location.hash}`)
      } catch { /* offline / sem version.json → ignora */ }
    }

    check()
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
}
