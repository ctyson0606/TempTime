'use client'

import { useState } from 'react'

interface JoinDialogProps {
  roomTitle: string | null
  onJoin: (displayName: string) => void
  /** Joining is a round trip now, so the button has to say so. */
  pending?: boolean
  /** A name the server would not take, or a request that did not arrive. */
  error?: string | null
}

/** Matches `participants.display_name` in the schema (PLAN.md section 4.1). */
const MAX_NAME_LENGTH = 24

/**
 * The only thing asked of anyone joining: a name to show in the room.
 *
 * No account, no email, no verification — the room code is the credential. The
 * name is remembered per room so a reload does not create a second member.
 */
export default function JoinDialog({
  roomTitle,
  onJoin,
  pending = false,
  error = null,
}: JoinDialogProps) {
  const [name, setName] = useState('')
  const trimmed = name.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (trimmed !== '') onJoin(trimmed)
        }}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900"
        aria-label="Join room"
      >
        <h2 className="text-lg font-semibold">
          {roomTitle === null ? 'Join this room' : `Join “${roomTitle}”`}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Pick a name the others will recognise. Nothing else is asked of you.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Your name"
          className="mt-4 w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-2 outline-none focus:border-indigo-500 dark:border-zinc-800"
        />
        {error !== null && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={trimmed === '' || pending}
          className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-2.5 font-medium text-white enabled:hover:bg-indigo-500 disabled:opacity-40"
        >
          {pending ? 'Joining…' : 'Join'}
        </button>
      </form>
    </div>
  )
}
