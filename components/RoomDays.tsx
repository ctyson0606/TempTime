'use client'

import { type ReactNode, useMemo, useState } from 'react'
import { DateTime } from 'luxon'
import { WEEKDAY_LABELS, roomMonths } from '@/lib/calendar'
import {
  DAYS_PER_PAGE,
  type DayRange,
  isPaged,
  nextPageStart,
  pageFrom,
  previousPageStart,
} from '@/lib/dayPages'
import { ISO_DATE } from '@/lib/dates'
import type { RoomGrid } from '@/lib/slots'

interface RoomDaysProps {
  room: RoomGrid
  /**
   * Names the overview calendar. A room page draws two — one above the grid you
   * paint, one above the results — and like the grids themselves they need
   * names sharing no words, because role-name matching is by substring.
   */
  label: string
  /** What picking a date is for, finishing "Tap a date to …". */
  purpose: string
  /** The grid, given the days to draw; `undefined` means every day. */
  children: (days: DayRange | undefined) => ReactNode
  /**
   * What the calendar says about one day, by position in `dates`. Without it a
   * date is only a date — fine for choosing what to paint, and nothing at all
   * to go on when choosing which results to open.
   */
  markDay?: (dayIndex: number) => DayMark | undefined
}

export interface DayMark {
  /** Background and text colour for the date. */
  className: string
  /** A few characters under the day number, such as `2/3`. */
  note: string
  /** The same fact in words, for the date's accessible name. */
  description: string
}

/**
 * A long room as a calendar of its dates, zooming into a page of days.
 *
 * A room that fits on one page never sees any of this: it is drawn whole,
 * exactly as it was before rooms could run past a week.
 *
 * Each grid on the page keeps its own place. Tapping a date in the results
 * does not move the painter above it, because a card above the one being read
 * that changes height moves what is being read.
 */
export default function RoomDays({
  room,
  label,
  purpose,
  children,
  markDay,
}: RoomDaysProps) {
  // `first` outlives a return to the calendar, so the calendar can show where
  // you just were. Null until a date has been picked: highlighting the first
  // week of a calendar nobody has opened yet would claim a visit that never
  // happened.
  const [first, setFirst] = useState<number | null>(null)
  const [zoomed, setZoomed] = useState(false)

  const dayCount = room.dates.length
  if (!isPaged(dayCount)) return <>{children(undefined)}</>

  const page = pageFrom(dayCount, first ?? 0)

  if (!zoomed) {
    return (
      <RoomCalendar
        room={room}
        label={label}
        purpose={purpose}
        lastViewed={first === null ? null : page}
        markDay={markDay}
        onPick={(index) => {
          setFirst(index)
          setZoomed(true)
        }}
      />
    )
  }

  const next = nextPageStart(dayCount, page)
  const previous = previousPageStart(page)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <PagerButton onClick={() => setZoomed(false)}>All dates</PagerButton>
          <PagerButton
            onClick={() => previous !== null && setFirst(previous)}
            disabled={previous === null}
          >
            <span aria-hidden>←</span> Earlier
          </PagerButton>
          <PagerButton
            onClick={() => next !== null && setFirst(next)}
            disabled={next === null}
          >
            Later <span aria-hidden>→</span>
          </PagerButton>
        </div>
        <p data-page-range className="text-xs text-zinc-500">
          {describePage(room, page)}
        </p>
      </div>
      {children(page)}
    </div>
  )
}

/** "Sep 3 – Sep 12 · days 1–7 of 30", counting days the room covers. */
function describePage(room: RoomGrid, page: DayRange): string {
  const format = (index: number) =>
    DateTime.fromFormat(room.dates[index], ISO_DATE, { zone: room.timezone }).toFormat(
      'LLL d',
    )
  const last = page.first + page.count - 1
  const span =
    page.count === 1 ? format(page.first) : `${format(page.first)} – ${format(last)}`
  const which =
    page.count === 1 ? `day ${page.first + 1}` : `days ${page.first + 1}–${last + 1}`
  return `${span} · ${which} of ${room.dates.length}`
}

function RoomCalendar({
  room,
  label,
  purpose,
  lastViewed,
  markDay,
  onPick,
}: {
  room: RoomGrid
  label: string
  purpose: string
  lastViewed: DayRange | null
  markDay?: (dayIndex: number) => DayMark | undefined
  onPick: (dayIndex: number) => void
}) {
  const months = useMemo(
    () => roomMonths(room.dates, room.timezone),
    [room.dates, room.timezone],
  )
  const position = useMemo(
    () => new Map(room.dates.map((date, index) => [date, index])),
    [room.dates],
  )
  const inLastViewed = (index: number) =>
    lastViewed !== null &&
    index >= lastViewed.first &&
    index < lastViewed.first + lastViewed.count

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-500">
        {room.dates.length} dates. Tap a date to {purpose} — you will see{' '}
        {DAYS_PER_PAGE} of them at a time, starting there.
      </p>
      <div
        role="group"
        aria-label={label}
        className="flex flex-wrap justify-center gap-6"
      >
        {months.map((month) => (
          <div key={month.key} className="w-72">
            <div className="mb-2 text-center text-sm font-medium">
              {DateTime.fromObject(
                { year: month.year, month: month.month, day: 1 },
                { zone: room.timezone },
              ).toFormat('LLLL yyyy')}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-500">
              {WEEKDAY_LABELS.map((weekday) => (
                <div key={weekday} className="py-1">
                  {weekday.slice(0, 2)}
                </div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: month.leadingBlanks }, (_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {month.days.map((day) => {
                const index = position.get(day.date)
                if (index === undefined) {
                  // Not one of the room's days: shown so the month reads as a
                  // month, but not something that can be picked.
                  return (
                    <div
                      key={day.date}
                      className="flex aspect-square items-center justify-center text-sm text-zinc-300 dark:text-zinc-700"
                    >
                      {day.dayOfMonth}
                    </div>
                  )
                }
                const mark = markDay?.(index)
                const date = DateTime.fromFormat(day.date, ISO_DATE, {
                  zone: room.timezone,
                }).toFormat('cccc d LLLL')
                return (
                  <button
                    key={day.date}
                    type="button"
                    data-date={day.date}
                    onClick={() => onPick(index)}
                    aria-label={
                      mark === undefined ? date : `${date}, ${mark.description}`
                    }
                    className={[
                      'flex aspect-square flex-col items-center justify-center rounded-lg text-sm leading-none font-medium transition-[filter] hover:brightness-95 dark:hover:brightness-110',
                      mark?.className ??
                        'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
                      // A ring rather than a fill, so it can sit on top of
                      // whatever colour the day's own mark gave it.
                      inLastViewed(index)
                        ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-background'
                        : '',
                    ].join(' ')}
                  >
                    {day.dayOfMonth}
                    {mark !== undefined && (
                      <span aria-hidden className="mt-0.5 text-[10px] font-normal">
                        {mark.note}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** `min-h-9` below `sm`, the tap-target floor the other small controls keep. */
function PagerButton({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-9 items-center gap-1 rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-medium enabled:hover:bg-zinc-200 disabled:opacity-40 sm:min-h-0 dark:bg-zinc-800 dark:enabled:hover:bg-zinc-700"
    >
      {children}
    </button>
  )
}
