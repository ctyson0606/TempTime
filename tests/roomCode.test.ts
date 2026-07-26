import { describe, expect, it, vi } from 'vitest'
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from '../lib/roomCode'

describe('ROOM_CODE_ALPHABET', () => {
  it('excludes every confusable character', () => {
    for (const banned of ['0', 'O', '1', 'I', 'L', 'U']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(banned)
    }
  })

  it('has no repeated characters', () => {
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length)
  })

  it('is 30 characters, giving 729,000,000 codes at length 6', () => {
    expect(ROOM_CODE_ALPHABET.length).toBe(30)
    expect(ROOM_CODE_LENGTH).toBe(6)
    expect(ROOM_CODE_ALPHABET.length ** ROOM_CODE_LENGTH).toBe(729_000_000)
  })
})

describe('generateRoomCode', () => {
  it('always produces a valid code', () => {
    for (let i = 0; i < 500; i++) {
      expect(isValidRoomCode(generateRoomCode())).toBe(true)
    }
  })

  it('uses the whole alphabet without obvious bias', () => {
    const draws = 30_000
    const counts = new Map<string, number>()
    for (let i = 0; i < draws / ROOM_CODE_LENGTH; i++) {
      for (const ch of generateRoomCode()) {
        counts.set(ch, (counts.get(ch) ?? 0) + 1)
      }
    }

    expect(counts.size).toBe(ROOM_CODE_ALPHABET.length)

    // Expected 1000 per character. A wide band keeps this from flaking while
    // still catching a truncated alphabet or a modulo-biased draw.
    const expected = draws / ROOM_CODE_ALPHABET.length
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.7)
      expect(count).toBeLessThan(expected * 1.3)
    }
  })

  it('rarely repeats', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateRoomCode))
    expect(codes.size).toBe(2000)
  })
})

describe('normalizeRoomCode', () => {
  it('uppercases and strips separators', () => {
    expect(normalizeRoomCode(' x7b-92 m ')).toBe('X7B92M')
  })

  it('leaves confusable characters in place so the code simply fails', () => {
    // The alphabet has no confusable pairs left, so there is nothing to map to.
    expect(isValidRoomCode(normalizeRoomCode('X7B92O'))).toBe(false)
  })
})

describe('isValidRoomCode', () => {
  it('requires exactly the right length', () => {
    expect(isValidRoomCode('X7B92')).toBe(false)
    expect(isValidRoomCode('X7B92MM')).toBe(false)
    expect(isValidRoomCode('X7B92M')).toBe(true)
  })

  it('rejects lowercase and excluded characters', () => {
    expect(isValidRoomCode('x7b92m')).toBe(false)
    expect(isValidRoomCode('X7B92I')).toBe(false)
  })
})

describe('generateRoomCode, byte by byte', () => {
  it('redraws bytes that would fold unevenly onto the alphabet', () => {
    // 256 is not a multiple of 30, so bytes 240-255 must be discarded rather
    // than folded with %, which would favour the first 16 characters. The bias
    // is far too small for the distribution test above to see, so pin the draw.
    const queue = [250, 251, 252, 253, 254, 255, 0, 1, 2, 3, 4, 5]
    const spy = vi
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
        const bytes = array as unknown as Uint8Array
        for (let i = 0; i < bytes.length; i++) bytes[i] = queue.shift() ?? 0
        return array
      })

    expect(generateRoomCode()).toBe(ROOM_CODE_ALPHABET.slice(0, ROOM_CODE_LENGTH))
    spy.mockRestore()
  })
})
