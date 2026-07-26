import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { type RoomGrid, emptyMask } from '../lib/slots'
import {
  blockSlots,
  busyCount,
  isBusy,
  maskToBlocks,
  paintBlock,
  slotDay,
  slotOffset,
} from '../lib/providers/manual'

/** Two consecutive days plus one three weeks later — the gap is the point. */
const room: RoomGrid = {
  timezone: 'Asia/Taipei',
  dates: ['2026-07-26', '2026-07-27', '2026-08-15'],
  dayStartMin: 480,
  dayEndMin: 1440,
  slotMinutes: 30,
}

/** 32 slots a day: 08:00 is offset 0, 09:00 is 2, 12:00 is 8. */
const slot = (day: number, offset: number) => day * 32 + offset
const busyIndices = (mask: string) =>
  [...mask].flatMap((cell, index) => (cell === '1' ? [index] : []))
const iso = (date: Date) =>
  DateTime.fromJSDate(date).setZone(room.timezone).toFormat('MM-dd HH:mm')

describe('slotDay and slotOffset', () => {
  it('split a slot into its day position and time of day', () => {
    expect(slotDay(room, 0)).toBe(0)
    expect(slotOffset(room, 0)).toBe(0)
    expect(slotDay(room, 33)).toBe(1)
    expect(slotOffset(room, 33)).toBe(1)
    expect(slotDay(room, 95)).toBe(2)
    expect(slotOffset(room, 95)).toBe(31)
  })
})

describe('blockSlots', () => {
  it('covers a single cell when the drag never moves', () => {
    expect(blockSlots(room, slot(1, 4), slot(1, 4))).toEqual([slot(1, 4)])
  })

  it('covers a run within one day', () => {
    expect(blockSlots(room, slot(0, 2), slot(0, 5))).toEqual([
      slot(0, 2),
      slot(0, 3),
      slot(0, 4),
      slot(0, 5),
    ])
  })

  it('is the same rectangle dragged in either direction', () => {
    expect(blockSlots(room, slot(2, 9), slot(0, 4))).toEqual(
      blockSlots(room, slot(0, 4), slot(2, 9)),
    )
  })

  it('takes the same hours on each day, not the indices in between', () => {
    // Saturday 09:00 to Monday 10:00 means those three mornings — it must not
    // sweep through Saturday evening or Sunday night.
    const slots = blockSlots(room, slot(0, 2), slot(2, 4))
    expect(slots).toEqual([
      slot(0, 2),
      slot(0, 3),
      slot(0, 4),
      slot(1, 2),
      slot(1, 3),
      slot(1, 4),
      slot(2, 2),
      slot(2, 3),
      slot(2, 4),
    ])
    expect(slots).not.toContain(slot(0, 31))
    expect(slots).not.toContain(slot(1, 0))
  })

  it('spans the room days, not the calendar days between them', () => {
    // 07-26 to 08-15 is three weeks, but only three columns exist.
    const slots = blockSlots(room, slot(0, 0), slot(2, 0))
    expect(slots).toEqual([slot(0, 0), slot(1, 0), slot(2, 0)])
  })

  it('refuses a slot outside the grid', () => {
    expect(() => blockSlots(room, 0, 96)).toThrow(RangeError)
    expect(() => blockSlots(room, -1, 0)).toThrow(RangeError)
    expect(() => blockSlots(room, 0, 1.5)).toThrow(RangeError)
  })
})

describe('paintBlock', () => {
  it('marks exactly the dragged block busy', () => {
    const mask = paintBlock(room, emptyMask(room), slot(0, 2), slot(1, 3), '1')
    expect(busyIndices(mask)).toEqual([slot(0, 2), slot(0, 3), slot(1, 2), slot(1, 3)])
  })

  it('leaves everything outside the block alone', () => {
    const first = paintBlock(room, emptyMask(room), slot(2, 0), slot(2, 1), '1')
    const second = paintBlock(room, first, slot(0, 8), slot(0, 8), '1')
    expect(busyIndices(second)).toEqual([slot(0, 8), slot(2, 0), slot(2, 1)])
  })

  it('erases with the same rectangle', () => {
    const painted = paintBlock(room, emptyMask(room), slot(0, 0), slot(2, 31), '1')
    expect(busyCount(painted)).toBe(96)
    const erased = paintBlock(room, painted, slot(1, 4), slot(1, 6), '0')
    expect(busyCount(erased)).toBe(93)
    expect(isBusy(erased, slot(1, 5))).toBe(false)
    expect(isBusy(erased, slot(1, 7))).toBe(true)
  })

  it('refuses a mask that does not fit the room', () => {
    expect(() => paintBlock(room, '0'.repeat(95), 0, 0, '1')).toThrow(RangeError)
    expect(() => paintBlock(room, '2'.repeat(96), 0, 0, '1')).toThrow(RangeError)
  })
})

describe('maskToBlocks', () => {
  it('returns nothing for an empty mask', () => {
    expect(maskToBlocks(room, emptyMask(room))).toEqual([])
  })

  it('merges adjacent slots into one interval', () => {
    const mask = paintBlock(room, emptyMask(room), slot(0, 2), slot(0, 5), '1')
    const blocks = maskToBlocks(room, mask)
    expect(blocks).toHaveLength(1)
    expect(iso(blocks[0].start)).toBe('07-26 09:00')
    expect(iso(blocks[0].end)).toBe('07-26 11:00')
    expect(blocks[0].source).toBe('manual')
  })

  it('keeps a gap as two intervals', () => {
    let mask = paintBlock(room, emptyMask(room), slot(0, 0), slot(0, 1), '1')
    mask = paintBlock(room, mask, slot(0, 4), slot(0, 4), '1')
    const blocks = maskToBlocks(room, mask)
    expect(blocks.map((b) => `${iso(b.start)}–${iso(b.end)}`)).toEqual([
      '07-26 08:00–07-26 09:00',
      '07-26 10:00–07-26 10:30',
    ])
  })

  it('never merges across a day boundary', () => {
    // Last slot of day 0 and first slot of day 1 are adjacent indices, eight
    // hours apart in time.
    let mask = paintBlock(room, emptyMask(room), slot(0, 31), slot(0, 31), '1')
    mask = paintBlock(room, mask, slot(1, 0), slot(1, 0), '1')
    const blocks = maskToBlocks(room, mask)
    expect(blocks.map((b) => `${iso(b.start)}–${iso(b.end)}`)).toEqual([
      '07-26 23:30–07-27 00:00',
      '07-27 08:00–07-27 08:30',
    ])
  })

  it('never merges across a gap in the dates either', () => {
    const mask = paintBlock(room, emptyMask(room), slot(1, 31), slot(2, 31), '1')
    const blocks = maskToBlocks(room, mask)
    expect(blocks.map((b) => `${iso(b.start)}–${iso(b.end)}`)).toEqual([
      '07-27 23:30–07-28 00:00',
      '08-15 23:30–08-16 00:00',
    ])
  })

  it('closes a run that reaches the end of the last day', () => {
    const mask = paintBlock(room, emptyMask(room), slot(2, 30), slot(2, 31), '1')
    const blocks = maskToBlocks(room, mask)
    expect(blocks).toHaveLength(1)
    expect(iso(blocks[0].end)).toBe('08-16 00:00')
  })

  it('refuses a mask that does not fit the room', () => {
    expect(() => maskToBlocks(room, '0'.repeat(10))).toThrow(RangeError)
  })
})
