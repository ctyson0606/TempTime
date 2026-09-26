'use client'

import type { ProviderId } from '@/lib/providers/types'

interface SourcePickerProps {
  onPick: (source: ProviderId) => void
  /** The source the last import came from, highlighted so the row shows state. */
  active?: ProviderId | null
  busy?: boolean
}

interface Source {
  id: ProviderId
  label: string
  note: string
  available: boolean
}

/**
 * Where the time taken out of an offer comes from.
 *
 * Only what works is shown. The platforms still to come used to be listed as
 * "Coming soon", on the theory that knowing a connector was on its way made
 * importing a file today bearable; in use they were half the row and did
 * nothing, and the user asked for them gone until they work. They stay in this
 * list, so each one reappears by adding a provider under `lib/providers/` and
 * flipping its flag.
 *
 * Painting by hand is not a source here either. The grid can always be painted,
 * so a button to choose it did nothing but print a hint.
 */
const SOURCES: Source[] = [
  {
    id: 'weekly',
    label: 'Weekly timetable',
    note: 'Kept on this device',
    available: true,
  },
  { id: 'ics', label: 'Import .ics', note: 'Read in your browser', available: true },
  { id: 'google', label: 'Google Calendar', note: 'Coming soon', available: false },
  { id: 'todoist', label: 'Todoist', note: 'Coming soon', available: false },
  { id: 'ticktick', label: 'TickTick', note: 'Coming soon', available: false },
]

export default function SourcePicker({ onPick, active, busy }: SourcePickerProps) {
  return (
    <div
      role="group"
      aria-label="Sources"
      className="flex flex-wrap items-center gap-2"
    >
      {SOURCES.filter((source) => source.available).map((source) => (
        <button
          key={source.id}
          type="button"
          onClick={() => onPick(source.id)}
          disabled={busy}
          title={source.note}
          className={[
            // See GridSizePicker in RoomView: thumb-sized on a phone, unchanged
            // from `sm` up.
            'inline-flex min-h-9 items-center rounded-xl px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-0',
            active === source.id
              ? 'bg-indigo-600 text-white'
              : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700',
          ].join(' ')}
        >
          {source.label}
        </button>
      ))}
    </div>
  )
}
