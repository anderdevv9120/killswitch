import 'server-only'
import { Pool } from 'pg'

const shared = globalThis as typeof globalThis & { killSwitchPool?: Pool }

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('Database is not configured')
  if (!shared.killSwitchPool) {
    shared.killSwitchPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 1000,
      query_timeout: 1000,
      statement_timeout: 1000,
      idleTimeoutMillis: 30000,
    })
    shared.killSwitchPool.on('error', () => console.error('Database connection failed'))
  }
  return shared.killSwitchPool
}
