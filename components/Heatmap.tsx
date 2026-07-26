'use client'

import { type PointerEvent as ReactPointerEvent, useState } from 'react'
import { formatSlotWindow } from '@/lib/room'
import type { RoomGrid } from '@/lib/slots'
import SlotGrid, { type GridSize, slotAtPoint } from './SlotGrid'

interface HeatmapProps {
  room: RoomGrid
  /** How many submitters are free in each slot. Length is the room's totalSlots. */
  freeCounts: readonly number[]
  submittedCount: number
  size?: GridSize
}

/**
 * Written out in full because Tailwind only emits the classes it can see in the
 * source; an interpolated `bg-emerald-${n}` reaches the browser as nothing.
 *
 * Green deepens with how many people are free, and the last step is reserved for
 * everyone — the answer people are actually looking for should not be a shade
 * away from "almost everyone".
 */
const LEVELS = [
  'bg-emerald-100 dark:bg-emerald-950',
  'bg-emerald-200 dark:bg-emerald-900',
  'bg-emerald-300 dark:bg-emerald-800/80',
  'bg-emerald-400 dark:bg-emerald-700',
  'bg-emerald-500 dark:bg-emerald-500',
]

/**
 * Everyone's answers, overlaid.
 *
 * Nobody free is deliberately left as the grid's own empty cell rather than
 * given a colour of its own: the eye is looking for where the green is, and
 * painting the impossible times as well only competes with that.
 */
export default function Heatmap({
  room,
  freeCounts,
  submittedCount,
  size = 'medium',
}: HeatmapProps) {
  const [hovered, setHovered] = useState<number | null>(null)

  if (submittedCount === 0) {
    // All-zero counts drawn literally are indistinguishable from "everyone is
    // busy the whole time", which is the opposite of what no answers means.
    return (
      <div className="flex flex-col gap-3">
        <SlotGrid room={room} size={size} label="Everyone's free time" />
        <p className="border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
          Nobody has sent their times yet. As people answer, the times that suit
          everyone fill in here.
        </p>
      </div>
    )
  }

  // Undefined leaves the cell with the grid's own empty look. Returning '' here
  // instead would be silently discarded by the grid's fallback.
  const cellClass = (slot: number): string | undefined => {
    const free = freeCounts[slot] ?? 0
    if (free <= 0) return undefined
    const level = Math.ceil((free / submittedCount) * LEVELS.length) - 1
    return LEVELS[Math.min(Math.max(level, 0), LEVELS.length - 1)]
  }

  const track = (event: ReactPointerEvent<HTMLDivElement>) => {
    const slot = slotAtPoint(event.clientX, event.clientY)
    if (slot !== hovered) setHovered(slot)
  }

  return (
    <div
      className="flex flex-col gap-3"
      onPointerMove={track}
      onPointerLeave={() => setHovered(null)}
    >
      <SlotGrid
        room={room}
        size={size}
        label="Everyone's free time"
        cellClass={cellClass}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        {/* Reserves its line whether or not a pointer is over the grid, so the
            layout below does not jump as the pointer crosses a cell. */}
        <p className="min-h-4 text-xs text-zinc-500">
          {hovered === null
            ? `${submittedCount} ${submittedCount === 1 ? 'person has' : 'people have'} answered. Hover a slot to read it.`
            : describe(room, hovered, freeCounts[hovered] ?? 0, submittedCount)}
        </p>
        <Legend submittedCount={submittedCount} />
      </div>
    </div>
  )
}

function describe(
  room: RoomGrid,
  slot: number,
  free: number,
  submittedCount: number,
): string {
  const when = formatSlotWindow(room, slot, slot + 1)
  if (free === 0) return `${when} — nobody is free`
  if (free === submittedCount) {
    return `${when} — everyone is free (${free} of ${submittedCount})`
  }
  return `${when} — ${free} of ${submittedCount} free`
}

function Legend({ submittedCount }: { submittedCount: number }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
      <span>0</span>
      <div className="h-3 w-4 rounded-sm bg-zinc-100 dark:bg-zinc-800/60" />
      {LEVELS.map((level) => (
        <div key={level} className={`h-3 w-4 rounded-sm ${level}`} />
      ))}
      <span>{submittedCount} free</span>
    </div>
  )
}
