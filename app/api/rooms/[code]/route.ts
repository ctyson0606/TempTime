import { NextResponse } from 'next/server'
import { apiError, isExpired, parseRoomCode, rateLimit } from '@/lib/api'
import { verifyOwnerSecret } from '@/lib/ownerSecret'
import { slotsPerDay, totalSlots } from '@/lib/slots'
import { type RoomRow, serverDb } from '@/lib/supabase/server'

type Context = { params: Promise<{ code: string }> }

/**
 * GET /api/rooms/:code — the room's settings. See PLAN.md section 6.
 *
 * Deliberately does not say whether the caller is the creator. The client
 * decides that from whether it holds an owner secret; the server only checks
 * one on DELETE. Anything else would turn this into an oracle for who owns
 * what.
 */
export async function GET(request: Request, { params }: Context) {
  const limited = rateLimit(request, 'readRoom')
  if (limited) return limited

  const code = parseRoomCode((await params).code)
  if (code === null) return apiError('INVALID_CODE', 'not a room code')

  const { data, error } = await serverDb()
    .from('rooms')
    .select('*')
    .eq('code', code)
    .maybeSingle<RoomRow>()

  if (error) return apiError('SERVER_ERROR', 'could not read the room')
  if (!data) return apiError('ROOM_NOT_FOUND', 'no such room')
  if (isExpired(data.expires_at)) {
    return apiError('ROOM_EXPIRED', 'this room has expired')
  }

  const grid = {
    timezone: data.timezone,
    dates: data.dates,
    dayStartMin: data.day_start_min,
    dayEndMin: data.day_end_min,
    slotMinutes: data.slot_minutes,
  }

  return NextResponse.json({
    id: data.id,
    code: data.code,
    title: data.title,
    ...grid,
    slotsPerDay: slotsPerDay(grid),
    totalSlots: totalSlots(grid),
    expiresAt: data.expires_at,
  })
}

/**
 * DELETE /api/rooms/:code — destroy a room, creator only.
 *
 * The secret arrives in a header rather than the URL so it stays out of server
 * logs and browser history. A wrong secret and a missing room are told apart —
 * knowing a room exists is not a secret, since anyone with the code can see
 * that from GET — but a wrong secret never says how wrong it was.
 *
 * Cascades take participants and submissions with the room, so everyone's data
 * goes. The UI confirms twice before calling this.
 */
export async function DELETE(request: Request, { params }: Context) {
  const limited = rateLimit(request, 'deleteRoom')
  if (limited) return limited

  const code = parseRoomCode((await params).code)
  if (code === null) return apiError('INVALID_CODE', 'not a room code')

  const secret = request.headers.get('x-owner-secret')
  if (!secret)
    return apiError('FORBIDDEN', 'this room can only be deleted by its creator')

  const db = serverDb()
  const { data, error } = await db
    .from('rooms')
    .select('id, owner_secret_hash')
    .eq('code', code)
    .maybeSingle<Pick<RoomRow, 'id' | 'owner_secret_hash'>>()

  if (error) return apiError('SERVER_ERROR', 'could not read the room')
  if (!data) return apiError('ROOM_NOT_FOUND', 'no such room')

  if (!verifyOwnerSecret(secret, data.owner_secret_hash)) {
    return apiError('FORBIDDEN', 'this room can only be deleted by its creator')
  }

  const { error: deleteError } = await db.from('rooms').delete().eq('id', data.id)
  if (deleteError) return apiError('SERVER_ERROR', 'could not delete the room')

  return NextResponse.json({ ok: true })
}
