'use client'

import { useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { type RoomGrid, emptyMask, fullMask, invertMask, totalSlots } from '@/lib/slots'
import { isMarked, markedCount, maskToBlocks } from '@/lib/providers/manual'
import { isPaged } from '@/lib/dayPages'
import GridPainter from './GridPainter'
import { EMPTY_CELL } from './SlotGrid'
import RoomDays from './RoomDays'
import type { GridSize } from './SlotGrid'

interface ManualPainterProps {
  room: RoomGrid
  mask: string
  onChange: (mask: string) => void
  size?: GridSize
  /** Slots an import would take away, shown in the removing colour until confirmed. */
  pending?: string | null
}

/**
 * Indigo, not the green the results grid uses.
 *
 * This grid is what one person is offering; the overlay is what everybody
 * together can do. Painting them the same colour would suggest the cell in front
 * of you means the same thing in both, and it does not.
 */
const FREE = 'bg-indigo-500'
/** Imported, and about to be taken out of the offer — see `BusyInput`. */
const PENDING_REMOVAL = 'bg-rose-400 dark:bg-rose-700'

/** How many intervals to spell out before summarising the rest. */
const BLOCKS_SHOWN = 6

/**
 * Drag across the grid to mark the time you are free.
 *
 * The gesture works the same with a mouse and a finger, so it is built on pointer
 * events and hit-testing rather than per-cell mouse handlers: during a touch drag
 * the browser keeps sending events to the element the touch started on, so which
 * cell the finger is over now has to be resolved by position.
 *
 * The cell the drag starts on decides whether the whole drag paints or erases —
 * dragging back over marked time clears it, which is how anyone who has used a
 * calendar expects it to behave.
 */
export default function ManualPainter({
  room,
  mask,
  onChange,
  size = 'medium',
  pending = null,
}: ManualPainterProps) {
  // Only a slot that was offered can be taken away, so the removal colour never
  // appears on a cell the import would not actually change.
  const markedClass = (slot: number) =>
    pending !== null && isMarked(pending, slot) ? PENDING_REMOVAL : FREE

  const marked = markedCount(mask)
  const total = totalSlots(room)

  /**
   * The last swap, kept with the grid it produced. Its message shows only while
   * the grid is still exactly that, so any later edit retires it without an
   * effect or a timer: a swap is the moment someone asks "which way round is
   * this now?", and the answer belongs where they are looking — beside the
   * button — rather than in the key above the grid.
   */
  const [swapped, setSwapped] = useState<{ from: number; mask: string } | null>(null)
  const swap = () => {
    const next = invertMask(mask)
    setSwapped({ from: marked, mask: next })
    onChange(next)
  }
  // On a paged room these reach every day, not only the page in view, so they
  // say how many. A button that looks the same whether it clears one week or
  // thirteen is the one someone presses expecting the smaller.
  const reach = isPaged(room.dates.length) ? ` ${room.dates.length} days` : ''
  const blocks = useMemo(() => maskToBlocks(room, mask), [room, mask])

  return (
    <div className="flex flex-col gap-3">
      <RoomDays room={room} label="Pick days to paint" purpose="mark when you are free">
        {(days) => (
          <>
            {/* What a coloured cell means, said before the grid is read. There
                is one meaning and no mode — coloured is free, whatever was
                painted or swapped to get there — but nothing on screen said
                so, and after a swap it was fair to wonder which way round the
                grid now was. Only beside a grid, like the results' readout. */}
            {/* An instruction first and a key second, at reading size: the
                first version was a 12px grey legend, which reads as a footnote
                and was skipped. The "Not free" swatch carries a ring because
                the empty cell's colour is close to the card behind it, and a
                swatch that vanishes explains nothing. */}
            <div
              data-painter-key
              className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm"
            >
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                Mark the times you are free
              </span>
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-zinc-600 dark:text-zinc-400">
                <KeyItem className={FREE}>Free</KeyItem>
                <KeyItem
                  className={`${EMPTY_CELL} ring-1 ring-zinc-300 ring-inset dark:ring-zinc-600`}
                >
                  Not free
                </KeyItem>
                {pending !== null && (
                  <KeyItem className={PENDING_REMOVAL}>Will be taken out</KeyItem>
                )}
              </span>
            </div>
            <GridPainter
              room={room}
              mask={mask}
              onChange={onChange}
              size={size}
              label="Your free times"
              markedClass={markedClass}
              days={days}
            />
          </>
        )}
      </RoomDays>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <p data-painter-status className="text-xs text-zinc-500">
          {swapped !== null && swapped.mask === mask ? (
            <>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                Swapped: {marked} of {total} slots are now free
              </span>{' '}
              (was {swapped.from}). Coloured still means free.
            </>
          ) : marked === 0 ? (
            'Drag across the grid to mark when you are free — or mark when you are busy, then swap.'
          ) : (
            `${marked} of ${total} slots marked free — ${duration(marked * room.slotMinutes)}. Drag over them again to clear.`
          )}
        </p>
        {/* Three one-shot actions rather than a busy/free mode. A mode would
            give every label, colour and count in this flow a second version to
            keep in step, and the two versions would drift somewhere no test can
            see. The swap covers the person who would rather think in busy time:
            paint what is taken, then flip once. See PLAN.md section 14. It was
            labelled "Invert", which said what it does to a bit string and not
            what it does to the grid; the label now names both ends. */}
        <div className="flex flex-wrap gap-2">
          <PainterAction
            onClick={() => onChange(fullMask(room))}
            disabled={marked === total}
          >
            Select all{reach}
          </PainterAction>
          <PainterAction onClick={swap}>Swap free ↔ not free</PainterAction>
          <PainterAction
            onClick={() => onChange(emptyMask(room))}
            disabled={marked === 0}
          >
            Clear all{reach}
          </PainterAction>
        </div>
      </div>

      {blocks.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-zinc-500">
          {blocks.slice(0, BLOCKS_SHOWN).map((block) => (
            <li key={block.id}>{describe(block.start, block.end, room.timezone)}</li>
          ))}
          {blocks.length > BLOCKS_SHOWN && (
            <li className="text-zinc-400">and {blocks.length - BLOCKS_SHOWN} more</li>
          )}
        </ul>
      )}
    </div>
  )
}

function KeyItem({
  className,
  children,
}: {
  className: string
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`h-4 w-6 rounded ${className}`} />
      {children}
    </span>
  )
}

/** `min-h-9` below `sm` for the same reason the other small controls carry it. */
function PainterAction({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-9 items-center rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-medium enabled:hover:bg-zinc-200 disabled:opacity-40 sm:min-h-0 dark:bg-zinc-800 dark:enabled:hover:bg-zinc-700"
    >
      {children}
    </button>
  )
}

function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

function describe(start: Date, end: Date, timezone: string): string {
  const from = DateTime.fromJSDate(start).setZone(timezone)
  const to = DateTime.fromJSDate(end).setZone(timezone)
  return `${from.toFormat('MM/dd ccc HH:mm')}–${to.toFormat('HH:mm')}`
}
