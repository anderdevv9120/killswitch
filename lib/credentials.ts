import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

export const SESSION_LIFETIME = 8 * 60 * 60 * 1000

export function isPasswordHash(value: string): boolean {
  return /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(value)
}

export function isSessionSecret(value: string): boolean {
  const bytes = Buffer.from(value, 'base64')
  return bytes.length >= 32 && bytes.toString('base64') === value
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 1024) throw new Error('Use a password between 12 and 1024 characters.')
  const salt = randomBytes(16)
  const key = await deriveKey(password, salt)
  return 'scrypt$' + salt.toString('hex') + '$' + key.toString('hex')
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (password.length > 1024 || !isPasswordHash(storedHash)) return false
  const [, salt, expected] = storedHash.split('$')
  return timingSafeEqual(await deriveKey(password, Buffer.from(salt, 'hex')), Buffer.from(expected, 'hex'))
}

export function signSession(now: number, secret: string, fingerprint: string): string {
  if (!isSessionSecret(secret)) throw new Error('Invalid session secret')
  const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_LIFETIME, fingerprint })).toString('base64url')
  const signature = createHmac('sha256', Buffer.from(secret, 'base64')).update(payload).digest('base64url')
  return payload + '.' + signature
}

export function verifySession(token: string, now: number, secret: string, fingerprint: string): boolean {
  if (token.length > 1024 || !isSessionSecret(secret)) return false
  try {
    const parts = token.split('.')
    if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return false
    const [payload, signature] = parts
    const expected = createHmac('sha256', Buffer.from(secret, 'base64')).update(payload).digest('base64url')
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return Number.isSafeInteger(data?.exp) && data.exp > now && data.exp <= now + SESSION_LIFETIME && data.fingerprint === fingerprint
  } catch {
    return false
  }
}
