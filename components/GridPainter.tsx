'use client'

import { type PointerEvent as ReactPointerEvent, useMemo, useState } from 'react'
import type { RoomGrid } from '@/lib/slots'
import { blockSlots, isMarked, paintBlock } from '@/lib/providers/manual'
import SlotGrid, { type GridSize, slotAt, slotAtPoint } from './SlotGrid'

interface GridPainterProps {
  room: RoomGrid
  mask: string
  onChange: (mask: string) => void
  /**
   * The grid's accessible name. Required rather than optional: a page drawing
   * more than one of these needs them told apart, and by the time a second
   * appears the first one's tests are already written.
   */
  label: string
  size?: GridSize
  /** Class for a marked cell. A function, so a caller can colour some of them differently. */
  markedClass: (slot: number) => string
  /** Draw weekday names without dates, for a grid that is not about real days. */
  weekdayOnly?: boolean
}

interface Drag {
  anchor: number
  focus: number
  /** What the drag writes, decided by the cell it started on. */
  value: '0' | '1'
}

const PAINTING = 'bg-indigo-300 dark:bg-indigo-400'
const ERASING = 'bg-zinc-200 dark:bg-zinc-700'

/**
 * Drag across a grid to mark slots on it.
 *
 * The gesture works the same with a mouse and a finger, so it is built on
 * pointer events and hit-testing rather than per-cell mouse handlers: during a
 * touch drag the browser keeps sending events to the element the touch started
 * on, so which cell the finger is over now has to be resolved by position.
 *
 * The cell the drag starts on decides whether the whole drag paints or erases —
 * dragging back over marked time clears it, which is how anyone who has used a
 * calendar expects it to behave.
 *
 * What a marked slot *means* is the caller's business. Two grids use this: the
 * one that collects the time you are free, and the weekly pattern that collects
 * the time you never are. They share the gesture and nothing else, which is why
 * the colours and every word around them come from above.
 */
export default function GridPainter({
  room,
  mask,
  onChange,
  label,
  size = 'medium',
  markedClass,
  weekdayOnly = false,
}: GridPainterProps) {
  const [drag, setDrag] = useState<Drag | null>(null)

  const preview = useMemo(() => {
    if (drag === null) return null
    return new Set(blockSlots(room, drag.anchor, drag.focus))
  }, [drag, room])

  // Undefined leaves the cell with the grid's own empty look.
  const cellClass = (slot: number) => {
    if (preview?.has(slot)) return drag?.value === '1' ? PAINTING : ERASING
    return isMarked(mask, slot) ? markedClass(slot) : undefined
  }

  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    const slot = slotAt(event.target)
    if (slot === null) return
    // Keeps the move and up events coming even once the pointer leaves this
    // column, which every multi-day drag does immediately.
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ anchor: slot, focus: slot, value: isMarked(mask, slot) ? '0' : '1' })
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

  return (
    <SlotGrid
      room={room}
      size={size}
      label={label}
      weekdayOnly={weekdayOnly}
      cellClass={cellClass}
      onPointerDown={start}
      onPointerMove={extend}
      onPointerUp={commit}
      onPointerCancel={() => setDrag(null)}
    />
  )
}
