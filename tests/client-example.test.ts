import { afterEach, describe, expect, it, vi } from 'vitest'
import { shouldDisable } from '../examples/check-switch.mjs'

afterEach(() => { vi.unstubAllGlobals() })

describe('customer startup check', () => {
  it.each([
    ['{"disabled":true}', 200, true], ['{"disabled":false}', 200, false],
    ['{"disabled":"true"}', 200, false], ['null', 200, false], ['{}', 200, false],
    ['not json', 200, false], ['{"disabled":true}', 503, false],
  ])('handles response %s with status %s', async (body, status, expected) => {
    const fetch = vi.fn().mockResolvedValue(new Response(body, { status }))
    vi.stubGlobal('fetch', fetch)
    expect(await shouldDisable('https://control.example/api/status/example')).toBe(expected)
    expect(fetch).toHaveBeenCalledWith('https://control.example/api/status/example', { cache: 'no-store', signal: expect.any(AbortSignal) })
  })
  it('fails open when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await shouldDisable('https://control.example/status')).toBe(false)
  })
  it('aborts a stalled request after two seconds and fails open', async () => {
    const fetch = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('timeout')), { once: true })
    }))
    vi.stubGlobal('fetch', fetch)
    const started = Date.now()
    expect(await shouldDisable('https://control.example/status')).toBe(false)
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true)
    expect(Date.now() - started).toBeGreaterThanOrEqual(1900)
  })
})
