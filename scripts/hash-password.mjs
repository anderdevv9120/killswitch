import { emitKeypressEvents } from 'node:readline'
import { hashPassword } from '../lib/credentials.ts'

async function readPassword() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run this command in an interactive terminal.')
  const wasRaw = process.stdin.isRaw
  emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdout.write('Admin password (12+ characters, input hidden): ')
  let onKey
  try {
    return await new Promise((resolve, reject) => {
      let password = ''
      onKey = (text, key) => {
        if (key.ctrl && (key.name === 'c' || key.name === 'd')) return reject(new Error('Cancelled.'))
        if (key.name === 'return') return resolve(password)
        if (key.name === 'backspace') password = Array.from(password).slice(0, -1).join('')
        else if (text && !key.ctrl && !key.meta) password += text
        if (password.length > 1024) reject(new Error('Password is too long.'))
      }
      process.stdin.on('keypress', onKey)
    })
  } finally {
    process.stdin.removeListener('keypress', onKey)
    process.stdin.setRawMode(wasRaw)
    process.stdin.pause()
    process.stdout.write('\n')
  }
}

readPassword().then(hashPassword).then((hash) => console.log(hash)).catch((error) => {
  console.error(error instanceof Error ? error.message : 'Password hashing failed.')
  process.exitCode = 1
})
