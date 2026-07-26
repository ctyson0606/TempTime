'use client'

import { useState } from 'react'
import CopyButton from './CopyButton'

interface RoomAdminBarProps {
  adminUrl: string
  onDelete: () => void
}

/**
 * Visible only to whoever holds the room's owner secret.
 *
 * Deletion is deliberately restricted to the creator: one mistaken click
 * destroys what everyone submitted, and that cost is not symmetric. Hence the
 * second confirmation, spelling out that the data does not come back.
 */
export default function RoomAdminBar({ adminUrl, onDelete }: RoomAdminBarProps) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm font-medium">You created this room</p>
      <p className="mt-1 text-xs text-zinc-500">
        Keep the admin link below — it is what proves it.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton value={adminUrl} label="Copy admin link" />
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
          >
            Delete room
          </button>
        ) : (
          <div className="flex w-full flex-col gap-2 rounded-xl bg-red-50 p-3 dark:bg-red-950">
            <p className="text-sm text-red-800 dark:text-red-200">
              Delete this room? Every member&apos;s submitted times go with it, and
              nothing can be recovered.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onDelete}
                className="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                Yes, delete it
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-xl bg-white px-3 py-2 text-sm font-medium dark:bg-zinc-900"
              >
                Keep it
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
