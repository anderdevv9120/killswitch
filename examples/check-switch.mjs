export async function shouldDisable(statusUrl) {
  try {
    const response = await fetch(statusUrl, { cache: 'no-store', signal: AbortSignal.timeout(2000) })
    if (!response.ok) return false
    const data = await response.json()
    return data?.disabled === true
  } catch {
    return false
  }
}
