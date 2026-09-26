import { describe, expect, it } from 'vitest'
import {
  DAYS_PER_PAGE,
  isPaged,
  nextPageStart,
  pageFrom,
  previousPageStart,
} from '../lib/dayPages'

describe('isPaged', () => {
  it('draws a room of one page whole, exactly as before paging existed', () => {
    expect(isPaged(1)).toBe(false)
    expect(isPaged(DAYS_PER_PAGE)).toBe(false)
  })

  it('pages a room from one day past a page', () => {
    expect(isPaged(DAYS_PER_PAGE + 1)).toBe(true)
    expect(isPaged(91)).toBe(true)
  })
})

describe('pageFrom', () => {
  it('starts on the day that was picked, not on a page boundary', () => {
    expect(pageFrom(30, 3)).toEqual({ first: 3, count: DAYS_PER_PAGE })
  })

  it('runs short only when the room runs out', () => {
    expect(pageFrom(30, 27)).toEqual({ first: 27, count: 3 })
    expect(pageFrom(30, 29)).toEqual({ first: 29, count: 1 })
  })

  it('clamps a start outside the room rather than drawing nothing', () => {
    expect(pageFrom(30, -4)).toEqual({ first: 0, count: DAYS_PER_PAGE })
    expect(pageFrom(30, 45)).toEqual({ first: 29, count: 1 })
  })

  it('refuses a room with no days', () => {
    expect(() => pageFrom(0, 0)).toThrow(RangeError)
  })
})

describe('moving between pages', () => {
  it('visits every day exactly once walking forward from the first', () => {
    // Positions in `dates`, so a page boundary that skipped or repeated a day
    // shows up as a gap or a duplicate here.
    const seen: number[] = []
    let start: number | null = 0
    while (start !== null) {
      const page = pageFrom(30, start)
      for (let i = 0; i < page.count; i++) seen.push(page.first + i)
      start = nextPageStart(30, page)
    }
    expect(seen).toEqual(Array.from({ length: 30 }, (_, i) => i))
  })

  it('has no page after the one that reaches the last day', () => {
    expect(nextPageStart(30, pageFrom(30, 23))).toBeNull()
    expect(nextPageStart(30, pageFrom(30, 22))).toBe(29)
  })

  it('goes back a whole page, and stops at a full first page', () => {
    expect(previousPageStart(pageFrom(30, 14))).toBe(7)
    // From a page picked mid-week, back lands on day 0 with a full page rather
    // than a short page of three.
    expect(previousPageStart(pageFrom(30, 3))).toBe(0)
    expect(previousPageStart(pageFrom(30, 0))).toBeNull()
  })
})
