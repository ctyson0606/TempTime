import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { MAX_ROOM_DAYS } from '../lib/dates'
import {
  createRoomSchema,
  describeIssues,
  joinSchema,
  roomCodeSchema,
  submitSchema,
} from '../lib/schemas'

const TAIPEI = 'Asia/Taipei'

/**
 * Dates are built relative to the real clock rather than pinned, because
 * `createRoomSchema` resolves the 90-day window against the current instant.
 * Hardcoded dates would pass today and start failing on their own.
 */
const inDays = (n: number): string =>
  DateTime.now().setZone(TAIPEI).plus({ days: n }).toFormat('yyyy-MM-dd')

const validRoom = {
  title: 'Dinner',
  timezone: TAIPEI,
  dates: [inDays(1), inDays(2)],
  dayStartMin: 480,
  dayEndMin: 1440,
}

describe('createRoomSchema', () => {
  it('accepts a well-formed room', () => {
    const result = createRoomSchema.safeParse(validRoom)
    expect(result.success).toBe(true)
  })

  it('fills in the default hours when they are omitted', () => {
    const result = createRoomSchema.parse({
      timezone: TAIPEI,
      dates: [inDays(1)],
    })
    expect(result.dayStartMin).toBe(480)
    expect(result.dayEndMin).toBe(1440)
  })

  it('turns a blank title into null rather than an empty string', () => {
    expect(createRoomSchema.parse({ ...validRoom, title: '   ' }).title).toBeNull()
    expect(createRoomSchema.parse({ ...validRoom, title: undefined }).title).toBeNull()
  })

  it('trims a title it keeps', () => {
    expect(createRoomSchema.parse({ ...validRoom, title: '  Dinner ' }).title).toBe(
      'Dinner',
    )
  })

  it('rejects a timezone the tz database does not know', () => {
    const result = createRoomSchema.safeParse({
      ...validRoom,
      timezone: 'Mars/Olympus',
    })
    expect(result.success).toBe(false)
  })

  it('rejects dates that are unsorted or repeated', () => {
    expect(
      createRoomSchema.safeParse({ ...validRoom, dates: [inDays(3), inDays(1)] })
        .success,
    ).toBe(false)
    expect(
      createRoomSchema.safeParse({ ...validRoom, dates: [inDays(1), inDays(1)] })
        .success,
    ).toBe(false)
  })

  it('rejects a date before today or past the 90-day window', () => {
    expect(
      createRoomSchema.safeParse({ ...validRoom, dates: [inDays(-1)] }).success,
    ).toBe(false)
    expect(
      createRoomSchema.safeParse({ ...validRoom, dates: [inDays(91)] }).success,
    ).toBe(false)
  })

  it('accepts both edges of the window', () => {
    expect(
      createRoomSchema.safeParse({ ...validRoom, dates: [inDays(0)] }).success,
    ).toBe(true)
    expect(
      createRoomSchema.safeParse({ ...validRoom, dates: [inDays(90)] }).success,
    ).toBe(true)
  })

  it(`rejects more than ${MAX_ROOM_DAYS} dates`, () => {
    const tooMany = Array.from({ length: MAX_ROOM_DAYS + 1 }, (_, i) => inDays(i + 1))
    expect(createRoomSchema.safeParse({ ...validRoom, dates: tooMany }).success).toBe(
      false,
    )
  })

  it('rejects an empty date list', () => {
    expect(createRoomSchema.safeParse({ ...validRoom, dates: [] }).success).toBe(false)
  })

  it('rejects a day that ends before it starts', () => {
    const result = createRoomSchema.safeParse({
      ...validRoom,
      dayStartMin: 600,
      dayEndMin: 540,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a day that does not divide into whole slots', () => {
    const result = createRoomSchema.safeParse({
      ...validRoom,
      dayStartMin: 480,
      dayEndMin: 1430,
    })
    expect(result.success).toBe(false)
  })

  it('names the offending field in the message', () => {
    const result = createRoomSchema.safeParse({ ...validRoom, dates: [inDays(-1)] })
    expect(result.success).toBe(false)
    if (!result.success) expect(describeIssues(result.error)).toContain('dates')
  })
})

describe('joinSchema', () => {
  it('trims the display name', () => {
    expect(joinSchema.parse({ displayName: '  Chen ' }).displayName).toBe('Chen')
  })

  it('rejects a name that is empty or only whitespace', () => {
    expect(joinSchema.safeParse({ displayName: '' }).success).toBe(false)
    expect(joinSchema.safeParse({ displayName: '   ' }).success).toBe(false)
  })

  it('rejects a name over 24 characters', () => {
    expect(joinSchema.safeParse({ displayName: 'x'.repeat(25) }).success).toBe(false)
    expect(joinSchema.safeParse({ displayName: 'x'.repeat(24) }).success).toBe(true)
  })

  it('accepts a returning member id but rejects a non-uuid', () => {
    expect(
      joinSchema.safeParse({
        displayName: 'Chen',
        participantId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      }).success,
    ).toBe(true)
    expect(
      joinSchema.safeParse({ displayName: 'Chen', participantId: 'nope' }).success,
    ).toBe(false)
  })
})

describe('submitSchema', () => {
  it('accepts a mask of 0 and 1 with known sources', () => {
    const result = submitSchema.safeParse({
      busyMask: '0011',
      sources: ['manual', 'ics'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects any other character in the mask', () => {
    expect(submitSchema.safeParse({ busyMask: '0012', sources: [] }).success).toBe(
      false,
    )
    expect(submitSchema.safeParse({ busyMask: '00 1', sources: [] }).success).toBe(
      false,
    )
  })

  it('rejects an empty mask', () => {
    expect(submitSchema.safeParse({ busyMask: '', sources: [] }).success).toBe(false)
  })

  it('rejects an unknown source', () => {
    expect(
      submitSchema.safeParse({ busyMask: '01', sources: ['outlook'] }).success,
    ).toBe(false)
  })
})

describe('roomCodeSchema', () => {
  it('upper-cases and strips separators', () => {
    expect(roomCodeSchema.parse('x7b-92m')).toBe('X7B92M')
  })

  it('rejects the wrong length or a character outside the alphabet', () => {
    expect(roomCodeSchema.safeParse('X7B92').success).toBe(false)
    expect(roomCodeSchema.safeParse('X7B92MM').success).toBe(false)
    // O, I and U are excluded from the alphabet as confusable.
    expect(roomCodeSchema.safeParse('X7B92O').success).toBe(false)
  })
})
