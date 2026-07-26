'use client'

import { useMemo, useRef, useState } from 'react'
import {
  type RoomGrid,
  blocksToMask,
  slotRange,
  totalSlots,
  unionMasks,
} from '@/lib/slots'
import { clearImport, loadImport, saveImport } from '@/lib/importCache'
import { type IcsSkipped, parseIcs } from '@/lib/providers/ics'
import type { BusyBlock, ProviderId } from '@/lib/providers/types'
import ManualPainter from './ManualPainter'
import PrivacyChecklist from './PrivacyChecklist'
import SourcePicker from './SourcePicker'
import type { GridSize } from './SlotGrid'

interface BusyInputProps {
  room: RoomGrid
  /** Which room's import cache to read and write. */
  code: string
  mask: string
  onChange: (mask: string) => void
  size?: GridSize
}

/**
 * Steps one and two of the room flow: where your busy time comes from, and which
 * of it you are willing to share.
 *
 * Imported events never go straight onto the grid. They sit in the checklist
 * first, shown on the grid as a lighter shade, and only what is still ticked is
 * merged in — the whole point being that declining an event happens before
 * anything is committed, not after.
 */
export default function BusyInput({
  room,
  code,
  mask,
  onChange,
  size,
}: BusyInputProps) {
  // Restored once, on the first client render. A reload in the middle of ticking
  // through a calendar should not send someone back to the file picker.
  const [cached] = useState(() => (isBrowser() ? loadImport(code) : null))
  const [imported, setImported] = useState<BusyBlock[] | null>(cached?.blocks ?? null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    new Set(cached?.selected ?? []),
  )
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  /** What the ticked events would add, drawn on the grid before it is committed. */
  const pending = useMemo(() => {
    if (imported === null) return null
    const ticked = imported.filter((block) => selected.has(block.id))
    return ticked.length === 0 ? null : blocksToMask(room, ticked)
  }, [imported, selected, room])

  const pick = (source: ProviderId) => {
    setError(null)
    if (source === 'ics') {
      fileInput.current?.click()
      return
    }
    setHint('Drag across the grid below to mark when you are busy.')
  }

  const read = async (file: File) => {
    setError(null)
    setHint(null)

    let text: string
    try {
      text = await file.text()
    } catch {
      setError('That file could not be read.')
      return
    }

    const result = parseIcs(text, {
      timezone: room.timezone,
      from: slotRange(room, 0).start.toJSDate(),
      to: slotRange(room, totalSlots(room) - 1).end.toJSDate(),
    })

    if (!result.ok) {
      setError(`That does not look like a calendar file: ${result.detail}`)
      remember(null, new Set())
      return
    }

    // The parser works from a date range, which spans the calendar days between
    // the room's chosen days as well. An event on one of those cannot mark a slot,
    // so listing it would offer a choice that changes nothing.
    const onGrid = result.blocks.filter((block) =>
      blocksToMask(room, [block]).includes('1'),
    )
    const skipped = {
      ...result.skipped,
      outsideRange:
        result.skipped.outsideRange + (result.blocks.length - onGrid.length),
    }

    if (onGrid.length === 0) {
      remember(null, new Set())
      setNotice(
        describe(skipped) ?? 'Nothing in that file falls on the days this room covers.',
      )
      return
    }

    remember(onGrid, new Set(onGrid.map((block) => block.id)))
    setNotice(describe(skipped))
  }

  /** Move the import forward in state and in the cache together. */
  const remember = (blocks: BusyBlock[] | null, ids: ReadonlySet<string>) => {
    setImported(blocks)
    setSelected(ids)
    if (blocks === null) clearImport(code)
    else saveImport(code, { blocks, selected: [...ids] })
  }

  const apply = () => {
    if (pending !== null) onChange(unionMasks(mask, pending))
    const count = selected.size
    remember(null, new Set())
    setNotice(`Added ${count} ${count === 1 ? 'event' : 'events'} to the grid.`)
  }

  return (
    <div className="flex flex-col gap-3">
      <SourcePicker
        onPick={pick}
        active={imported === null ? null : 'ics'}
        busy={imported !== null}
      />

      <input
        ref={fileInput}
        type="file"
        accept=".ics,text/calendar"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Cleared so choosing the same file twice fires a change event again.
          event.target.value = ''
          if (file !== undefined) void read(file)
        }}
      />

      {error !== null && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {hint !== null && imported === null && (
        <p className="text-xs text-zinc-500">{hint}</p>
      )}

      {imported === null
        ? notice !== null && <p className="text-xs text-zinc-500">{notice}</p>
        : null}

      {imported !== null && (
        <PrivacyChecklist
          blocks={imported}
          timezone={room.timezone}
          selected={selected}
          notice={notice}
          onToggle={(id) => {
            const next = new Set(selected)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            remember(imported, next)
          }}
          onSelectAll={(all) =>
            remember(
              imported,
              all ? new Set(imported.map((block) => block.id)) : new Set(),
            )
          }
          onApply={apply}
          onDiscard={() => {
            remember(null, new Set())
            setNotice(null)
          }}
        />
      )}

      <ManualPainter
        room={room}
        mask={mask}
        onChange={onChange}
        size={size}
        pending={pending}
      />
    </div>
  )
}

/** The cache is browser-only; the server pass must not reach for it. */
function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

/** One sentence about what the file contained but the grid will not show. */
function describe(skipped: IcsSkipped): string | null {
  const parts: string[] = []
  if (skipped.allDay > 0) parts.push(`${skipped.allDay} all-day`)
  if (skipped.transparent > 0) parts.push(`${skipped.transparent} marked free`)
  if (skipped.cancelled > 0) parts.push(`${skipped.cancelled} cancelled`)
  if (skipped.outsideRange > 0) parts.push(`${skipped.outsideRange} outside these days`)
  if (skipped.empty > 0) parts.push(`${skipped.empty} with no duration`)
  if (skipped.truncated > 0) {
    parts.push(`${skipped.truncated} repeating too often to expand`)
  }
  return parts.length === 0 ? null : `Ignored: ${parts.join(', ')}.`
}
