import { SignJWT, jwtVerify } from 'jose'

/**
 * Pinned, and passed to `jwtVerify` as an allow-list.
 *
 * A verifier that trusts the token's own `alg` header can be talked into
 * accepting `none`, or into checking an RS256 token's signature with the public
 * key as an HMAC secret. Naming the algorithm on both sides closes that.
 */
export const JWT_ALGORITHM = 'HS256'

/**
 * Supabase treats a request as signed-in only when the token carries this
 * audience and a matching `role` claim, and the same token is handed to the
 * Supabase client for Realtime (PLAN.md section 2.3).
 *
 * UNVERIFIED: no Supabase project exists yet, so this has not been checked
 * against a live instance. If Realtime rejects these tokens, this is the first
 * place to look.
 */
export const JWT_AUDIENCE = 'authenticated'

/** HS256 with a short key is brute-forceable offline. Supabase's own is longer. */
const MIN_SECRET_LENGTH = 32

export interface RoomTokenClaims {
  roomId: string
  participantId: string
}

function encodeSecret(secret: string): Uint8Array {
  if (secret.length < MIN_SECRET_LENGTH) {
    // Fail loudly at the call site rather than signing weak tokens all day.
    throw new Error(
      `JWT secret must be at least ${MIN_SECRET_LENGTH} characters, got ${secret.length}`,
    )
  }
  return new TextEncoder().encode(secret)
}

/**
 * Issue a participant's room token.
 *
 * Claims go on the wire in snake_case because Postgres RLS policies read them
 * as `auth.jwt() ->> 'room_id'`; the camelCase in `RoomTokenClaims` stops at the
 * TypeScript boundary. Expiry is the room's own `expires_at`, so the token dies
 * with the room rather than outliving it.
 */
export async function signRoomToken(
  claims: RoomTokenClaims,
  opts: { secret: string; expiresAt: Date },
): Promise<string> {
  return new SignJWT({
    role: JWT_AUDIENCE,
    room_id: claims.roomId,
    participant_id: claims.participantId,
  })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(claims.participantId)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(opts.expiresAt.getTime() / 1000))
    .sign(encodeSecret(opts.secret))
}

/**
 * Returns `null` for anything not currently valid — bad signature, wrong
 * algorithm, expired, missing claims. Callers map that to 401 and have no
 * decision to make about which failure it was; telling an attacker apart from a
 * user with a stale token is not worth the leak.
 *
 * A malformed secret still throws, because that is our configuration error, not
 * the caller's credential.
 */
export async function verifyRoomToken(
  token: string,
  secret: string,
): Promise<RoomTokenClaims | null> {
  const key = encodeSecret(secret)

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: [JWT_ALGORITHM],
      audience: JWT_AUDIENCE,
    })

    const roomId = payload.room_id
    const participantId = payload.participant_id
    if (typeof roomId !== 'string' || typeof participantId !== 'string') return null

    return { roomId, participantId }
  } catch {
    return null
  }
}
