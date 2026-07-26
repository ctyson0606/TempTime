import { NextResponse } from 'next/server'
import {
  apiError,
  isExpired,
  parseRoomCode,
  rateLimit,
  readJson,
  roomMember,
} from '@/lib/api'
import { describeIssues, submitSchema } from '@/lib/schemas'
import { isValidMask, totalSlots } from '@/lib/slots'
import { type RoomRow, serverDb } from '@/lib/supabase/server'

type Context = { params: Promise<{ code: string }> }

/**
 * POST /api/rooms/:code/submit — send this member's 0/1 mask.
 *
 * This is the moment the privacy model pays off: what arrives is a string of
 * zeroes and ones and a list of source names, and that is all that is stored.
 * No event titles, no original boundaries, nothing about which platform it came
 * from (PLAN.md section 2.1). Unticking an event in the browser means its slots
 * arrive as `0` and are indistinguishable from time that was never busy.
 *
 * Repeatable: someone may change their mind and send again.
 */
export async function POST(request: Request, { params }: Context) {
  const limited = rateLimit(request, 'submit')
  if (limited) return limited

  const code = parseRoomCode((await params).code)
  if (code === null) return apiError('INVALID_CODE', 'not a room code')

  const db = serverDb()
  const { data: room, error } = await db
    .from('rooms')
    .select('id, timezone, dates, day_start_min, day_end_min, slot_minutes, expires_at')
    .eq('code', code)
    .maybeSingle<Omit<RoomRow, 'code' | 'title' | 'owner_secret_hash' | 'created_at'>>()

  if (error) return apiError('SERVER_ERROR', 'could not read the room')
  if (!room) return apiError('ROOM_NOT_FOUND', 'no such room')
  if (isExpired(room.expires_at))
    return apiError('ROOM_EXPIRED', 'this room has expired')

  const member = await roomMember(request, room.id)
  if (member === null) return apiError('UNAUTHORIZED', 'join this room first')

  const body = await readJson(request)
  if (body === null) return apiError('INVALID_BODY', 'expected a JSON body')

  const parsed = submitSchema.safeParse(body)
  if (!parsed.success) return apiError('INVALID_BODY', describeIssues(parsed.error))

  const grid = {
    timezone: room.timezone,
    dates: room.dates,
    dayStartMin: room.day_start_min,
    dayEndMin: room.day_end_min,
    slotMinutes: room.slot_minutes,
  }

  // The schema checked the characters; only the room knows the length. A mask
  // of the wrong size is a client built against a different grid, and storing
  // it would silently misalign every slot in the aggregate.
  if (!isValidMask(grid, parsed.data.busyMask)) {
    return apiError(
      'INVALID_BODY',
      `busyMask must be ${totalSlots(grid)} characters, got ${parsed.data.busyMask.length}`,
    )
  }

  const updatedAt = new Date().toISOString()
  const { error: writeError } = await db.from('submissions').upsert(
    {
      room_id: room.id,
      participant_id: member.participantId,
      busy_mask: parsed.data.busyMask,
      sources: parsed.data.sources,
      updated_at: updatedAt,
    },
    { onConflict: 'participant_id' },
  )

  if (writeError) return apiError('SERVER_ERROR', 'could not save your times')

  // The signal others watch. Realtime pushes this row, not the submission, so
  // what reaches another browser is "someone submitted" and nothing more.
  const { error: markError } = await db
    .from('participants')
    .update({ submitted_at: updatedAt })
    .eq('id', member.participantId)

  if (markError) return apiError('SERVER_ERROR', 'could not save your times')

  return NextResponse.json({ ok: true, updatedAt })
}

/**
 * DELETE /api/rooms/:code/submit — withdraw.
 *
 * Removes the row rather than blanking the mask: an all-zero mask means "I am
 * free the whole time", which is a real answer and not the same as not having
 * answered.
 */
export async function DELETE(request: Request, { params }: Context) {
  const limited = rateLimit(request, 'submit')
  if (limited) return limited

  const code = parseRoomCode((await params).code)
  if (code === null) return apiError('INVALID_CODE', 'not a room code')

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

  const member = await roomMember(request, room.id)
  if (member === null) return apiError('UNAUTHORIZED', 'join this room first')

  const { error: deleteError } = await db
    .from('submissions')
    .delete()
    .eq('participant_id', member.participantId)

  if (deleteError) return apiError('SERVER_ERROR', 'could not withdraw your times')

  const { error: markError } = await db
    .from('participants')
    .update({ submitted_at: null })
    .eq('id', member.participantId)

  if (markError) return apiError('SERVER_ERROR', 'could not withdraw your times')

  return NextResponse.json({ ok: true })
}
