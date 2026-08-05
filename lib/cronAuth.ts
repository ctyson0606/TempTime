import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * The credential on the scheduled purge route (PLAN.md section 4.3).
 *
 * Server-only by nature, like `lib/ownerSecret.ts`: `timingSafeEqual` has no Web
 * Crypto equivalent, and nothing in the browser has any business holding this
 * value. Kept out of the route file so the comparison itself can be tested
 * without standing up a request.
 */

/**
 * Where the secret is read from, in order.
 *
 * `x-cron-secret` is what PLAN.md section 6 specifies and what any external
 * scheduler can be told to send. `Authorization: Bearer` is there because Vercel
 * Cron cannot send custom headers at all — it issues a plain GET and attaches
 * the project's `CRON_SECRET` as a bearer token, so a route that only reads the
 * custom header would reject the one scheduler this project is most likely to
 * deploy behind.
 */
export function presentedCronSecret(headers: Headers): string | null {
  const custom = headers.get('x-cron-secret')?.trim()
  if (custom) return custom

  const authorization = headers.get('authorization')?.trim()
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice('bearer '.length).trim()
    if (token) return token
  }
  return null
}

/**
 * Constant-time comparison of two secrets.
 *
 * Both sides are hashed first rather than compared as bytes. `timingSafeEqual`
 * throws on buffers of different lengths, so a raw comparison needs a length
 * check in front of it — and that check is a plain `!==` that answers "how long
 * is the real secret" to anyone who asks. Hashing makes both operands exactly 32
 * bytes, so there is one code path whatever arrives.
 *
 * A caller error, so this returns rather than throwing. The missing-variable
 * case throws, but it does so in `cronSecret()`, because that one is ours.
 */
export function cronSecretMatches(presented: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest()
  return timingSafeEqual(digest(presented), digest(expected))
}
