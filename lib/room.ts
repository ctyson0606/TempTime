import { type RoomGrid, slotRange } from './slots'

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

/**
 * A run of slots as a reader sees it: `08/02 Sun 18:00–19:30`.
 *
 * `endSlot` is exclusive, matching `lib/aggregate.ts`, so the window ends when
 * the slot before it ends. Reading `endSlot`'s own range would run one slot long
 * and would throw on the last slot of the grid.
 *
 * A window reaching the end of the day ends at the next day's 00:00, which reads
 * as the morning it is not. The grid's gutter calls that hour 24:00 and every
 * other label has to agree with it — which is why this is one function rather
 * than the same two lines in each component.
 */
export function formatSlotWindow(
  room: RoomGrid,
  startSlot: number,
  endSlot: number,
): string {
  const start = slotRange(room, startSlot).start
  const end = slotRange(room, endSlot - 1).end
  const until =
    end.hour === 0 && end.minute === 0
      ? formatMinuteOfDay(room.dayEndMin)
      : end.toFormat('HH:mm')
  return `${start.toFormat('MM/dd ccc HH:mm')}–${until}`
}
