import { NextResponse, type NextRequest } from 'next/server'
import { buildCsp, newCspNonce } from '@/lib/csp'
import { supabaseUrl } from '@/lib/env'

/**
 * Attaches the Content-Security-Policy, which is the one security header that
 * cannot be a constant: its script nonce is minted per response. The rest —
 * nosniff, Referrer-Policy, and the others that never change — are in
 * `next.config.ts`, where they also cover the static assets this file skips.
 *
 * `proxy.ts` is what Next 16 calls the file that used to be `middleware.ts`.
 *
 * The policy is set twice, and only one of them is proven to matter. On the
 * response it is what the browser enforces, and it is also — measured, not
 * assumed — where Next 16.2.11 reads the nonce back out of in order to stamp it
 * on the inline scripts it renders. Commenting out the request line changed
 * nothing: the page still hydrated and the served HTML still carried 16 nonces.
 * Commenting out the response line instead also left the HTML nonced, and sent
 * no policy at all.
 *
 * The request pass is kept anyway, on the same reasoning as the `setAuth` call
 * in `lib/realtime.ts`: it is what Next documents, the cost is one line, and
 * the alternative is depending on an undocumented path staying undocumented
 * across upgrades. It is belt-and-braces, not a fix — if a future version reads
 * only the request header, `scripts/verify-headers.mjs` catches it, because a
 * nonce-less page is exactly what it failed on the first time it ran.
 */
export function proxy(request: NextRequest) {
  const csp = buildCsp({
    nonce: newCspNonce(),
    // Throws if unset, per lib/env.ts: a policy silently missing its Supabase
    // origin would leave every room stuck on the polling fallback with nothing
    // in the log to say why.
    supabaseOrigin: new URL(supabaseUrl()).origin,
    dev: process.env.NODE_ENV === 'development',
  })

  const headers = new Headers(request.headers)
  headers.set('content-security-policy', csp)

  const response = NextResponse.next({ request: { headers } })
  response.headers.set('content-security-policy', csp)
  return response
}

export const config = {
  matcher: [
    /*
     * Documents only. Static assets under `_next` are built by us and carry no
     * inline script, and the API returns JSON that no browser parses as a
     * document — so both would pay for a nonce that nothing reads. They still
     * get the constant headers from `next.config.ts`.
     */
    '/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)',
  ],
}
