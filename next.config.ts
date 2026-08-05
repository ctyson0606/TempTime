import type { NextConfig } from 'next'

/**
 * Security headers whose value is the same on every response. The one that is
 * not — the CSP, whose script nonce is minted per request — is in `proxy.ts`.
 *
 * These live here rather than there because `next.config.ts` applies them to
 * everything, static assets and API responses included, while `proxy.ts`
 * deliberately skips both.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  // Superseded by `frame-ancestors 'none'` in the CSP for anything current;
  // kept for browsers that enforce this and not that.
  { key: 'X-Frame-Options', value: 'DENY' },

  /*
   * `no-referrer`, not the framework default, because our URLs are credentials.
   * The admin link carries the owner secret in its query string (PLAN.md
   * section 2.4) and the room link is the only thing needed to enter a room, so
   * a Referer header on any outbound request hands one of them to a third
   * party. Nothing here reads Referer, so there is nothing to trade against it.
   */
  { key: 'Referrer-Policy', value: 'no-referrer' },

  // Features the app never uses. Named individually rather than by wildcard:
  // an unrecognised feature name makes the browser log a warning, and console
  // noise is what scripts/verify-headers.mjs reads violations out of.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },

  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },

  /*
   * HSTS is only honoured over https, so it is dead weight in development and
   * would be a footgun if a browser did take it from localhost. No `preload`:
   * that is a submission to a list which is slow to leave, and the domain is
   * not chosen yet (STATE.md → Open Questions).
   */
  ...(process.env.NODE_ENV === 'production'
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains',
        },
      ]
    : []),
]

const nextConfig: NextConfig = {
  // `X-Powered-By: Next.js` names the framework and, by implication, the
  // advisories worth trying. It buys nothing back.
  poweredByHeader: false,

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
