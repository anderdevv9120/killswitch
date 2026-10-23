import { createServer, type AddressInfo, type Socket } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
import { getPool, reportDatabaseError } from '../lib/db'

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

it('allows a valid PostgreSQL startup that takes longer than one second', async () => {
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    let timer: ReturnType<typeof setTimeout>
    socket.once('data', () => {
      // A PostgreSQL AuthenticationOk followed by ReadyForQuery, after a slow handshake.
      timer = setTimeout(() => socket.write(Buffer.from('5200000008000000005a0000000549', 'hex')), 1250)
    })
    socket.on('error', () => {})
    socket.on('close', () => { clearTimeout(timer); sockets.delete(socket) })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  vi.stubEnv('DATABASE_URL', 'postgresql://test:test@127.0.0.1:' + (server.address() as AddressInfo).port + '/test')
  const pool = getPool()
  try {
    const client = await pool.connect()
    expect(client).toBeDefined()
    client.release()
  } finally {
    await pool.end()
    delete (globalThis as typeof globalThis & { killSwitchPool?: unknown }).killSwitchPool
    sockets.forEach((socket) => socket.destroy())
    await new Promise<void>((resolve) => { server.close(() => resolve()) })
  }
})

it('reports a database error code without logging credentials or the error message', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  reportDatabaseError('switch-status', Object.assign(new Error('postgresql://user:private-password@host/database'), { code: '28P01' }))
  const output = log.mock.calls.flat().join(' ')
  expect(output).toContain('28P01')
  expect(output).not.toContain('private-password')
  expect(output).not.toContain('postgresql://')
})

it('identifies a connection timeout without logging its message', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  reportDatabaseError('admin-login', new Error('Connection terminated due to connection timeout'))
  expect(log.mock.calls.flat().join(' ')).toContain('"timeout":true')
})
