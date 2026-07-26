import { NextResponse } from 'next/server'
import { type RateLimitName, checkRateLimit, clientIp } from './rateLimit'
import { roomCodeSchema } from './schemas'

/**
 * Shared plumbing for the Route Handlers. Error responses all take the shape
 * `{ error, code }` from PLAN.md section 6, so the client has one thing to
 * branch on rather than parsing prose.
 */

export type ApiErrorCode =
  | 'RATE_LIMITED'
  | 'INVALID_BODY'
  | 'INVALID_CODE'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_EXPIRED'
  | 'FORBIDDEN'
  | 'CODE_COLLISION'
  | 'SERVER_ERROR'

const STATUS: Record<ApiErrorCode, number> = {
  RATE_LIMITED: 429,
  INVALID_BODY: 400,
  INVALID_CODE: 400,
  ROOM_NOT_FOUND: 404,
  ROOM_EXPIRED: 410,
  FORBIDDEN: 403,
  CODE_COLLISION: 503,
  SERVER_ERROR: 500,
}

export function apiError(code: ApiErrorCode, message: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status: STATUS[code] })
}

/**
 * Apply the endpoint's limit to this caller, returning a 429 to send back or
 * `null` to carry on.
 *
 * `Retry-After` is in seconds and rounded up: rounding down would advertise a
 * moment that is still refused.
 */
export function rateLimit(request: Request, name: RateLimitName): NextResponse | null {
  const result = checkRateLimit(name, clientIp(request.headers))
  if (result.ok) return null

  const response = apiError('RATE_LIMITED', 'too many requests, slow down')
  response.headers.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)))
  return response
}

/** `null` for a body that is not JSON at all, which callers map to INVALID_BODY. */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export function parseRoomCode(raw: string): string | null {
  const result = roomCodeSchema.safeParse(raw)
  return result.success ? result.data : null
}

/**
 * A room that is past `expires_at` but not yet purged is gone as far as anyone
 * asking is concerned, but it is not the same as a room that never existed or
 * was deleted by its creator — the two get different wording in the UI, so they
 * get different statuses here (410 against 404).
 */
export function isExpired(expiresAt: string, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime()
}
