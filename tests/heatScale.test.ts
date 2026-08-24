import { describe, expect, it } from 'vitest'
import { rankFor, stepsInUse } from '../lib/heatScale'

/**
 * The ramp the component ships. Its length is a parameter rather than a
 * constant, so a few cases below run against five steps as well to keep it one.
 */
const RAMP = 4

/** Which ramp step each possible answer count lands on, low to high. */
const painted = (submittedCount: number) => {
  const steps = stepsInUse(submittedCount, RAMP)
  return Array.from(
    { length: submittedCount },
    (_, i) => steps[rankFor(i + 1, submittedCount, RAMP)],
  )
}

describe('stepsInUse', () => {
  it('uses both ends of the ramp rather than a slice of it', () => {
    expect(stepsInUse(2, RAMP)).toEqual([0, 3])
    expect(stepsInUse(3, RAMP)).toEqual([0, 2, 3])
    expect(stepsInUse(2, 5)).toEqual([0, 4])
    expect(stepsInUse(3, 5)).toEqual([0, 2, 4])
    expect(stepsInUse(4, 5)).toEqual([0, 1, 3, 4])
  })

  it('opens out to the whole ramp once there are enough people', () => {
    expect(stepsInUse(4, RAMP)).toEqual([0, 1, 2, 3])
    expect(stepsInUse(9, RAMP)).toEqual([0, 1, 2, 3])
    expect(stepsInUse(9, 5)).toEqual([0, 1, 2, 3, 4])
  })

  it('gives a lone submitter the top step, because one of one is everyone', () => {
    expect(stepsInUse(1, RAMP)).toEqual([3])
    expect(stepsInUse(1, 5)).toEqual([4])
  })

  it('has nothing to draw before anyone has answered', () => {
    expect(stepsInUse(0, RAMP)).toEqual([])
  })
})

describe('rankFor', () => {
  it('separates the two answers a room of two can give', () => {
    expect(painted(2)).toEqual([0, RAMP - 1])
  })

  it('spreads three people across the ramp', () => {
    expect(painted(3)).toEqual([0, 2, 3])
  })

  it('reserves the top step for everyone, whatever the count', () => {
    for (const people of [1, 2, 3, 4, 5, 7, 12]) {
      const marks = painted(people)
      expect(marks[people - 1]).toBe(RAMP - 1)
      // The near miss is what the old proportional sum could not tell apart:
      // with seven submitters it put six-of-seven on the top step as well.
      if (people > 1) expect(marks[people - 2]).not.toBe(RAMP - 1)
    }
  })

  it('climbs and never falls back as more people are free', () => {
    for (const people of [2, 3, 5, 7, 12, 30]) {
      const marks = painted(people)
      for (let i = 1; i < marks.length; i++) {
        expect(marks[i]).toBeGreaterThanOrEqual(marks[i - 1])
      }
    }
  })

  it('starts a partial answer at the bottom of the ramp', () => {
    for (const people of [2, 3, 5, 7, 12]) {
      expect(painted(people)[0]).toBe(0)
    }
  })

  it('says a slot nobody is free for is not on the scale at all', () => {
    // An empty answer is drawn as the grid's own cell, so it must be told apart
    // from the palest colour rather than sharing it.
    expect(rankFor(0, 4, RAMP)).toBe(-1)
    expect(rankFor(0, 0, RAMP)).toBe(-1)
  })
})
