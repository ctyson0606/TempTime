import { beforeEach, describe, expect, it } from 'vitest'
import type { RoomGrid } from '../lib/slots'
import {
  type WeeklyBlock,
  WEEK_DAYS,
  isWeeklyBlock,
  weekGrid,
  weekMaskToWeekly,
  weekSlots,
  weeklyMinutes,
  weeklyToRoomMask,
  weeklyToWeekMask,
} from '../lib/weekly'
import { clearWeekly, loadWeekly, saveWeekly } from '../lib/weeklyStore'

/** 09:00 to 12:00 in half-hours: six slots a day, small enough to read. */
const axis: RoomGrid = {
  timezone: 'Asia/Taipei',
  dates: ['2026-08-17'],
  dayStartMin: 540,
  dayEndMin: 720,
  slotMinutes: 30,
}

/** Three Mondays and one Wednesday — the case that prompted this feature. */
const room: RoomGrid = {
  ...axis,
  dates: ['2026-08-17', '2026-08-19', '2026-08-24', '2026-08-31'],
}

const MONDAY = 1
const WEDNESDAY = 3

const marked = (mask: string) =>
  [...mask].flatMap((cell, index) => (cell === '1' ? [index] : []))

describe('weekGrid', () => {
  it('is seven days beginning on a Monday', () => {
    const week = weekGrid(axis)
    expect(week.dates).toHaveLength(WEEK_DAYS)
    expect(week.timezone).toBe(axis.timezone)
    expect(week.slotMinutes).toBe(axis.slotMinutes)
    expect(weekSlots(week)).toBe(WEEK_DAYS * 6)
  })
})

describe('weeklyToWeekMask', () => {
  it('marks only the slots the window covers, half-open at both ends', () => {
    // 10:00–11:00 is slots 2 and 3 of a day that starts at 09:00. The slot
    // beginning at 11:00 is not covered by a block that ends at 11:00.
    const mask = weeklyToWeekMask(axis, [
      { weekday: MONDAY, startMin: 600, endMin: 660 },
    ])
    expect(marked(mask)).toEqual([2, 3])
  })

  it('puts each weekday in its own column', () => {
    const mask = weeklyToWeekMask(axis, [
      { weekday: MONDAY, startMin: 540, endMin: 570 },
      { weekday: 7, startMin: 540, endMin: 570 },
    ])
    // Monday is column 0, Sunday column 6, at six slots a day.
    expect(marked(mask)).toEqual([0, 36])
  })
})

describe('weekMaskToWeekly', () => {
  it('round-trips a painted week', () => {
    const blocks: WeeklyBlock[] = [
      { weekday: MONDAY, startMin: 540, endMin: 630 },
      { weekday: WEDNESDAY, startMin: 660, endMin: 720 },
    ]
    const mask = weeklyToWeekMask(axis, blocks)
    expect(weekMaskToWeekly(axis, mask)).toEqual(blocks)
    expect(weeklyToWeekMask(axis, weekMaskToWeekly(axis, mask))).toBe(mask)
  })

  it('does not run one day into the next', () => {
    // Monday's last slot and Tuesday's first are adjacent indices and hours
    // apart in time. One block spanning them would be a lie about both.
    const perDay = 6
    const cells = Array.from({ length: WEEK_DAYS * perDay }, () => '0')
    cells[perDay - 1] = '1'
    cells[perDay] = '1'
    const blocks = weekMaskToWeekly(axis, cells.join(''))
    expect(blocks).toEqual([
      { weekday: 1, startMin: 690, endMin: 720 },
      { weekday: 2, startMin: 540, endMin: 570 },
    ])
  })

  it('refuses a mask that is not a week on this axis', () => {
    expect(() => weekMaskToWeekly(axis, '0'.repeat(10))).toThrow(RangeError)
  })
})

describe('weeklyToRoomMask', () => {
  it('applies to every matching weekday the room covers', () => {
    // The question this feature answers: three Mondays are selected, and one
    // Monday commitment lands on all three.
    const mask = weeklyToRoomMask(room, [
      { weekday: MONDAY, startMin: 600, endMin: 660 },
    ])
    // Days 0, 2 and 3 are the Mondays; day 1 is the Wednesday.
    expect(marked(mask)).toEqual([2, 3, 14, 15, 20, 21])
  })

  it('marks nothing on a weekday the pattern does not name', () => {
    const mask = weeklyToRoomMask(room, [{ weekday: 6, startMin: 540, endMin: 720 }])
    expect(mask).toBe('0'.repeat(mask.length))
  })

  it('is the room-shaped complement of nothing when the pattern is empty', () => {
    expect(weeklyToRoomMask(room, [])).toBe('0'.repeat(4 * 6))
  })
})

describe('weeklyMinutes', () => {
  it('adds the windows up', () => {
    expect(
      weeklyMinutes([
        { weekday: MONDAY, startMin: 540, endMin: 660 },
        { weekday: WEDNESDAY, startMin: 600, endMin: 630 },
      ]),
    ).toBe(150)
  })
})

describe('isWeeklyBlock', () => {
  it('accepts a real block and rejects the ways one goes wrong', () => {
    expect(isWeeklyBlock({ weekday: 1, startMin: 540, endMin: 600 })).toBe(true)
    expect(isWeeklyBlock({ weekday: 0, startMin: 540, endMin: 600 })).toBe(false)
    expect(isWeeklyBlock({ weekday: 8, startMin: 540, endMin: 600 })).toBe(false)
    expect(isWeeklyBlock({ weekday: 1, startMin: 600, endMin: 600 })).toBe(false)
    expect(isWeeklyBlock({ weekday: 1, startMin: 540, endMin: 1441 })).toBe(false)
    expect(isWeeklyBlock({ weekday: 1, startMin: -30, endMin: 600 })).toBe(false)
    expect(isWeeklyBlock(null)).toBe(false)
    expect(isWeeklyBlock('monday')).toBe(false)
  })
})

/** Enough of the Storage interface for this module, without a DOM. */
function installLocalStorage(): Map<string, string> {
  const entries = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
    },
  })
  return entries
}

describe('weeklyStore', () => {
  let entries: Map<string, string>

  beforeEach(() => {
    entries = installLocalStorage()
  })

  it('round-trips a pattern', () => {
    const blocks: WeeklyBlock[] = [{ weekday: MONDAY, startMin: 840, endMin: 1080 }]
    saveWeekly(blocks)
    expect(loadWeekly()).toEqual(blocks)
  })

  it('survives this device having nothing stored', () => {
    expect(loadWeekly()).toBeNull()
  })

  it('reads a malformed pattern as absent rather than throwing', () => {
    entries.set('temptime:weekly', '{ not json')
    expect(loadWeekly()).toBeNull()
    entries.set('temptime:weekly', '{"weekday":1}')
    expect(loadWeekly()).toBeNull()
  })

  it('drops one bad block without losing the good ones', () => {
    entries.set(
      'temptime:weekly',
      JSON.stringify([
        { weekday: 1, startMin: 540, endMin: 600 },
        { weekday: 99, startMin: 540, endMin: 600 },
      ]),
    )
    expect(loadWeekly()).toEqual([{ weekday: 1, startMin: 540, endMin: 600 }])
  })

  it('saving nothing clears the device rather than storing an empty list', () => {
    saveWeekly([{ weekday: MONDAY, startMin: 540, endMin: 600 }])
    saveWeekly([])
    expect(entries.has('temptime:weekly')).toBe(false)
    expect(loadWeekly()).toBeNull()
  })

  it('clears on request', () => {
    saveWeekly([{ weekday: MONDAY, startMin: 540, endMin: 600 }])
    clearWeekly()
    expect(loadWeekly()).toBeNull()
  })
})
