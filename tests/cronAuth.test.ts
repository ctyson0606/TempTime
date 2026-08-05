import { describe, expect, it } from 'vitest'
import { cronSecretMatches, presentedCronSecret } from '../lib/cronAuth'

const headers = (entries: Record<string, string>) => new Headers(entries)

describe('presentedCronSecret', () => {
  it('reads the header PLAN.md section 6 specifies', () => {
    expect(presentedCronSecret(headers({ 'x-cron-secret': 'sekrit' }))).toBe('sekrit')
  })

  it('reads a bearer token, which is all Vercel Cron can send', () => {
    expect(presentedCronSecret(headers({ authorization: 'Bearer sekrit' }))).toBe(
      'sekrit',
    )
  })

  it('accepts the bearer scheme in any case', () => {
    // Header values are not normalised for us, and schedulers disagree on this.
    expect(presentedCronSecret(headers({ authorization: 'bearer sekrit' }))).toBe(
      'sekrit',
    )
  })

  it('prefers the explicit header when both are present', () => {
    const both = headers({ 'x-cron-secret': 'explicit', authorization: 'Bearer other' })
    expect(presentedCronSecret(both)).toBe('explicit')
  })

  it('falls through to the bearer token when the explicit header is blank', () => {
    // An empty header is a header that was never filled in, not a secret of
    // length zero; treating it as present would mask the credential behind it.
    const both = headers({ 'x-cron-secret': '   ', authorization: 'Bearer other' })
    expect(presentedCronSecret(both)).toBe('other')
  })

  // Annotated rather than inferred: without it each case widens to its own
  // shape with the other header typed `undefined`, which no longer fits
  // `Headers`.
  it.each<{ entries: Record<string, string>; reason: string }>([
    { entries: {}, reason: 'nothing at all' },
    { entries: { 'x-cron-secret': '' }, reason: 'an empty custom header' },
    { entries: { authorization: 'Bearer' }, reason: 'a bearer scheme with no token' },
    {
      entries: { authorization: 'Bearer   ' },
      reason: 'a bearer token of only spaces',
    },
    { entries: { authorization: 'Basic sekrit' }, reason: 'the wrong scheme' },
    { entries: { authorization: 'sekrit' }, reason: 'a token with no scheme' },
  ])('returns null for $reason', ({ entries }) => {
    expect(presentedCronSecret(headers(entries))).toBeNull()
  })
})

describe('cronSecretMatches', () => {
  it('accepts the same secret', () => {
    expect(cronSecretMatches('sekrit', 'sekrit')).toBe(true)
  })

  it('rejects a different secret', () => {
    expect(cronSecretMatches('sekrit', 'sekret')).toBe(false)
  })

  it('rejects an empty presented secret', () => {
    expect(cronSecretMatches('', 'sekrit')).toBe(false)
  })

  it('rejects a prefix of the real secret', () => {
    // The shape a character-at-a-time attack produces, and the case a length
    // check in front of timingSafeEqual would answer early.
    expect(cronSecretMatches('sek', 'sekrit')).toBe(false)
  })

  it('does not throw on operands of wildly different lengths', () => {
    // timingSafeEqual throws on unequal buffers; hashing first is what removes
    // that branch. A throw here would be a 500 where a 401 belongs.
    expect(cronSecretMatches('a', 'b'.repeat(4096))).toBe(false)
  })

  it('is not fooled by a secret that differs only in trailing whitespace', () => {
    expect(cronSecretMatches('sekrit ', 'sekrit')).toBe(false)
  })

  it('compares by value, so two equal strings of any length match', () => {
    const long = 'x'.repeat(4096)
    expect(cronSecretMatches(long, long)).toBe(true)
  })
})
