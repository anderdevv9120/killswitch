'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { authenticate, requireAdmin, SESSION_COOKIE } from '../../lib/auth'

export type FormState = { error?: string; success?: string }

export async function login(_previous: FormState, formData: FormData): Promise<FormState> {
  if (!await authenticate(formData.get('username'), formData.get('password'))) {
    return { error: 'Unable to sign in. Check your credentials or try again later.' }
  }
  redirect('/')
}

export async function logout(): Promise<void> {
  await requireAdmin()
  const cookieJar = await cookies()
  cookieJar.delete(SESSION_COOKIE)
  redirect('/login')
}
