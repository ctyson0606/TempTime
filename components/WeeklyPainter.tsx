'use client'

import { useMemo } from 'react'
import { Info } from 'luxon'
import { formatMinuteOfDay } from '@/lib/room'
import type { RoomGrid } from '@/lib/slots'
import { markedCount } from '@/lib/providers/manual'
import {
  type WeeklyBlock,
  weekGrid,
  weekMaskToWeekly,
  weeklyMinutes,
  weeklyToWeekMask,
} from '@/lib/weekly'
import GridPainter from './GridPainter'
import type { GridSize } from './SlotGrid'

interface WeeklyPainterProps {
  /** Supplies the time axis and the timezone; its dates are not used. */
  room: RoomGrid
  blocks: readonly WeeklyBlock[]
  onChange: (blocks: WeeklyBlock[]) => void
  onApply: () => void
  onClose: () => void
  size?: GridSize
  /** How many of the room's days the pattern would actually touch. */
  affectedSlots: number
}

/** Rose, the colour every other part of this flow uses for time being taken away. */
const BUSY = 'bg-rose-400 dark:bg-rose-700'

/** How many windows to spell out before summarising the rest. */
const BLOCKS_SHOWN = 8

/**
 * The week that repeats: classes, shifts, anything at the same hour every week.
 *
 * It exists because a calendar file cannot express this. A university timetable
 * export ends every course with `UNTIL` at the close of term, so it stops
 * importing the day term ends, while the commitment it describes is unchanged.
 * Painted here once, it is kept on this device and applies to whichever weekdays
 * a room covers — including three separate Mondays, which is the case that has
 * no answer at all in an `.ics`.
 *
 * Like an import, it only ever *subtracts*. Nothing here can offer time on
 * somebody's behalf.
 */
export default function WeeklyPainter({
  room,
  blocks,
  onChange,
  onApply,
  onClose,
  size = 'small',
  affectedSlots,
}: WeeklyPainterProps) {
  const week = useMemo(() => weekGrid(room), [room])
  const mask = useMemo(() => weeklyToWeekMask(room, blocks), [room, blocks])
  const painted = markedCount(mask)

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Your usual week</h3>
        <p className="text-xs text-zinc-500">
          Kept on this device, ready for the next room.
        </p>
      </div>

      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Drag to mark the hours you are busy every week — classes, shifts, the standing
        meeting. It is taken out of the time you marked as free, on every matching
        weekday this room covers. Nothing here is sent anywhere, and it can only ever
        take time away, never offer it.
      </p>

      <GridPainter
        room={week}
        mask={mask}
        onChange={(next) => onChange(weekMaskToWeekly(room, next))}
        size={size}
        label="Your usual week"
        weekdayOnly
        markedClass={() => BUSY}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <p className="text-xs text-zinc-500">
          {painted === 0
            ? 'Nothing marked yet.'
            : `${duration(weeklyMinutes(blocks))} a week, on ${dayCount(blocks)}.`}
        </p>
        <button
          type="button"
          onClick={() => onChange([])}
          disabled={painted === 0}
          className="inline-flex min-h-9 items-center rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-medium enabled:hover:bg-zinc-200 disabled:opacity-40 sm:min-h-0 dark:bg-zinc-800 dark:enabled:hover:bg-zinc-700"
        >
          Clear all
        </button>
      </div>

      {blocks.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-zinc-500">
          {[...blocks]
            .sort(byWhen)
            .slice(0, BLOCKS_SHOWN)
            .map((block) => (
              <li key={`${block.weekday}:${block.startMin}`}>{describe(block)}</li>
            ))}
          {blocks.length > BLOCKS_SHOWN && (
            <li className="text-zinc-400">and {blocks.length - BLOCKS_SHOWN} more</li>
          )}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={affectedSlots === 0}
          title={
            painted > 0 && affectedSlots === 0
              ? 'None of it falls on the days this room covers'
              : undefined
          }
          className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-medium text-white enabled:hover:bg-indigo-500 disabled:opacity-40"
        >
          {/* Says what it will do to *this* room, because a pattern can be
              perfectly good and still touch none of the days chosen here. */}
          Take {affectedSlots} {affectedSlots === 1 ? 'slot' : 'slots'} out of my free
          time
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-zinc-100 px-3 py-2 text-xs font-medium hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        >
          Done
        </button>
      </div>
    </div>
  )
}

function byWhen(a: WeeklyBlock, b: WeeklyBlock): number {
  return a.weekday - b.weekday || a.startMin - b.startMin
}

/** Short weekday names, taken from Luxon so they match the grid's own headers. */
const WEEKDAYS = Info.weekdays('short')

function describe(block: WeeklyBlock): string {
  const day = WEEKDAYS[block.weekday - 1] ?? `day ${block.weekday}`
  return `${day} ${formatMinuteOfDay(block.startMin)}–${formatMinuteOfDay(block.endMin)}`
}

function dayCount(blocks: readonly WeeklyBlock[]): string {
  const days = new Set(blocks.map((block) => block.weekday)).size
  return days === 1 ? '1 day' : `${days} days`
}

function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}
