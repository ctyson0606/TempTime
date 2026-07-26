import { NextResponse } from 'next/server'
import { apiError, isExpired, parseRoomCode, rateLimit, readJson } from '@/lib/api'
import { supabaseJwtSecret } from '@/lib/env'
import { signRoomToken } from '@/lib/jwt'
import { describeIssues, joinSchema } from '@/lib/schemas'
import { type ParticipantRow, type RoomRow, serverDb } from '@/lib/supabase/server'

type Context = { params: Promise<{ code: string }> }

/**
 * POST /api/rooms/:code/join — take a seat in a room. See PLAN.md section 6.
 *
 * No accounts: holding the room code is what grants entry, which is the point
 * of a QR you can scan (PLAN.md section 2.3). The token issued here expires
 * with the room, and can do exactly two things — read the aggregate, and submit
 * a mask.
 *
 * `participantId` comes back from the client's own storage on a return visit.
 * It is checked against this room before being reused, so a token or id from
 * another room cannot be replayed to hijack a seat here.
 */
export async function POST(request: Request, { params }: Context) {
  const limited = rateLimit(request, 'join')
  if (limited) return limited

  const code = parseRoomCode((await params).code)
  if (code === null) return apiError('INVALID_CODE', 'not a room code')

  const body = await readJson(request)
  if (body === null) return apiError('INVALID_BODY', 'expected a JSON body')

  const parsed = joinSchema.safeParse(body)
  if (!parsed.success) return apiError('INVALID_BODY', describeIssues(parsed.error))

  const db = serverDb()
  const { data: room, error } = await db
    .from('rooms')
    .select('id, expires_at')
    .eq('code', code)
    .maybeSingle<Pick<RoomRow, 'id' | 'expires_at'>>()

  if (error) return apiError('SERVER_ERROR', 'could not read the room')
  if (!room) return apiError('ROOM_NOT_FOUND', 'no such room')
  if (isExpired(room.expires_at))
    return apiError('ROOM_EXPIRED', 'this room has expired')

  const { displayName, participantId } = parsed.data
  let participant: Pick<ParticipantRow, 'id'> | null = null

  if (participantId) {
    // Scoped to this room: an id from elsewhere simply misses and a new member
    // is created, rather than renaming someone else's seat.
    const { data } = await db
      .from('participants')
      .update({ display_name: displayName })
      .eq('id', participantId)
      .eq('room_id', room.id)
      .select('id')
      .maybeSingle<Pick<ParticipantRow, 'id'>>()
    participant = data
  }

  if (!participant) {
    const { data, error: insertError } = await db
      .from('participants')
      .insert({ room_id: room.id, display_name: displayName })
      .select('id')
      .single<Pick<ParticipantRow, 'id'>>()

    if (insertError || !data) return apiError('SERVER_ERROR', 'could not join the room')
    participant = data
  }

  const token = await signRoomToken(
    { roomId: room.id, participantId: participant.id },
    { secret: supabaseJwtSecret(), expiresAt: new Date(room.expires_at) },
  )

  return NextResponse.json({
    participantId: participant.id,
    token,
    expiresAt: room.expires_at,
  })
}
