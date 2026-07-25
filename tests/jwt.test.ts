import { SignJWT, decodeJwt } from 'jose'
import { describe, expect, it } from 'vitest'
import {
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  type RoomTokenClaims,
  signRoomToken,
  verifyRoomToken,
} from '../lib/jwt'

const SECRET = 'a'.repeat(48)
const OTHER_SECRET = 'b'.repeat(48)

const claims: RoomTokenClaims = {
  roomId: '9f1c0b6e-2d1a-4c3b-8e5f-7a6b5c4d3e2f',
  participantId: '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d',
}

const inAnHour = () => new Date(Date.now() + 3_600_000)
const anHourAgo = () => new Date(Date.now() - 3_600_000)

const key = (secret: string) => new TextEncoder().encode(secret)

describe('signRoomToken', () => {
  it('round-trips through verifyRoomToken', async () => {
    const token = await signRoomToken(claims, {
      secret: SECRET,
      expiresAt: inAnHour(),
    })
    expect(await verifyRoomToken(token, SECRET)).toEqual(claims)
  })

  it('puts the claims on the wire in snake_case for Postgres RLS', async () => {
    const token = await signRoomToken(claims, {
      secret: SECRET,
      expiresAt: inAnHour(),
    })
    // RLS reads these as auth.jwt() ->> 'room_id'. camelCase would silently
    // match nothing and every policy would deny.
    expect(decodeJwt(token)).toMatchObject({
      room_id: claims.roomId,
      participant_id: claims.participantId,
      sub: claims.participantId,
      role: JWT_AUDIENCE,
      aud: JWT_AUDIENCE,
    })
  })

  it('expires exactly when the room does', async () => {
    const expiresAt = inAnHour()
    const token = await signRoomToken(claims, { secret: SECRET, expiresAt })
    expect(decodeJwt(token).exp).toBe(Math.floor(expiresAt.getTime() / 1000))
  })

  it('signs with the pinned algorithm', async () => {
    const token = await signRoomToken(claims, {
      secret: SECRET,
      expiresAt: inAnHour(),
    })
    const header = JSON.parse(
      Buffer.from(token.split('.')[0], 'base64url').toString('utf8'),
    )
    expect(header.alg).toBe(JWT_ALGORITHM)
  })

  it('refuses a secret shorter than 32 characters', async () => {
    await expect(
      signRoomToken(claims, { secret: 'too-short', expiresAt: inAnHour() }),
    ).rejects.toThrow(/at least 32 characters/)
  })
})

describe('verifyRoomToken', () => {
  it('rejects a token signed with a different secret', async () => {
    const token = await signRoomToken(claims, {
      secret: OTHER_SECRET,
      expiresAt: inAnHour(),
    })
    expect(await verifyRoomToken(token, SECRET)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await signRoomToken(claims, {
      secret: SECRET,
      expiresAt: anHourAgo(),
    })
    expect(await verifyRoomToken(token, SECRET)).toBeNull()
  })

  it('rejects a tampered payload', async () => {
    const token = await signRoomToken(claims, {
      secret: SECRET,
      expiresAt: inAnHour(),
    })
    const [header, , signature] = token.split('.')
    const forged = Buffer.from(
      JSON.stringify({
        room_id: 'someone-elses-room',
        participant_id: claims.participantId,
        aud: JWT_AUDIENCE,
        role: JWT_AUDIENCE,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url')
    expect(await verifyRoomToken(`${header}.${forged}.${signature}`, SECRET)).toBeNull()
  })

  it('rejects a token signed with a different algorithm', async () => {
    // Same secret, HS512 instead of HS256. Without an explicit allow-list
    // jwtVerify would trust the header and accept this.
    const token = await new SignJWT({
      role: JWT_AUDIENCE,
      room_id: claims.roomId,
      participant_id: claims.participantId,
    })
      .setProtectedHeader({ alg: 'HS512' })
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime('1h')
      .sign(key(SECRET))

    expect(await verifyRoomToken(token, SECRET)).toBeNull()
  })

  it('rejects a token missing the audience', async () => {
    const token = await new SignJWT({
      room_id: claims.roomId,
      participant_id: claims.participantId,
    })
      .setProtectedHeader({ alg: JWT_ALGORITHM })
      .setExpirationTime('1h')
      .sign(key(SECRET))

    expect(await verifyRoomToken(token, SECRET)).toBeNull()
  })

  it.each([
    ['room_id', { participant_id: claims.participantId }],
    ['participant_id', { room_id: claims.roomId }],
  ])('rejects a well-signed token missing %s', async (_name, payload) => {
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: JWT_ALGORITHM })
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime('1h')
      .sign(key(SECRET))

    expect(await verifyRoomToken(token, SECRET)).toBeNull()
  })

  it.each([
    ['empty string', ''],
    ['not a JWT', 'hello'],
    ['two segments', 'aaa.bbb'],
  ])('rejects %s without throwing', async (_name, token) => {
    expect(await verifyRoomToken(token, SECRET)).toBeNull()
  })

  it('still throws on a misconfigured secret, not a null result', async () => {
    const token = await signRoomToken(claims, {
      secret: SECRET,
      expiresAt: inAnHour(),
    })
    // A short secret is our configuration bug, not the caller's bad credential.
    await expect(verifyRoomToken(token, 'short')).rejects.toThrow(
      /at least 32 characters/,
    )
  })
})
