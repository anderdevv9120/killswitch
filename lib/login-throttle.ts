import 'server-only'
import { getPool } from './db'

export async function consumeLoginAttempt(): Promise<boolean> {
  const result = await getPool().query(`
    INSERT INTO admin_login_throttle (id, attempts, window_started_at) VALUES (1, 1, now())
    ON CONFLICT (id) DO UPDATE SET
      attempts = CASE WHEN admin_login_throttle.window_started_at <= now() - interval '15 minutes' THEN 1 ELSE admin_login_throttle.attempts + 1 END,
      window_started_at = CASE WHEN admin_login_throttle.window_started_at <= now() - interval '15 minutes' THEN now() ELSE admin_login_throttle.window_started_at END
    WHERE admin_login_throttle.attempts < 5 OR admin_login_throttle.window_started_at <= now() - interval '15 minutes'
    RETURNING attempts
  `)
  return result.rows.length > 0
}

export async function clearLoginAttempts(): Promise<void> {
  await getPool().query('DELETE FROM admin_login_throttle WHERE id = 1')
}
