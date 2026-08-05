'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useBrowserValue } from '@/lib/browser'
import { formatMinuteOfDay } from '@/lib/room'
import {
  type Heatmap as HeatmapData,
  type RoomDetail,
  deleteRoom,
  fetchHeatmap,
  fetchMySubmission,
  fetchRoom,
  joinRoom,
  submitMask,
  withdrawSubmission,
} from '@/lib/roomClient'
import {
  forgetRoom,
  readDisplayName,
  readDraftMask,
  readOwnerSecret,
  readParticipantId,
  readToken,
  saveDraftMask,
  saveMembership,
  saveOwnerSecret,
  subscribeSession,
} from '@/lib/roomSession'
import { type RealtimeMode, watchRoom } from '@/lib/realtime'
import { loadImport } from '@/lib/importCache'
import { type RoomGrid, blocksToMask, emptyMask, isValidMask } from '@/lib/slots'
import BestSlots from './BestSlots'
import BusyInput from './BusyInput'
import CopyButton from './CopyButton'
import ExpiryBadge from './ExpiryBadge'
import Heatmap from './Heatmap'
import JoinDialog from './JoinDialog'
import MemberList from './MemberList'
import QrDialog from './QrDialog'
import RoomAdminBar from './RoomAdminBar'
import SlotGrid, { GRID_CARD_WIDTH, GRID_SIZES, type GridSize } from './SlotGrid'

/** Every section but the grid keeps to a comfortable reading width. */
const COLUMN = 'mx-auto w-full max-w-2xl'

/**
 * What the page knows about the room.
 *
 * Four ways for a room not to be here, and they are not interchangeable.
 * `expired` ran its course, `destroyed` was deleted by its creator while this
 * browser was a member, `deleted` is that same event seen by the creator who did
 * it, and `missing` is a code nothing was ever stored under. Telling someone the
 * wrong one sends them hunting for a typo that is not there, or waiting for a
 * room that will never come back.
 */
type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; room: RoomDetail }
  | { kind: 'missing' }
  | { kind: 'expired' }
  | { kind: 'destroyed' }
  | { kind: 'deleted' }
  | { kind: 'error'; message: string }

/**
 * A malformed code is shown as "no such room" rather than "that is not a code".
 * Both mean the same thing to someone who mistyped it, and the distinction only
 * tells a script whether its guess had the right shape.
 *
 * `wasMember` is what separates a deleted room from a mistyped code, and it has
 * to come from this side: the API answers both with 404 on purpose, since
 * "there used to be a room here" is not something a stranger with a guessed code
 * should be told. A browser that holds a membership for this code was in the
 * room while it existed, so for that browser the 404 means it is gone.
 */
function statusFromFailure(
  failure: { code: string; error: string },
  wasMember: boolean,
): Status {
  if (failure.code === 'ROOM_EXPIRED') return { kind: 'expired' }
  if (failure.code === 'ROOM_NOT_FOUND' || failure.code === 'INVALID_CODE') {
    return wasMember ? { kind: 'destroyed' } : { kind: 'missing' }
  }
  return { kind: 'error', message: failure.error }
}

/**
 * Which sources this mask came from, worked out rather than tracked.
 *
 * `sources` is descriptive metadata — it does not affect a single slot — so
 * reconstructing it here is cheaper than threading it up through the painter
 * and the checklist. Anything the ticked imports account for is `ics`; anything
 * left over was drawn by hand.
 */
function deriveSources(room: RoomGrid, code: string, mask: string): string[] {
  const cached = loadImport(code)
  const ticked = (cached?.blocks ?? []).filter((block) =>
    cached?.selected.includes(block.id),
  )
  const fromIcs = ticked.length > 0 ? blocksToMask(room, ticked) : null

  const sources: string[] = []
  if (fromIcs !== null && fromIcs.includes('1')) sources.push('ics')
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === '1' && fromIcs?.[i] !== '1') {
      sources.push('manual')
      break
    }
  }
  return sources
}

/**
 * The room page.
 *
 * The room itself comes from `GET /api/rooms/:code`, so it is the same room in
 * every browser. What stays local is only this browser's own membership — the
 * token, the name, the owner secret if it has one — none of which the server
 * will hand back (PLAN.md sections 2.3 and 2.4).
 */
export default function RoomView({ code }: { code: string }) {
  const origin = useBrowserValue(() => window.location.origin)
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  const [showQr, setShowQr] = useState(false)
  const [gridSize, setGridSize] = useState<GridSize>('medium')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null)
  const [liveMode, setLiveMode] = useState<RealtimeMode>('connecting')

  const token = useSyncExternalStore(
    subscribeSession,
    () => readToken(code),
    () => null,
  )
  const displayName = useSyncExternalStore(
    subscribeSession,
    () => readDisplayName(code),
    () => null,
  )
  const ownerSecret = useSyncExternalStore(
    subscribeSession,
    () => readOwnerSecret(code),
    () => null,
  )
  const draftMask = useSyncExternalStore(
    subscribeSession,
    () => readDraftMask(code),
    () => null,
  )
  const participantId = useSyncExternalStore(
    subscribeSession,
    () => readParticipantId(code),
    () => null,
  )

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get('owner')
    if (fromLink === null) return
    saveOwnerSecret(code, fromLink)
    // Drop the secret from the address bar once it is stored. The creator still
    // has it from the admin bar's copy button, and it keeps the one credential
    // that can destroy the room out of screenshots and browser history.
    window.history.replaceState(null, '', `/r/${code}`)
  }, [code])

  useEffect(() => {
    // Guarded rather than fire-and-forget: a reply that arrives after this page
    // has moved on would otherwise overwrite whatever replaced it.
    let cancelled = false

    fetchRoom(code).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setStatus({ kind: 'ready', room: result.data })
        return
      }
      // Read before forgetting: the membership is the only evidence this
      // browser has that the room behind a 404 ever existed.
      const wasMember = readParticipantId(code) !== null
      // A room this browser can no longer use should not leave a token behind:
      // every later request would carry a credential that can only fail.
      if (result.code === 'ROOM_NOT_FOUND' || result.code === 'ROOM_EXPIRED') {
        forgetRoom(code)
      }
      setStatus(statusFromFailure(result, wasMember))
    })

    return () => {
      cancelled = true
    }
  }, [code])

  useEffect(() => {
    if (token === null) return
    let cancelled = false

    fetchMySubmission(code, token).then((result) => {
      if (cancelled || !result.ok) return
      setSubmittedAt(result.data.updatedAt)
      // Seed the grid from what was sent, but never over a local draft: an
      // unsent edit is the more recent intention of the two.
      if (result.data.busyMask !== null && readDraftMask(code) === null) {
        saveDraftMask(code, result.data.busyMask)
      }
    })

    return () => {
      cancelled = true
    }
  }, [code, token])

  useEffect(() => {
    if (token === null) return
    let cancelled = false

    fetchHeatmap(code, token).then((result) => {
      if (cancelled || !result.ok) return
      setHeatmap(result.data)
    })

    return () => {
      cancelled = true
    }
  }, [code, token])

  // Realtime needs the room's id, which only exists once the room has loaded.
  const roomId = status.kind === 'ready' ? status.room.id : null

  useEffect(() => {
    if (token === null || roomId === null) return
    let cancelled = false

    const stop = watchRoom({
      roomId,
      token,
      onMode: (next) => {
        if (!cancelled) setLiveMode(next)
      },
      // Deliberately re-reads everything rather than applying the pushed row.
      // What arrives is "somebody did something"; the answers themselves have
      // one route into this browser and it is the heatmap endpoint.
      onChange: () => {
        fetchHeatmap(code, token).then((result) => {
          if (cancelled || !result.ok) return
          setHeatmap(result.data)
        })
      },
    })

    return () => {
      cancelled = true
      stop()
    }
  }, [code, roomId, token])

  /**
   * Read the overlay again after this browser changes its own answer.
   *
   * Someone else's answer does not arrive on its own yet — that is what
   * `lib/realtime.ts` is for — so until then the results are current as of the
   * last thing *you* did. A failure leaves the previous overlay on screen rather
   * than blanking it: being one refresh behind is not worth an error banner.
   */
  const refreshHeatmap = async () => {
    if (token === null) return
    const result = await fetchHeatmap(code, token)
    if (result.ok) setHeatmap(result.data)
  }

  const send = async (room: RoomDetail, mask: string) => {
    if (token === null) return
    setSubmitting(true)
    const result = await submitMask(code, token, mask, deriveSources(room, code, mask))
    setSubmitting(false)

    if (!result.ok) {
      setSubmitError(result.error)
      return
    }
    setSubmitError(null)
    setSubmittedAt(result.data.updatedAt)
    void refreshHeatmap()
  }

  const withdraw = async () => {
    if (token === null) return
    setSubmitting(true)
    const result = await withdrawSubmission(code, token)
    setSubmitting(false)

    if (!result.ok) {
      setSubmitError(result.error)
      return
    }
    setSubmitError(null)
    setSubmittedAt(null)
    void refreshHeatmap()
  }

  const join = async (name: string) => {
    setJoining(true)
    const result = await joinRoom(code, name, readParticipantId(code))
    setJoining(false)

    if (!result.ok) {
      // The room can go away between loading the page and typing a name. This
      // page loaded it a moment ago, so a 404 now is a room that has just been
      // deleted rather than a code that was never right.
      if (result.code === 'ROOM_NOT_FOUND' || result.code === 'ROOM_EXPIRED') {
        forgetRoom(code)
        setStatus(statusFromFailure(result, true))
      } else {
        setJoinError(result.error)
      }
      return
    }

    setJoinError(null)
    saveMembership(code, {
      token: result.data.token,
      participantId: result.data.participantId,
      displayName: name,
    })
  }

  const destroy = async () => {
    if (ownerSecret === null) return
    const result = await deleteRoom(code, ownerSecret)
    if (!result.ok && result.code !== 'ROOM_NOT_FOUND') {
      setStatus({ kind: 'error', message: result.error })
      return
    }
    forgetRoom(code)
    setStatus({ kind: 'deleted' })
  }

  if (status.kind === 'loading' || origin === null) {
    return (
      <div
        className={`${COLUMN} h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900`}
      />
    )
  }

  if (status.kind === 'deleted') {
    return (
      <Notice
        title="Room deleted"
        body="You deleted this room. Every member's submitted times went with it."
      />
    )
  }

  // Deliberately different words from "Room expired" below. Both mean the room
  // is not coming back, but only one of them is somebody's decision, and someone
  // who was told the wrong one will either wait for a room that ended or go
  // asking why a room they were using vanished.
  if (status.kind === 'destroyed') {
    return (
      <Notice
        title="Room deleted by its creator"
        body={`Room ${code} was deleted by whoever created it. Everyone's times went with it, and nothing can bring them back.`}
      />
    )
  }

  if (status.kind === 'missing') {
    return (
      <Notice
        title="No such room"
        body={`Nothing is stored under ${code}. Check the code, or ask whoever set it up for the link again.`}
      />
    )
  }

  if (status.kind === 'expired') {
    return (
      <Notice
        title="Room expired"
        body="Every day this room covered has passed, so it has been cleaned up. Nobody deleted it — rooms go on their own once the last date is over. Create a new room to plan the next one."
      />
    )
  }

  if (status.kind === 'error') {
    return (
      <Notice
        title="Could not load this room"
        body={`${status.message} It may be worth trying again in a moment.`}
      />
    )
  }

  const { room } = status
  const roomUrl = `${origin}/r/${room.code}`
  // A draft painted against a different grid is treated as no draft at all,
  // rather than crashing the page it is being drawn on.
  const mask =
    draftMask !== null && isValidMask(room, draftMask) ? draftMask : emptyMask(room)

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
            onChange={(next) => saveDraftMask(room.code, next)}
            size={gridSize}
          />
        )}
      </section>

      {displayName !== null && (
        <section
          className={`${COLUMN} rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">
                {submittedAt === null ? 'Not sent yet' : 'Sent'}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                {submittedAt === null
                  ? 'Only the string of 0s and 1s is sent — never an event name.'
                  : `Last sent ${new Date(submittedAt).toLocaleString()}. Send again any time to change it.`}
              </p>
            </div>
            <div className="flex gap-2">
              {submittedAt !== null && (
                <button
                  type="button"
                  onClick={() => void withdraw()}
                  disabled={submitting}
                  className="rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium enabled:hover:bg-zinc-200 disabled:opacity-40 dark:bg-zinc-800 dark:enabled:hover:bg-zinc-700"
                >
                  Withdraw
                </button>
              )}
              <button
                type="button"
                onClick={() => void send(room, mask)}
                disabled={submitting}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white enabled:hover:bg-indigo-500 disabled:opacity-40"
              >
                {submitting
                  ? 'Sending…'
                  : submittedAt === null
                    ? 'Send my times'
                    : 'Send again'}
              </button>
            </div>
          </div>
          {submitError !== null && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {submitError}
            </p>
          )}
        </section>
      )}

      {heatmap !== null && (
        <>
          <section
            className={`${GRID_CARD_WIDTH} rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800`}
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium">When everyone is free</h2>
              <LiveBadge mode={liveMode} />
            </div>
            <Heatmap
              room={room}
              freeCounts={heatmap.freeCounts}
              submittedCount={heatmap.submittedCount}
              size={gridSize}
            />
          </section>

          <section
            className={`${COLUMN} rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800`}
          >
            <h2 className="mb-3 text-sm font-medium">Best times to meet</h2>
            <BestSlots
              room={room}
              slots={heatmap.bestSlots}
              submittedCount={heatmap.submittedCount}
            />
          </section>
        </>
      )}

      <section
        className={`${COLUMN} rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800`}
      >
        <h2 className="text-sm font-medium">In this room</h2>
        {heatmap === null ? (
          <p className="mt-2 text-sm text-zinc-500">
            {displayName === null ? 'Just you.' : `${displayName} — you`}
          </p>
        ) : (
          <MemberList members={heatmap.participants} youId={participantId} />
        )}
      </section>

      <section
        className={`${COLUMN} rounded-2xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700`}
      >
        <h2 className="font-medium text-zinc-700 dark:text-zinc-300">Still to come</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Connecting Google Calendar, Todoist and TickTick directly.</li>
        </ul>
      </section>

      {ownerSecret !== null && (
        <div className={COLUMN}>
          <RoomAdminBar
            adminUrl={`${roomUrl}?owner=${ownerSecret}`}
            onDelete={() => void destroy()}
          />
        </div>
      )}

      {displayName === null && (
        <JoinDialog
          roomTitle={room.title}
          pending={joining}
          error={joinError}
          onJoin={(name) => void join(name)}
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
            // `min-h-9` up to `sm` only: 24px is a fine target for a mouse and
            // a poor one for a thumb, and the phone pass measured exactly that.
            'inline-flex min-h-9 items-center px-2 py-1 text-xs capitalize transition-colors sm:min-h-0',
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

/**
 * Which transport the results are arriving on.
 *
 * Worth saying out loud rather than hiding: on the fallback an answer can be
 * four seconds stale, and someone staring at a room waiting for a friend should
 * be able to tell "nothing has happened" from "this page is a bit behind".
 */
function LiveBadge({ mode }: { mode: RealtimeMode }) {
  const label = {
    connecting: 'Connecting…',
    live: 'Updating live',
    polling: 'Checking every few seconds',
  }[mode]

  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-500">
      <span
        aria-hidden
        className={[
          'h-1.5 w-1.5 rounded-full',
          mode === 'live'
            ? 'bg-emerald-500'
            : mode === 'polling'
              ? 'bg-amber-500'
              : 'bg-zinc-300 dark:bg-zinc-600',
        ].join(' ')}
      />
      {label}
    </span>
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
