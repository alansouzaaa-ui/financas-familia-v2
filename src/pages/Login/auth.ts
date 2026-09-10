// Login auth utilities
export async function clearSession(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store' })
  } catch { /* ignore */ }
}

export async function checkSession(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/session', { method: 'GET', credentials: 'same-origin', cache: 'no-store' })
    if (!res.ok) return false
    const data = await res.json() as { authenticated: boolean }
    return data.authenticated === true
  } catch {
    return false
  }
}
