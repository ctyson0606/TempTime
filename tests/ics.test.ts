import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'
import { MAX_OCCURRENCES, parseIcs } from '../lib/providers/ics'
import { type RoomGrid, blocksToMask } from '../lib/slots'

/** The room every case is read against: two adjacent days plus one later. */
const room: RoomGrid = {
  timezone: 'Asia/Taipei',
  dates: ['2026-07-26', '2026-07-27', '2026-08-15'],
  dayStartMin: 480,
  dayEndMin: 1440,
  slotMinutes: 30,
}

const range = {
  timezone: room.timezone,
  from: new Date('2026-07-26T00:00:00+08:00'),
  to: new Date('2026-08-16T00:00:00+08:00'),
}

const calendar = (...events: string[]) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//test//EN',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')

const event = (lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n')

const TAIPEI_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Asia/Taipei',
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0800',
  'TZOFFSETTO:+0800',
  'TZNAME:CST',
  'END:STANDARD',
  'END:VTIMEZONE',
].join('\r\n')

const parse = (text: string) => {
  const result = parseIcs(text, range)
  if (!result.ok)
    throw new Error(`expected a parse, got ${result.error}: ${result.detail}`)
  return result
}

const wall = (date: Date, zone = room.timezone) =>
  DateTime.fromJSDate(date).setZone(zone).toFormat('yyyy-MM-dd HH:mm')

const busyIndices = (mask: string) =>
  [...mask].flatMap((cell, index) => (cell === '1' ? [index] : []))

describe('parseIcs', () => {
  it('reads a plain timed event', () => {
    const { blocks, skipped } = parse(
      calendar(
        TAIPEI_VTIMEZONE,
        event([
          'UID:a@test',
          'SUMMARY:Team sync',
          'DTSTART;TZID=Asia/Taipei:20260726T140000',
          'DTEND;TZID=Asia/Taipei:20260726T160000',
        ]),
      ),
    )

    expect(blocks).toHaveLength(1)
    expect(wall(blocks[0].start)).toBe('2026-07-26 14:00')
    expect(wall(blocks[0].end)).toBe('2026-07-26 16:00')
    expect(blocks[0].label).toBe('Team sync')
    expect(blocks[0].source).toBe('ics')
    expect(skipped.allDay).toBe(0)
  })

  it('reads DURATION as well as DTEND', () => {
    const { blocks } = parse(
      calendar(
        event([
          'UID:b@test',
          'SUMMARY:Standup',
          'DTSTART;TZID=Asia/Taipei:20260726T090000',
          'DURATION:PT45M',
        ]),
      ),
    )
    expect(wall(blocks[0].end)).toBe('2026-07-26 09:45')
  })

  it('reads UTC times', () => {
    const { blocks } = parse(
      calendar(
        event([
          'UID:c@test',
          'SUMMARY:Call',
          'DTSTART:20260726T060000Z',
          'DTEND:20260726T070000Z',
        ]),
      ),
    )
    // 06:00Z is 14:00 in Taipei.
    expect(wall(blocks[0].start)).toBe('2026-07-26 14:00')
  })

  it('places a floating time in the room timezone, not the machine one', () => {
    const text = calendar(
      event([
        'UID:d@test',
        'SUMMARY:Floating',
        'DTSTART:20260726T110000',
        'DTEND:20260726T120000',
      ]),
    )

    // The same file read for two rooms lands on each room's own clock.
    const taipei = parseIcs(text, range)
    const london = parseIcs(text, { ...range, timezone: 'Europe/London' })
    if (!taipei.ok || !london.ok) throw new Error('expected both to parse')

    expect(wall(taipei.blocks[0].start)).toBe('2026-07-26 11:00')
    expect(wall(london.blocks[0].start, 'Europe/London')).toBe('2026-07-26 11:00')
    expect(taipei.blocks[0].start.getTime()).not.toBe(london.blocks[0].start.getTime())
  })

  it('ignores all-day events', () => {
    const { blocks, skipped } = parse(
      calendar(
        event([
          'UID:e@test',
          'SUMMARY:Someone birthday',
          'DTSTART;VALUE=DATE:20260726',
          'DTEND;VALUE=DATE:20260727',
        ]),
      ),
    )
    expect(blocks).toHaveLength(0)
    expect(skipped.allDay).toBe(1)
  })

  it('ignores events the calendar itself calls free', () => {
    const { blocks, skipped } = parse(
      calendar(
        event([
          'UID:f@test',
          'SUMMARY:Tentative reminder',
          'DTSTART;TZID=Asia/Taipei:20260726T100000',
          'DTEND;TZID=Asia/Taipei:20260726T110000',
          'TRANSP:TRANSPARENT',
        ]),
      ),
    )
    expect(blocks).toHaveLength(0)
    expect(skipped.transparent).toBe(1)
  })

  it('ignores cancelled events', () => {
    const { blocks, skipped } = parse(
      calendar(
        event([
          'UID:g@test',
          'DTSTART;TZID=Asia/Taipei:20260726T100000',
          'DTEND;TZID=Asia/Taipei:20260726T110000',
          'STATUS:CANCELLED',
        ]),
      ),
    )
    expect(blocks).toHaveLength(0)
    expect(skipped.cancelled).toBe(1)
  })

  it('ignores zero-length events', () => {
    const { blocks, skipped } = parse(
      calendar(
        event([
          'UID:h@test',
          'DTSTART;TZID=Asia/Taipei:20260726T100000',
          'DTEND;TZID=Asia/Taipei:20260726T100000',
        ]),
      ),
    )
    expect(blocks).toHaveLength(0)
    expect(skipped.empty).toBe(1)
  })

  it('drops events outside the range and counts them', () => {
    const { blocks, skipped } = parse(
      calendar(
        event([
          'UID:i@test',
          'DTSTART;TZID=Asia/Taipei:20251225T100000',
          'DTEND;TZID=Asia/Taipei:20251225T110000',
        ]),
      ),
    )
    expect(blocks).toHaveLength(0)
    expect(skipped.outsideRange).toBe(1)
  })

  it('counts a recurrence that ends before the range rather than saying nothing', () => {
    // This one takes neither branch inside the expansion — it simply runs out of
    // occurrences — so without explicit accounting the file comes back with no
    // blocks and no reasons, which reads to the user exactly like an empty file.
    const { blocks, skipped } = parse(
      calendar(
        event([
          'UID:ended@test',
          'SUMMARY:Last term',
          'DTSTART;TZID=Asia/Taipei:20260601T140000',
          'DTEND;TZID=Asia/Taipei:20260601T160000',
          'RRULE:FREQ=WEEKLY;UNTIL=20260620T235959Z',
        ]),
      ),
    )
    expect(blocks).toHaveLength(0)
    expect(skipped.outsideRange).toBe(1)
  })

  it('survives an event whose recurrence ical.js refuses to expand', () => {
    // Taken from a real HKUST timetable export: EXDATE declares a TZID, which
    // makes its values date-*times*, and then writes bare dates. ical.js throws
    // `invalid date-time value` on the first call to iterator(). That escaped
    // parseIcs entirely, rejected a promise nobody awaited, and left the import
    // button looking like it did nothing at all.
    const { blocks, skipped } = parse(
      calendar(
        event([
          'UID:exdate@test',
          'SUMMARY:Course with unreadable exclusions',
          'DTSTART;TZID=Asia/Taipei:20260726T140000',
          'DTEND;TZID=Asia/Taipei:20260726T180000',
          'RRULE:FREQ=WEEKLY;UNTIL=20260810T235959Z',
          'EXDATE;TZID=Asia/Taipei:20260802,20260809',
        ]),
        event([
          'UID:fine@test',
          'SUMMARY:Readable neighbour',
          'DTSTART;TZID=Asia/Taipei:20260727T090000',
          'DTEND;TZID=Asia/Taipei:20260727T100000',
        ]),
      ),
    )
    // The point of the fix: one bad event costs one event, not the file.
    expect(skipped.unreadable).toBe(1)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].label).toBe('Readable neighbour')
  })

  it('expands a bounded recurrence', () => {
    const { blocks } = parse(
      calendar(
        event([
          'UID:j@test',
          'SUMMARY:Standup',
          'DTSTART;TZID=Asia/Taipei:20260726T090000',
          'DTEND;TZID=Asia/Taipei:20260726T093000',
          'RRULE:FREQ=DAILY;COUNT=3',
        ]),
      ),
    )
    expect(blocks.map((b) => wall(b.start))).toEqual([
      '2026-07-26 09:00',
      '2026-07-27 09:00',
      '2026-07-28 09:00',
    ])
    // Each occurrence needs its own id, or the checklist collapses them.
    expect(new Set(blocks.map((b) => b.id)).size).toBe(3)
  })

  it('keeps the wall-clock hour of a recurrence that started years ago', () => {
    // The reason expansion walks from DTSTART: seeding the iterator with a later
    // date rewrites the occurrence to the seed's time of day.
    const { blocks } = parse(
      calendar(
        event([
          'UID:k@test',
          'SUMMARY:Long-running daily',
          'DTSTART;TZID=Asia/Taipei:20200101T090000',
          'DTEND;TZID=Asia/Taipei:20200101T093000',
          'RRULE:FREQ=DAILY',
        ]),
      ),
    )
    expect(blocks.length).toBeGreaterThan(20)
    for (const block of blocks) {
      expect(wall(block.start).slice(11)).toBe('09:00')
    }
    expect(wall(blocks[0].start)).toBe('2026-07-26 09:00')
  })

  it('stops an unbounded recurrence at the end of the range', () => {
    const { blocks } = parse(
      calendar(
        event([
          'UID:l@test',
          'DTSTART;TZID=Asia/Taipei:20260726T090000',
          'DTEND;TZID=Asia/Taipei:20260726T093000',
          'RRULE:FREQ=DAILY',
        ]),
      ),
    )
    // 07-26 through 08-15 inclusive.
    expect(blocks).toHaveLength(21)
    expect(wall(blocks[blocks.length - 1].start)).toBe('2026-08-15 09:00')
  })

  it('reports a recurrence it could not walk far enough to reach', () => {
    const { blocks, skipped } = parse(
      calendar(
        event([
          'UID:m@test',
          'DTSTART;TZID=Asia/Taipei:20260101T090000',
          'DTEND;TZID=Asia/Taipei:20260101T090100',
          'RRULE:FREQ=MINUTELY',
        ]),
      ),
    )
    // A minutely rule needs far more than the ceiling to reach July.
    expect(blocks).toHaveLength(0)
    expect(skipped.truncated).toBe(1)
    expect(MAX_OCCURRENCES).toBeGreaterThan(1000)
  })

  it('returns a result rather than throwing on a file it cannot read', () => {
    const result = parseIcs('this is not a calendar', range)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error).toBe('UNREADABLE')
    expect(result.detail).not.toBe('')
  })

  it('reads an empty calendar as no blocks', () => {
    const { blocks } = parse(calendar())
    expect(blocks).toEqual([])
  })

  it('sorts blocks by start time whatever order the file uses', () => {
    const { blocks } = parse(
      calendar(
        event([
          'UID:n@test',
          'DTSTART;TZID=Asia/Taipei:20260727T100000',
          'DTEND;TZID=Asia/Taipei:20260727T110000',
        ]),
        event([
          'UID:o@test',
          'DTSTART;TZID=Asia/Taipei:20260726T100000',
          'DTEND;TZID=Asia/Taipei:20260726T110000',
        ]),
      ),
    )
    expect(blocks.map((b) => wall(b.start))).toEqual([
      '2026-07-26 10:00',
      '2026-07-27 10:00',
    ])
  })
})

describe('parsed blocks feeding the grid', () => {
  it('mark the slots they overlap, and nothing on unselected days', () => {
    const { blocks } = parse(
      calendar(
        event([
          'UID:p@test',
          'SUMMARY:Across the gap',
          'DTSTART;TZID=Asia/Taipei:20260727T230000',
          'DTEND;TZID=Asia/Taipei:20260815T090000',
        ]),
      ),
    )

    const mask = blocksToMask(room, blocks)
    // 07-27 23:00 to midnight is the last two slots of day 1; 08:00–09:00 on
    // 08-15 is the first two of day 2. The three weeks between are not on the
    // grid at all.
    expect(busyIndices(mask)).toEqual([62, 63, 64, 65])
  })
})
