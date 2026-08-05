/**
 * The Content-Security-Policy, and the nonce it is built around.
 *
 * Kept here rather than in `proxy.ts` so the policy can be asserted by unit
 * tests without standing a server up. `proxy.ts` holds only the per-request
 * plumbing: mint a nonce, build this string, attach it both ways.
 *
 * The nonce is what makes the script directive worth having. Next.js emits
 * inline scripts of its own — the bootstrap and the streamed flight data — so
 * the only alternatives are `'unsafe-inline'`, which permits every injected
 * script as well as Next's, or hashes, which change on every build. Next reads
 * the nonce out of the *request* `content-security-policy` header and stamps it
 * on the scripts it renders (`app-render.js` → `getScriptNonceFromHeader`).
 *
 * PLAN.md section 7.3 asks for this header. It only asks that external sources
 * be shut out; the nonce goes further, and the cost is stated in STATE.md.
 */

export interface CspOptions {
  /** Base64 nonce for this response's inline scripts. */
  nonce: string
  /**
   * Origin of the Supabase project — scheme and host, no path. The only host a
   * browser here talks to that is not us: `lib/realtime.ts` opens a WebSocket
   * to it. Everything else, answers included, goes through our own API.
   */
  supabaseOrigin: string
  /** See the dev-only additions below. They are never sent in production. */
  dev: boolean
}

/**
 * A nonce for one response.
 *
 * Web Crypto, not `node:crypto`: this runs in the Edge runtime, and the same
 * reasoning applies as in `lib/roomCode.ts`. 16 bytes is what the CSP spec
 * calls for — 128 bits of unpredictability is the whole security property, and
 * a nonce an attacker can guess is a nonce that permits their script.
 */
export function newCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

export function buildCsp({ nonce, supabaseOrigin, dev }: CspOptions): string {
  // wss for the Realtime socket. `'self'` does not cover it: the host is
  // another origin entirely, and connect-src is what a WebSocket is checked
  // against.
  const supabaseSocket = supabaseOrigin.replace(/^http/, 'ws')

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    // Nothing here embeds anything, and both of these are how an injected tag
    // gets to run code that script-src would otherwise have stopped.
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    // Clickjacking. A room page has destructive buttons on it — delete, and
    // withdraw — which is exactly what a transparent frame is aimed at.
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],

    // No `'strict-dynamic'`. It would *replace* `'self'` rather than add to it,
    // making every chunk Next loads at runtime depend on the nonce propagating
    // through a `document.createElement('script')` we do not control. Our
    // chunks are same-origin, so `'self'` covers them without that bet.
    //
    // `'unsafe-eval'` in development only: React Fast Refresh and the dev
    // server's module runtime both evaluate code as text. Shipping it would
    // hand an injected string the same power, which is most of what this
    // directive is for.
    'script-src': ["'self'", `'nonce-${nonce}'`, ...(dev ? ["'unsafe-eval'"] : [])],

    // `'unsafe-inline'` for styles is deliberate and is the one relaxation
    // here. Next injects a `<style>` element for the streamed CSS and React
    // hoists more; a nonce does not reach all of them, and a stylesheet cannot
    // execute script. The realistic attack it leaves open is exfiltration
    // through a crafted selector, which needs an injection point that would
    // already be a worse bug than this directive.
    'style-src': ["'self'", "'unsafe-inline'"],

    // `data:` is the QR code. `components/QrDialog.tsx` draws it in the browser
    // precisely so the room link never leaves the machine, and the result is a
    // data URL rather than a fetched image.
    'img-src': ["'self'", 'data:'],

    // next/font self-hosts, so there is no font CDN to allow.
    'font-src': ["'self'"],

    'connect-src': [
      "'self'",
      supabaseOrigin,
      supabaseSocket,
      // The dev server's own HMR socket. `'self'` is specified to cover a
      // same-origin ws:// in CSP3, but browsers have disagreed about it for
      // years and a broken dev loop is not worth the argument.
      ...(dev ? ['ws:'] : []),
    ],

    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
  }

  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    // Valueless directive, so it does not fit the map above. Not in
    // development, where the server is plain http and this would rewrite every
    // request to a port nothing is listening on.
    .concat(dev ? [] : ['upgrade-insecure-requests'])

  return policy.join('; ')
}
