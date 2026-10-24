/** 密碼散列：Workers 環境用 Web Crypto 的 PBKDF2 取代 bcrypt（bcrypt 的 CPU 開銷會超出 Free 計劃限制） */

const PBKDF2_ITERATIONS = 100_000
const KEY_BITS = 256
const SALT_BYTES = 16
const enc = new TextEncoder()

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

/** 輸出格式：pbkdf2$iterations$salt$hash（Base64） */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const derived = await deriveBits(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (!Number.isFinite(iterations) || iterations <= 0) return false
  try {
    const salt = fromBase64(parts[2])
    const expected = fromBase64(parts[3])
    const derived = await deriveBits(password, salt, iterations)
    if (expected.length !== derived.length) return false
    let diff = 0
    for (let i = 0; i < derived.length; i++) diff |= expected[i] ^ derived[i]
    return diff === 0
  } catch {
    return false
  }
}
