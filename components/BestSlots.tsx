'use client'

import { formatSlotWindow } from '@/lib/room'
import type { HeatmapBestSlot } from '@/lib/roomClient'
import type { RoomGrid } from '@/lib/slots'

interface BestSlotsProps {
  room: RoomGrid
  slots: readonly HeatmapBestSlot[]
  submittedCount: number
}

/**
 * The ranked windows to meet.
 *
 * `isEveryone` is false when the server fell back to the best available rather
 * than a whole-room match, and the difference is the whole message: "everyone
 * can make this" and "this is the least bad option" must never look alike, or
 * someone books the second believing it is the first.
 */
export default function BestSlots({ room, slots, submittedCount }: BestSlotsProps) {
  if (submittedCount === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Once people send their times, the best windows to meet appear here.
      </p>
    )
  }

  if (slots.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No window works for anyone yet — every slot is busy for at least one person who
        has answered.
      </p>
    )
  }

  const everyone = slots[0].isEveryone

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-500">
        {everyone
          ? `Free for all ${submittedCount} who have answered.`
          : `Nothing suits everyone. The best on offer is ${slots[0].freeCount} of ${submittedCount}.`}
      </p>
      <ol className="flex flex-col gap-2">
        {slots.map((slot) => (
          <li
            key={slot.startSlot}
            className={[
              'flex flex-wrap items-baseline justify-between gap-2 rounded-xl px-3 py-2',
              slot.isEveryone
                ? 'bg-emerald-50 dark:bg-emerald-950/50'
                : 'bg-amber-50 dark:bg-amber-950/40',
            ].join(' ')}
          >
            <span className="text-sm font-medium">
              {formatSlotWindow(room, slot.startSlot, slot.endSlot)}
            </span>
            <span className="text-xs text-zinc-500">
              {length(room, slot)} · {slot.freeCount} of {submittedCount} free
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function length(room: RoomGrid, slot: HeatmapBestSlot): string {
  const minutes = (slot.endSlot - slot.startSlot) * room.slotMinutes
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}
