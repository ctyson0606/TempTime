'use client'

import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useMemo,
  useState,
} from 'react'
import { type DayPeak, dayPeaks } from '@/lib/aggregate'
import { rankFor, stepRanges, stepsInUse } from '@/lib/heatScale'
import { formatSlotWindow } from '@/lib/room'
import { type RoomGrid, slotsPerDay } from '@/lib/slots'
import { isPaged } from '@/lib/dayPages'
import RoomDays, { type DayMark } from './RoomDays'
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
 * Text on each step, for the calendar's dates, which carry a day number and a
 * count on top of the colour. Picked by measured contrast, not by eye: the
 * higher of white and emerald-950 on each step, which puts every pairing at
 * 4:1 or better. Emerald-600 is the close call in both modes — 4.02 for the
 * dark text against 3.77 for white.
 */
const LEVEL_TEXT = [
  'text-emerald-950 dark:text-white',
  'text-emerald-950 dark:text-emerald-950',
  'text-white dark:text-emerald-950',
  'text-white dark:text-emerald-950',
]

/**
 * Added to the top step when it means a whole group rather than one person: a
 * tick drawn in the step's own text colour, so "everyone" differs from "all but
 * one" in shape as well as in shade. Two neighbouring greens are the hardest
 * pair on the ramp to tell apart, and they are exactly the pair that decides
 * whether a time works. A pseudo-element, so the cells stay empty to anything
 * reading their text.
 */
const EVERYONE_MARK =
  "flex items-center justify-center text-[9px] leading-none after:content-['✓']"

/** The grid's own empty cell, so a day nobody can make looks like a slot nobody can. */
const EMPTY_DAY = 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400'

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

  const live = submittedCount > 0
  // With one answer every free slot is "everyone", and ticking all of them
  // would mark nothing out.
  const markEveryone = submittedCount >= 2
  const peaks = useMemo(
    () => (live ? dayPeaks(freeCounts, slotsPerDay(room)) : null),
    [live, freeCounts, room],
  )

  /**
   * A date on the results calendar, coloured by its best moment on the same
   * ramp as the grid, so the step a date wears is the step its best cell wears
   * once opened. A day is only as good as the most people it can seat at once.
   */
  const markDay = (dayIndex: number): DayMark | undefined => {
    const peak = peaks?.[dayIndex]
    if (peak === undefined) return undefined
    const rank = rankFor(peak.best, submittedCount, LEVELS.length)
    const everyone = markEveryone && peak.best === submittedCount
    return {
      className:
        rank < 0 ? EMPTY_DAY : `${LEVELS[scale[rank]]} ${LEVEL_TEXT[scale[rank]]}`,
      note: `${everyone ? '✓ ' : ''}${peak.best}/${submittedCount}`,
      description: describePeak(peak, submittedCount, room.slotMinutes),
    }
  }

  // Undefined leaves the cell with the grid's own empty look. Returning '' here
  // instead would be silently discarded by the grid's fallback.
  const cellClass = (slot: number): string | undefined => {
    const free = freeCounts[slot] ?? 0
    const rank = rankFor(free, submittedCount, LEVELS.length)
    if (rank < 0) return undefined
    const step = scale[rank]
    return markEveryone && free === submittedCount
      ? `${LEVELS[step]} ${LEVEL_TEXT[step]} ${EVERYONE_MARK}`
      : LEVELS[step]
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

  // One tree for both states, so the page a long room is showing survives the
  // first answer arriving rather than snapping back to the calendar.
  return (
    <div
      className="flex flex-col gap-3"
      onPointerDown={live ? track : undefined}
      onPointerMove={live ? track : undefined}
      onPointerLeave={live ? release : undefined}
    >
      {live && isPaged(room.dates.length) && peaks !== null && (
        <p className="text-sm">{summarise(peaks, submittedCount)}</p>
      )}
      {live && <Legend submittedCount={submittedCount} scale={scale} />}

      <RoomDays
        room={room}
        label="Overview of the room's dates"
        purpose="see who is free"
        markDay={live ? markDay : undefined}
      >
        {(days) =>
          live ? (
            <>
              <SlotGrid
                room={room}
                size={size}
                label="Everyone's free time"
                days={days}
                cellClass={cellClass}
              />
              {/* Only beside a grid: on a long room's calendar there is no slot
                  to tap, and a line saying to tap one is a line to ignore.
                  Reserves its height whether or not a pointer is over the grid,
                  so the layout below does not jump as the pointer crosses a
                  cell. `data-readout` is how a probe finds this line
                  specifically — an unscoped text match for its words has matched
                  a heading before, and passed whether or not this rendered. */}
              <p
                data-readout
                className="min-h-4 border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800"
              >
                {hovered === null
                  ? 'Tap or hover a slot to see exactly how many are free.'
                  : describe(room, hovered, freeCounts[hovered] ?? 0, submittedCount)}
              </p>
            </>
          ) : (
            // All-zero counts drawn literally are indistinguishable from
            // "everyone is busy the whole time", which is the opposite of what
            // no answers means.
            //
            // Named differently from the overlay, and deliberately sharing no
            // words with it. This grid has the same role, the same cells and
            // none of the behaviour: no pointer handlers, no readout. Under one
            // name a screen reader announces the two identically, and anything
            // selecting by role cannot tell which one it found — which is how a
            // probe came to tap this one for five days and report the readout
            // as broken. A name that merely *added* to the other would be no
            // better, because a substring match finds both.
            <SlotGrid
              room={room}
              size={size}
              label="Results, no answers yet"
              days={days}
            />
          )
        }
      </RoomDays>

      {!live && (
        <p className="border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
          Nobody has sent their times yet. As people answer, the times that suit
          everyone fill in here.
        </p>
      )}
    </div>
  )
}

/**
 * What the calendar adds up to, in one sentence. Leads with the answer the page
 * exists for — which dates everyone can make — and says plainly when there is
 * none, rather than leaving someone to scan every date for the darkest green.
 */
function summarise(peaks: readonly DayPeak[], submittedCount: number): string {
  const everyone = peaks.filter((peak) => peak.best === submittedCount).length
  const dates = (n: number) => `${n} ${n === 1 ? 'date' : 'dates'}`
  const who =
    submittedCount === 1
      ? 'The 1 person who has answered is'
      : `All ${submittedCount} who have answered are`

  if (everyone > 0) {
    return `${who} free at some point on ${dates(everyone)} of ${peaks.length}.`
  }
  const best = Math.max(...peaks.map((peak) => peak.best))
  if (best === 0) return 'Nobody who has answered is free on any of these dates.'
  const on = peaks.filter((peak) => peak.best === best).length
  return `No date suits everyone yet. The most free at once is ${best} of ${submittedCount}, on ${dates(on)}.`
}

function describePeak(
  peak: DayPeak,
  submittedCount: number,
  slotMinutes: number,
): string {
  if (peak.best === 0) return 'nobody free'
  const minutes = peak.slots * slotMinutes
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const length =
    hours === 0 ? `${rest}m` : rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
  return peak.best === submittedCount
    ? `everyone free (${peak.best} of ${submittedCount}) for ${length}`
    : `at most ${peak.best} of ${submittedCount} free, for ${length}`
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
 * Only the steps in play, each labelled with the people it stands for.
 *
 * Above the grid rather than under it: a key read after the thing it explains
 * is a key read after the reader has already guessed. Drawing all the steps in
 * a room of two would promise a gradation the grid never shows, and past four
 * people a step is a range that nobody could infer from two end labels.
 */
function Legend({
  submittedCount,
  scale,
}: {
  submittedCount: number
  scale: readonly number[]
}) {
  const ranges = stepRanges(submittedCount, LEVELS.length)
  const top = scale.length - 1
  return (
    <div
      data-legend
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-zinc-500"
    >
      <span>
        {submittedCount} {submittedCount === 1 ? 'person has' : 'people have'} answered
        · Free at once:
      </span>
      <Swatch className="bg-zinc-100 dark:bg-zinc-800/60">0</Swatch>
      {scale.map((step, rank) => {
        const { min, max } = ranges[rank]
        const everyone = rank === top && submittedCount >= 2
        return (
          <Swatch
            key={step}
            className={`${LEVELS[step]} ${LEVEL_TEXT[step]}`}
            tick={everyone}
          >
            {everyone
              ? `all ${submittedCount}`
              : min === max
                ? `${min}`
                : `${min}–${max}`}
          </Swatch>
        )
      })}
    </div>
  )
}

function Swatch({
  className,
  tick = false,
  children,
}: {
  className: string
  tick?: boolean
  children: ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden
        className={`inline-flex h-4 w-5 items-center justify-center rounded-sm text-[9px] leading-none ${className}`}
      >
        {tick ? '✓' : ''}
      </span>
      {children}
    </span>
  )
}
