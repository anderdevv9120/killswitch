'use client'

import { useActionState } from 'react'
import { login } from './actions'

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {})
  return (
    <form action={action} className="stack">
      <label htmlFor="username">Username</label>
      <input id="username" name="username" autoComplete="username" maxLength={120} required />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" maxLength={1024} required />
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  )
}
