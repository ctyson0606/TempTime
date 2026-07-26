'use client'

import type { RoomMeta } from './room'

/**
 * The browser's side of the rooms API (PLAN.md section 6).
 *
 * Every call returns a result rather than throwing: a 404, a 410 and a rejected
 * name are all ordinary things for a user to run into, and each needs different
 * words on screen. Only a network failure is exceptional, and it is folded into
 * the same shape so callers have one branch to write.
 */

export interface ApiFailure {
  status: number
  code: string
  error: string
}

export type ApiResult<T> = { ok: true; data: T } | ({ ok: false } & ApiFailure)

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    // Offline, DNS, a dropped connection: no status to report, so one is
    // invented that no route returns.
    return {
      ok: false,
      status: 0,
      code: 'NETWORK',
      error: 'Could not reach the server.',
    }
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const failure = body as { error?: string; code?: string } | null
    return {
      ok: false,
      status: response.status,
      code: failure?.code ?? 'SERVER_ERROR',
      error: failure?.error ?? 'Something went wrong.',
    }
  }

  return { ok: true, data: body as T }
}

export interface CreatedRoom {
  code: string
  /** Returned exactly once. Nothing can hand it back afterwards. */
  ownerSecret: string
  expiresAt: string
}

export interface RoomDetail extends RoomMeta {
  id: string
  slotsPerDay: number
  totalSlots: number
}

export interface Membership {
  participantId: string
  token: string
  expiresAt: string
}

export function createRoom(input: {
  title: string | null
  timezone: string
  dates: string[]
  dayStartMin: number
  dayEndMin: number
}): Promise<ApiResult<CreatedRoom>> {
  return request<CreatedRoom>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function fetchRoom(code: string): Promise<ApiResult<RoomDetail>> {
  return request<RoomDetail>(`/api/rooms/${encodeURIComponent(code)}`)
}

/**
 * `participantId` is this browser's own from a previous visit. The server checks
 * it belongs to this room before reusing it, so a stale one from elsewhere just
 * produces a new member rather than an error.
 */
export function joinRoom(
  code: string,
  displayName: string,
  participantId?: string | null,
): Promise<ApiResult<Membership>> {
  return request<Membership>(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    body: JSON.stringify(
      participantId ? { displayName, participantId } : { displayName },
    ),
  })
}

export interface MySubmission {
  /** `null` until this member has submitted anything. */
  busyMask: string | null
  sources: string[]
  updatedAt: string | null
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

/**
 * Send the mask. Note what crosses the wire: a string of 0s and 1s and the
 * names of the sources it came from — no event titles, no times, nothing that
 * says which calendar it was read from.
 */
export function submitMask(
  code: string,
  token: string,
  busyMask: string,
  sources: string[],
): Promise<ApiResult<{ ok: true; updatedAt: string }>> {
  return request(`/api/rooms/${encodeURIComponent(code)}/submit`, {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify({ busyMask, sources }),
  })
}

export function withdrawSubmission(
  code: string,
  token: string,
): Promise<ApiResult<{ ok: true }>> {
  return request(`/api/rooms/${encodeURIComponent(code)}/submit`, {
    method: 'DELETE',
    headers: bearer(token),
  })
}

export function fetchMySubmission(
  code: string,
  token: string,
): Promise<ApiResult<MySubmission>> {
  return request<MySubmission>(`/api/rooms/${encodeURIComponent(code)}/my-submission`, {
    headers: bearer(token),
  })
}

export function deleteRoom(
  code: string,
  ownerSecret: string,
): Promise<ApiResult<{ ok: true }>> {
  return request<{ ok: true }>(`/api/rooms/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: { 'x-owner-secret': ownerSecret },
  })
}
