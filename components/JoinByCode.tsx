'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ROOM_CODE_LENGTH, isValidRoomCode, normalizeRoomCode } from '@/lib/roomCode'

/**
 * Entry by typed code, for someone who was read the code rather than sent the
 * link. Normalising here means "x7b-92 m" gets to the same room as "X7B92M".
 */
export default function JoinByCode() {
  const router = useRouter()
  const [input, setInput] = useState('')
  const code = normalizeRoomCode(input)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (isValidRoomCode(code)) router.push(`/r/${code}`)
      }}
      className="flex items-center gap-2"
    >
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Room code"
        maxLength={ROOM_CODE_LENGTH + 4}
        aria-label="Room code"
        className="w-32 rounded-xl border border-zinc-200 bg-transparent px-3 py-2 font-mono text-sm uppercase tracking-widest outline-none focus:border-indigo-500 dark:border-zinc-800"
      />
      <button
        type="submit"
        disabled={!isValidRoomCode(code)}
        className="rounded-xl px-3 py-2 text-sm font-medium text-indigo-600 enabled:hover:bg-indigo-50 disabled:opacity-40 dark:text-indigo-400 dark:enabled:hover:bg-indigo-950"
      >
        Join
      </button>
    </form>
  )
}
