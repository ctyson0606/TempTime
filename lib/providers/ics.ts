import ICAL from 'ical.js'
import { DateTime, IANAZone } from 'luxon'
import type { BusyBlock } from './types'

/**
 * Why each event that did not become a busy block was dropped. Reported so the
 * UI can say "3 all-day events ignored" instead of silently losing them — an
 * event that vanishes without explanation is the failure people notice last.
 */
export interface IcsSkipped {
  /** Birthdays and holidays. Ignored by default; see PLAN.md section 13. */
  allDay: number
  /** The calendar itself marks these as free time (`TRANSP:TRANSPARENT`). */
  transparent: number
  cancelled: number
  /** Real events, but not on any day this room covers. */
  outsideRange: number
  /** Zero-length or inverted, so they occupy no time. */
  empty: number
  /** Events whose recurrence hit `MAX_OCCURRENCES` before reaching the range. */
  truncated: number
  /**
   * Events ical.js refused to expand.
   *
   * Real exports carry values the library will not decode. HKUST's timetable
   * planner writes `EXDATE;TZID=Asia/Hong_Kong:20260619` — a bare date under a
   * parameter that declares a date-*time* — and ical.js throws
   * `invalid date-time value: "2026-06-19T::"` on the first call to `iterator()`.
   * One such event used to take the whole file down with it.
   */
  unreadable: number
}

/** Every skip, however it was classified. Used to prove each event was seen. */
function totalSkipped(skipped: IcsSkipped): number {
  return (
    skipped.allDay +
    skipped.transparent +
    skipped.cancelled +
    skipped.outsideRange +
    skipped.empty +
    skipped.truncated +
    skipped.unreadable
  )
}

export type IcsResult =
  | { ok: true; blocks: BusyBlock[]; skipped: IcsSkipped }
  | { ok: false; error: 'UNREADABLE'; detail: string }

export interface IcsRange {
  /** The room's timezone, used to place events that carry no zone at all. */
  timezone: string
  from: Date
  to: Date
}

/**
 * Ceiling on how many occurrences of one recurrence rule are walked.
 *
 * Expansion has to start at DTSTART: seeding the iterator with a later date
 * looks like it fast-forwards, but it actually rewrites the occurrence's
 * time-of-day to the seed's, so a daily 09:00 meeting comes back at whatever
 * hour the seed happened to be. Walking from the start keeps the clock time
 * correct, at the cost of stepping through history — a daily event running since
 * 2010 takes a few thousand steps to reach this year, which is why the ceiling is
 * high and hitting it is reported rather than ignored.
 */
export const MAX_OCCURRENCES = 20_000

/**
 * Read an `.ics` file into busy blocks overlapping the room's days.
 *
 * A malformed file is the caller's problem, so it comes back as a result rather
 * than an exception. Titles are carried in `label` for the privacy checklist and
 * never leave the browser.
 */
export function parseIcs(text: string, range: IcsRange): IcsResult {
  let calendar: ICAL.Component
  try {
    calendar = new ICAL.Component(ICAL.parse(text))
  } catch (error) {
    return {
      ok: false,
      error: 'UNREADABLE',
      detail: error instanceof Error ? error.message : 'not an iCalendar file',
    }
  }

  registerTimezones(calendar)

  const blocks: BusyBlock[] = []
  const skipped: IcsSkipped = {
    allDay: 0,
    transparent: 0,
    cancelled: 0,
    outsideRange: 0,
    empty: 0,
    truncated: 0,
    unreadable: 0,
  }

  for (const component of calendar.getAllSubcomponents('vevent')) {
    let event: ICAL.Event
    try {
      event = new ICAL.Event(component)
    } catch {
      // A VEVENT without a usable DTSTART is not something we can place.
      skipped.empty++
      continue
    }

    if (component.getFirstPropertyValue('status') === 'CANCELLED') {
      skipped.cancelled++
      continue
    }
    if (component.getFirstPropertyValue('transp') === 'TRANSPARENT') {
      skipped.transparent++
      continue
    }
    if (event.startDate.isDate) {
      skipped.allDay++
      continue
    }

    // One event must not be able to lose the file. Expansion reaches deep into
    // ical.js, which throws on values it cannot decode, and a real export only
    // has to get one property wrong for every other event in it to disappear.
    const found = blocks.length
    const accounted = totalSkipped(skipped)
    try {
      collect(event, range, blocks, skipped)
    } catch {
      skipped.unreadable++
      continue
    }

    // Every event leaves a trace: a block, or a reason it produced none. A
    // recurrence that ends before the room begins takes neither branch inside
    // `collect` — it simply runs out — and without this the UI would have
    // nothing to say beyond "nothing matched", which is what an empty file
    // looks like too.
    if (blocks.length === found && totalSkipped(skipped) === accounted) {
      skipped.outsideRange++
    }
  }

  blocks.sort((a, b) => a.start.getTime() - b.start.getTime())
  return { ok: true, blocks, skipped }
}

/** One event, expanded if it recurs, filtered to the range. */
function collect(
  event: ICAL.Event,
  range: IcsRange,
  blocks: BusyBlock[],
  skipped: IcsSkipped,
): void {
  if (!event.isRecurring()) {
    add(event.startDate, event.endDate, event, range, blocks, skipped)
    return
  }

  const iterator = event.iterator()
  let steps = 0

  for (let next = iterator.next(); next; next = iterator.next()) {
    if (++steps > MAX_OCCURRENCES) {
      skipped.truncated++
      return
    }

    const occurrence = event.getOccurrenceDetails(next)
    const start = instantOf(occurrence.startDate, range.timezone)
    if (start >= range.to) return
    if (instantOf(occurrence.endDate, range.timezone) <= range.from) continue

    add(occurrence.startDate, occurrence.endDate, event, range, blocks, skipped)
  }
}

function add(
  startTime: ICAL.Time,
  endTime: ICAL.Time,
  event: ICAL.Event,
  range: IcsRange,
  blocks: BusyBlock[],
  skipped: IcsSkipped,
): void {
  const start = instantOf(startTime, range.timezone)
  const end = instantOf(endTime, range.timezone)

  if (end <= start) {
    skipped.empty++
    return
  }
  // Half-open, matching `blocksToMask`: an event ending as the range begins does
  // not overlap it.
  if (end <= range.from || start >= range.to) {
    skipped.outsideRange++
    return
  }

  blocks.push({
    id: `ics:${event.uid}:${start.getTime()}`,
    start,
    end,
    label: event.summary ?? undefined,
    source: 'ics',
  })
}

/**
 * An iCalendar time to a real instant.
 *
 * Resolved through Luxon by TZID rather than by `toJSDate()`, so the answer does
 * not depend on the machine reading the file. Two cases matter:
 *
 * - A time with no zone ("floating") means "local time, wherever you are". The
 *   room has one timezone that everyone's grid is drawn in, so that is the only
 *   defensible reading — `toJSDate()` would instead use the timezone of whoever
 *   happens to be importing, putting the same file on different slots for
 *   different members.
 * - A named IANA zone is resolved from the tz database, not from the file's
 *   VTIMEZONE block, which is often years stale.
 *
 * Anything else — Outlook's Windows zone names, for instance — falls back to
 * ical.js, which is why the VTIMEZONE definitions are registered first.
 */
function instantOf(time: ICAL.Time, roomTimezone: string): Date {
  const tzid = time.zone?.tzid
  const zone = tzid === undefined || tzid === 'floating' ? roomTimezone : tzid

  if (IANAZone.isValidZone(zone)) {
    const resolved = DateTime.fromObject(
      {
        year: time.year,
        month: time.month,
        day: time.day,
        hour: time.hour,
        minute: time.minute,
        second: time.second,
      },
      { zone },
    )
    if (resolved.isValid) return resolved.toJSDate()
  }

  return time.toJSDate()
}

/**
 * Make the file's own zone definitions available to ical.js.
 *
 * Only reached for zones Luxon cannot name, but that includes every Outlook
 * export, so it is worth the four lines. Registration is global and first-wins;
 * a second file redefining the same TZID keeps the first definition, which for
 * offsets that differ is a difference of no practical consequence.
 */
function registerTimezones(calendar: ICAL.Component): void {
  for (const component of calendar.getAllSubcomponents('vtimezone')) {
    const timezone = new ICAL.Timezone(component)
    if (timezone.tzid !== '' && !ICAL.TimezoneService.has(timezone.tzid)) {
      ICAL.TimezoneService.register(timezone, timezone.tzid)
    }
  }
}
