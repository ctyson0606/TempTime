import {
  type RoomGrid,
  isValidMask,
  slotRange,
  slotsPerDay,
  totalSlots,
} from '../slots'
import type { BusyBlock, ProviderId } from './types'

/**
 * Hand-painted busy time.
 *
 * Deliberately not a `BusyProvider`: there is nothing to connect to and nothing
 * to fetch. The drag *is* the input, so this module holds the mask arithmetic the
 * painter needs and nothing else. Providers that really fetch — `ics`, and the
 * platforms after it — implement that interface instead.
 */
export const MANUAL: ProviderId = 'manual'

/** Which of the room's days a slot falls on. A position in `dates`, not a date. */
export function slotDay(room: RoomGrid, slot: number): number {
  return Math.floor(slot / slotsPerDay(room))
}

/** How far into that day a slot sits, in slots. */
export function slotOffset(room: RoomGrid, slot: number): number {
  return slot % slotsPerDay(room)
}

export function isBusy(mask: string, slot: number): boolean {
  return mask[slot] === '1'
}

export function busyCount(mask: string): number {
  let count = 0
  for (const cell of mask) if (cell === '1') count++
  return count
}

/**
 * Every slot in the block a drag from `anchor` to `focus` covers.
 *
 * A drag defines a rectangle in day × time-of-day, not a run of indices: dragging
 * from Saturday 09:00 to Monday 11:00 means "those three mornings", which is what
 * a user picking three days actually means. Dragging a range of indices instead
 * would sweep through Saturday evening and Sunday night as well.
 *
 * Direction does not matter — the rectangle is the same dragged either way.
 */
export function blockSlots(room: RoomGrid, anchor: number, focus: number): number[] {
  const total = totalSlots(room)
  for (const slot of [anchor, focus]) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= total) {
      throw new RangeError(`slot ${slot} outside grid of ${total}`)
    }
  }

  const perDay = slotsPerDay(room)
  const [firstDay, lastDay] = order(slotDay(room, anchor), slotDay(room, focus))
  const [firstOffset, lastOffset] = order(
    slotOffset(room, anchor),
    slotOffset(room, focus),
  )

  const slots: number[] = []
  for (let day = firstDay; day <= lastDay; day++) {
    for (let offset = firstOffset; offset <= lastOffset; offset++) {
      slots.push(day * perDay + offset)
    }
  }
  return slots
}

/** Set every slot in the dragged block to `value`, leaving the rest untouched. */
export function paintBlock(
  room: RoomGrid,
  mask: string,
  anchor: number,
  focus: number,
  value: '0' | '1',
): string {
  if (!isValidMask(room, mask)) {
    throw new RangeError(`mask does not fit this room: ${mask.length} slots`)
  }
  const painted = [...mask]
  for (const slot of blockSlots(room, anchor, focus)) painted[slot] = value
  return painted.join('')
}

/**
 * The mask read back as human-readable intervals, for showing someone what they
 * marked.
 *
 * Runs stop at a day boundary. Indices being adjacent does not make them adjacent
 * in time — one day's last slot ends at 24:00 and the next day's first starts at
 * 08:00, and with days chosen freely the gap can be weeks.
 */
export function maskToBlocks(room: RoomGrid, mask: string): BusyBlock[] {
  if (!isValidMask(room, mask)) {
    throw new RangeError(`mask does not fit this room: ${mask.length} slots`)
  }

  const perDay = slotsPerDay(room)
  const blocks: BusyBlock[] = []

  for (let day = 0; day < room.dates.length; day++) {
    let runStart: number | null = null

    for (let offset = 0; offset <= perDay; offset++) {
      const slot = day * perDay + offset
      // The extra iteration past the day's last slot closes an open run.
      const busy = offset < perDay && isBusy(mask, slot)

      if (busy && runStart === null) {
        runStart = slot
      } else if (!busy && runStart !== null) {
        blocks.push({
          id: `${MANUAL}:${runStart}-${slot}`,
          start: slotRange(room, runStart).start.toJSDate(),
          end: slotRange(room, slot - 1).end.toJSDate(),
          source: MANUAL,
        })
        runStart = null
      }
    }
  }

  return blocks
}

function order(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a]
}
