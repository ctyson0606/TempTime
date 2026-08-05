'use client'

/**
 * What this browser remembers about a room it has been in.
 *
 * Everything here is per-room and local by design. The token identifies a member
 * to the API, the owner secret is the one credential that can destroy a room
 * (PLAN.md section 2.4), and neither is recoverable from the server — losing
 * this storage means rejoining as a new member, which is the accepted trade for
 * having no accounts at all.
 *
 * Notifies subscribers on every write so components can read it through
 * `useSyncExternalStore`. Every value is a string or null, so a snapshot is
 * always a primitive and React's identity comparison settles.
 */

type Kind = 'token' | 'participant' | 'owner' | 'name' | 'free'

/**
 * Drafts written before the grid meant free time. A mask stored under the old
 * key holds busy time, so reading it as a draft now would show every free hour
 * as taken and every taken hour as free — silently, and only for people who had
 * a draft in flight. The key changed rather than migrating the value: a draft is
 * cheap to lose and impossible to verify.
 */
const LEGACY_DRAFT: string = 'draft'

const key = (kind: Kind, code: string) => `temptime:${kind}:${code}`

const listeners = new Set<() => void>()

function changed(): void {
  for (const listener of listeners) listener()
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function read(kind: Kind, code: string): string | null {
  return localStorage.getItem(key(kind, code))
}

export const readToken = (code: string) => read('token', code)
export const readParticipantId = (code: string) => read('participant', code)
export const readOwnerSecret = (code: string) => read('owner', code)
export const readDisplayName = (code: string) => read('name', code)

/**
 * The free-time mask being painted, before it is submitted.
 *
 * Kept separate from the submitted one because they are different things: this
 * is a draft that survives a reload, and `POST /submit` is the moment it becomes
 * something other people's results depend on. Stored the way the grid reads it —
 * `'1'` means free — and inverted only on the way to the API.
 */
export const readDraftMask = (code: string) => read('free', code)

export function saveMembership(
  code: string,
  membership: { token: string; participantId: string; displayName: string },
): void {
  localStorage.setItem(key('token', code), membership.token)
  localStorage.setItem(key('participant', code), membership.participantId)
  localStorage.setItem(key('name', code), membership.displayName)
  changed()
}

export function saveOwnerSecret(code: string, secret: string): void {
  localStorage.setItem(key('owner', code), secret)
  changed()
}

export function saveDraftMask(code: string, mask: string): void {
  localStorage.setItem(key('free', code), mask)
  changed()
}

/**
 * Drop everything about a room this browser can no longer use — it was deleted,
 * or it expired. Leaving a token for a room that is gone means every later
 * request carries a credential that can only fail.
 */
export function forgetRoom(code: string): void {
  for (const kind of ['token', 'participant', 'owner', 'name', 'free'] as const) {
    localStorage.removeItem(key(kind, code))
  }
  // Swept here as well, so a browser that held a pre-flip draft does not carry
  // it around for the three months a room can live.
  localStorage.removeItem(`temptime:${LEGACY_DRAFT}:${code}`)
  changed()
}
