'use client'

import {
  type PointerEvent as ReactPointerEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import { DateTime } from 'luxon'
import { WEEKDAY_LABELS, calendarMonths } from '@/lib/calendar'
import { MAX_ROOM_DAYS, normalizeDates } from '@/lib/dates'

interface DatePickerProps {
  timezone: string
  selected: readonly string[]
  onChange: (dates: string[]) => void
  max?: number
}

/** A drag in progress: what it writes, and where the pointer last was. */
interface Sweep {
  /** Select or deselect, decided by the day the drag started on. */
  select: boolean
  /** The selection as this drag has left it so far. */
  working: Set<string>
  x: number
  y: number
}

/** How far apart to sample a fast drag, in pixels — under half a day cell. */
const SAMPLE_PX = 12

/** The selectable day under a point, or null. */
function dayAt(x: number, y: number): string | null {
  const cell = document.elementFromPoint(x, y)?.closest('[data-day]')
  if (!(cell instanceof HTMLElement) || cell.dataset.selectable !== 'true') return null
  return cell.dataset.day ?? null
}

/**
 * Month-at-a-time multi-select over the selectable window.
 *
 * Days are independent: picking 07-26, 07-27 and 08-15 is normal, not an edge
 * case. One month is shown at a time because the window spans four of them and
 * a four-month wall of dates buries the handful a user actually wants.
 *
 * Press and sweep to pick many at once: every day the pointer passes over
 * follows the day it started on, so a sweep that starts on an unpicked day
 * picks and one that starts on a picked day clears — the same rule the time
 * grid paints by. It is built like that grid, on pointer events and
 * hit-testing, because a finger's events keep going to the day it landed on.
 */
export default function DatePicker({
  timezone,
  selected,
  onChange,
  max = MAX_ROOM_DAYS,
}: DatePickerProps) {
  const months = useMemo(() => calendarMonths(timezone), [timezone])
  const [page, setPage] = useState(0)
  const month = months[page]
  const atLimit = selected.length >= max
  const sweep = useRef<Sweep | null>(null)

  /** Apply the sweep to one day, respecting the limit when adding. */
  const touch = (date: string) => {
    const current = sweep.current
    if (current === null) return
    if (current.select === current.working.has(date)) return
    if (current.select) {
      if (current.working.size >= max) return
      current.working.add(date)
    } else {
      current.working.delete(date)
    }
    // Built from the working set, not from `selected`: several moves can land
    // before the parent re-renders, and each would otherwise start from the
    // same stale list and undo the one before it.
    onChange(normalizeDates([...current.working]))
  }

  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    const date = dayAt(event.clientX, event.clientY)
    if (date === null) return
    // Keeps the moves coming once the pointer leaves the day it started on.
    event.currentTarget.setPointerCapture(event.pointerId)
    sweep.current = {
      select: !selected.includes(date),
      working: new Set(selected),
      x: event.clientX,
      y: event.clientY,
    }
    touch(date)
  }

  const extend = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = sweep.current
    if (current === null) return
    // A fast swipe can cross a whole day between two events, so the straight
    // line from the last point is sampled rather than only its end.
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / SAMPLE_PX))
    for (let i = 1; i <= steps; i++) {
      const day = dayAt(current.x + (dx * i) / steps, current.y + (dy * i) / steps)
      if (day !== null) touch(day)
    }
    current.x = event.clientX
    current.y = event.clientY
  }

  const finish = () => {
    sweep.current = null
  }

  const toggle = (date: string) => {
    if (selected.includes(date)) {
      onChange(selected.filter((d) => d !== date))
    } else if (!atLimit) {
      onChange(normalizeDates([...selected, date]))
    }
  }

  const monthLabel = DateTime.fromObject(
    { year: month.year, month: month.month, day: 1 },
    { zone: timezone },
  ).toFormat('LLLL yyyy')

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPage((p) => p - 1)}
          disabled={page === 0}
          className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 enabled:hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:enabled:hover:bg-zinc-800"
          aria-label="Previous month"
        >
          ←
        </button>
        <span className="text-sm font-medium">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={page === months.length - 1}
          className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 enabled:hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:enabled:hover:bg-zinc-800"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-500">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">
            {label.slice(0, 2)}
          </div>
        ))}
      </div>

      {/* `touch-none` so a finger sweeping the days picks them instead of
          scrolling the page; the page still scrolls from anywhere else. */}
      <div
        className="mt-1 grid touch-none grid-cols-7 gap-1 select-none"
        onPointerDown={start}
        onPointerMove={extend}
        onPointerUp={finish}
        onPointerCancel={finish}
      >
        {Array.from({ length: month.leadingBlanks }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {month.days.map((day) => {
          const isSelected = selected.includes(day.date)
          // A day past the limit stays clickable only to unselect itself.
          const disabled = !day.selectable || (atLimit && !isSelected)
          return (
            <button
              key={day.date}
              type="button"
              data-day={day.date}
              data-selectable={day.selectable && !(atLimit && !isSelected)}
              // Pointer presses are handled by the sweep above, which already
              // toggled this day on pointerdown; acting on the click that
              // follows would undo it. A click with `detail` 0 comes from the
              // keyboard, and that one is the only way a key picks a day.
              onClick={(event) => {
                if (event.detail === 0) toggle(day.date)
              }}
              disabled={disabled}
              aria-pressed={isSelected}
              className={[
                'aspect-square rounded-lg text-sm transition-colors',
                isSelected
                  ? 'bg-indigo-600 font-medium text-white hover:bg-indigo-500'
                  : disabled
                    ? 'text-zinc-300 dark:text-zinc-700'
                    : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
              ].join(' ')}
            >
              {day.dayOfMonth}
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-xs text-zinc-500">
        {selected.length} of {max} days selected
        {atLimit && ' — deselect one to pick another'}
      </p>
    </div>
  )
}
