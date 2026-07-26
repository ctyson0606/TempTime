'use client'

import { type PointerEvent as ReactPointerEvent, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { type RoomGrid, emptyMask, totalSlots } from '@/lib/slots'
import {
  blockSlots,
  busyCount,
  isBusy,
  maskToBlocks,
  paintBlock,
} from '@/lib/providers/manual'
import SlotGrid, { type GridSize, slotAt, slotAtPoint } from './SlotGrid'

interface ManualPainterProps {
  room: RoomGrid
  mask: string
  onChange: (mask: string) => void
  size?: GridSize
  /** Slots an import would add, shown lighter until they are confirmed. */
  pending?: string | null
}

interface Drag {
  anchor: number
  focus: number
  /** What the drag writes, decided by the cell it started on. */
  value: '0' | '1'
}

const BUSY = 'bg-indigo-500'
const PAINTING = 'bg-indigo-300 dark:bg-indigo-400'
const ERASING = 'bg-zinc-200 dark:bg-zinc-700'
/** Imported but not yet confirmed — see `BusyInput`. */
const PENDING = 'bg-indigo-200 dark:bg-indigo-800'

/** How many intervals to spell out before summarising the rest. */
const BLOCKS_SHOWN = 6

/**
 * Drag across the grid to mark busy time.
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
  const [drag, setDrag] = useState<Drag | null>(null)

  const preview = useMemo(() => {
    if (drag === null) return null
    return new Set(blockSlots(room, drag.anchor, drag.focus))
  }, [drag, room])

  // Undefined leaves the cell with the grid's own empty look.
  const cellClass = (slot: number) => {
    if (preview?.has(slot)) return drag?.value === '1' ? PAINTING : ERASING
    if (isBusy(mask, slot)) return BUSY
    return pending !== null && isBusy(pending, slot) ? PENDING : undefined
  }

  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    const slot = slotAt(event.target)
    if (slot === null) return
    // Keeps the move and up events coming even once the pointer leaves this
    // column, which every multi-day drag does immediately.
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ anchor: slot, focus: slot, value: isBusy(mask, slot) ? '0' : '1' })
  }

  const extend = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag === null) return
    // Null means the pointer is over the gutter or off the grid; hold the last
    // cell rather than collapsing the selection.
    const slot = slotAtPoint(event.clientX, event.clientY)
    if (slot === null || slot === drag.focus) return
    setDrag({ ...drag, focus: slot })
  }

  const commit = () => {
    if (drag === null) return
    onChange(paintBlock(room, mask, drag.anchor, drag.focus, drag.value))
    setDrag(null)
  }

  const marked = busyCount(mask)
  const blocks = useMemo(() => maskToBlocks(room, mask), [room, mask])

  return (
    <div className="flex flex-col gap-3">
      <SlotGrid
        room={room}
        size={size}
        label="Your busy times"
        cellClass={cellClass}
        onPointerDown={start}
        onPointerMove={extend}
        onPointerUp={commit}
        onPointerCancel={() => setDrag(null)}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <p className="text-xs text-zinc-500">
          {marked === 0
            ? 'Drag across the grid to mark when you are busy.'
            : `${marked} of ${totalSlots(room)} slots marked busy — ${duration(marked * room.slotMinutes)}. Drag over them again to clear.`}
        </p>
        <button
          type="button"
          onClick={() => onChange(emptyMask(room))}
          disabled={marked === 0}
          className="rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-medium enabled:hover:bg-zinc-200 disabled:opacity-40 dark:bg-zinc-800 dark:enabled:hover:bg-zinc-700"
        >
          Clear all
        </button>
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
