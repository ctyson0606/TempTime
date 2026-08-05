import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api'
import { cronSecretMatches, presentedCronSecret } from '@/lib/cronAuth'
import { cronSecret } from '@/lib/env'
import { serverDb } from '@/lib/supabase/server'

/**
 * A cached response here would be a purge that silently stops running, which is
 * the failure nobody notices. Reading headers already forces this dynamic; the
 * declaration says so out loud rather than relying on that staying true.
 */
export const dynamic = 'force-dynamic'

/**
 * The backup destruction path (PLAN.md sections 4.3 and 6).
 *
 * `supabase/migrations/0003_cron.sql` is the primary one and runs the same
 * delete inside the database every hour. This route exists for the case where
 * that schedule is not available — pg_cron not enabled, a database restored
 * without it — and for being able to trigger a purge by hand.
 *
 * `vercel.json` schedules this daily, not hourly as PLAN.md section 4.3 asks
 * for. Vercel's Hobby plan refuses to deploy a cron expression that runs more
 * than once a day, so an hourly entry there is not a stricter schedule but a
 * failed deployment. The hourly guarantee comes from pg_cron either way; JSON
 * cannot carry a comment saying so, hence this one and the README.
 *
 * Deliberately not rate-limited, unlike every route in PLAN.md section 7.2.
 * Nothing here touches the database before the credential matches, so an
 * unauthenticated flood costs one SHA-256 per request and nothing else; adding a
 * limit would buy that back at the price of a bucket that could refuse the
 * scheduler after a few retries.
 */
async function purge(request: Request): Promise<NextResponse> {
  // Throws when unset. A purge route that quietly accepts everything because a
  // variable is missing is worse than one that 500s on the first request.
  const expected = cronSecret()

  const presented = presentedCronSecret(request.headers)
  if (presented === null || !cronSecretMatches(presented, expected)) {
    // One answer for missing, malformed and wrong. Nothing here says which.
    return apiError('UNAUTHORIZED', 'this endpoint is for the scheduler')
  }

  // The app's clock rather than the database's. PostgREST has no way to send
  // `now()` as a value, and `expires_at` already carries a 24-hour grace period
  // (PLAN.md section 4.3), so seconds of clock skew change nothing.
  const now = new Date().toISOString()

  const { data, error } = await serverDb()
    .from('rooms')
    .delete()
    .lt('expires_at', now)
    // Without a select, PostgREST reports no rows and the response could not say
    // whether anything was purged or the filter simply matched nothing.
    .select('id')
    .returns<Array<{ id: string }>>()

  if (error) return apiError('SERVER_ERROR', 'could not purge expired rooms')

  // Cascades take participants and submissions with each room (PLAN.md section
  // 4.1), so this count is rooms, not rows.
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 })
}

/** What PLAN.md section 6 specifies, and what an external scheduler should use. */
export async function POST(request: Request): Promise<NextResponse> {
  return purge(request)
}

/**
 * Vercel Cron only issues GET, and cannot be configured to send anything else.
 * The spec named POST before the scheduler was chosen; rather than pin the
 * platform backwards, both verbs run the same handler behind the same secret.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return purge(request)
}
