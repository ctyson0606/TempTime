import { describe, expect, it } from 'vitest'
import { buildCsp, newCspNonce } from '../lib/csp'

const SUPABASE = 'https://abcdefghijklm.supabase.co'

const prod = (nonce = 'n0nce') =>
  buildCsp({ nonce, supabaseOrigin: SUPABASE, dev: false })
const dev = (nonce = 'n0nce') =>
  buildCsp({ nonce, supabaseOrigin: SUPABASE, dev: true })

/** The values of one directive, or `null` if it is not in the policy at all. */
function directive(policy: string, name: string): string[] | null {
  const found = policy
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find((parts) => parts[0] === name)
  return found ? found.slice(1) : null
}

describe('buildCsp', () => {
  it('carries the nonce into script-src', () => {
    expect(directive(prod('abc123'), 'script-src')).toContain("'nonce-abc123'")
  })

  it('never permits inline script, in either mode', () => {
    // The whole point of the nonce. A browser that sees both ignores
    // 'unsafe-inline', but writing it would still be a lie about the intent.
    expect(directive(prod(), 'script-src')).not.toContain("'unsafe-inline'")
    expect(directive(dev(), 'script-src')).not.toContain("'unsafe-inline'")
  })

  it('keeps eval and the HMR socket out of production', () => {
    expect(directive(prod(), 'script-src')).not.toContain("'unsafe-eval'")
    expect(directive(prod(), 'connect-src')).not.toContain('ws:')
    // ...and grants both in development, where the dev server needs them.
    expect(directive(dev(), 'script-src')).toContain("'unsafe-eval'")
    expect(directive(dev(), 'connect-src')).toContain('ws:')
  })

  it('allows the Realtime socket, not just the Supabase origin', () => {
    // connect-src is what a WebSocket is checked against, and wss:// does not
    // match an https:// source. Getting this wrong pins every room on the
    // polling fallback.
    const connect = directive(prod(), 'connect-src')
    expect(connect).toContain(SUPABASE)
    expect(connect).toContain('wss://abcdefghijklm.supabase.co')
  })

  it('allows the QR code, which is a data URL', () => {
    expect(directive(prod(), 'img-src')).toContain('data:')
    // And nowhere else: data: in script-src is a classic bypass.
    expect(directive(prod(), 'script-src')).not.toContain('data:')
    expect(directive(prod(), 'default-src')).not.toContain('data:')
  })

  it('shuts out framing, plugins and stray base tags', () => {
    expect(directive(prod(), 'frame-ancestors')).toEqual(["'none'"])
    expect(directive(prod(), 'object-src')).toEqual(["'none'"])
    expect(directive(prod(), 'base-uri')).toEqual(["'self'"])
    expect(directive(prod(), 'form-action')).toEqual(["'self'"])
  })

  it('upgrades insecure requests in production only', () => {
    expect(prod()).toContain('upgrade-insecure-requests')
    // On http://localhost this would rewrite every request to a port nothing
    // is listening on.
    expect(dev()).not.toContain('upgrade-insecure-requests')
  })

  it('falls back to default-src for anything not named', () => {
    expect(directive(prod(), 'default-src')).toEqual(["'self'"])
  })
})

describe('newCspNonce', () => {
  it('is base64 and long enough to be unguessable', () => {
    const nonce = newCspNonce()
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/)
    // 16 random bytes; a shorter nonce is a guessable one.
    expect(atob(nonce)).toHaveLength(16)
  })

  it('differs every time', () => {
    const seen = new Set(Array.from({ length: 100 }, newCspNonce))
    expect(seen.size).toBe(100)
  })

  it('never contains a character that would end the directive', () => {
    // A nonce carrying `;` or a space would split the policy it is written
    // into. base64 cannot, but the assertion is what keeps a future encoding
    // change from being a silent hole.
    for (let i = 0; i < 100; i++) {
      expect(newCspNonce()).not.toMatch(/[;\s'"]/)
    }
  })
})
