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
 * Where busy times come from.
 *
 * The unavailable platforms are listed rather than hidden: knowing the connector
 * is coming is the reason someone would put up with importing a file today. Each
 * one becomes available by adding a provider under `lib/providers/`, with no
 * change here beyond a flag.
 */
const SOURCES: Source[] = [
  { id: 'manual', label: 'Paint by hand', note: 'Drag on the grid', available: true },
  { id: 'ics', label: 'Import .ics', note: 'Read in your browser', available: true },
  { id: 'google', label: 'Google Calendar', note: 'Coming soon', available: false },
  { id: 'todoist', label: 'Todoist', note: 'Coming soon', available: false },
  { id: 'ticktick', label: 'TickTick', note: 'Coming soon', available: false },
]

export default function SourcePicker({ onPick, active, busy }: SourcePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {SOURCES.map((source) => (
        <button
          key={source.id}
          type="button"
          onClick={() => onPick(source.id)}
          disabled={!source.available || busy}
          title={source.note}
          className={[
            // See GridSizePicker in RoomView: thumb-sized on a phone, unchanged
            // from `sm` up.
            'inline-flex min-h-9 items-center rounded-xl px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-0',
            !source.available
              ? 'cursor-not-allowed bg-zinc-50 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600'
              : active === source.id
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700',
          ].join(' ')}
        >
          {source.label}
          {!source.available && (
            <span className="ml-1.5 font-normal">· {source.note}</span>
          )}
        </button>
      ))}
    </div>
  )
}
