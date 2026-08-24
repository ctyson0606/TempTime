'use client'

import { type PointerEvent as ReactPointerEvent, useState } from 'react'
import { rankFor, stepsInUse } from '@/lib/heatScale'
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
 * Green deepens with how many people are free. Which of these steps a room
 * actually uses is `lib/heatScale.ts`'s decision, not this array's — a room of
 * two people uses the first and the last, not the first two.
 *
 * The steps were chosen against the empty cell they sit beside, not by eye. The
 * ramp this replaces ran emerald-100 to emerald-500, and measured against
 * `bg-zinc-100` it failed on two counts: its palest step stood at 1.03:1
 * contrast, so "one person is free" was all but the same colour as "nobody is",
 * and its first two steps were 0.046 apart in perceptual lightness against a
 * 0.06 floor. Both ramps below clear a monotone-lightness check, a 0.06 gap
 * between neighbours, and 2:1 at the pale end against that mode's empty cell.
 * No opacity anywhere: a translucent step is a different colour than the one
 * that was measured. Dark mode is its own selection rather than a flip of the
 * light one — brightness has to increase with the count there, so the ramp runs
 * the other way.
 *
 * Four steps and not five. Once the pale end is pinned at emerald-500 by that
 * 2:1 floor, a fifth step with a visible gap below it lands on emerald-950,
 * which reads as black rather than as green: "everyone is free" stopped looking
 * like the thing the eye is hunting for and started looking like a hole in the
 * grid. Dropping a step buys back a top that is still recognisably green, and
 * four levels is more gradation than a room of two or three ever shows.
 */
const LEVELS = [
  'bg-emerald-500 dark:bg-emerald-800',
  'bg-emerald-600 dark:bg-emerald-600',
  'bg-emerald-700 dark:bg-emerald-500',
  'bg-emerald-900 dark:bg-emerald-300',
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
  // Which steps this room is drawing with, low to high. The legend has to show
  // the same ones the cells use, so both read it from here.
  const scale = stepsInUse(submittedCount, LEVELS.length)

  if (submittedCount === 0) {
    // All-zero counts drawn literally are indistinguishable from "everyone is
    // busy the whole time", which is the opposite of what no answers means.
    //
    // Named differently from the overlay below, and deliberately sharing no
    // words with it. This grid has the same role, the same cells and none of
    // the behaviour: no pointer handlers, no readout. Under one name a screen
    // reader announces the two identically, and anything selecting by role
    // cannot tell which one it found — which is how a probe came to tap this
    // one for five days and report the readout as broken. A name that merely
    // *added* to the other would be no better, because a substring match finds
    // both.
    return (
      <div className="flex flex-col gap-3">
        <SlotGrid room={room} size={size} label="Results, no answers yet" />
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
    const rank = rankFor(freeCounts[slot] ?? 0, submittedCount, LEVELS.length)
    if (rank < 0) return undefined
    return LEVELS[scale[rank]]
  }

  const track = (event: ReactPointerEvent<HTMLDivElement>) => {
    const slot = slotAtPoint(event.clientX, event.clientY)
    if (slot !== hovered) setHovered(slot)
  }

  /**
   * A finger has no hover, so a tap has to be what reads a slot out — and the
   * readout is the only place the counts behind a colour are written down. A
   * tap fires no `pointermove` at all when the finger does not travel, so
   * without `onPointerDown` the line stays on its default text forever, which
   * is what a phone actually did.
   */
  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Touch fires `pointerleave` immediately after `pointerup`, so clearing on
    // it unconditionally would blank the readout in the same frame the tap
    // filled it. A mouse leaving the grid genuinely has left it.
    if (event.pointerType === 'mouse') setHovered(null)
  }

  return (
    <div
      className="flex flex-col gap-3"
      onPointerDown={track}
      onPointerMove={track}
      onPointerLeave={release}
    >
      <SlotGrid
        room={room}
        size={size}
        label="Everyone's free time"
        cellClass={cellClass}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        {/* Reserves its line whether or not a pointer is over the grid, so the
            layout below does not jump as the pointer crosses a cell.
            `data-readout` is how a probe finds this line specifically: the
            heading above it also contains the words "everyone is free", and an
            unscoped text match reports success against the heading whether or
            not this ever renders. */}
        <p data-readout className="min-h-4 text-xs text-zinc-500">
          {hovered === null
            ? `${submittedCount} ${submittedCount === 1 ? 'person has' : 'people have'} answered. Tap or hover a slot to read it.`
            : describe(room, hovered, freeCounts[hovered] ?? 0, submittedCount)}
        </p>
        <Legend submittedCount={submittedCount} scale={scale} />
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

/**
 * Only the steps in play. Drawing all five in a room of two would promise a
 * gradation the grid never shows, and the swatch someone is trying to match
 * their cell against would not be among them.
 */
function Legend({
  submittedCount,
  scale,
}: {
  submittedCount: number
  scale: readonly number[]
}) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
      <span>0</span>
      <div className="h-3 w-4 rounded-sm bg-zinc-100 dark:bg-zinc-800/60" />
      {scale.map((step) => (
        <div key={step} className={`h-3 w-4 rounded-sm ${LEVELS[step]}`} />
      ))}
      <span>{submittedCount} free</span>
    </div>
  )
}
