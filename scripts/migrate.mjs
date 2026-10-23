import nextEnv from '@next/env'
import { readFile } from 'node:fs/promises'
import pg from 'pg'

nextEnv.loadEnvConfig(process.cwd())

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('Database is not configured')
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, statement_timeout: 10000 })
  try {
    await client.connect()
    await client.query('BEGIN')
    await client.query(await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8'))
    await client.query('COMMIT')
    console.log('Database schema ready.')
  } finally {
    await client.end()
  }
}

migrate().catch(() => {
  console.error('Migration failed. Check DATABASE_URL and database access. No changes were committed on failure.')
  process.exitCode = 1
})
