import type { PointerEventHandler } from 'react'
import { DateTime } from 'luxon'
import { ISO_DATE } from '@/lib/dates'
import { formatMinuteOfDay } from '@/lib/room'
import { type RoomGrid, slotsPerDay } from '@/lib/slots'

export type GridSize = 'small' | 'medium' | 'large'

export const GRID_SIZES: readonly GridSize[] = ['small', 'medium', 'large']

/** Cells carry this so a pointer can be resolved to a slot by hit-testing. */
export const SLOT_ATTRIBUTE = 'data-slot'

/**
 * Class strings are written out per size rather than interpolated, because
 * Tailwind only emits the classes it can see in the source.
 *
 * `labelEveryMin` is how often a time label is printed; `null` means every slot,
 * which only fits once the rows are tall enough to read.
 */
const SIZES: Record<
  GridSize,
  {
    gutter: string
    column: string
    divider: string
    row: string
    header: string
    date: string
    weekday: string
    label: string
    labelEveryMin: number | null
  }
> = {
  small: {
    gutter: 'w-9',
    column: 'w-9',
    divider: 'w-4',
    row: 'h-3',
    header: 'h-9',
    date: 'text-[10px]',
    weekday: 'text-[9px]',
    label: 'text-[9px]',
    labelEveryMin: 120,
  },
  medium: {
    gutter: 'w-14',
    column: 'w-16',
    divider: 'w-8',
    row: 'h-5',
    header: 'h-11',
    date: 'text-xs',
    weekday: 'text-[10px]',
    label: 'text-[10px]',
    labelEveryMin: 60,
  },
  large: {
    gutter: 'w-16',
    column: 'w-28',
    divider: 'w-10',
    row: 'h-8',
    header: 'h-12',
    date: 'text-sm',
    weekday: 'text-xs',
    label: 'text-xs',
    labelEveryMin: null,
  },
}

/**
 * The card holding the grid sizes itself to the grid rather than to the reading
 * width the rest of the page uses: large exists to fit a full seven-day room on
 * screen at once, and that needs more room than a column of prose. `max-w-full`
 * hands the overflow back to the grid's own scroller on a narrow screen.
 */
export const GRID_CARD_WIDTH = 'mx-auto w-fit max-w-full'

const EMPTY_CELL = 'bg-zinc-100 dark:bg-zinc-800/60'

interface SlotGridProps {
  room: RoomGrid
  size?: GridSize
  /** Look of the cell at `slot`. Return nothing for the plain empty cell. */
  cellClass?: (slot: number) => string | undefined
  /**
   * Painting handlers, attached to the grid rather than to 224 cells. Setting
   * them also stops a finger on the cells from scrolling the page instead of
   * painting; the time gutter and the date header stay scrollable.
   */
  onPointerDown?: PointerEventHandler<HTMLDivElement>
  onPointerMove?: PointerEventHandler<HTMLDivElement>
  onPointerUp?: PointerEventHandler<HTMLDivElement>
  onPointerCancel?: PointerEventHandler<HTMLDivElement>
}

/**
 * The grid a room is laid out on: one column per selected day, one row per slot.
 *
 * A break between days that are not consecutive is drawn explicitly. Without it
 * 07-27 and 08-15 sit side by side and read as two days in a row, which is the
 * one thing the free-date model must not let a user believe.
 */
export default function SlotGrid({
  room,
  size = 'medium',
  cellClass,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: SlotGridProps) {
  const style = SIZES[size]
  const perDay = slotsPerDay(room)
  const rows = Array.from(
    { length: perDay },
    (_, row) => room.dayStartMin + row * room.slotMinutes,
  )
  const labelled = (minute: number) =>
    style.labelEveryMin === null || minute % style.labelEveryMin === 0
  const paintable = onPointerDown !== undefined

  const columns = room.dates.map((date, index) => {
    const day = DateTime.fromFormat(date, ISO_DATE, { zone: room.timezone })
    const previous =
      index === 0
        ? null
        : DateTime.fromFormat(room.dates[index - 1], ISO_DATE, { zone: room.timezone })
    const skipped =
      previous === null ? 0 : Math.round(day.diff(previous, 'days').days) - 1
    return { date, day, skipped }
  })

  return (
    <div className="overflow-x-auto">
      <div className="mx-auto flex w-fit min-w-max">
        <div className={`${style.gutter} shrink-0`}>
          <div className={style.header} />
          {rows.map((minute) => (
            <div
              key={minute}
              className={`${style.row} ${style.label} pr-1.5 text-right leading-none text-zinc-400`}
            >
              {labelled(minute) ? formatMinuteOfDay(minute) : ''}
            </div>
          ))}
        </div>

        {columns.map(({ date, day, skipped }, dayIndex) => (
          <div key={date} className="flex">
            {skipped > 0 && (
              <div
                className={`${style.divider} mx-1 flex shrink-0 flex-col items-center`}
              >
                <div
                  className={`${style.header} ${style.weekday} flex items-end pb-1 text-zinc-400`}
                >
                  +{skipped}d
                </div>
                <div className="flex-1 border-l border-dashed border-zinc-300 dark:border-zinc-700" />
              </div>
            )}
            <div className={`${style.column} shrink-0`}>
              <div className={`${style.header} text-center`}>
                <div className={`${style.date} font-medium`}>
                  {day.toFormat('MM/dd')}
                </div>
                <div className={`${style.weekday} text-zinc-500`}>
                  {day.toFormat('ccc')}
                </div>
              </div>
              <div
                className={
                  paintable ? 'cursor-crosshair touch-none select-none' : undefined
                }
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
              >
                {rows.map((minute, row) => {
                  const slot = dayIndex * perDay + row
                  return (
                    <div
                      key={minute}
                      data-slot={slot}
                      className={[
                        style.row,
                        'mx-px',
                        cellClass?.(slot) ?? EMPTY_CELL,
                        minute % 60 === 0
                          ? 'border-t border-zinc-300 dark:border-zinc-700'
                          : 'border-t border-zinc-200/70 dark:border-zinc-800',
                      ].join(' ')}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
