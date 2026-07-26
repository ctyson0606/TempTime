'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { DateTime } from 'luxon'
import { useBrowserValue } from '@/lib/browser'
import { formatMinuteOfDay } from '@/lib/room'
import { emptyMask, isValidMask } from '@/lib/slots'
import {
  deleteDemoRoom,
  recallDisplayName,
  recallMask,
  recallOwnerSecret,
  rememberDisplayName,
  rememberMask,
  rememberOwnerSecret,
  snapshotDemoRoom,
  subscribeDemoStore,
} from '@/lib/demoRoom'
import BusyInput from './BusyInput'
import CopyButton from './CopyButton'
import ExpiryBadge from './ExpiryBadge'
import JoinDialog from './JoinDialog'
import QrDialog from './QrDialog'
import RoomAdminBar from './RoomAdminBar'
import SlotGrid, { GRID_CARD_WIDTH, GRID_SIZES, type GridSize } from './SlotGrid'

/** Every section but the grid keeps to a comfortable reading width. */
const COLUMN = 'mx-auto w-full max-w-2xl'

/**
 * The room page.
 *
 * Reads the room from the browser-local stand-in store, so nothing here talks to
 * a server yet. The states it can be in — found, never existed, expired, just
 * deleted — are the four the API will report (200 / 404 / 410), which is why they
 * are modelled now rather than bolted on alongside the fetch.
 */
export default function RoomView({ code }: { code: string }) {
  const origin = useBrowserValue(() => window.location.origin)
  const room = useSyncExternalStore(
    subscribeDemoStore,
    () => snapshotDemoRoom(code),
    () => null,
  )
  const displayName = useSyncExternalStore(
    subscribeDemoStore,
    () => recallDisplayName(code),
    () => null,
  )
  const ownerSecret = useSyncExternalStore(
    subscribeDemoStore,
    () => recallOwnerSecret(code),
    () => null,
  )
  const storedMask = useSyncExternalStore(
    subscribeDemoStore,
    () => recallMask(code),
    () => null,
  )
  const [deleted, setDeleted] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [gridSize, setGridSize] = useState<GridSize>('medium')

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get('owner')
    if (fromLink === null) return
    rememberOwnerSecret(code, fromLink)
    // Drop the secret from the address bar once it is stored. The creator still
    // has it from the admin bar's copy button, and it keeps the one credential
    // that can destroy the room out of screenshots and browser history.
    window.history.replaceState(null, '', `/r/${code}`)
  }, [code])

  if (deleted) {
    return (
      <Notice
        title="Room deleted"
        body="You deleted this room. Every member's submitted times went with it."
      />
    )
  }

  // `origin` is null only for the server-rendered pass, during which the store
  // reports no room. Waiting for it keeps that pass from flashing "no such room".
  if (origin === null) {
    return (
      <div
        className={`${COLUMN} h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900`}
      />
    )
  }

  if (room === null) {
    return (
      <Notice
        title="No such room"
        body={`Nothing is stored under ${code}. It may have been deleted by its creator, or the code may be mistyped.`}
      />
    )
  }

  if (DateTime.fromISO(room.expiresAt) <= DateTime.utc()) {
    return (
      <Notice
        title="Room expired"
        body="Every day this room covered has passed, so it is being cleaned up. Create a new room to plan the next one."
      />
    )
  }

  const roomUrl = `${origin}/r/${room.code}`
  // A stored mask that no longer fits the grid is treated as no mask at all,
  // rather than crashing the page it was painted on.
  const mask =
    storedMask !== null && isValidMask(room, storedMask) ? storedMask : emptyMask(room)

  return (
    <div className="flex flex-col gap-6">
      <header className={`${COLUMN} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {room.title ?? 'Untitled room'}
          </h1>
          <span className="font-mono text-lg tracking-[0.2em] text-zinc-500">
            {room.code}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={roomUrl} label="Copy link" />
          <button
            type="button"
            onClick={() => setShowQr(true)}
            className="rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Show QR
          </button>
        </div>
        <ExpiryBadge expiresAt={room.expiresAt} timezone={room.timezone} />
      </header>

      <section
        className={`${GRID_CARD_WIDTH} rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800`}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">
            {room.dates.length} {room.dates.length === 1 ? 'day' : 'days'},{' '}
            {formatMinuteOfDay(room.dayStartMin)}–{formatMinuteOfDay(room.dayEndMin)}
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">{room.timezone}</span>
            <GridSizePicker size={gridSize} onChange={setGridSize} />
          </div>
        </div>
        {displayName === null ? (
          // Marking busy time belongs to a member, and the join dialog is
          // covering the page until there is one.
          <SlotGrid room={room} size={gridSize} />
        ) : (
          <BusyInput
            room={room}
            code={room.code}
            mask={mask}
            onChange={(next) => rememberMask(room.code, next)}
            size={gridSize}
          />
        )}
      </section>

      <section
        className={`${COLUMN} rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800`}
      >
        <h2 className="text-sm font-medium">In this room</h2>
        <p className="mt-2 text-sm text-zinc-500">
          {displayName === null ? 'Just you.' : `${displayName} — you`}
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Other members appear once the room lives on a server rather than in this
          browser.
        </p>
      </section>

      <section
        className={`${COLUMN} rounded-2xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700`}
      >
        <h2 className="font-medium text-zinc-700 dark:text-zinc-300">Still to come</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Submitting to the room. What you mark is kept in this browser for now; when
            it is submitted, only the string of 0s and 1s is sent.
          </li>
          <li>The heatmap of everyone&apos;s answers, and the best times to meet.</li>
          <li>Connecting Google Calendar, Todoist and TickTick directly.</li>
        </ul>
      </section>

      {ownerSecret !== null && (
        <div className={COLUMN}>
          <RoomAdminBar
            adminUrl={`${roomUrl}?owner=${ownerSecret}`}
            onDelete={() => {
              deleteDemoRoom(room.code)
              setDeleted(true)
            }}
          />
        </div>
      )}

      {displayName === null && (
        <JoinDialog
          roomTitle={room.title}
          onJoin={(name) => rememberDisplayName(room.code, name)}
        />
      )}

      {showQr && <QrDialog url={roomUrl} onClose={() => setShowQr(false)} />}
    </div>
  )
}

/**
 * Three fixed steps rather than a zoom slider: the useful sizes are "all seven
 * days at a glance", "readable on a phone", and "one screen, whole week legible".
 */
function GridSizePicker({
  size,
  onChange,
}: {
  size: GridSize
  onChange: (size: GridSize) => void
}) {
  return (
    <div
      role="group"
      aria-label="Grid size"
      className="flex overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
    >
      {GRID_SIZES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={size === option}
          className={[
            'px-2 py-1 text-xs capitalize transition-colors',
            size === option
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800',
          ].join(' ')}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div
      className={`${COLUMN} rounded-2xl border border-zinc-200 p-6 text-center dark:border-zinc-800`}
    >
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-500">{body}</p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Create a room
      </Link>
    </div>
  )
}
