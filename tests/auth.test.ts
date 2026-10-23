import { scryptSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { cookieJar, query, reportDatabaseError } = vi.hoisted(() => ({
  cookieJar: { get: vi.fn(), set: vi.fn(), delete: vi.fn() }, query: vi.fn(), reportDatabaseError: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => cookieJar }))
vi.mock('../lib/db', () => ({ getPool: () => ({ query }), reportDatabaseError }))
import { authenticate, isAdmin, requireAdmin } from '../lib/auth'
import { consumeLoginAttempt } from '../lib/login-throttle'

const salt = Buffer.alloc(16, 2)
const storedHash = 'scrypt$' + salt.toString('hex') + '$' + scryptSync('a-test-password', salt, 64).toString('hex')

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  query.mockReset()
  reportDatabaseError.mockReset()
  cookieJar.get.mockReset()
  cookieJar.set.mockReset()
  cookieJar.delete.mockReset()
  query.mockResolvedValue({ rows: [{ attempts: 1 }], rowCount: 1 })
  vi.stubEnv('ADMIN_USERNAME', 'admin')
  vi.stubEnv('ADMIN_PASSWORD_HASH', storedHash)
  vi.stubEnv('SESSION_SECRET', Buffer.alloc(32, 9).toString('base64'))
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('admin boundary', () => {
  it('rejects missing or invalid cookies and stops unauthorized callers', async () => {
    expect(await isAdmin()).toBe(false)
    await expect(requireAdmin()).rejects.toThrow('Unauthorized')
    cookieJar.get.mockReturnValue({ value: 'forged.cookie' })
    expect(await isAdmin()).toBe(false)
  })
  it.each(['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'SESSION_SECRET'])('denies missing %s configuration', async (key) => {
    vi.stubEnv(key, '')
    expect(await authenticate('admin', 'a-test-password')).toBe(false)
    expect(cookieJar.set).not.toHaveBeenCalled()
    expect(await isAdmin()).toBe(false)
  })
  it('denies malformed password configuration', async () => {
    vi.stubEnv('ADMIN_PASSWORD_HASH', 'plain-text')
    expect(await authenticate('admin', 'a-test-password')).toBe(false)
    expect(cookieJar.set).not.toHaveBeenCalled()
  })
  it.each([
    ['ADMIN_PASSWORD_HASH', storedHash.replaceAll('$', '\\$'), 'passwordHashValid'],
    ['SESSION_SECRET', 'invalid-secret', 'sessionSecretValid'],
  ])('reports invalid %s format without logging its value', async (key, value, flag) => {
    vi.stubEnv(key, value)
    expect(await authenticate('admin', 'a-test-password')).toBe(false)
    const output = vi.mocked(console.error).mock.calls.flat().join(' ')
    expect(output).toContain('[admin-login] Invalid administrator configuration')
    expect(output).toContain('"' + flag + '":false')
    expect(output).not.toContain(value)
    expect(output).not.toContain('a-test-password')
    expect(query).not.toHaveBeenCalled()
  })
  it.each([['admin', 'wrong-password'], ['unknown', 'a-test-password'], ['admin', 'x'.repeat(1025)]])('rejects bad credentials', async (username, password) => {
    expect(await authenticate(username, password)).toBe(false)
    expect(cookieJar.set).not.toHaveBeenCalled()
  })
  it('issues a protected cookie and accepts the resulting session', async () => {
    expect(await authenticate('admin', 'a-test-password')).toBe(true)
    const [name, token, options] = cookieJar.set.mock.calls[0]
    expect(name).toBe('kill-switch-admin')
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'strict', path: '/', maxAge: 28800 })
    expect(options.secure).toBe(process.env.NODE_ENV === 'production')
    expect(token).not.toContain('a-test-password')
    cookieJar.get.mockReturnValue({ value: token })
    expect(await isAdmin()).toBe(true)
    vi.stubEnv('ADMIN_PASSWORD_HASH', '')
    expect(await isAdmin()).toBe(false)
  })
  it('denies login when the throttle is exhausted', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 })
    expect(await authenticate('admin', 'a-test-password')).toBe(false)
    expect(cookieJar.set).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith('[admin-login] Login rate limit reached')
  })
  it('reports credential rejection without logging submitted values', async () => {
    expect(await authenticate('private-username', 'private-password')).toBe(false)
    expect(console.warn).toHaveBeenCalledWith('[admin-login] Credentials do not match')
  })
  it('fails closed on a database outage', async () => {
    const error = new Error('private connection details')
    query.mockRejectedValue(error)
    expect(await authenticate('admin', 'a-test-password')).toBe(false)
    expect(cookieJar.set).not.toHaveBeenCalled()
    expect(reportDatabaseError).toHaveBeenCalledWith('admin-login', error)
  })
})

describe('shared throttle', () => {
  it('uses a single atomic statement and respects its refusal', async () => {
    expect(await consumeLoginAttempt()).toBe(true)
    expect(query.mock.calls[0][0]).toMatch(/ON CONFLICT/i)
    expect(query.mock.calls[0][0]).toMatch(/attempts < 5/i)
    expect(query.mock.calls[0][0]).toContain("15 minutes")
    query.mockResolvedValue({ rows: [], rowCount: 0 })
    expect(await consumeLoginAttempt()).toBe(false)
  })
})
