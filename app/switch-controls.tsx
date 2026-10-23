'use client'

import { useActionState, useState } from 'react'
import { addSwitch, updateSwitch } from './actions'

export function CreateSwitchForm() {
  const [state, action, pending] = useActionState(addSwitch, {})
  return (
    <form action={action} className="create-form">
      <div className="create-input"><label htmlFor="deployment-name" className="sr-only">Deployment name</label><input id="deployment-name" name="name" placeholder="e.g. Carebox · Customer name" maxLength={120} required disabled={pending} /></div>
      <button type="submit" disabled={pending}>{pending ? 'Adding…' : '+ Add deployment'}</button>
      {state.error && <p className="error form-message" role="alert">{state.error}</p>}
      {state.success && <output className="success form-message">{state.success}</output>}
    </form>
  )
}

export function SwitchControls({ id, disabled }: { id: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(updateSwitch, {})
  const [copyMessage, setCopyMessage] = useState('')

  async function copyUrl() {
    const url = new URL('/api/status/' + id, window.location.origin).href
    try {
      await navigator.clipboard.writeText(url)
      setCopyMessage('Status URL copied.')
    } catch {
      setCopyMessage('Copy failed. Copy this URL manually: ' + url)
    }
  }

  return (
    <div className="deployment-controls">
      <div className="button-row">
        <button type="button" className="button-secondary" onClick={copyUrl}>Copy status URL</button>
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="disabled" value={String(!disabled)} />
          <button type="submit" className={disabled ? '' : 'button-danger'} disabled={pending}>{pending ? 'Saving…' : disabled ? 'Enable app' : 'Disable app'}</button>
        </form>
      </div>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {state.success && <output className="success">{state.success}</output>}
      {copyMessage && <output className="copy-message">{copyMessage}</output>}
    </div>
  )
}
