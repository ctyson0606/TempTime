import { createClient } from '@supabase/supabase-js'
import { supabaseSecretKey, supabaseUrl } from '../env'

/**
 * The server's database handle. Holds the secret key, so it bypasses RLS and is
 * the only thing in the project that can read `submissions`.
 *
 * Never import this from a client component. Every route that touches data goes
 * through here, which is also what makes the Zod schemas load-bearing: the
 * database sees no writes that did not pass them (PLAN.md section 4.1).
 *
 * Built per call rather than kept at module scope so a missing environment
 * variable throws on the first request instead of at import time, when the
 * message would surface as an opaque build failure.
 */
export function serverDb() {
  return createClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Rows as they exist in Postgres — snake_case, unlike everything above. */
export interface RoomRow {
  id: string
  code: string
  title: string | null
  timezone: string
  dates: string[]
  day_start_min: number
  day_end_min: number
  slot_minutes: number
  owner_secret_hash: string
  created_at: string
  expires_at: string
}

export interface ParticipantRow {
  id: string
  room_id: string
  display_name: string
  joined_at: string
  submitted_at: string | null
}
