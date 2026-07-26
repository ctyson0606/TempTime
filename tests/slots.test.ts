import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import {
  type RoomGrid,
  blocksToMask,
  emptyMask,
  isValidMask,
  roomExpiresAt,
  slotDate,
  slotRange,
  slotStart,
  slotsPerDay,
  timeToSlot,
  totalSlots,
  unionMasks,
} from '../lib/slots'

/** Two consecutive days plus one three weeks later — the gap is the point. */
const room: RoomGrid = {
  timezone: 'Asia/Taipei',
  dates: ['2026-07-26', '2026-07-27', '2026-08-15'],
  dayStartMin: 480,
  dayEndMin: 1440,
  slotMinutes: 30,
}

const wall = (iso: string) => DateTime.fromISO(iso, { zone: room.timezone })
const at = (iso: string) => wall(iso).toJSDate()
const block = (from: string, to: string) => ({ start: at(from), end: at(to) })
const busyIndices = (mask: string) =>
  [...mask].flatMap((c, i) => (c === '1' ? [i] : []))

describe('grid size', () => {
  it('derives 32 slots per day and 96 in total', () => {
    expect(slotsPerDay(room)).toBe(32)
    expect(totalSlots(room)).toBe(96)
  })
})

describe('slotDate', () => {
  it('indexes into dates, not the calendar', () => {
    expect(slotDate(room, 0)).toBe('2026-07-26')
    expect(slotDate(room, 1)).toBe('2026-07-27')
    // Day 2 is 19 calendar days after day 1.
    expect(slotDate(room, 2)).toBe('2026-08-15')
  })

  it('throws past the end', () => {
    expect(() => slotDate(room, 3)).toThrow(RangeError)
  })
})

describe('slotRange', () => {
  const fmt = (dt: DateTime) => dt.toFormat('yyyy-MM-dd HH:mm')

  it('starts the first day at the configured hour', () => {
    expect(fmt(slotRange(room, 0).start)).toBe('2026-07-26 08:00')
    expect(fmt(slotRange(room, 0).end)).toBe('2026-07-26 08:30')
  })

  it('rolls the final slot over into the next calendar day', () => {
    expect(fmt(slotRange(room, 31).start)).toBe('2026-07-26 23:30')
    expect(fmt(slotRange(room, 31).end)).toBe('2026-07-27 00:00')
  })

  it('jumps to the next selected date, not the next calendar date', () => {
    expect(fmt(slotRange(room, 32).start)).toBe('2026-07-27 08:00')
    expect(fmt(slotRange(room, 64).start)).toBe('2026-08-15 08:00')
  })

  it('rejects indices outside the grid', () => {
    expect(() => slotRange(room, -1)).toThrow(RangeError)
    expect(() => slotRange(room, 96)).toThrow(RangeError)
    expect(() => slotRange(room, 1.5)).toThrow(RangeError)
  })
})

describe('slotRange across a DST transition', () => {
  // 2026-03-08 is when US clocks jump from 02:00 to 03:00.
  const dstRoom: RoomGrid = {
    timezone: 'America/New_York',
    dates: ['2026-03-07', '2026-03-08'],
    dayStartMin: 480,
    dayEndMin: 1440,
    slotMinutes: 30,
  }

  it('keeps wall-clock 08:00 on both sides of the jump', () => {
    expect(slotStart(dstRoom, 0).toFormat('HH:mm')).toBe('08:00')
    expect(slotStart(dstRoom, 32).toFormat('HH:mm')).toBe('08:00')
  })

  it('shifts the underlying instant by an hour, as it must', () => {
    // Same wall time, different offset: EST before, EDT after.
    expect(slotStart(dstRoom, 0).toUTC().toFormat('HH:mm')).toBe('13:00')
    expect(slotStart(dstRoom, 32).toUTC().toFormat('HH:mm')).toBe('12:00')
  })
})

describe('timeToSlot', () => {
  it('round-trips every slot start', () => {
    for (let i = 0; i < totalSlots(room); i++) {
      expect(timeToSlot(room, slotStart(room, i))).toBe(i)
    }
  })

  it('maps a time inside a slot to that slot', () => {
    expect(timeToSlot(room, wall('2026-07-26T09:29'))).toBe(2)
  })

  it('returns null for a date the room did not select', () => {
    expect(timeToSlot(room, wall('2026-07-28T10:00'))).toBeNull()
    expect(timeToSlot(room, wall('2026-08-01T10:00'))).toBeNull()
  })

  it('returns null outside the daily window', () => {
    expect(timeToSlot(room, wall('2026-07-26T07:59'))).toBeNull()
    expect(timeToSlot(room, wall('2026-07-26T08:00'))).toBe(0)
    expect(timeToSlot(room, wall('2026-07-26T23:59'))).toBe(31)
  })

  it('reads an instant in the room timezone, whatever zone it arrives in', () => {
    // 2026-07-26 09:00 Taipei expressed as UTC.
    expect(timeToSlot(room, DateTime.fromISO('2026-07-26T01:00:00Z'))).toBe(2)
  })
})

describe('blocksToMask', () => {
  it('marks every slot an interval touches', () => {
    const mask = blocksToMask(room, [block('2026-07-26T09:00', '2026-07-26T10:00')])
    expect(busyIndices(mask)).toEqual([2, 3])
  })

  it('treats intervals as half-open at both ends', () => {
    // Ends exactly when slot 2 begins, so slot 2 stays free.
    expect(
      busyIndices(blocksToMask(room, [block('2026-07-26T08:00', '2026-07-26T09:00')])),
    ).toEqual([0, 1])
    // Starts exactly when slot 2 begins, so slot 1 stays free.
    expect(
      busyIndices(blocksToMask(room, [block('2026-07-26T09:00', '2026-07-26T09:30')])),
    ).toEqual([2])
  })

  it('marks a slot that is only partly covered', () => {
    expect(
      busyIndices(blocksToMask(room, [block('2026-07-26T09:15', '2026-07-26T09:20')])),
    ).toEqual([2])
  })

  it('drops an interval that falls entirely outside the grid', () => {
    expect(blocksToMask(room, [block('2026-07-28T09:00', '2026-07-28T10:00')])).toBe(
      emptyMask(room),
    )
    // Inside a selected date but before the daily window opens.
    expect(blocksToMask(room, [block('2026-07-26T03:00', '2026-07-26T05:00')])).toBe(
      emptyMask(room),
    )
  })

  it('marks only the ends of an interval spanning unselected days', () => {
    const mask = blocksToMask(room, [block('2026-07-27T22:00', '2026-08-15T09:00')])
    // 22:00-24:00 on day 1, then 08:00-09:00 on day 2. Nothing in between,
    // because nothing in between is on the grid.
    expect(busyIndices(mask)).toEqual([60, 61, 62, 63, 64, 65])
  })

  it('ignores zero-length and inverted intervals', () => {
    expect(blocksToMask(room, [block('2026-07-26T09:00', '2026-07-26T09:00')])).toBe(
      emptyMask(room),
    )
    expect(blocksToMask(room, [block('2026-07-26T10:00', '2026-07-26T09:00')])).toBe(
      emptyMask(room),
    )
  })

  it('unions overlapping intervals', () => {
    const mask = blocksToMask(room, [
      block('2026-07-26T09:00', '2026-07-26T10:00'),
      block('2026-07-26T09:30', '2026-07-26T11:00'),
    ])
    expect(busyIndices(mask)).toEqual([2, 3, 4, 5])
  })

  it('produces a mask of the right shape for an empty list', () => {
    const mask = blocksToMask(room, [])
    expect(mask).toBe(emptyMask(room))
    expect(mask).toHaveLength(96)
  })
})

describe('isValidMask', () => {
  it('requires the exact length and only 0/1', () => {
    expect(isValidMask(room, emptyMask(room))).toBe(true)
    expect(isValidMask(room, '0'.repeat(95))).toBe(false)
    expect(isValidMask(room, '2'.repeat(96))).toBe(false)
  })
})

describe('roomExpiresAt', () => {
  it('is the end of the last day plus the grace period', () => {
    // Last date is 2026-08-15, dayEndMin 1440 = midnight starting 08-16, +24h.
    expect(roomExpiresAt(room).toISO()).toBe(wall('2026-08-17T00:00').toISO())
  })

  it('follows the last selected date, not the first', () => {
    const short: RoomGrid = { ...room, dates: ['2026-07-26'] }
    expect(roomExpiresAt(short).toISO()).toBe(wall('2026-07-28T00:00').toISO())
  })

  it('respects a day that ends before midnight', () => {
    const evening: RoomGrid = { ...room, dayEndMin: 1320 }
    expect(roomExpiresAt(evening).toISO()).toBe(wall('2026-08-16T22:00').toISO())
  })

  it('is anchored in the room timezone, not the runtime one', () => {
    const utc: RoomGrid = { ...room, timezone: 'UTC' }
    expect(roomExpiresAt(utc).toUTC().toISO()).toBe(
      DateTime.fromISO('2026-08-17T00:00', { zone: 'UTC' }).toISO(),
    )
    expect(roomExpiresAt(room).toUTC().toISO()).toBe(
      DateTime.fromISO('2026-08-16T16:00', { zone: 'UTC' }).toISO(),
    )
  })

  it('refuses a room with no dates', () => {
    expect(() => roomExpiresAt({ ...room, dates: [] })).toThrow(RangeError)
  })
})

describe('unionMasks', () => {
  it('is busy where either side is busy', () => {
    expect(unionMasks('0011', '0101')).toBe('0111')
  })

  it('leaves a mask alone when merged with an empty one', () => {
    const mask = '1'.repeat(96)
    expect(unionMasks(mask, emptyMask(room))).toBe(mask)
  })

  it('refuses masks of different lengths', () => {
    expect(() => unionMasks('000', '0000')).toThrow(RangeError)
  })
})
