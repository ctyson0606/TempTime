import { describe, expect, it } from 'vitest'
import {
  OWNER_SECRET_BYTES,
  generateOwnerSecret,
  hashOwnerSecret,
  verifyOwnerSecret,
} from '../lib/ownerSecret'

describe('generateOwnerSecret', () => {
  it('encodes 32 bytes as base64url', () => {
    const secret = generateOwnerSecret()
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(Buffer.from(secret, 'base64url')).toHaveLength(OWNER_SECRET_BYTES)
  })

  it('survives a query string without escaping', () => {
    for (let i = 0; i < 200; i++) {
      const secret = generateOwnerSecret()
      expect(encodeURIComponent(secret)).toBe(secret)
    }
  })

  it('never repeats', () => {
    const secrets = new Set(Array.from({ length: 1000 }, generateOwnerSecret))
    expect(secrets.size).toBe(1000)
  })
})

describe('hashOwnerSecret', () => {
  it('produces 64 hex characters', () => {
    expect(hashOwnerSecret('whatever')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', () => {
    const secret = generateOwnerSecret()
    expect(hashOwnerSecret(secret)).toBe(hashOwnerSecret(secret))
  })

  it('does not contain the secret', () => {
    const secret = generateOwnerSecret()
    expect(hashOwnerSecret(secret)).not.toContain(secret)
  })

  it('matches the known SHA-256 of a fixed input', () => {
    // Guards against the digest silently changing algorithm or encoding.
    expect(hashOwnerSecret('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('verifyOwnerSecret', () => {
  it('accepts the secret it was derived from', () => {
    const secret = generateOwnerSecret()
    expect(verifyOwnerSecret(secret, hashOwnerSecret(secret))).toBe(true)
  })

  it('rejects a different secret', () => {
    const hash = hashOwnerSecret(generateOwnerSecret())
    expect(verifyOwnerSecret(generateOwnerSecret(), hash)).toBe(false)
  })

  it('rejects an empty secret against a real hash', () => {
    const hash = hashOwnerSecret(generateOwnerSecret())
    expect(verifyOwnerSecret('', hash)).toBe(false)
  })

  it.each([
    ['', 'empty'],
    ['abc', 'too short'],
    ['z'.repeat(64), 'not hex'],
    ['a'.repeat(63), 'one character short'],
    ['a'.repeat(65), 'one character long'],
  ])('rejects a stored hash that is %s (%s) without throwing', (hash) => {
    expect(verifyOwnerSecret('anything', hash)).toBe(false)
  })

  it('rejects a hash with trailing garbage past 64 characters', () => {
    const secret = generateOwnerSecret()
    expect(verifyOwnerSecret(secret, `${hashOwnerSecret(secret)}zz`)).toBe(false)
  })
})
