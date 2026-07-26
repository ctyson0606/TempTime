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

/** Largest multiple of the alphabet size that fits in a byte. See below. */
const UNBIASED_CEILING =
  Math.floor(256 / ROOM_CODE_ALPHABET.length) * ROOM_CODE_ALPHABET.length

/**
 * Web Crypto rather than `node:crypto`, so this also runs in the browser and on
 * the Edge runtime — the same reason `jose` was chosen over `jsonwebtoken`.
 * `Math.random` is seeded predictably enough that codes would be guessable in
 * bulk, so the CSPRNG is not optional.
 *
 * 256 is not a multiple of 30, so bytes at or above `UNBIASED_CEILING` are
 * redrawn instead of folded with `%` — otherwise the first 16 characters of the
 * alphabet would come up slightly more often than the rest.
 */
export function generateRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH)
  let code = ''

  while (code.length < ROOM_CODE_LENGTH) {
    crypto.getRandomValues(bytes)
    for (const byte of bytes) {
      if (byte >= UNBIASED_CEILING) continue
      code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]
      if (code.length === ROOM_CODE_LENGTH) break
    }
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
