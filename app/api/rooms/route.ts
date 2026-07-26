import { NextResponse } from 'next/server'
import { apiError, rateLimit, readJson } from '@/lib/api'
import { generateOwnerSecret, hashOwnerSecret } from '@/lib/ownerSecret'
import { DEFAULT_SLOT_MINUTES } from '@/lib/room'
import { generateRoomCode } from '@/lib/roomCode'
import { createRoomSchema, describeIssues } from '@/lib/schemas'
import { roomExpiresAt } from '@/lib/slots'
import { serverDb } from '@/lib/supabase/server'

/** Postgres unique_violation: the generated code was already taken. */
const UNIQUE_VIOLATION = '23505'

/**
 * 30^6 codes against a handful of live rooms makes one collision unlikely and
 * five in a row effectively impossible — five failures means something else is
 * wrong, and looping forever would turn that into a hung request.
 */
const CODE_ATTEMPTS = 5

/**
 * POST /api/rooms — create a room. See PLAN.md section 6.
 *
 * `ownerSecret` is in the response and nowhere else: only its hash is stored,
 * so this is the one moment it exists in plaintext outside the creator's
 * browser. Everything the client sent is re-validated here; the browser runs
 * the same schema only to produce a better error message.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, 'createRoom')
  if (limited) return limited

  const body = await readJson(request)
  if (body === null) return apiError('INVALID_BODY', 'expected a JSON body')

  const parsed = createRoomSchema.safeParse(body)
  if (!parsed.success) return apiError('INVALID_BODY', describeIssues(parsed.error))

  const input = parsed.data
  const grid = {
    timezone: input.timezone,
    dates: input.dates,
    dayStartMin: input.dayStartMin,
    dayEndMin: input.dayEndMin,
    slotMinutes: DEFAULT_SLOT_MINUTES,
  }

  // Derived from the last date chosen, not from now: two rooms created together
  // can expire three months apart (PLAN.md section 4.3).
  const expiresAt = roomExpiresAt(grid).toUTC().toISO()
  if (expiresAt === null) {
    return apiError('SERVER_ERROR', 'could not determine when this room expires')
  }

  const ownerSecret = generateOwnerSecret()
  const db = serverDb()

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode()
    const { error } = await db.from('rooms').insert({
      code,
      title: input.title,
      timezone: input.timezone,
      dates: input.dates,
      day_start_min: input.dayStartMin,
      day_end_min: input.dayEndMin,
      slot_minutes: DEFAULT_SLOT_MINUTES,
      owner_secret_hash: hashOwnerSecret(ownerSecret),
      expires_at: expiresAt,
    })

    if (!error) {
      return NextResponse.json({ code, ownerSecret, expiresAt }, { status: 201 })
    }
    if (error.code !== UNIQUE_VIOLATION) {
      return apiError('SERVER_ERROR', 'could not create the room')
    }
  }

  return apiError('CODE_COLLISION', 'could not allocate a room code, try again')
}
