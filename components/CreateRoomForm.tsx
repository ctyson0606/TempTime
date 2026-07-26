'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useBrowserValue } from '@/lib/browser'
import { MAX_ROOM_DAYS, validateDates } from '@/lib/dates'
import {
  DEFAULT_DAY_END_MIN,
  DEFAULT_DAY_START_MIN,
  DEFAULT_SLOT_MINUTES,
  type RoomMeta,
  formatMinuteOfDay,
} from '@/lib/room'
import { generateRoomCode } from '@/lib/roomCode'
import { roomExpiresAt } from '@/lib/slots'
import { newDemoOwnerSecret, rememberOwnerSecret, saveDemoRoom } from '@/lib/demoRoom'
import CopyButton from './CopyButton'
import DatePicker from './DatePicker'
import QrDialog from './QrDialog'

interface Created {
  room: RoomMeta
  ownerSecret: string
}

const HOURS = Array.from({ length: 25 }, (_, hour) => hour * 60)

export default function CreateRoomForm() {
  // Both come from the browser: the server's timezone is not the user's, and a
  // calendar hydrated from it would offer the wrong day.
  const timezone = useBrowserValue(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  )
  const origin = useBrowserValue(() => window.location.origin)
  const [title, setTitle] = useState('')
  const [dates, setDates] = useState<string[]>([])
  const [dayStartMin, setDayStartMin] = useState(DEFAULT_DAY_START_MIN)
  const [dayEndMin, setDayEndMin] = useState(DEFAULT_DAY_END_MIN)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Created | null>(null)
  const [showQr, setShowQr] = useState(false)

  if (timezone === null || origin === null) {
    return (
      <div className="h-96 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
    )
  }

  if (created !== null) {
    return (
      <RoomCreated
        created={created}
        origin={origin}
        showQr={showQr}
        onToggleQr={setShowQr}
      />
    )
  }

  const submit = () => {
    const check = validateDates(dates, timezone)
    if (!check.ok) {
      setError(
        check.error === 'EMPTY'
          ? 'Pick at least one day.'
          : `That set of days is not valid: ${check.detail}`,
      )
      return
    }
    if (dayEndMin <= dayStartMin) {
      setError('The end of the day has to come after the start.')
      return
    }
    if ((dayEndMin - dayStartMin) % DEFAULT_SLOT_MINUTES !== 0) {
      setError('The day has to divide evenly into slots.')
      return
    }

    const grid = {
      timezone,
      dates,
      dayStartMin,
      dayEndMin,
      slotMinutes: DEFAULT_SLOT_MINUTES,
    }
    const room: RoomMeta = {
      code: generateRoomCode(),
      title: title.trim() === '' ? null : title.trim(),
      ...grid,
      // Derived here only because there is no server yet; `POST /api/rooms`
      // owns this value once it exists.
      expiresAt: roomExpiresAt(grid).toISO() ?? '',
    }

    const ownerSecret = newDemoOwnerSecret()
    saveDemoRoom(room)
    rememberOwnerSecret(room.code, ownerSecret)
    setError(null)
    setCreated({ room, ownerSecret })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="flex flex-col gap-6"
    >
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Title (optional)</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          placeholder="Weekend dinner"
          className="rounded-xl border border-zinc-200 bg-transparent px-3 py-2 outline-none focus:border-indigo-500 dark:border-zinc-800"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          Days — any {MAX_ROOM_DAYS} within the next 90, and they need not be next to
          each other
        </span>
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <DatePicker timezone={timezone} selected={dates} onChange={setDates} />
        </div>
        {dates.length > 0 && (
          <p className="text-xs text-zinc-500">Selected: {dates.join(', ')}</p>
        )}
      </div>

      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-2">
          <span className="text-sm font-medium">Day starts</span>
          <HourSelect value={dayStartMin} onChange={setDayStartMin} upTo={23 * 60} />
        </label>
        <label className="flex flex-1 flex-col gap-2">
          <span className="text-sm font-medium">Day ends</span>
          <HourSelect value={dayEndMin} onChange={setDayEndMin} from={60} />
        </label>
      </div>

      <p className="text-xs text-zinc-500">
        Times are in {timezone}, the room&apos;s timezone for everyone who joins.
      </p>

      {error !== null && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={dates.length === 0}
        className="rounded-xl bg-indigo-600 px-4 py-3 font-medium text-white enabled:hover:bg-indigo-500 disabled:opacity-40"
      >
        Create room
      </button>
    </form>
  )
}

function HourSelect({
  value,
  onChange,
  from = 0,
  upTo = 24 * 60,
}: {
  value: number
  onChange: (minute: number) => void
  from?: number
  upTo?: number
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="rounded-xl border border-zinc-200 bg-transparent px-3 py-2 outline-none focus:border-indigo-500 dark:border-zinc-800"
    >
      {HOURS.filter((minute) => minute >= from && minute <= upTo).map((minute) => (
        <option key={minute} value={minute}>
          {formatMinuteOfDay(minute)}
        </option>
      ))}
    </select>
  )
}

function RoomCreated({
  created,
  origin,
  showQr,
  onToggleQr,
}: {
  created: Created
  origin: string
  showQr: boolean
  onToggleQr: (open: boolean) => void
}) {
  const { room, ownerSecret } = created
  const roomUrl = `${origin}/r/${room.code}`
  const adminUrl = `${roomUrl}?owner=${ownerSecret}`

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-zinc-200 p-6 text-center dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Room code</p>
        <p className="mt-1 font-mono text-4xl font-semibold tracking-[0.2em]">
          {room.code}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <CopyButton value={roomUrl} label="Copy link" />
          <button
            type="button"
            onClick={() => onToggleQr(true)}
            className="rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Show QR
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
          Save your admin link
        </p>
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
          It is the only proof that you created this room, and the only way to delete it
          early. It is shown once — we cannot show it again.
        </p>
        <p className="mt-3 break-all rounded-lg bg-white/70 p-2 font-mono text-xs dark:bg-black/30">
          {adminUrl}
        </p>
        <div className="mt-3">
          <CopyButton value={adminUrl} label="Copy admin link" />
        </div>
      </div>

      <Link
        href={`/r/${room.code}`}
        className="rounded-xl bg-indigo-600 px-4 py-3 text-center font-medium text-white hover:bg-indigo-500"
      >
        Go to the room
      </Link>

      {showQr && <QrDialog url={roomUrl} onClose={() => onToggleQr(false)} />}
    </div>
  )
}
