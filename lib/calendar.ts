import { DateTime } from 'luxon'
import { ISO_DATE, isSelectable, selectionWindow } from './dates'

/**
 * One cell of a month grid. `selectable` is the picker's only gate — the same
 * window `validateDates` enforces server-side, so a user cannot click a day the
 * server would later reject.
 */
export interface CalendarDay {
  date: string
  dayOfMonth: number
  selectable: boolean
}

export interface CalendarMonth {
  /** `yyyy-MM`, stable enough to use as a React key. */
  key: string
  year: number
  month: number
  /** Empty cells before the 1st. Weeks start on Sunday. */
  leadingBlanks: number
  days: CalendarDay[]
}

/** Weeks start on Sunday, matching the calendars this project's users read. */
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Every month the picker needs to render, from the month containing today to the
 * month containing the last selectable day.
 *
 * Whole months are emitted rather than only the selectable span, because a grid
 * that starts mid-month reads as a bug. The days outside the window come back
 * with `selectable: false` and the picker greys them out.
 */
export function calendarMonths(
  timezone: string,
  now: DateTime = DateTime.utc(),
): CalendarMonth[] {
  const { first, last } = selectionWindow(timezone, now)
  return monthsBetween(first, last, timezone, (date) =>
    isSelectable(date, timezone, now),
  )
}

/**
 * The months a room's dates fall in, with only those dates selectable.
 *
 * The same whole-month layout as the picker that chose them, so a room's
 * overview reads as the calendar its creator clicked on. Months in between
 * that hold none of the dates are still emitted: skipping one would put August
 * directly after June and make the gap look like two adjacent months.
 */
export function roomMonths(
  dates: readonly string[],
  timezone: string,
): CalendarMonth[] {
  if (dates.length === 0) {
    throw new RangeError('a room with no dates has no calendar')
  }
  const chosen = new Set(dates)
  return monthsBetween(dates[0], dates[dates.length - 1], timezone, (date) =>
    chosen.has(date),
  )
}

function monthsBetween(
  first: string,
  last: string,
  timezone: string,
  selectable: (date: string) => boolean,
): CalendarMonth[] {
  const start = DateTime.fromFormat(first, ISO_DATE, { zone: timezone })
  if (!start.isValid) {
    throw new RangeError(`invalid timezone: ${timezone}`)
  }

  const end = DateTime.fromFormat(last, ISO_DATE, { zone: timezone }).startOf('month')
  const months: CalendarMonth[] = []

  for (
    let cursor = start.startOf('month');
    cursor <= end;
    cursor = cursor.plus({ months: 1 })
  ) {
    const days: CalendarDay[] = []
    for (let day = 1; day <= cursor.daysInMonth!; day++) {
      const date = cursor.set({ day }).toFormat(ISO_DATE)
      days.push({ date, dayOfMonth: day, selectable: selectable(date) })
    }

    months.push({
      key: cursor.toFormat('yyyy-MM'),
      year: cursor.year,
      month: cursor.month,
      // Luxon numbers Monday 1 … Sunday 7; the grid starts on Sunday.
      leadingBlanks: cursor.weekday % 7,
      days,
    })
  }

  return months
}
