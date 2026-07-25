import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** 256 bits. Guessing one is not a threat model we need to defend against. */
export const OWNER_SECRET_BYTES = 32

/** SHA-256 hex, so a stored value is always exactly this long. */
const HASH_PATTERN = /^[0-9a-f]{64}$/

/**
 * The one credential that proves someone created a room.
 *
 * base64url so it survives being pasted into the admin link's query string
 * without escaping. Returned to the creator exactly once — only the hash is
 * stored, so nothing can hand it back afterwards.
 */
export function generateOwnerSecret(): string {
  return randomBytes(OWNER_SECRET_BYTES).toString('base64url')
}

export function hashOwnerSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

/**
 * Compare in constant time.
 *
 * A plain `===` leaks how many leading characters matched, which is enough to
 * recover a secret one character at a time given enough attempts. The rate limit
 * on DELETE makes that slow, not impossible.
 */
export function verifyOwnerSecret(secret: string, expectedHash: string): boolean {
  if (!HASH_PATTERN.test(expectedHash)) return false
  return timingSafeEqual(
    Buffer.from(hashOwnerSecret(secret), 'hex'),
    Buffer.from(expectedHash, 'hex'),
  )
}
