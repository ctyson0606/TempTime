import { randomInt } from 'node:crypto'

/**
 * Excludes characters that are misread when a code is copied off a screen or
 * read aloud: `0`/`O`, `1`/`I`/`L`, and `U` (heard as "you"). 30 characters.
 */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * 30^6 = 729,000,000 codes.
 *
 * Five characters was sized for rooms that died after 24 hours. Rooms now live
 * until their last selected date, so far more of them coexist and both
 * collision and blind-guess rates rise. See PLAN.md section 7.1.
 */
export const ROOM_CODE_LENGTH = 6

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`)

/**
 * `randomInt` draws from the CSPRNG and rejects modulo bias. `Math.random` is
 * seeded predictably enough that codes would be guessable in bulk.
 */
export function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
  }
  return code
}

/**
 * Clean up a code a user typed or pasted. Case and separators are noise; the
 * alphabet has no confusable pairs left to resolve, so anything outside it is
 * dropped and the result simply fails `isValidRoomCode`.
 */
export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export function isValidRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code)
}
