import 'server-only'
import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'
import { isPasswordHash, isSessionSecret, SESSION_LIFETIME, signSession, verifyPassword, verifySession } from './credentials'
import { clearLoginAttempts, consumeLoginAttempt } from './login-throttle'
import { reportDatabaseError } from './db'

export const SESSION_COOKIE = 'kill-switch-admin'

function getConfig() {
  const username = process.env.ADMIN_USERNAME?.trim()
  const passwordHash = process.env.ADMIN_PASSWORD_HASH ?? ''
  const secret = process.env.SESSION_SECRET ?? ''
  if (!username || !isPasswordHash(passwordHash) || !isSessionSecret(secret)) return null
  const fingerprint = createHash('sha256').update(username + '\0' + passwordHash).digest('hex')
  return { username, passwordHash, secret, fingerprint }
}

export async function authenticate(username: unknown, password: unknown): Promise<boolean> {
  const config = getConfig()
  if (!config || typeof username !== 'string' || username.length > 120 || typeof password !== 'string' || password.length > 1024) return false
  try {
    if (!await consumeLoginAttempt()) return false
    const validPassword = await verifyPassword(password, config.passwordHash)
    if (username !== config.username || !validPassword) return false
    await clearLoginAttempts()
    const cookieJar = await cookies()
    cookieJar.set(SESSION_COOKIE, signSession(Date.now(), config.secret, config.fingerprint), {
      httpOnly: true, sameSite: 'strict', path: '/', maxAge: SESSION_LIFETIME / 1000, secure: process.env.NODE_ENV === 'production',
    })
    return true
  } catch (error) {
    reportDatabaseError('admin-login', error)
    return false
  }
}

export async function isAdmin(): Promise<boolean> {
  const config = getConfig()
  if (!config) return false
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  return Boolean(token && verifySession(token, Date.now(), config.secret, config.fingerprint))
}

export async function requireAdmin(): Promise<void> {
  if (!await isAdmin()) throw new Error('Unauthorized')
}
