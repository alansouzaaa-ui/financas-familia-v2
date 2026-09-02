// api/lib/auth.ts — server-only, no VITE_ secrets

const enc = new TextEncoder()

function toBase64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function sign(payloadB64: string, secret: string): Promise<string> {
  const key = await importKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64))
  return toBase64url(new Uint8Array(sig))
}

async function verify(payloadB64: string, sigB64: string, secret: string): Promise<boolean> {
  const key = await importKey(secret)
  try {
    return await crypto.subtle.verify('HMAC', key, fromBase64url(sigB64) as BufferSource, enc.encode(payloadB64))
  } catch {
    return false
  }
}

function encodePayload<T>(value: T): string {
  return toBase64url(enc.encode(JSON.stringify(value)))
}

function decodePayload<T>(b64: string): T {
  const bytes = fromBase64url(b64)
  return JSON.parse(new TextDecoder().decode(bytes)) as T
}

// --- Session ---

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function createSession(secret: string, now: number): Promise<string> {
  const payload = encodePayload({ exp: now + SESSION_TTL_MS })
  const sig = await sign(payload, secret)
  return `${payload}.${sig}`
}

export async function verifySession(token: string, secret: string, now: number): Promise<boolean> {
  const dot = token.lastIndexOf('.')
  if (dot < 0) return false
  const payloadB64 = token.slice(0, dot)
  const sigB64 = token.slice(dot + 1)
  if (!(await verify(payloadB64, sigB64, secret))) return false
  try {
    const { exp } = decodePayload<{ exp: number }>(payloadB64)
    return now < exp
  } catch {
    return false
  }
}

export function getSessionCookie(token: string, _now?: number): string {
  return `ff_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`
}

// --- Arbitrary payload ---

export async function signPayload<T>(value: T, secret: string): Promise<string> {
  const payload = encodePayload(value)
  const sig = await sign(payload, secret)
  return `${payload}.${sig}`
}

export async function verifyPayload<T>(token: string, secret: string): Promise<T | null> {
  const dot = token.lastIndexOf('.')
  if (dot < 0) return null
  const payloadB64 = token.slice(0, dot)
  const sigB64 = token.slice(dot + 1)
  if (!(await verify(payloadB64, sigB64, secret))) return null
  try {
    return decodePayload<T>(payloadB64)
  } catch {
    return null
  }
}
