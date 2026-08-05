'use client'

import { DateTime } from 'luxon'
import type { BusyBlock } from '@/lib/providers/types'

interface PrivacyChecklistProps {
  blocks: BusyBlock[]
  timezone: string
  /** Ids that will be taken out of the free time. Everything else is left alone. */
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  onSelectAll: (all: boolean) => void
  onApply: () => void
  onDiscard: () => void
  /** What the file contained that did not become a block, if anything. */
  notice?: string | null
}

/**
 * The privacy gate: every imported event, individually declinable.
 *
 * This is the product's actual difference from every other scheduling tool, so
 * the wording has to be unambiguous — unticking is not "hide this from the list",
 * it is "leave that time in what I am offering". Titles are on screen because you
 * cannot decide without seeing them, and they are dropped at this boundary: only
 * the 0/1 mask goes any further.
 */
export default function PrivacyChecklist({
  blocks,
  timezone,
  selected,
  onToggle,
  onSelectAll,
  onApply,
  onDiscard,
  notice,
}: PrivacyChecklistProps) {
  const all = selected.size === blocks.length
  const none = selected.size === 0

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">
          {blocks.length} {blocks.length === 1 ? 'event' : 'events'} found
        </h3>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => onSelectAll(true)}
            disabled={all}
            className="text-indigo-600 enabled:hover:underline disabled:opacity-40 dark:text-indigo-400"
          >
            Tick all
          </button>
          <button
            type="button"
            onClick={() => onSelectAll(false)}
            disabled={none}
            className="text-indigo-600 enabled:hover:underline disabled:opacity-40 dark:text-indigo-400"
          >
            Untick all
          </button>
        </div>
      </div>

      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        Ticked events are taken out of the time you marked as free. Unticked ones change
        nothing. The names below are only ever on this screen — they are not sent
        anywhere, and they are not what gets submitted.
      </p>

      {notice != null && notice !== '' && (
        <p className="mt-2 text-xs text-zinc-500">{notice}</p>
      )}

      <ul className="mt-3 max-h-64 overflow-y-auto pr-1">
        {blocks.map((block) => (
          <li key={block.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/60 dark:hover:bg-black/20">
              <input
                type="checkbox"
                checked={selected.has(block.id)}
                onChange={() => onToggle(block.id)}
                className="size-4 accent-indigo-600"
              />
              <span className="font-mono text-xs text-zinc-500">
                {when(block.start, block.end, timezone)}
              </span>
              <span className="truncate text-sm">
                {block.label ?? 'Untitled event'}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={none}
          className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-medium text-white enabled:hover:bg-indigo-500 disabled:opacity-40"
        >
          Take {selected.size} out of my free time
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-xl bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          Discard import
        </button>
      </div>
    </div>
  )
}

function when(start: Date, end: Date, timezone: string): string {
  const from = DateTime.fromJSDate(start).setZone(timezone)
  const to = DateTime.fromJSDate(end).setZone(timezone)
  const sameDay = from.hasSame(to, 'day')
  return `${from.toFormat('MM/dd ccc HH:mm')}–${to.toFormat(sameDay ? 'HH:mm' : 'MM/dd HH:mm')}`
}
