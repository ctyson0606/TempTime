/**
 * Which of a room's days a grid draws at once.
 *
 * A room can cover up to 91 days, and a grid of 91 columns is neither paintable
 * nor readable: a drag cannot reach a day that is off-screen, and nobody reads
 * a heatmap five thousand pixels wide. So a long room is shown as a calendar of
 * its dates, and picking one zooms into a page of days starting there.
 *
 * A page is a run of consecutive positions in `dates`, not a calendar week. The
 * grid already skips the days a room did not select, so a page of seven is
 * always seven days someone can answer for — a calendar week of a sparse room
 * could hold one.
 *
 * Pages hold positions only. Slot indices stay global — a cell on the third
 * page carries the same index it would on a grid of every day — so the mask,
 * the heatmap counts and every conversion between them never learn that paging
 * exists.
 */

/** The width a full seven-day room was designed and tested at. */
export const DAYS_PER_PAGE = 7

export interface DayRange {
  /** Position in `dates` of the first day drawn. */
  first: number
  /** How many days are drawn from there. Short only on the last page. */
  count: number
}

/** A room that fits on one page is drawn whole, exactly as before paging. */
export function isPaged(dayCount: number): boolean {
  return dayCount > DAYS_PER_PAGE
}

/**
 * The page that starts at `first`.
 *
 * Starts where it is asked to rather than snapping to a multiple of the page
 * size: tapping a date means "show me from here", and a page that began three
 * days earlier would hide the day that was tapped among days that were not.
 */
export function pageFrom(dayCount: number, first: number): DayRange {
  if (!Number.isInteger(dayCount) || dayCount < 1) {
    throw new RangeError(`a room has at least one day, got ${dayCount}`)
  }
  const start = Math.min(Math.max(Math.trunc(first), 0), dayCount - 1)
  return { first: start, count: Math.min(DAYS_PER_PAGE, dayCount - start) }
}

/** Where the page after this one starts, or null on the last page. */
export function nextPageStart(dayCount: number, page: DayRange): number | null {
  const next = page.first + page.count
  return next < dayCount ? next : null
}

/**
 * Where the page before this one starts, or null on the first.
 *
 * Clamped at the first day rather than allowed to run short, so going back
 * from a page that started on day 3 shows days 0–6: a full page, overlapping
 * the one just left, rather than a page of three.
 */
export function previousPageStart(page: DayRange): number | null {
  return page.first === 0 ? null : Math.max(0, page.first - DAYS_PER_PAGE)
}
