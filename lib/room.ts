import type { RoomGrid } from './slots'

/**
 * A room as the client sees it — exactly the shape `GET /api/rooms/:code`
 * returns (PLAN.md section 6), minus the values derivable from the grid.
 *
 * Extends `RoomGrid` so anything in `lib/slots.ts` accepts it directly.
 */
export interface RoomMeta extends RoomGrid {
  code: string
  title: string | null
  /** ISO instant. Derived server-side by `roomExpiresAt`. */
  expiresAt: string
}

/** Default room hours: 08:00 to midnight, in half-hour slots. */
export const DEFAULT_DAY_START_MIN = 480
export const DEFAULT_DAY_END_MIN = 1440
export const DEFAULT_SLOT_MINUTES = 30

/** `540` to `09:00`. Accepts 1440 for the midnight that ends a day. */
export function formatMinuteOfDay(minute: number): string {
  const hour = Math.floor(minute / 60)
  return `${String(hour).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}
