'use client'

import { createClient } from '@supabase/supabase-js'
import { supabasePublishableKey, supabaseUrl } from './env'

/**
 * Live updates for a room, with a fallback that does the same job badly.
 *
 * What is pushed is a change to `participants` — someone joined, someone
 * submitted, someone withdrew. The payload is thrown away: it arrives under the
 * subscriber's own RLS policy and could only ever carry a row they are already
 * allowed to read, but treating it as a bare signal means the results still come
 * from `GET /heatmap` and there is exactly one path by which anyone's answers
 * reach a browser (PLAN.md section 5).
 *
 * The fallback is not a nicety. A blocked WebSocket, a proxy that eats upgrades,
 * or a Realtime service that rejects our token all produce the same silence, and
 * silence is indistinguishable from "nothing has happened yet". Polling is
 * slower and correct; going quiet is neither.
 */

export type RealtimeMode = 'connecting' | 'live' | 'polling'

export interface WatchRoomOptions {
  roomId: string
  /** The room token. Realtime validates it independently of PostgREST. */
  token: string
  /** Something in the room changed; re-read whatever depends on it. */
  onChange: () => void
  /** Transport changes, so the UI can say which one it is on. */
  onMode?: (mode: RealtimeMode) => void
}

/** How long to wait for `SUBSCRIBED` before giving up and polling. */
const SUBSCRIBE_TIMEOUT_MS = 5_000

/**
 * Matches the rate limit `/heatmap` was sized against — 15 calls a minute per
 * open tab. Changing this without changing `RATE_LIMITS.heatmap` is how members
 * behind one address start rate-limiting each other.
 */
const POLL_INTERVAL_MS = 4_000

/**
 * Watch a room. Returns the unsubscribe.
 *
 * Safe to call again with a new room or token; each call owns its own client and
 * timers, and the returned function releases all of them.
 */
export function watchRoom({
  roomId,
  token,
  onChange,
  onMode,
}: WatchRoomOptions): () => void {
  const client = createClient(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    // Realtime authorises the socket with this, not with the publishable key.
    // Without it the connection opens and then delivers nothing, which is the
    // failure that looks most like a bug in the subscription itself.
    accessToken: () => Promise.resolve(token),
  })

  let stopped = false
  let mode: RealtimeMode = 'connecting'
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let giveUpTimer: ReturnType<typeof setTimeout> | null = null

  const setMode = (next: RealtimeMode) => {
    if (stopped || next === mode) return
    mode = next
    onMode?.(next)
  }

  const startPolling = () => {
    if (stopped || pollTimer !== null) return
    setMode('polling')
    pollTimer = setInterval(onChange, POLL_INTERVAL_MS)
    // The subscription may have been down for a while before this fired, so the
    // first read happens now rather than one interval from now.
    onChange()
  }

  const stopPolling = () => {
    if (pollTimer === null) return
    clearInterval(pollTimer)
    pollTimer = null
  }

  const channel = client.channel(`room:${roomId}`).on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'participants',
      filter: `room_id=eq.${roomId}`,
    },
    () => {
      if (!stopped) onChange()
    },
  )

  /**
   * Attach the token explicitly, and join only once it is set.
   *
   * The `accessToken` option above does reach `realtime.setAuth`, but supabase-js
   * calls it in a promise it does not await, so nothing in its contract says the
   * token is attached before a `subscribe()` on the next line. Postgres Changes
   * applies this room's RLS policy per subscriber; a socket that joined without
   * the token is `anon`, which grants nothing, and every event is dropped while
   * the channel still reports SUBSCRIBED.
   *
   * Honest about what is established: doing it this way is deliberate, not
   * proven necessary. Deliberately reverting to the bare `subscribe()` did not
   * reproduce any failure across three runs, so the race either does not occur
   * in practice — the join is queued until the socket opens, by which time the
   * library's promise has long resolved — or it needs conditions this has not
   * met. The one delivery failure actually observed here, on the first ever
   * subscription to this project, was never explained; a cold Realtime service
   * fits it better than this does. Kept because relying on the timing of a
   * promise a library chose not to await is not something to depend on, and the
   * cost is one `await`.
   */
  void client.realtime
    .setAuth(token)
    .catch(() => {
      // A token Realtime will not take is not fatal; the fallback below is
      // exactly the case it exists for.
    })
    .then(() => {
      if (stopped) return
      channel.subscribe((status) => {
        if (stopped) return
        if (status === 'SUBSCRIBED') {
          // A subscription that recovers takes the work back off the timer.
          stopPolling()
          setMode('live')
          return
        }
        // Everything else — CHANNEL_ERROR, TIMED_OUT, CLOSED — means nothing is
        // being delivered. supabase-js retries underneath; polling covers the
        // gap either way and stops again the moment SUBSCRIBED comes back.
        startPolling()
      })
    })

  // The belt to the callback's braces: a socket that opens and then simply never
  // subscribes reports no status at all, so nothing above would ever fire.
  giveUpTimer = setTimeout(() => {
    if (mode !== 'live') startPolling()
  }, SUBSCRIBE_TIMEOUT_MS)

  return () => {
    stopped = true
    stopPolling()
    if (giveUpTimer !== null) clearTimeout(giveUpTimer)
    void client.removeChannel(channel)
  }
}
