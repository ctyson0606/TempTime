import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { WEEKDAY_LABELS, calendarMonths } from '../lib/calendar'

/** 2026-07-25 18:00 in Taipei — comfortably inside one calendar day everywhere. */
const now = DateTime.fromISO('2026-07-25T10:00:00Z')
const taipei = 'Asia/Taipei'

const monthKeys = (tz: string, at = now) => calendarMonths(tz, at).map((m) => m.key)
const findDay = (tz: string, date: string, at = now) =>
  calendarMonths(tz, at)
    .flatMap((m) => m.days)
    .find((d) => d.date === date)

describe('calendarMonths', () => {
  it('spans the month of today through the month of the last selectable day', () => {
    // Window is 2026-07-25 … 2026-10-23.
    expect(monthKeys(taipei)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10'])
  })

  it('emits whole months, including the days outside the window', () => {
    // `now` explicitly: without it this reads the real clock and the
    // assertions below only hold during July 2026.
    const july = calendarMonths(taipei, now)[0]
    expect(july.days).toHaveLength(31)
    expect(july.days[0].date).toBe('2026-07-01')
    expect(july.days[30].date).toBe('2026-07-31')
  })

  it('offsets the first of the month to its weekday, counting from Sunday', () => {
    // 2026-07-01 is a Wednesday, 2026-08-01 a Saturday, 2026-09-01 a Tuesday.
    const [july, august, september] = calendarMonths(taipei, now)
    expect(july.leadingBlanks).toBe(3)
    expect(august.leadingBlanks).toBe(6)
    expect(september.leadingBlanks).toBe(2)
    expect(WEEKDAY_LABELS[july.leadingBlanks]).toBe('Wed')
  })

  it('leaves no gap before a month that starts on Sunday', () => {
    // Luxon calls Sunday 7; the grid needs 0, and only this case tells them apart.
    const november = DateTime.fromISO('2026-11-05T12:00:00Z')
    const first = calendarMonths('UTC', november)[0]
    expect(first.key).toBe('2026-11')
    expect(first.leadingBlanks).toBe(0)
  })

  it('marks days before today unselectable and today selectable', () => {
    expect(findDay(taipei, '2026-07-24')?.selectable).toBe(false)
    expect(findDay(taipei, '2026-07-25')?.selectable).toBe(true)
  })

  it('marks the last day of the window selectable and the next one not', () => {
    expect(findDay(taipei, '2026-10-23')?.selectable).toBe(true)
    expect(findDay(taipei, '2026-10-24')?.selectable).toBe(false)
  })

  it('resolves "today" in the given timezone, not UTC', () => {
    // 16:30 UTC is already the 26th in Taipei but still the 25th in London.
    const evening = DateTime.fromISO('2026-07-25T16:30:00Z')
    expect(findDay(taipei, '2026-07-25', evening)?.selectable).toBe(false)
    expect(findDay(taipei, '2026-07-26', evening)?.selectable).toBe(true)
    expect(findDay('Europe/London', '2026-07-25', evening)?.selectable).toBe(true)
  })

  it('handles a leap February', () => {
    const january = DateTime.fromISO('2028-01-15T12:00:00Z')
    const february = calendarMonths('UTC', january).find((m) => m.key === '2028-02')
    expect(february?.days).toHaveLength(29)
    expect(february?.leadingBlanks).toBe(2)
  })

  it('rejects an unknown timezone rather than rendering an empty picker', () => {
    expect(() => calendarMonths('Mars/Olympus')).toThrow(RangeError)
  })
})
