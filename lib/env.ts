/**
 * Environment access, with the failure made loud.
 *
 * A missing or malformed variable is our deployment error, not a caller's, so
 * every accessor throws rather than returning undefined. Silence here degrades
 * into blanket 401s and empty rooms that look like user error.
 *
 * Each accessor is a function, not a module-scope constant: throwing at import
 * time would fail the build of pages that never touch Supabase. The
 * `NEXT_PUBLIC_` reads are written out literally because Next.js substitutes
 * them textually at build time — a dynamic `process.env[name]` lookup is not
 * replaced and comes back undefined in the browser.
 */

function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`)
  }
  return trimmed
}

/**
 * The project's base URL, with no path.
 *
 * The dashboard shows the REST endpoint — `.../rest/v1/` — and pasting that is
 * the easy mistake; supabase-js appends its own paths and every request then
 * 404s. Caught once already, so it is checked rather than documented.
 */
export function supabaseUrl(): string {
  const url = required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
  const base = url.replace(/\/+$/, '')
  if (/\/rest\/v\d/.test(base)) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL must be the project base URL, not the REST ' +
        `endpoint. Drop the /rest/... path: ${base.replace(/\/rest\/v\d.*$/, '')}`,
    )
  }
  return base
}

/** Safe in the browser: constrained by RLS, and only two tables are granted. */
export function supabasePublishableKey(): string {
  return required(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  )
}

/**
 * Bypasses RLS completely, including the no-policy rule that keeps individual
 * masks unreadable. Server only — never reference this from a client component,
 * and never rename it into a `NEXT_PUBLIC_` variable.
 */
export function supabaseSecretKey(): string {
  return required('SUPABASE_SECRET_KEY', process.env.SUPABASE_SECRET_KEY)
}

/**
 * The project's legacy HS256 shared secret. We sign room tokens with it so that
 * Supabase — not just our own routes — will verify them, which is what lets a
 * browser subscribe to Realtime under its room's RLS policy.
 */
export function supabaseJwtSecret(): string {
  return required('SUPABASE_JWT_SECRET', process.env.SUPABASE_JWT_SECRET)
}

/** Guards the purge route. Ours to invent; see PLAN.md section 4.3. */
export function cronSecret(): string {
  return required('CRON_SECRET', process.env.CRON_SECRET)
}
