import { describe, expect, it } from 'vitest'
import { aggregate, findBestSlots } from '../lib/aggregate'

describe('aggregate', () => {
  it('returns correctly shaped arrays when nobody has submitted', () => {
    expect(aggregate([], 4)).toEqual({
      submittedCount: 0,
      busyCounts: [0, 0, 0, 0],
      freeCounts: [0, 0, 0, 0],
    })
  })

  it('counts busy and free per slot', () => {
    expect(aggregate(['1100', '1010'], 4)).toEqual({
      submittedCount: 2,
      busyCounts: [2, 1, 1, 0],
      freeCounts: [0, 1, 1, 2],
    })
  })

  it('rejects a mask of the wrong length rather than silently truncating', () => {
    expect(() => aggregate(['110'], 4)).toThrow(RangeError)
  })
})

describe('findBestSlots', () => {
  const opts = { slotsPerDay: 4 }

  it('returns nothing before anyone submits', () => {
    expect(findBestSlots([0, 0, 0, 0], 0, opts)).toEqual([])
  })

  it('returns nothing when every slot is busy for everyone', () => {
    expect(findBestSlots([0, 0, 0, 0], 2, opts)).toEqual([])
  })

  it('finds a run where everyone is free', () => {
    expect(findBestSlots([0, 3, 3, 0], 3, opts)).toEqual([
      { startSlot: 1, endSlot: 3, freeCount: 3, isEveryone: true },
    ])
  })

  it('never merges runs across a day boundary', () => {
    // Two full days, everyone free throughout. Index 3 and index 4 are adjacent
    // in the array but separated by eight hours of night — or by weeks, when
    // the dates are not consecutive.
    const result = findBestSlots([1, 1, 1, 1, 1, 1, 1, 1], 1, opts)
    expect(result).toEqual([
      { startSlot: 0, endSlot: 4, freeCount: 1, isEveryone: true },
      { startSlot: 4, endSlot: 8, freeCount: 1, isEveryone: true },
    ])
  })

  it('does not bridge a boundary even when only the edges are free', () => {
    // Free at the very end of one day and the very start of the next.
    const result = findBestSlots([0, 0, 1, 1, 1, 1, 0, 0], 1, opts)
    expect(result).toEqual([
      { startSlot: 2, endSlot: 4, freeCount: 1, isEveryone: true },
      { startSlot: 4, endSlot: 6, freeCount: 1, isEveryone: true },
    ])
  })

  it('sorts by length, then by earliest start', () => {
    // Day 0: a run of 2. Day 1: a run of 4. Day 2: another run of 2.
    const free = [1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1]
    expect(findBestSlots(free, 1, opts)).toEqual([
      { startSlot: 4, endSlot: 8, freeCount: 1, isEveryone: true },
      { startSlot: 0, endSlot: 2, freeCount: 1, isEveryone: true },
      { startSlot: 10, endSlot: 12, freeCount: 1, isEveryone: true },
    ])
  })

  it('caps the result at the limit', () => {
    const free = [1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0]
    expect(findBestSlots(free, 1, opts)).toHaveLength(3)
    expect(findBestSlots(free, 1, { ...opts, limit: 2 })).toHaveLength(2)
  })

  it('drops runs shorter than the minimum duration', () => {
    // A single free slot on day 0, a two-slot run on day 1.
    const result = findBestSlots([1, 0, 0, 0, 1, 1, 0, 0], 1, opts)
    expect(result).toEqual([
      { startSlot: 4, endSlot: 6, freeCount: 1, isEveryone: true },
    ])
  })

  it('falls back to the best available when nobody is free together', () => {
    // Three submitters, never all free at once; two are free in slots 1-2.
    const result = findBestSlots([1, 2, 2, 1], 3, opts)
    expect(result).toEqual([
      { startSlot: 1, endSlot: 3, freeCount: 2, isEveryone: false },
    ])
  })

  it('relaxes the duration floor in the fallback rather than showing nothing', () => {
    // Everyone is free, but only for a single slot: the strict pass finds
    // nothing, so the fallback surfaces it anyway.
    const result = findBestSlots([0, 2, 0, 0], 2, opts)
    expect(result).toEqual([
      { startSlot: 1, endSlot: 2, freeCount: 2, isEveryone: true },
    ])
  })

  it('keeps the fallback inside day boundaries too', () => {
    const result = findBestSlots([1, 1, 1, 1, 1, 1, 1, 1], 3, opts)
    expect(result).toEqual([
      { startSlot: 0, endSlot: 4, freeCount: 1, isEveryone: false },
      { startSlot: 4, endSlot: 8, freeCount: 1, isEveryone: false },
    ])
  })

  it('handles a final day shorter than slotsPerDay', () => {
    expect(findBestSlots([1, 1, 1], 1, opts)).toEqual([
      { startSlot: 0, endSlot: 3, freeCount: 1, isEveryone: true },
    ])
  })
})
