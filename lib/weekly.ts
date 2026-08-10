import { DateTime } from 'luxon'
import { ISO_DATE } from './dates'
import { type RoomGrid, slotsPerDay } from './slots'

/**
 * A commitment that repeats every week: one weekday, one wall-clock window.
 *
 * This exists because a calendar file does not survive the thing it describes. A
 * university timetable export anchors every course to real dates and ends each
 * one with `UNTIL` at the close of term, so it stops importing the day term
 * ends — while "Mondays, two till six" is still true, and is what the person
 * meant. Painted once, it applies to whichever weekdays a room happens to cover.
 *
 * Stored in minutes rather than in slots for the same reason. A room fixes a day
 * window and a slot length; the commitment does not, and a pattern painted in a
 * 08:00–24:00 room has to still mean the same thing in a room that starts at
 * 06:00.
 */
export interface WeeklyBlock {
  /** ISO weekday: 1 is Monday, 7 is Sunday, matching Luxon. */
  weekday: number
  /** Minutes from midnight, read as wall time in the room's own timezone. */
  startMin: number
  endMin: number
}

export const WEEK_DAYS = 7

/**
 * The week the painter is drawn on.
 *
 * A fixed Monday, because nothing reads these dates for meaning — the grid shows
 * weekday names only, and every conversion in this module works in weekday and
 * minute-of-day arithmetic that never touches them. Anchoring to a real week
 * instead would put a DST transition inside the pattern twice a year, in a grid
 * whose whole point is that it is the same every week.
 */
const REFERENCE_MONDAY = '2024-01-01'

/**
 * A seven-day grid sharing the room's time axis, for painting a week on.
 *
 * Everything the room's own grid can do — dragging a rectangle, rendering,
 * hit-testing — works on this unchanged, because all of it is index arithmetic
 * over `dates`.
 */
export function weekGrid(room: RoomGrid): RoomGrid {
  const monday = DateTime.fromFormat(REFERENCE_MONDAY, ISO_DATE, {
    zone: room.timezone,
  })
  if (!monday.isValid) {
    throw new RangeError(`invalid timezone: ${room.timezone}`)
  }
  return {
    ...room,
    dates: Array.from({ length: WEEK_DAYS }, (_, day) =>
      monday.plus({ days: day }).toFormat(ISO_DATE),
    ),
  }
}

/** How many slots a week holds on this time axis. */
export function weekSlots(axis: RoomGrid): number {
  return WEEK_DAYS * slotsPerDay(axis)
}

/**
 * Does any block cover this slot?
 *
 * Half-open on both sides, matching `blocksToMask`: a class ending at 10:00 does
 * not occupy the slot starting at 10:00.
 */
function covers(
  blocks: readonly WeeklyBlock[],
  weekday: number,
  from: number,
  to: number,
): boolean {
  return blocks.some(
    (block) => block.weekday === weekday && block.startMin < to && block.endMin > from,
  )
}

/**
 * The pattern drawn on a week grid.
 *
 * `axis` supplies the day window and slot length only; its `dates` are ignored,
 * because the result is always seven days long.
 */
export function weeklyToWeekMask(
  axis: RoomGrid,
  blocks: readonly WeeklyBlock[],
): string {
  const perDay = slotsPerDay(axis)
  const cells: string[] = []
  for (let day = 0; day < WEEK_DAYS; day++) {
    for (let row = 0; row < perDay; row++) {
      const from = axis.dayStartMin + row * axis.slotMinutes
      cells.push(covers(blocks, day + 1, from, from + axis.slotMinutes) ? '1' : '0')
    }
  }
  return cells.join('')
}

/**
 * The painted week read back as intervals, one run at a time.
 *
 * Runs stop at a day boundary for the same reason `maskToBlocks` does: adjacent
 * indices are not adjacent in time when one day ends at 24:00 and the next
 * begins at 08:00.
 */
export function weekMaskToWeekly(axis: RoomGrid, mask: string): WeeklyBlock[] {
  const perDay = slotsPerDay(axis)
  if (mask.length !== WEEK_DAYS * perDay) {
    throw new RangeError(
      `week mask does not fit this axis: ${mask.length} of ${WEEK_DAYS * perDay}`,
    )
  }

  const blocks: WeeklyBlock[] = []
  for (let day = 0; day < WEEK_DAYS; day++) {
    let runFrom: number | null = null
    for (let row = 0; row <= perDay; row++) {
      // The extra iteration past the last row closes a run left open.
      const set = row < perDay && mask[day * perDay + row] === '1'
      const minute = axis.dayStartMin + row * axis.slotMinutes
      if (set && runFrom === null) {
        runFrom = minute
      } else if (!set && runFrom !== null) {
        blocks.push({ weekday: day + 1, startMin: runFrom, endMin: minute })
        runFrom = null
      }
    }
  }
  return blocks
}

/**
 * The pattern laid over a real room: one mask, marking every slot the weekly
 * commitment falls on.
 *
 * The room's days are matched by weekday in the room's own timezone, which is
 * the only timezone in play — every label on every grid is drawn in it, so a
 * pattern painted against those labels means the same thing here.
 */
export function weeklyToRoomMask(
  room: RoomGrid,
  blocks: readonly WeeklyBlock[],
): string {
  const perDay = slotsPerDay(room)
  const cells: string[] = []
  for (const date of room.dates) {
    const day = DateTime.fromFormat(date, ISO_DATE, { zone: room.timezone })
    if (!day.isValid) {
      throw new RangeError(`invalid room date: ${date}`)
    }
    for (let row = 0; row < perDay; row++) {
      const from = room.dayStartMin + row * room.slotMinutes
      cells.push(covers(blocks, day.weekday, from, from + room.slotMinutes) ? '1' : '0')
    }
  }
  return cells.join('')
}

/** Total time the pattern accounts for, in minutes. */
export function weeklyMinutes(blocks: readonly WeeklyBlock[]): number {
  return blocks.reduce((total, block) => total + (block.endMin - block.startMin), 0)
}

/**
 * Is this a usable block?
 *
 * Exported because the store reads data written by an older version of this page
 * as readily as by this one, and a stale shape must not be able to break a room.
 */
export function isWeeklyBlock(value: unknown): value is WeeklyBlock {
  if (typeof value !== 'object' || value === null) return false
  const block = value as Partial<WeeklyBlock>
  return (
    Number.isInteger(block.weekday) &&
    (block.weekday as number) >= 1 &&
    (block.weekday as number) <= WEEK_DAYS &&
    Number.isInteger(block.startMin) &&
    Number.isInteger(block.endMin) &&
    (block.startMin as number) >= 0 &&
    (block.endMin as number) > (block.startMin as number) &&
    (block.endMin as number) <= 1440
  )
}
