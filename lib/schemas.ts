import { z } from 'zod'
import { DateTime } from 'luxon'
import { ISO_DATE, MAX_ROOM_DAYS, validateDates } from './dates'
import {
  DEFAULT_DAY_END_MIN,
  DEFAULT_DAY_START_MIN,
  DEFAULT_SLOT_MINUTES,
} from './room'
import { isValidRoomCode, normalizeRoomCode } from './roomCode'

/**
 * Request validation for every endpoint in PLAN.md section 6.
 *
 * The server re-does all of it. The browser runs the same rules for the sake of
 * a decent error message, but nothing here trusts that it did — the client is
 * the one place an attacker fully controls.
 *
 * Rules that need more than the request body — a mask's length, a date's
 * position in the selection window — are noted where they live instead.
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const MAX_TITLE_LENGTH = 80
const MAX_DISPLAY_NAME_LENGTH = 24

/** Blank and whitespace-only titles become null rather than empty strings. */
const titleSchema = z
  .string()
  .max(MAX_TITLE_LENGTH, `title is at most ${MAX_TITLE_LENGTH} characters`)
  .transform((t) => t.trim() || null)
  .nullable()
  .optional()
  .transform((t) => t ?? null)

/**
 * Checked against the tz database rather than a format regex. An unknown zone
 * would otherwise survive to `lib/slots.ts` and silently resolve every wall
 * time against UTC.
 */
const timezoneSchema = z
  .string()
  .refine((tz) => DateTime.local().setZone(tz).isValid, 'unknown IANA timezone')

const minuteOfDaySchema = z
  .number()
  .int('must be a whole number of minutes')
  .min(0)
  .max(1440)

export const createRoomSchema = z
  .object({
    title: titleSchema,
    timezone: timezoneSchema,
    dates: z
      .array(z.string().regex(ISO_DATE_PATTERN, `dates must be ${ISO_DATE}`))
      .min(1, 'pick at least one date')
      .max(MAX_ROOM_DAYS, `at most ${MAX_ROOM_DAYS} dates`),
    dayStartMin: minuteOfDaySchema.default(DEFAULT_DAY_START_MIN),
    dayEndMin: minuteOfDaySchema.default(DEFAULT_DAY_END_MIN),
  })
  .superRefine((room, ctx) => {
    // Ordering, duplicates and the 90-day window all depend on the timezone, so
    // they cannot be expressed per-field. lib/dates.ts stays the single source
    // of those rules; this only forwards the failure.
    const check = validateDates(room.dates, room.timezone)
    if (!check.ok) {
      ctx.addIssue({ code: 'custom', path: ['dates'], message: check.detail })
    }

    if (room.dayEndMin <= room.dayStartMin) {
      ctx.addIssue({
        code: 'custom',
        path: ['dayEndMin'],
        message: 'the day must end after it starts',
      })
      return
    }

    // Mirrors the CHECK constraint in 0001_init.sql. A day that does not divide
    // evenly would give the last slot a different length from the rest, and
    // every index calculation in lib/slots.ts assumes they are equal.
    if ((room.dayEndMin - room.dayStartMin) % DEFAULT_SLOT_MINUTES !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['dayEndMin'],
        message: `the day must divide into ${DEFAULT_SLOT_MINUTES}-minute slots`,
      })
    }
  })

export const joinSchema = z.object({
  displayName: z
    .string()
    .transform((n) => n.trim())
    .refine((n) => n.length >= 1, 'a name is required')
    .refine(
      (n) => n.length <= MAX_DISPLAY_NAME_LENGTH,
      `at most ${MAX_DISPLAY_NAME_LENGTH} characters`,
    ),
  /** Sent back on re-entry so a returning member keeps their submission. */
  participantId: z.uuid().optional(),
})

export const submitSchema = z.object({
  /**
   * Charset only. The length has to equal the room's `totalSlots`, which this
   * schema cannot know — the route checks it with `isValidMask` once the room
   * is loaded. Both checks are required; neither implies the other.
   */
  busyMask: z.string().regex(/^[01]+$/, 'a mask is a string of 0 and 1'),
  sources: z.array(
    z.enum(['manual', 'weekly', 'ics', 'google', 'todoist', 'ticktick']),
  ),
})

/**
 * Path parameter, not a body. Normalises first because a code arrives from a
 * QR scan, a paste, or someone typing it in lowercase.
 */
export const roomCodeSchema = z
  .string()
  .transform(normalizeRoomCode)
  .refine(isValidRoomCode, 'not a room code')

export type CreateRoomInput = z.infer<typeof createRoomSchema>
export type JoinInput = z.infer<typeof joinSchema>
export type SubmitInput = z.infer<typeof submitSchema>

/**
 * Collapse a failure into one line for the `error` field of an API response.
 *
 * Field names are safe to expose — they are our own contract — but nothing here
 * echoes the submitted value back, which is how a validation message turns into
 * a reflection of whatever an attacker sent.
 */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join('; ')
}
