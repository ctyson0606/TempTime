import { type WeeklyBlock, isWeeklyBlock } from './weekly'

/**
 * The weekly pattern, kept on this device.
 *
 * `localStorage`, not the `sessionStorage` the calendar import uses, and the
 * difference is the whole feature: a pattern that died with the tab would have
 * to be repainted for every room, which is barely better than painting the room
 * itself. It is keyed globally rather than per room for the same reason.
 *
 * What that costs is stated plainly on the privacy page: a rough shape of
 * somebody's week sits on their disk until they clear it. What it does *not*
 * contain is any part of why — no course names, no titles, nothing but weekday
 * and clock time. Nothing here is ever sent anywhere; what leaves the browser is
 * the same 0/1 mask as always.
 */
const KEY = 'temptime:weekly'

export function saveWeekly(blocks: readonly WeeklyBlock[]): void {
  try {
    if (blocks.length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(blocks))
  } catch {
    // Private-mode browsers and full quotas both throw here. Losing the pattern
    // costs one repaint; failing the room over it would cost everything.
  }
}

/**
 * The stored pattern, or null when there is nothing usable.
 *
 * Anything malformed reads as absent rather than throwing, and one bad block
 * discards only itself — the same rule the calendar import follows, for the same
 * reason: this is data from whatever version of the page last wrote it.
 */
export function loadWeekly(): WeeklyBlock[] | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return null
  }
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const blocks = parsed.filter(isWeeklyBlock)
    return blocks.length === 0 ? null : blocks
  } catch {
    return null
  }
}

export function clearWeekly(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Best-effort in both directions, like the read.
  }
}
