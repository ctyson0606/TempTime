import { NextResponse } from 'next/server'
import { apiError, isExpired, parseRoomCode, rateLimit, roomMember } from '@/lib/api'
import { type RoomRow, serverDb } from '@/lib/supabase/server'

type Context = { params: Promise<{ code: string }> }

/**
 * GET /api/rooms/:code/my-submission — the caller's own mask, and only theirs.
 *
 * The single exception to "individual masks never leave the server" (PLAN.md
 * section 6). It exists so "change my times" starts from what was sent rather
 * than from a blank grid, and it is keyed on the participant id inside the
 * token, never on anything the caller can name — asking for someone else's is
 * not a request this endpoint can express.
 */
export async function GET(request: Request, { params }: Context) {
  const limited = rateLimit(request, 'readRoom')
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

  const { data, error: readError } = await db
    .from('submissions')
    .select('busy_mask, sources, updated_at')
    .eq('participant_id', member.participantId)
    .maybeSingle<{ busy_mask: string; sources: string[]; updated_at: string }>()

  if (readError) return apiError('SERVER_ERROR', 'could not read your times')

  // Not having submitted is an ordinary state, not an error: it is where every
  // member starts.
  if (!data) return NextResponse.json({ busyMask: null, sources: [], updatedAt: null })

  return NextResponse.json({
    busyMask: data.busy_mask,
    sources: data.sources,
    updatedAt: data.updated_at,
  })
}
