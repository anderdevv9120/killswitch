'use server'
import { revalidatePath } from 'next/cache'
import { isAdmin } from '../lib/auth'
import { createSwitch, isSwitchId, setSwitchDisabled, validateName } from '../lib/switches'
import type { FormState } from './login/actions'

export async function addSwitch(_previous: FormState, formData: FormData): Promise<FormState> {
  if (!await isAdmin()) return { error: 'Your session expired. Please sign in again.' }
  let name: string
  try {
    name = validateName(formData.get('name'))
  } catch {
    return { error: 'Enter a name between 1 and 120 characters.' }
  }
  try {
    await createSwitch(name)
  } catch {
    return { error: 'Could not add the deployment. Please try again.' }
  }
  revalidatePath('/')
  return { success: 'Deployment added. The app is enabled by default.' }
}

export async function updateSwitch(_previous: FormState, formData: FormData): Promise<FormState> {
  if (!await isAdmin()) return { error: 'Your session expired. Please sign in again.' }
  const id = formData.get('id')
  const disabled = formData.get('disabled')
  if (typeof id !== 'string' || !isSwitchId(id) || (disabled !== 'true' && disabled !== 'false')) {
    return { error: 'Invalid deployment or switch state.' }
  }
  try {
    if (!await setSwitchDisabled(id, disabled === 'true')) return { error: 'Deployment not found. Refresh the page.' }
  } catch {
    return { error: 'Could not update the deployment. Please try again.' }
  }
  revalidatePath('/')
  return { success: 'Deployment updated.' }
}
