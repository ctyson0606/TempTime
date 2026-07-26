import { describe, expect, it } from 'vitest'
import { formatMinuteOfDay, formatSlotWindow } from '../lib/room'

/** Two days, 08:00 to midnight, half-hour slots: 32 slots a day, 64 in all. */
const room = {
  timezone: 'Asia/Taipei',
  dates: ['2026-08-02', '2026-08-03'],
  dayStartMin: 480,
  dayEndMin: 1440,
  slotMinutes: 30,
}

describe('formatMinuteOfDay', () => {
  it('pads and keeps 24:00 as the end of a day', () => {
    expect(formatMinuteOfDay(480)).toBe('08:00')
    expect(formatMinuteOfDay(570)).toBe('09:30')
    expect(formatMinuteOfDay(1440)).toBe('24:00')
  })
})

describe('formatSlotWindow', () => {
  it('reads a single slot from its own day', () => {
    expect(formatSlotWindow(room, 0, 1)).toBe('08/02 Sun 08:00–08:30')
  })

  it('spans a run of slots', () => {
    expect(formatSlotWindow(room, 0, 4)).toBe('08/02 Sun 08:00–10:00')
  })

  it('starts from the right day, since dayIndex is a position and not an offset', () => {
    expect(formatSlotWindow(room, 32, 33)).toBe('08/03 Mon 08:00–08:30')
  })

  /**
   * The end of the last slot is the next day's 00:00. Printed literally it reads
   * as the morning, so a window covering a whole evening looked like it ran
   * "08:00–00:00" — backwards. The grid's gutter labels the same instant 24:00
   * and this has to match it.
   */
  it('calls the midnight that ends a day 24:00, not 00:00', () => {
    expect(formatSlotWindow(room, 62, 64)).toBe('08/03 Mon 23:00–24:00')
    expect(formatSlotWindow(room, 0, 32)).toBe('08/02 Sun 08:00–24:00')
  })

  it('leaves a midday end alone', () => {
    const shortDay = { ...room, dayEndMin: 1200 }
    expect(formatSlotWindow(shortDay, 0, 24)).toBe('08/02 Sun 08:00–20:00')
  })
})
