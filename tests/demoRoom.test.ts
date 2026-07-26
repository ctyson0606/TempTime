import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomMeta } from '../lib/room'
import {
  deleteDemoRoom,
  newDemoOwnerSecret,
  recallDisplayName,
  recallOwnerSecret,
  rememberDisplayName,
  rememberOwnerSecret,
  saveDemoRoom,
  snapshotDemoRoom,
  subscribeDemoStore,
} from '../lib/demoRoom'

/**
 * Enough of the Storage interface for this module, so the store can be tested
 * without pulling in a DOM implementation.
 */
function installLocalStorage(): Map<string, string> {
  const entries = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
    },
  })
  return entries
}

const room: RoomMeta = {
  code: 'X7B92M',
  title: 'Weekend dinner',
  timezone: 'Asia/Taipei',
  dates: ['2026-07-26', '2026-07-27', '2026-08-15'],
  dayStartMin: 480,
  dayEndMin: 1440,
  slotMinutes: 30,
  expiresAt: '2026-08-16T16:00:00.000Z',
}

let entries: Map<string, string>

beforeEach(() => {
  entries = installLocalStorage()
  deleteDemoRoom(room.code)
})

describe('the demo room store', () => {
  it('returns null for a room that was never created', () => {
    expect(snapshotDemoRoom('QQQQQQ')).toBeNull()
  })

  it('round-trips a room', () => {
    saveDemoRoom(room)
    expect(snapshotDemoRoom(room.code)).toEqual(room)
  })

  it('hands back the same object so React can compare snapshots', () => {
    saveDemoRoom(room)
    expect(snapshotDemoRoom(room.code)).toBe(snapshotDemoRoom(room.code))
  })

  it('stops caching a room once it is overwritten', () => {
    saveDemoRoom(room)
    saveDemoRoom({ ...room, title: 'Renamed' })
    expect(snapshotDemoRoom(room.code)?.title).toBe('Renamed')
  })

  it('notifies subscribers on every write, and stops after unsubscribing', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeDemoStore(listener)

    saveDemoRoom(room)
    rememberDisplayName(room.code, 'Chen')
    rememberOwnerSecret(room.code, 'secret')
    expect(listener).toHaveBeenCalledTimes(3)

    unsubscribe()
    deleteDemoRoom(room.code)
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('deleting takes the name and owner secret with the room', () => {
    saveDemoRoom(room)
    rememberDisplayName(room.code, 'Chen')
    rememberOwnerSecret(room.code, 'secret')

    deleteDemoRoom(room.code)

    expect(snapshotDemoRoom(room.code)).toBeNull()
    expect(recallDisplayName(room.code)).toBeNull()
    expect(recallOwnerSecret(room.code)).toBeNull()
    expect(entries.size).toBe(0)
  })

  it('reads a corrupted entry as no room rather than throwing', () => {
    saveDemoRoom(room)
    entries.set(`temptime:demo-room:${room.code}`, '{ not json')
    // The cache still holds the good parse; a write is what re-reads it.
    saveDemoRoom({ ...room, code: 'OTHER1' })
    expect(snapshotDemoRoom(room.code)).toBeNull()
  })
})

describe('newDemoOwnerSecret', () => {
  it('is base64url, so it survives the admin link query string', () => {
    for (let i = 0; i < 50; i++) {
      expect(newDemoOwnerSecret()).toMatch(/^[A-Za-z0-9_-]{43}$/)
    }
  })

  it('does not repeat', () => {
    const secrets = new Set(Array.from({ length: 200 }, newDemoOwnerSecret))
    expect(secrets.size).toBe(200)
  })
})
