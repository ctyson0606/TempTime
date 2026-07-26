import Link from 'next/link'
import RoomView from '@/components/RoomView'
import { normalizeRoomCode } from '@/lib/roomCode'

/**
 * Codes are normalised before anything else looks at them, so a link with
 * lowercase or stray punctuation lands in the same room as the printed code.
 */
export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10">
      <Link
        href="/"
        className="mx-auto mb-6 block w-full max-w-2xl text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        ← TempTime
      </Link>
      <RoomView code={normalizeRoomCode(decodeURIComponent(code))} />
    </main>
  )
}
