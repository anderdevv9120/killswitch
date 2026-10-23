import 'server-only'
import { Pool } from 'pg'

const shared = globalThis as typeof globalThis & { killSwitchPool?: Pool }

export function reportDatabaseError(context: string, error: unknown): void {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN'
  const timeout = error instanceof Error && /timeout|timed out/i.test(error.message)
  console.error(`[${context}] Database failure ${JSON.stringify({ code, timeout, configured: Boolean(process.env.DATABASE_URL) })}`)
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('Database is not configured')
  if (!shared.killSwitchPool) {
    shared.killSwitchPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      enableChannelBinding: true,
      max: 5,
      connectionTimeoutMillis: 5000,
      query_timeout: 1000,
      statement_timeout: 1000,
      idleTimeoutMillis: 30000,
    })
    shared.killSwitchPool.on('error', (error) => reportDatabaseError('pool', error))
  }
  return shared.killSwitchPool
}
