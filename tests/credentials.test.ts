import { scryptSync } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { hashPassword, isPasswordHash, isSessionSecret, signSession, verifyPassword, verifySession } from '../lib/credentials'

const salt = Buffer.alloc(16, 1)
const hash = 'scrypt$' + salt.toString('hex') + '$' + scryptSync('correct-password', salt, 64).toString('hex')
const secret = Buffer.alloc(32, 7).toString('base64')
const now = 1730000000000

describe('passwords', () => {
  it('accepts the password and rejects a wrong one', async () => {
    expect(await verifyPassword('correct-password', hash)).toBe(true)
    expect(await verifyPassword('wrong-password', hash)).toBe(false)
  })
  it.each(['', 'scrypt$bad$bad', 'plain-text', hash + 'extra'])('rejects malformed hashes', async (value) => {
    expect(isPasswordHash(value)).toBe(false)
    expect(await verifyPassword('correct-password', value)).toBe(false)
  })
  it('rejects oversized input before deriving a key', async () => {
    expect(await verifyPassword('x'.repeat(1025), hash)).toBe(false)
  })
  it('generates salted hashes compatible with verification', async () => {
    const first = await hashPassword('a-test-password')
    const second = await hashPassword('a-test-password')
    expect(first).not.toBe(second)
    expect(isPasswordHash(first)).toBe(true)
    expect(await verifyPassword('a-test-password', first)).toBe(true)
  })
  it('refuses to generate a hash for a short password', async () => {
    await expect(hashPassword('short')).rejects.toThrow()
  })
  it('refuses noninteractive password input without echoing it', () => {
    const result = spawnSync(process.execPath, ['scripts/hash-password.mjs'], { input: 'never-echo-this-password', encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('interactive terminal')
    expect(result.stdout + result.stderr).not.toContain('never-echo-this-password')
  })
})

describe('sessions', () => {
  it('accepts a valid signature until exactly eight hours', () => {
    const token = signSession(now, secret, 'original')
    expect(verifySession(token, now, secret, 'original')).toBe(true)
    expect(verifySession(token, now + 8 * 60 * 60 * 1000 - 1, secret, 'original')).toBe(true)
    expect(verifySession(token, now + 8 * 60 * 60 * 1000, secret, 'original')).toBe(false)
  })
  it('rejects tampering, secret changes and credential rotation', () => {
    const token = signSession(now, secret, 'original')
    expect(verifySession(token + 'x', now, secret, 'original')).toBe(false)
    expect(verifySession(token, now, Buffer.alloc(32, 8).toString('base64'), 'original')).toBe(false)
    expect(verifySession(token, now, secret, 'rotated')).toBe(false)
  })
  it.each(['', 'bad', 'x'.repeat(1025), 'a.b.c'])('rejects malformed tokens', (token) => {
    expect(verifySession(token, now, secret, 'original')).toBe(false)
  })
  it.each(['', 'short', '!'.repeat(64), Buffer.alloc(31).toString('base64')])('rejects an invalid signing secret', (value) => {
    expect(isSessionSecret(value)).toBe(false)
    expect(verifySession('a.b', now, value, 'original')).toBe(false)
  })
})
