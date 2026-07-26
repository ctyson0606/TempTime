'use client'

import { useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { WEEKDAY_LABELS, calendarMonths } from '@/lib/calendar'
import { MAX_ROOM_DAYS, normalizeDates } from '@/lib/dates'

interface DatePickerProps {
  timezone: string
  selected: readonly string[]
  onChange: (dates: string[]) => void
  max?: number
}

/**
 * Month-at-a-time multi-select over the selectable window.
 *
 * Days are independent: picking 07-26, 07-27 and 08-15 is normal, not an edge
 * case. One month is shown at a time because the window spans four of them and
 * a four-month wall of dates buries the handful a user actually wants.
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

      <div className="mt-1 grid grid-cols-7 gap-1">
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
              onClick={() => toggle(day.date)}
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
