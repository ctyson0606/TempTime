import { DateTime } from 'luxon'
import { ISO_DATE } from './dates'

/**
 * Everything needed to lay out a room's grid.
 *
 * `dates` is an explicit ascending list, not a range. A `dayIndex` is a position
 * in that array, never a calendar offset — a room covering 07-26, 07-27 and
 * 08-15 has dayIndex 0, 1, 2, and the days in between do not exist on the grid.
 */
export interface RoomGrid {
  timezone: string
  dates: readonly string[]
  dayStartMin: number
  dayEndMin: number
  slotMinutes: number
}

/** The shape `blocksToMask` consumes. `BusyBlock` satisfies it structurally. */
export interface TimeInterval {
  start: Date
  end: Date
}

const MINUTES_PER_DAY = 1440

export function slotsPerDay(room: RoomGrid): number {
  return (room.dayEndMin - room.dayStartMin) / room.slotMinutes
}

export function totalSlots(room: RoomGrid): number {
  return room.dates.length * slotsPerDay(room)
}

export function slotDate(room: RoomGrid, dayIndex: number): string {
  const date = room.dates[dayIndex]
  if (date === undefined) {
    throw new RangeError(`dayIndex ${dayIndex} outside ${room.dates.length} dates`)
  }
  return date
}

/**
 * Resolve a wall-clock minute-of-day on a given calendar date.
 *
 * Built with `fromObject` rather than by adding minutes to midnight, because
 * users reason in wall time: 08:00 means 08:00 on the clock even on the day a
 * DST transition makes that day 23 or 25 hours long. Adding a duration would
 * drift by an hour on those two days a year.
 *
 * `minuteOfDay` may be 1440 (midnight ending the day), which is why the day
 * rolls over explicitly instead of relying on hour 24.
 */
function wallTime(room: RoomGrid, date: string, minuteOfDay: number): DateTime {
  const base = DateTime.fromFormat(date, ISO_DATE, { zone: room.timezone })
  if (!base.isValid) {
    throw new RangeError(`invalid room date: ${date}`)
  }
  const dayRollover = Math.floor(minuteOfDay / MINUTES_PER_DAY)
  const minute = minuteOfDay % MINUTES_PER_DAY
  return DateTime.fromObject(
    {
      year: base.year,
      month: base.month,
      day: base.day,
      hour: Math.floor(minute / 60),
      minute: minute % 60,
    },
    { zone: room.timezone },
  ).plus({ days: dayRollover })
}

export function slotStart(room: RoomGrid, index: number): DateTime {
  return slotRange(room, index).start
}

export function slotRange(
  room: RoomGrid,
  index: number,
): { start: DateTime; end: DateTime } {
  const perDay = slotsPerDay(room)
  if (!Number.isInteger(index) || index < 0 || index >= totalSlots(room)) {
    throw new RangeError(`slot ${index} outside grid of ${totalSlots(room)}`)
  }
  const date = slotDate(room, Math.floor(index / perDay))
  const offset = index % perDay
  const startMin = room.dayStartMin + offset * room.slotMinutes
  return {
    start: wallTime(room, date, startMin),
    end: wallTime(room, date, startMin + room.slotMinutes),
  }
}

/** Every slot's bounds, in index order. Cheap enough to rebuild per call. */
export function allSlotRanges(
  room: RoomGrid,
): Array<{ start: DateTime; end: DateTime }> {
  const ranges = []
  for (let i = 0; i < totalSlots(room); i++) ranges.push(slotRange(room, i))
  return ranges
}

/** Hours a room outlives its last slot before it is destroyed. */
export const EXPIRY_GRACE_HOURS = 24

/**
 * When the room is destroyed: the end of its last day, plus a grace period.
 *
 * The grace exists because deleting at the instant the last slot ends would
 * blank the page of anyone still looking at the result that evening. Note this
 * is derived from the dates chosen, not from creation time — two rooms created
 * together can expire three months apart.
 */
export function roomExpiresAt(room: RoomGrid): DateTime {
  if (room.dates.length === 0) {
    throw new RangeError('a room with no dates has no expiry')
  }
  const last = room.dates[room.dates.length - 1]
  return wallTime(room, last, room.dayEndMin).plus({ hours: EXPIRY_GRACE_HOURS })
}

/**
 * Instant to slot index, or `null` when it falls outside the grid.
 *
 * This is a lookup, not arithmetic. A contiguous room could subtract two dates
 * to get a dayIndex; with days chosen freely the date has to be found in
 * `dates`, and a miss means the instant is simply not on the grid. Getting this
 * wrong makes events vanish silently rather than throwing, so it is covered
 * directly by tests.
 */
export function timeToSlot(room: RoomGrid, at: DateTime): number | null {
  const local = at.setZone(room.timezone)
  if (!local.isValid) return null

  const dayIndex = room.dates.indexOf(local.toFormat(ISO_DATE))
  if (dayIndex < 0) return null

  const minuteOfDay = local.hour * 60 + local.minute
  if (minuteOfDay < room.dayStartMin || minuteOfDay >= room.dayEndMin) return null

  const offset = Math.floor((minuteOfDay - room.dayStartMin) / room.slotMinutes)
  return dayIndex * slotsPerDay(room) + offset
}

/**
 * Collapse busy intervals into the room's 0/1 mask.
 *
 * Deliberately conservative: a slot is busy if any interval overlaps it at all.
 * Over-reporting busy costs a candidate meeting time; under-reporting books over
 * something real.
 *
 * Intervals are half-open, so an event ending exactly when a slot begins leaves
 * that slot free. Anything outside the grid — including the middle of an
 * interval that spans days the room did not select — is dropped rather than
 * clamped.
 *
 * Scans every slot against every interval instead of mapping interval edges to
 * indices. At 224 slots the cost is irrelevant, and it removes the class of bug
 * where edge-mapping quietly mishandles a gap in `dates`.
 */
export function blocksToMask(room: RoomGrid, blocks: readonly TimeInterval[]): string {
  const total = totalSlots(room)
  const mask = new Array<string>(total).fill('0')
  const ranges = allSlotRanges(room).map((r) => ({
    start: r.start.toMillis(),
    end: r.end.toMillis(),
  }))

  for (const block of blocks) {
    const from = block.start.getTime()
    const to = block.end.getTime()
    // Zero-length and inverted intervals occupy no time and mark nothing.
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue

    for (let i = 0; i < total; i++) {
      if (mask[i] === '1') continue
      if (from < ranges[i].end && to > ranges[i].start) mask[i] = '1'
    }
  }

  return mask.join('')
}

export function emptyMask(room: RoomGrid): string {
  return '0'.repeat(totalSlots(room))
}

export function isValidMask(room: RoomGrid, mask: string): boolean {
  return mask.length === totalSlots(room) && /^[01]*$/.test(mask)
}

export function fullMask(room: RoomGrid): string {
  return '1'.repeat(totalSlots(room))
}

/**
 * The complement, which is the only conversion between what someone paints and
 * what gets stored.
 *
 * The grid takes free time and `submissions.busy_mask` holds busy time, so one
 * of the two has to be flipped. Doing it in exactly two places — just before a
 * submission leaves, and just after one comes back — is what keeps a single
 * meaning in the database; see PLAN.md section 3.4 on why two meanings there
 * would be the expensive mistake.
 */
export function invertMask(mask: string): string {
  let flipped = ''
  for (const cell of mask) flipped += cell === '1' ? '0' : '1'
  return flipped
}

/**
 * Everything set in `a` that is not set in `b`.
 *
 * This is how an import lands: the calendar can only take time away from what
 * someone offered, never add to it. Adding would assert an availability nobody
 * claimed — an empty hour on a calendar is not the same as a free one, which is
 * the over-reporting the old busy-first model was built on (PLAN.md section 10).
 */
export function subtractMask(a: string, b: string): string {
  if (a.length !== b.length) {
    throw new RangeError(`cannot subtract masks of ${b.length} from ${a.length} slots`)
  }
  let left = ''
  for (let i = 0; i < a.length; i++) {
    left += a[i] === '1' && b[i] !== '1' ? '1' : '0'
  }
  return left
}
