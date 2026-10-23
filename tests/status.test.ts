import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('../lib/db', () => ({ getPool: () => ({ query }) }))
import { GET } from '../app/api/status/[id]/route'
import { createSwitch, validateName, setSwitchDisabled } from '../lib/switches'

const id = 'f1a7c5d2-7400-4b9a-8e23-04b4fa901875'
const request = (value = id) => GET(new Request('https://control.example/api/status/' + value), { params: Promise.resolve({ id: value }) })

beforeEach(() => { query.mockReset() })

describe('public status', () => {
  it.each([true, false])('returns only disabled=%s', async (disabled) => {
    query.mockResolvedValue({ rows: [{ disabled }], rowCount: 1 })
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ disabled })
    expect(query.mock.calls[0][1]).toEqual([id])
  })
  it.each(['invalid', "' OR 1=1 --"])('rejects invalid UUID %s without querying', async (value) => {
    expect((await request(value)).status).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })
  it('returns 404 for an unknown switch', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 })
    expect((await request()).status).toBe(404)
  })
  it('returns a safe 503 on database failure', async () => {
    query.mockRejectedValue(new Error('secret database password'))
    const response = await request()
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('secret')
  })
  it.each(['true', 'false', 'missing', 'invalid', 'failure'])('keeps CORS and no-store for %s', async (mode) => {
    if (mode === 'failure') query.mockRejectedValue(new Error('offline'))
    else query.mockResolvedValue({ rows: mode === 'missing' ? [] : [{ disabled: mode === 'true' }] })
    const response = await request(mode === 'invalid' ? 'invalid' : id)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull()
  })
})

describe('switch storage boundaries', () => {
  it.each([null, '', '   ', 'x'.repeat(121)])('rejects an invalid name', (name) => {
    expect(() => validateName(name)).toThrow()
  })
  it('trims names and sends SQL-looking text as a parameter', async () => {
    const name = "Robert'); DROP TABLE switches;--"
    query.mockResolvedValue({ rows: [{ id, name, disabled: false, updated_at: new Date() }], rowCount: 1 })
    expect(validateName('  Carebox  ')).toBe('Carebox')
    expect((await createSwitch('  ' + name + '  ')).disabled).toBe(false)
    expect(query.mock.calls[0][0]).not.toContain(name)
    expect(query.mock.calls[0][1][1]).toBe(name)
  })
  it('passes an explicit target state on repeated updates', async () => {
    query.mockResolvedValue({ rows: [{ id }], rowCount: 1 })
    expect(await setSwitchDisabled(id, true)).toBe(true)
    expect(await setSwitchDisabled(id, true)).toBe(true)
    expect(query.mock.calls.map((call) => call[1])).toEqual([[id, true], [id, true]])
  })
  it('reports a missing row when updating', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 })
    expect(await setSwitchDisabled(id, false)).toBe(false)
  })
})
