import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { query, cookieJar, revalidatePath, redirect } = vi.hoisted(() => ({
  query: vi.fn(), cookieJar: { get: vi.fn(), set: vi.fn(), delete: vi.fn() }, revalidatePath: vi.fn(), redirect: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('../lib/db', () => ({ getPool: () => ({ query }) }))
vi.mock('next/headers', () => ({ cookies: async () => cookieJar }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('next/navigation', () => ({ redirect }))
import { createHash } from 'node:crypto'
import { signSession } from '../lib/credentials'
import { addSwitch, updateSwitch } from '../app/actions'
import { login, logout } from '../app/login/actions'

const id = 'f1a7c5d2-7400-4b9a-8e23-04b4fa901875'
const passwordHash = 'scrypt$' + '01'.repeat(16) + '$' + '01'.repeat(64)
const secret = Buffer.alloc(32, 4).toString('base64')
function form(values: Record<string, string>) {
  const data = new FormData()
  Object.entries(values).forEach(([key, value]) => data.set(key, value))
  return data
}

beforeEach(() => {
  query.mockReset()
  cookieJar.get.mockReset()
  cookieJar.delete.mockReset()
  cookieJar.set.mockReset()
  revalidatePath.mockReset()
  redirect.mockReset()
  vi.stubEnv('ADMIN_USERNAME', 'admin')
  vi.stubEnv('ADMIN_PASSWORD_HASH', passwordHash)
  vi.stubEnv('SESSION_SECRET', secret)
  const fingerprint = createHash('sha256').update('admin\\0'.replace('\\0', '\0') + passwordHash).digest('hex')
  cookieJar.get.mockReturnValue({ value: signSession(Date.now(), secret, fingerprint) })
})
afterEach(() => { vi.unstubAllEnvs() })

describe('dashboard mutations', () => {
  it('rejects unauthorized creates and updates before any SQL', async () => {
    cookieJar.get.mockReturnValue(undefined)
    expect((await addSwitch({}, form({ name: 'Carebox' }))).error).toBeTruthy()
    expect((await updateSwitch({}, form({ id, disabled: 'true' }))).error).toBeTruthy()
    expect(query).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it.each(['', '   ', 'x'.repeat(121)])('rejects an invalid deployment name', async (name) => {
    expect((await addSwitch({}, form({ name }))).error).toBeTruthy()
    expect(query).not.toHaveBeenCalled()
  })
  it('trims valid names, uses parameters and refreshes after creating', async () => {
    query.mockResolvedValue({ rows: [{ id, name: 'Carebox', disabled: false, updated_at: new Date() }], rowCount: 1 })
    expect((await addSwitch({}, form({ name: '  Carebox  ' }))).error).toBeUndefined()
    expect(query.mock.calls[0][1][1]).toBe('Carebox')
    expect(revalidatePath).toHaveBeenCalledWith('/')
  })
  it.each(['', '1', 'yes', 'TRUE'])('rejects an invalid boolean %s', async (disabled) => {
    expect((await updateSwitch({}, form({ id, disabled }))).error).toBeTruthy()
    expect(query).not.toHaveBeenCalled()
  })
  it('rejects a missing boolean or malformed UUID', async () => {
    expect((await updateSwitch({}, form({ id }))).error).toBeTruthy()
    expect((await updateSwitch({}, form({ id: 'invalid', disabled: 'true' }))).error).toBeTruthy()
    expect(query).not.toHaveBeenCalled()
  })
  it('writes the same target for repeated disable submissions and refreshes', async () => {
    query.mockResolvedValue({ rows: [{ id }], rowCount: 1 })
    await updateSwitch({}, form({ id, disabled: 'true' }))
    await updateSwitch({}, form({ id, disabled: 'true' }))
    expect(query.mock.calls.map((call) => call[1])).toEqual([[id, true], [id, true]])
    expect(revalidatePath).toHaveBeenCalledTimes(2)
  })
  it('reports a missing switch without claiming success', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 })
    expect((await updateSwitch({}, form({ id, disabled: 'false' }))).error).toContain('not found')
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('keeps database failure details out of mutation responses', async () => {
    query.mockRejectedValue(new Error('private database credential'))
    for (const result of [await addSwitch({}, form({ name: 'Carebox' })), await updateSwitch({}, form({ id, disabled: 'true' }))]) {
      expect(result.error).toBeTruthy()
      expect(result.error).not.toContain('private')
      expect(result.success).toBeUndefined()
    }
    expect(revalidatePath).not.toHaveBeenCalled()
  })
  it('logs out by clearing the authenticated cookie', async () => {
    await logout()
    expect(cookieJar.delete).toHaveBeenCalledWith('kill-switch-admin')
    expect(redirect).toHaveBeenCalledWith('/login')
  })
  it('does not echo a password in a failed login response', async () => {
    cookieJar.get.mockReturnValue(undefined)
    query.mockResolvedValue({ rows: [], rowCount: 0 })
    const result = await login({}, form({ username: 'admin', password: 'do-not-echo-this-password' }))
    expect(result.error).toBeTruthy()
    expect(JSON.stringify(result)).not.toContain('do-not-echo-this-password')
    expect(cookieJar.set).not.toHaveBeenCalled()
  })
})
