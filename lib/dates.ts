import { DateTime, IANAZone } from 'luxon'

/**
 * Upper bound on how many days a single room may cover.
 *
 * Deliberately one constant, because the product intends to raise it. Note that
 * `supabase/migrations/0001_init.sql` repeats the number in a CHECK constraint,
 * so raising it here alone is not enough — see PLAN.md section 14.
 */
export const MAX_ROOM_DAYS = 7

/** How far ahead a room may reach, counted from today in the room's timezone. */
export const SELECTION_WINDOW_DAYS = 90

/** The only date format that crosses a boundary in this project. */
export const ISO_DATE = 'yyyy-MM-dd'

export type DateRejection =
  | 'INVALID_TIMEZONE'
  | 'EMPTY'
  | 'TOO_MANY'
  | 'MALFORMED'
  | 'DUPLICATE'
  | 'NOT_ASCENDING'
  | 'BEFORE_WINDOW'
  | 'AFTER_WINDOW'

export type DateCheck =
  | { ok: true }
  | { ok: false; error: DateRejection; detail: string }

function reject(error: DateRejection, detail: string): DateCheck {
  return { ok: false, error, detail }
}

/**
 * "Today" is always resolved in the room's timezone, never the server's. A room
 * created at 23:30 in Taipei is on a different calendar day than the Vercel
 * instance that handled the request.
 */
export function todayIn(timezone: string, now: DateTime = DateTime.utc()): string {
  return now.setZone(timezone).toFormat(ISO_DATE)
}

/** Inclusive bounds of what the date picker is allowed to offer. */
export function selectionWindow(
  timezone: string,
  now: DateTime = DateTime.utc(),
): { first: string; last: string } {
  const start = now.setZone(timezone).startOf('day')
  return {
    first: start.toFormat(ISO_DATE),
    last: start.plus({ days: SELECTION_WINDOW_DAYS }).toFormat(ISO_DATE),
  }
}

/**
 * Sort ascending and drop duplicates.
 *
 * The client calls this before submitting; the server does not. `validateDates`
 * rejects unsorted input rather than silently repairing it, so that a client
 * sending garbage gets an error instead of a room whose days are not the ones
 * the user clicked. ISO dates sort correctly as plain strings.
 */
export function normalizeDates(dates: readonly string[]): string[] {
  return [...new Set(dates)].sort()
}

/** True when a single date may be offered by the picker. */
export function isSelectable(
  date: string,
  timezone: string,
  now: DateTime = DateTime.utc(),
): boolean {
  if (!IANAZone.isValidZone(timezone)) return false
  if (!DateTime.fromFormat(date, ISO_DATE, { zone: timezone }).isValid) return false
  const { first, last } = selectionWindow(timezone, now)
  return date >= first && date <= last
}

/**
 * Full server-side check for a room's date array. Runs in the order a user would
 * hit the problems, so the first failure is the most useful one to report.
 */
export function validateDates(
  dates: readonly string[],
  timezone: string,
  now: DateTime = DateTime.utc(),
): DateCheck {
  if (!IANAZone.isValidZone(timezone)) {
    return reject('INVALID_TIMEZONE', `unknown IANA zone: ${timezone}`)
  }
  if (dates.length === 0) {
    return reject('EMPTY', 'a room needs at least one date')
  }
  if (dates.length > MAX_ROOM_DAYS) {
    return reject('TOO_MANY', `at most ${MAX_ROOM_DAYS} dates, got ${dates.length}`)
  }

  for (const date of dates) {
    if (!DateTime.fromFormat(date, ISO_DATE, { zone: timezone }).isValid) {
      return reject('MALFORMED', `not a ${ISO_DATE} date: ${date}`)
    }
  }

  for (let i = 1; i < dates.length; i++) {
    if (dates[i] === dates[i - 1]) {
      return reject('DUPLICATE', `repeated date: ${dates[i]}`)
    }
    if (dates[i] < dates[i - 1]) {
      return reject('NOT_ASCENDING', `${dates[i]} follows ${dates[i - 1]}`)
    }
  }

  const { first, last } = selectionWindow(timezone, now)
  for (const date of dates) {
    if (date < first) return reject('BEFORE_WINDOW', `${date} is before ${first}`)
    if (date > last) return reject('AFTER_WINDOW', `${date} is after ${last}`)
  }

  return { ok: true }
}
