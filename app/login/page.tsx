import { redirect } from 'next/navigation'
import { isAdmin } from '../../lib/auth'
import { LoginForm } from './login-form'

export const runtime = 'nodejs'

export default async function LoginPage() {
  if (await isAdmin()) redirect('/')
  return (
    <main className="login-shell">
      <section className="panel login-panel" aria-labelledby="login-title">
        <span className="brand-mark" aria-hidden="true">K</span>
        <p className="eyebrow">KILL SWITCH / ADMIN</p>
        <h1 id="login-title">Your deployments.<br />Your controls.</h1>
        <p className="muted">Sign in to manage deployment access.</p>
        <LoginForm />
      </section>
    </main>
  )
}
