import { NextResponse } from 'next/server'
import { apiError, isExpired, parseRoomCode, rateLimit, roomMember } from '@/lib/api'
import { type Aggregated, aggregate, findBestSlots } from '@/lib/aggregate'
import { slotsPerDay, totalSlots } from '@/lib/slots'
import { type ParticipantRow, type RoomRow, serverDb } from '@/lib/supabase/server'

type Context = { params: Promise<{ code: string }> }

type RoomFields = Pick<
  RoomRow,
  | 'id'
  | 'timezone'
  | 'dates'
  | 'day_start_min'
  | 'day_end_min'
  | 'slot_minutes'
  | 'expires_at'
>

type ParticipantFields = Pick<ParticipantRow, 'id' | 'display_name' | 'submitted_at'>

/**
 * GET /api/rooms/:code/heatmap — everyone's answers, overlaid. See PLAN.md
 * section 6.
 *
 * This is the endpoint the privacy model exists for. It is the only place that
 * reads more than one person's `busy_mask`, and none of them leave: the masks go
 * into `aggregate` and what comes back out is a count per slot. Who is busy when
 * is not derivable from a count, which is why the members list carries a
 * `submitted` boolean and nothing else.
 *
 * One case is inherent rather than a leak to fix here: with a single submitter
 * the counts *are* that person's mask, inverted. That is what an overlay of one
 * thing looks like, and it resolves itself the moment a second person sends.
 *
 * Membership is required. Anyone holding the code could call `GET
 * /api/rooms/:code` and see the room exists, but seeing what people answered
 * takes a token this room issued.
 */
export async function GET(request: Request, { params }: Context) {
  const limited = rateLimit(request, 'heatmap')
  if (limited) return limited

  const code = parseRoomCode((await params).code)
  if (code === null) return apiError('INVALID_CODE', 'not a room code')

  const db = serverDb()
  const { data: room, error } = await db
    .from('rooms')
    .select('id, timezone, dates, day_start_min, day_end_min, slot_minutes, expires_at')
    .eq('code', code)
    .maybeSingle<RoomFields>()

  if (error) return apiError('SERVER_ERROR', 'could not read the room')
  if (!room) return apiError('ROOM_NOT_FOUND', 'no such room')
  if (isExpired(room.expires_at))
    return apiError('ROOM_EXPIRED', 'this room has expired')

  const member = await roomMember(request, room.id)
  if (member === null) return apiError('UNAUTHORIZED', 'join this room first')

  const [people, sent] = await Promise.all([
    db
      .from('participants')
      .select('id, display_name, submitted_at')
      .eq('room_id', room.id)
      // Stable order for the members list: whoever arrived first stays first,
      // so a re-poll does not shuffle the names under the reader's eyes.
      .order('joined_at', { ascending: true })
      .returns<ParticipantFields[]>(),
    db
      .from('submissions')
      .select('busy_mask')
      .eq('room_id', room.id)
      .returns<Array<{ busy_mask: string }>>(),
  ])

  if (people.error || sent.error) {
    return apiError('SERVER_ERROR', 'could not read this room’s answers')
  }

  const grid = {
    timezone: room.timezone,
    dates: room.dates,
    dayStartMin: room.day_start_min,
    dayEndMin: room.day_end_min,
    slotMinutes: room.slot_minutes,
  }

  let counts: Aggregated
  try {
    counts = aggregate(
      (sent.data ?? []).map((row) => row.busy_mask),
      totalSlots(grid),
    )
  } catch {
    // A stored mask whose length is not this room's means the grid moved under
    // it. Nothing in the app can currently do that, and refusing is the right
    // answer anyway: an aggregate misaligned by one slot reads as a real result.
    return apiError('SERVER_ERROR', 'stored answers do not fit this room’s grid')
  }

  const participants = (people.data ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    submitted: p.submitted_at !== null,
  }))

  return NextResponse.json({
    participants,
    submittedCount: counts.submittedCount,
    freeCounts: counts.freeCounts,
    bestSlots: findBestSlots(counts.freeCounts, counts.submittedCount, {
      slotsPerDay: slotsPerDay(grid),
    }),
    // Read from the same list everyone else is judged by, rather than a separate
    // lookup, so the caller's own row cannot disagree with what it says.
    mySubmitted: participants.some((p) => p.id === member.participantId && p.submitted),
  })
}
