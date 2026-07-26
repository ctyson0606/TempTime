/**
 * In-memory sliding-window rate limiting. See PLAN.md section 7.2.
 *
 * A sliding log rather than a fixed window: fixed windows let twice the limit
 * through across a boundary, which on `GET /api/rooms/:code` is exactly the
 * endpoint an enumeration script hammers. At these limits the log is a handful
 * of numbers per key.
 *
 * Known limit, stated in the spec: serverless instances do not share this
 * counter, so a spread-out attacker gets one allowance per instance. It stops
 * the naive script, which is what it is for. The interface is small on purpose
 * — swapping in a shared store replaces this file and nothing else.
 */

export interface RateLimitRule {
  limit: number
  windowMs: number
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/**
 * Reading a room is limited too. It is the one endpoint needed to enumerate
 * room codes, so leaving it open would make the sixth character pointless.
 */
export const RATE_LIMITS = {
  createRoom: { limit: 10, windowMs: HOUR },
  readRoom: { limit: 60, windowMs: MINUTE },
  join: { limit: 20, windowMs: MINUTE },
  submit: { limit: 30, windowMs: MINUTE },
  deleteRoom: { limit: 10, windowMs: MINUTE },
} as const satisfies Record<string, RateLimitRule>

export type RateLimitName = keyof typeof RATE_LIMITS

export interface RateLimitResult {
  ok: boolean
  /** How many more calls this key may make right now. */
  remaining: number
  /** Milliseconds until the oldest recorded hit falls out of the window. */
  retryAfterMs: number
}

const hits = new Map<string, number[]>()

/**
 * Keys are per-IP and never revisited once a client goes away, so without a
 * ceiling the map grows for the life of the process. Past it, the whole map is
 * swept of entries that are entirely outside their window.
 */
const SWEEP_THRESHOLD = 10_000

function sweep(now: number): void {
  for (const [key, times] of hits) {
    const newest = times[times.length - 1]
    // Longest window in the table; using it for every key is conservative and
    // avoids storing a rule alongside each entry.
    if (newest === undefined || now - newest >= HOUR) hits.delete(key)
  }
}

/**
 * Record one hit and say whether it is allowed.
 *
 * Counts the attempt, not the success — a run of rejected room codes is the
 * traffic worth limiting, and only counting successes would leave it unbounded.
 */
export function checkRateLimit(
  name: RateLimitName,
  key: string,
  now: number = Date.now(),
): RateLimitResult {
  const { limit, windowMs } = RATE_LIMITS[name]
  const bucket = `${name}:${key}`

  if (hits.size > SWEEP_THRESHOLD) sweep(now)

  const cutoff = now - windowMs
  const times = (hits.get(bucket) ?? []).filter((t) => t > cutoff)

  if (times.length >= limit) {
    hits.set(bucket, times)
    // times[0] is the oldest hit still counted; the window frees up when it ages out.
    return { ok: false, remaining: 0, retryAfterMs: times[0] + windowMs - now }
  }

  times.push(now)
  hits.set(bucket, times)
  return { ok: true, remaining: limit - times.length, retryAfterMs: 0 }
}

/**
 * The caller's IP as the platform reports it.
 *
 * `x-forwarded-for` is a list appended to by each proxy; the client's own
 * address is the first entry. Trusting the last would let a caller pin itself
 * to whatever value it likes by sending its own header.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0].trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

/** Test seam. Nothing in the app should need to forget its counters. */
export function resetRateLimits(): void {
  hits.clear()
}
