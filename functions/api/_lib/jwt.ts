/** 基於 Web Crypto 的 HMAC-SHA256 JWT（Workers 環境無 jsonwebtoken 依賴） */

export interface AuthPayload {
  uid: number
  username: string
}

/** JWT 簽名密鑰（生產環境必須在 Pages Settings 中配置 JWT_SECRET） */
export function jwtSecret(env: { JWT_SECRET?: string }): string {
  return env.JWT_SECRET ?? 'blog-dev-secret-change-me'
}

const DAY_SECONDS = 60 * 60 * 24
const TOKEN_TTL_SECONDS = 7 * DAY_SECONDS
const enc = new TextEncoder()

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function base64UrlJson(value: unknown): string {
  return base64UrlEncodeBytes(enc.encode(JSON.stringify(value)))
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

async function signData(data: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data))
  return base64UrlEncodeBytes(new Uint8Array(signature))
}

export async function signToken(payload: AuthPayload, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' })
  const body = base64UrlJson({ ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS })
  const unsigned = `${header}.${body}`
  return `${unsigned}.${await signData(unsigned, secret)}`
}

export async function verifyToken(token: string, secret: string): Promise<AuthPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  let expected: string
  try {
    expected = await signData(`${parts[0]}.${parts[1]}`, secret)
  } catch {
    return null
  }
  if (expected !== parts[2]) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as Partial<AuthPayload> & {
      exp?: unknown
    }
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null
    if (typeof payload.uid !== 'number' || typeof payload.username !== 'string') return null
    return { uid: payload.uid, username: payload.username }
  } catch {
    return null
  }
}
