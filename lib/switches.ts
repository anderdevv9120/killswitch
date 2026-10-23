import 'server-only'
import { randomUUID } from 'node:crypto'
import { getPool } from './db'

export type SwitchRecord = { id: string; name: string; disabled: boolean; updated_at: Date }
export function isSwitchId(value: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
}

export function validateName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
    throw new Error('Enter a name between 1 and 120 characters.')
  }
  return value.trim()
}

export async function getSwitchStatus(id: string): Promise<boolean | null> {
  if (!isSwitchId(id)) throw new Error('Invalid switch ID')
  const result = await getPool().query<{ disabled: boolean }>('SELECT disabled FROM switches WHERE id = $1', [id])
  return result.rows[0]?.disabled ?? null
}

export async function listSwitches(): Promise<SwitchRecord[]> {
  const result = await getPool().query<SwitchRecord>('SELECT id, name, disabled, updated_at FROM switches ORDER BY updated_at DESC, id ASC')
  return result.rows
}

export async function createSwitch(name: string): Promise<SwitchRecord> {
  const cleanName = validateName(name)
  const result = await getPool().query<SwitchRecord>(
    'INSERT INTO switches (id, name) VALUES ($1, $2) RETURNING id, name, disabled, updated_at',
    [randomUUID(), cleanName],
  )
  return result.rows[0]
}

export async function setSwitchDisabled(id: string, disabled: boolean): Promise<boolean> {
  if (!isSwitchId(id) || typeof disabled !== 'boolean') throw new Error('Invalid switch update')
  const result = await getPool().query(
    'UPDATE switches SET updated_at = CASE WHEN disabled IS DISTINCT FROM $2::boolean THEN NOW() ELSE updated_at END, disabled = $2 WHERE id = $1 RETURNING id',
    [id, disabled],
  )
  return result.rows.length > 0
}
