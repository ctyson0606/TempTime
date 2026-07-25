import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import {
  MAX_ROOM_DAYS,
  isSelectable,
  normalizeDates,
  selectionWindow,
  todayIn,
  validateDates,
} from '../lib/dates'

/** 2026-07-25 20:00 in Taipei, still 2026-07-25 in UTC. */
const NOW = DateTime.fromISO('2026-07-25T12:00:00Z')
/** 2026-07-26 07:00 in Taipei while UTC is still on the 25th. */
const NOW_ACROSS_MIDNIGHT = DateTime.fromISO('2026-07-25T23:00:00Z')

const TAIPEI = 'Asia/Taipei'

describe('todayIn', () => {
  it('resolves the calendar day in the room timezone, not the server', () => {
    expect(todayIn(TAIPEI, NOW_ACROSS_MIDNIGHT)).toBe('2026-07-26')
    expect(todayIn('UTC', NOW_ACROSS_MIDNIGHT)).toBe('2026-07-25')
  })
})

describe('selectionWindow', () => {
  it('spans today through 90 days out', () => {
    expect(selectionWindow(TAIPEI, NOW)).toEqual({
      first: '2026-07-25',
      last: '2026-10-23',
    })
  })
})

describe('normalizeDates', () => {
  it('sorts ascending and drops duplicates', () => {
    expect(normalizeDates(['2026-08-15', '2026-07-26', '2026-08-15'])).toEqual([
      '2026-07-26',
      '2026-08-15',
    ])
  })

  it('leaves an already-clean list untouched', () => {
    const clean = ['2026-07-26', '2026-07-27']
    expect(normalizeDates(clean)).toEqual(clean)
  })
})

describe('isSelectable', () => {
  it('accepts both edges of the window', () => {
    expect(isSelectable('2026-07-25', TAIPEI, NOW)).toBe(true)
    expect(isSelectable('2026-10-23', TAIPEI, NOW)).toBe(true)
  })

  it('rejects the day before and the day after', () => {
    expect(isSelectable('2026-07-24', TAIPEI, NOW)).toBe(false)
    expect(isSelectable('2026-10-24', TAIPEI, NOW)).toBe(false)
  })
})

describe('validateDates', () => {
  const check = (dates: string[], zone = TAIPEI, now = NOW) =>
    validateDates(dates, zone, now)

  it('accepts a non-consecutive selection inside the window', () => {
    expect(check(['2026-07-26', '2026-07-27', '2026-08-15'])).toEqual({ ok: true })
  })

  it('accepts a single day', () => {
    expect(check(['2026-07-25'])).toEqual({ ok: true })
  })

  it('accepts exactly MAX_ROOM_DAYS', () => {
    const dates = Array.from({ length: MAX_ROOM_DAYS }, (_, i) =>
      DateTime.fromISO('2026-07-25').plus({ days: i }).toFormat('yyyy-MM-dd'),
    )
    expect(check(dates)).toEqual({ ok: true })
  })

  it('rejects one day past MAX_ROOM_DAYS', () => {
    const dates = Array.from({ length: MAX_ROOM_DAYS + 1 }, (_, i) =>
      DateTime.fromISO('2026-07-25').plus({ days: i }).toFormat('yyyy-MM-dd'),
    )
    expect(check(dates)).toMatchObject({ ok: false, error: 'TOO_MANY' })
  })

  it('rejects an empty selection', () => {
    expect(check([])).toMatchObject({ ok: false, error: 'EMPTY' })
  })

  it('rejects an unknown timezone', () => {
    expect(check(['2026-07-26'], 'Mars/Olympus')).toMatchObject({
      ok: false,
      error: 'INVALID_TIMEZONE',
    })
  })

  it.each([
    ['2026-7-26', 'a non-padded date'],
    ['2026-02-30', 'a day that does not exist'],
    ['not-a-date', 'plain garbage'],
  ])('rejects %s (%s)', (date) => {
    expect(check([date])).toMatchObject({ ok: false, error: 'MALFORMED' })
  })

  it('rejects duplicates', () => {
    expect(check(['2026-07-26', '2026-07-26'])).toMatchObject({
      ok: false,
      error: 'DUPLICATE',
    })
  })

  it('rejects an unsorted list rather than repairing it', () => {
    expect(check(['2026-08-15', '2026-07-26'])).toMatchObject({
      ok: false,
      error: 'NOT_ASCENDING',
    })
  })

  it('rejects yesterday', () => {
    expect(check(['2026-07-24'])).toMatchObject({
      ok: false,
      error: 'BEFORE_WINDOW',
    })
  })

  it('rejects a date past the window', () => {
    expect(check(['2026-10-24'])).toMatchObject({ ok: false, error: 'AFTER_WINDOW' })
  })

  it('judges the window edge in the room timezone', () => {
    // Taipei has already rolled over to the 26th, so the 25th is yesterday
    // there even though UTC still calls it today.
    expect(check(['2026-07-25'], TAIPEI, NOW_ACROSS_MIDNIGHT)).toMatchObject({
      ok: false,
      error: 'BEFORE_WINDOW',
    })
    expect(check(['2026-07-25'], 'UTC', NOW_ACROSS_MIDNIGHT)).toEqual({ ok: true })
  })
})
