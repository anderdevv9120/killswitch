import { redirect } from 'next/navigation'
import Link from 'next/link'
import { isAdmin } from '../lib/auth'
import { listSwitches } from '../lib/switches'
import { logout } from './login/actions'
import { CreateSwitchForm, SwitchControls } from './switch-controls'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  if (!await isAdmin()) redirect('/login')
  const switches = await listSwitches()
  const disabledCount = switches.filter((item) => item.disabled).length
  return (
    <div className="dashboard">
      <header className="topbar">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">K</span> Kill Switch</Link>
        <div className="topbar-actions"><span className="admin-label">ADMIN CONSOLE</span><form action={logout}><button className="button-quiet" type="submit">Sign out</button></form></div>
      </header>
      <main>
        <section className="page-heading">
          <div><p className="eyebrow">DEPLOYMENT ACCESS</p><h1>One place. Every switch.</h1><p className="muted">Manage access to the apps you deliver.</p></div>
          <div className="summary"><strong>{switches.length}</strong> deployments <span aria-hidden="true">/</span> <strong>{disabledCount}</strong> disabled</div>
        </section>
        <section className="panel create-panel" aria-labelledby="create-title">
          <div><h2 id="create-title">Add a deployment</h2><p className="muted">Give it a name you can recognize. New apps start enabled.</p></div>
          <CreateSwitchForm />
        </section>
        <section className="deployment-section" aria-labelledby="deployments-title">
          <div className="section-heading"><h2 id="deployments-title">Your deployments <span className="count">{switches.length}</span></h2><span className="muted">Changes apply on the next app reload</span></div>
          {switches.length === 0 ? (
            <div className="panel empty-state"><span className="empty-icon" aria-hidden="true">↗</span><h3>No deployments yet</h3><p className="muted">Add your first deployment above to get its status URL.</p></div>
          ) : (
            <ul className="deployment-list">
              {switches.map((item) => (
                <li className="panel deployment" key={item.id}>
                  <div className="deployment-info"><div className="deployment-title"><h3>{item.name}</h3><span className={'badge ' + (item.disabled ? 'badge-disabled' : 'badge-enabled')}><span aria-hidden="true">●</span> {item.disabled ? 'Disabled' : 'Enabled'}</span></div><code className="deployment-id">{item.id}</code><p className="updated">Updated <time dateTime={item.updated_at.toISOString()}>{item.updated_at.toLocaleString('en-GB', { timeZone: 'UTC' })} UTC</time></p></div>
                  <SwitchControls key={String(item.disabled)} id={item.id} disabled={item.disabled} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <footer>Only an explicit disabled response blocks an app. Connection failures let it run normally.</footer>
      </main>
    </div>
  )
}
