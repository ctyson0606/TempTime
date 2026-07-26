import { beforeEach, describe, expect, it } from 'vitest'
import {
  RATE_LIMITS,
  checkRateLimit,
  clientIp,
  resetRateLimits,
} from '../lib/rateLimit'

const T0 = 1_800_000_000_000

beforeEach(resetRateLimits)

describe('checkRateLimit', () => {
  it('allows exactly the limit, then refuses', () => {
    const { limit } = RATE_LIMITS.join
    for (let i = 0; i < limit; i++) {
      expect(checkRateLimit('join', '1.2.3.4', T0).ok).toBe(true)
    }
    expect(checkRateLimit('join', '1.2.3.4', T0).ok).toBe(false)
  })

  it('counts down what is left', () => {
    const { limit } = RATE_LIMITS.join
    expect(checkRateLimit('join', '1.2.3.4', T0).remaining).toBe(limit - 1)
    expect(checkRateLimit('join', '1.2.3.4', T0).remaining).toBe(limit - 2)
  })

  it('slides: a hit stops counting once the window has passed it', () => {
    const { limit, windowMs } = RATE_LIMITS.join
    for (let i = 0; i < limit; i++) checkRateLimit('join', '1.2.3.4', T0)
    expect(checkRateLimit('join', '1.2.3.4', T0 + windowMs - 1).ok).toBe(false)
    expect(checkRateLimit('join', '1.2.3.4', T0 + windowMs + 1).ok).toBe(true)
  })

  it('frees one slot at a time rather than resetting the whole window', () => {
    const { limit, windowMs } = RATE_LIMITS.join
    // Spread the allowance one millisecond apart.
    for (let i = 0; i < limit; i++) checkRateLimit('join', '1.2.3.4', T0 + i)
    // The cutoff is exclusive, so at exactly T0 + windowMs only the hit made at
    // T0 has aged out: one call gets in and the next is refused again.
    const at = T0 + windowMs
    expect(checkRateLimit('join', '1.2.3.4', at).ok).toBe(true)
    expect(checkRateLimit('join', '1.2.3.4', at).ok).toBe(false)
    // One millisecond later a second hit has aged out, freeing exactly one more.
    expect(checkRateLimit('join', '1.2.3.4', at + 1).ok).toBe(true)
    expect(checkRateLimit('join', '1.2.3.4', at + 1).ok).toBe(false)
  })

  it('reports when the oldest counted hit ages out', () => {
    const { limit, windowMs } = RATE_LIMITS.join
    for (let i = 0; i < limit; i++) checkRateLimit('join', '1.2.3.4', T0)
    const refused = checkRateLimit('join', '1.2.3.4', T0 + 1_000)
    expect(refused.ok).toBe(false)
    expect(refused.retryAfterMs).toBe(windowMs - 1_000)
  })

  it('keeps separate counts per caller', () => {
    const { limit } = RATE_LIMITS.join
    for (let i = 0; i < limit; i++) checkRateLimit('join', '1.2.3.4', T0)
    expect(checkRateLimit('join', '1.2.3.4', T0).ok).toBe(false)
    expect(checkRateLimit('join', '5.6.7.8', T0).ok).toBe(true)
  })

  it('keeps separate counts per endpoint', () => {
    const { limit } = RATE_LIMITS.join
    for (let i = 0; i < limit; i++) checkRateLimit('join', '1.2.3.4', T0)
    expect(checkRateLimit('join', '1.2.3.4', T0).ok).toBe(false)
    expect(checkRateLimit('submit', '1.2.3.4', T0).ok).toBe(true)
  })

  it('limits room reads, which is the enumeration path', () => {
    const { limit } = RATE_LIMITS.readRoom
    for (let i = 0; i < limit; i++) {
      expect(checkRateLimit('readRoom', '1.2.3.4', T0).ok).toBe(true)
    }
    expect(checkRateLimit('readRoom', '1.2.3.4', T0).ok).toBe(false)
  })

  /**
   * Not a property of the algorithm but of the number chosen, and the number is
   * the whole point: the realtime fallback polls the heatmap every 4 seconds, so
   * a limit set below that rate refuses members for merely reading the page. Four
   * people behind one office NAT is the case that has to fit.
   */
  it('leaves room for four tabs polling the heatmap every four seconds', () => {
    const { limit, windowMs } = RATE_LIMITS.heatmap
    const pollsPerTabPerWindow = windowMs / 4_000
    expect(limit).toBeGreaterThanOrEqual(pollsPerTabPerWindow * 4)
  })
})

describe('clientIp', () => {
  it('takes the first entry of x-forwarded-for, not the last', () => {
    // The last entry is the nearest proxy; the first is the original caller. A
    // caller that sends its own header can only prepend, never displace.
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' })
    expect(clientIp(headers)).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip, then to a constant', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9')
    expect(clientIp(new Headers())).toBe('unknown')
  })

  it('ignores a blank forwarded header', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '  ' }))).toBe('unknown')
  })
})
