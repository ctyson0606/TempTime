import type { RoomMeta } from './room'

/**
 * Stand-in for the rooms API while there is no database.
 *
 * Everything here is browser-local: a room created in one browser does not exist
 * in another, and nothing is validated the way the server will validate it. It
 * exists so the UI can be built and clicked through ahead of `POST /api/rooms`
 * and `GET /api/rooms/:code` (PLAN.md section 6), and it is deleted the moment
 * those exist.
 *
 * It notifies subscribers on every write, which is what lets components read it
 * through `useSyncExternalStore` instead of copying it into state. The real
 * client gets the same shape of signal from Realtime.
 *
 * Deliberately not a general-purpose store: no listing, no expiry sweep, no
 * participants. Anything more would be a second implementation of the backend.
 */
const ROOM_KEY = (code: string) => `temptime:demo-room:${code}`
const OWNER_KEY = (code: string) => `temptime:owner:${code}`
const NAME_KEY = (code: string) => `temptime:name:${code}`
const MASK_KEY = (code: string) => `temptime:mask:${code}`

const listeners = new Set<() => void>()
const rooms = new Map<string, RoomMeta | null>()

function changed(): void {
  rooms.clear()
  for (const listener of listeners) listener()
}

export function subscribeDemoStore(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Parsed rooms are cached because `useSyncExternalStore` compares snapshots by
 * identity — parsing the JSON afresh on every read would hand React a new object
 * each render and never settle. The cache is dropped on any write.
 */
export function snapshotDemoRoom(code: string): RoomMeta | null {
  if (!rooms.has(code)) rooms.set(code, readRoom(code))
  return rooms.get(code) ?? null
}

function readRoom(code: string): RoomMeta | null {
  const raw = localStorage.getItem(ROOM_KEY(code))
  if (raw === null) return null
  try {
    return JSON.parse(raw) as RoomMeta
  } catch {
    // A hand-edited or half-written entry reads as "no such room", which is what
    // the real API will report for it too.
    return null
  }
}

export function saveDemoRoom(room: RoomMeta): void {
  localStorage.setItem(ROOM_KEY(room.code), JSON.stringify(room))
  changed()
}

export function deleteDemoRoom(code: string): void {
  localStorage.removeItem(ROOM_KEY(code))
  localStorage.removeItem(OWNER_KEY(code))
  localStorage.removeItem(NAME_KEY(code))
  localStorage.removeItem(MASK_KEY(code))
  changed()
}

/**
 * Stands in for `POST /api/rooms/:code/submit`. Note what is stored: the 0/1
 * mask and nothing else, exactly what will go over the wire — no titles, no
 * original event boundaries.
 */
export function rememberMask(code: string, mask: string): void {
  localStorage.setItem(MASK_KEY(code), mask)
  changed()
}

export function recallMask(code: string): string | null {
  return localStorage.getItem(MASK_KEY(code))
}

/** Owner secrets are 32 random bytes, base64url — see `lib/ownerSecret.ts`. */
export function newDemoOwnerSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function rememberOwnerSecret(code: string, secret: string): void {
  localStorage.setItem(OWNER_KEY(code), secret)
  changed()
}

export function recallOwnerSecret(code: string): string | null {
  return localStorage.getItem(OWNER_KEY(code))
}

export function rememberDisplayName(code: string, name: string): void {
  localStorage.setItem(NAME_KEY(code), name)
  changed()
}

export function recallDisplayName(code: string): string | null {
  return localStorage.getItem(NAME_KEY(code))
}
