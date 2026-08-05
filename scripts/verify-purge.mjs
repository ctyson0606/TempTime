// The destruction checks from PLAN.md section 12, in executable form: does an
// expired room read as expired, does the purge route delete it, and — the part
// that makes the rest mean anything — does it leave everything else alone.
//
//   npm run dev
//   node scripts/verify-purge.mjs             # or APP_URL=... to point elsewhere
//
// Development only: it writes to the live database, using the secret key from
// `.env.local` to plant rooms with an `expires_at` in the past. Nothing in the
// app can produce one of those, which is why the fixtures go in through
// PostgREST rather than through `POST /api/rooms` — and why this script costs
// nothing against that endpoint's ten-an-hour limit.
//
// Every destructive assertion is paired with a control that must survive it. A
// purge that deleted the entire table would satisfy "the expired room is gone"
// perfectly.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const APP = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const REST = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`
const secret = {
  apikey: env.SUPABASE_SECRET_KEY,
  Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
}

let failures = 0
const report = (pass, label, detail = '') => {
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}

async function db(path, init = {}) {
  const res = await fetch(`${REST}/${path}`, {
    ...init,
    headers: { ...secret, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

async function app(path, init = {}) {
  const res = await fetch(`${APP}${path}`, init)
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

/** The real alphabet: a code outside it is rejected before any room is looked up. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const randomCode = () =>
  Array.from(
    { length: 6 },
    () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
  ).join('')

const HOUR = 3_600_000
const planted = []

/**
 * Plant a room with a member who has answered, so the cascade has something to
 * take with it. `expiresAt` decides whether the purge should claim this one.
 */
async function plantRoom(expiresAt) {
  const code = randomCode()
  const room = await db('rooms', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      code,
      title: 'Purge fixture',
      timezone: 'Asia/Taipei',
      dates: ['2026-12-24', '2026-12-25'],
      owner_secret_hash: 'x'.repeat(64),
      expires_at: expiresAt,
    }),
  })
  if (room.status !== 201) {
    throw new Error(`room insert failed: ${room.status} ${JSON.stringify(room.body)}`)
  }
  const id = room.body[0].id

  const member = await db('participants', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ room_id: id, display_name: `member-${code}` }),
  })
  if (member.status !== 201) {
    throw new Error(`participant insert failed: ${member.status}`)
  }

  const answer = await db('submissions', {
    method: 'POST',
    body: JSON.stringify({
      room_id: id,
      participant_id: member.body[0].id,
      busy_mask: '01'.repeat(32),
    }),
  })
  if (answer.status !== 201)
    throw new Error(`submission insert failed: ${answer.status}`)

  planted.push(id)
  return { id, code }
}

/** How many rows the three tables still hold for a room. */
async function rowsFor(id) {
  const [rooms, members, answers] = await Promise.all([
    db(`rooms?id=eq.${id}&select=id`),
    db(`participants?room_id=eq.${id}&select=id`),
    db(`submissions?room_id=eq.${id}&select=id`),
  ])
  return {
    rooms: rooms.body?.length ?? 0,
    participants: members.body?.length ?? 0,
    submissions: answers.body?.length ?? 0,
  }
}

const past = new Date(Date.now() - HOUR).toISOString()
const future = new Date(Date.now() + 48 * HOUR).toISOString()

const expired = await plantRoom(past)
const live = await plantRoom(future)

try {
  // --- 410 and 404 are different answers -----------------------------------
  // The UI writes different words for these two, so the API has to be telling
  // them apart rather than returning one status for "you cannot have it".
  const expiredRead = await app(`/api/rooms/${expired.code}`)
  report(
    expiredRead.status === 410 && expiredRead.body?.code === 'ROOM_EXPIRED',
    'a room past expires_at reads as 410 ROOM_EXPIRED',
    `${expiredRead.status} ${expiredRead.body?.code}`,
  )

  const missingRead = await app(`/api/rooms/${randomCode()}`)
  report(
    missingRead.status === 404 && missingRead.body?.code === 'ROOM_NOT_FOUND',
    'a room that never existed reads as 404 ROOM_NOT_FOUND',
    `${missingRead.status} ${missingRead.body?.code}`,
  )

  const liveRead = await app(`/api/rooms/${live.code}`)
  report(
    liveRead.status === 200,
    'a room within its dates still reads fine',
    `${liveRead.status}`,
  )

  // --- the credential ------------------------------------------------------
  // The known-bad control runs alongside the real one. Watching an unauthorised
  // call fail proves nothing on its own; what is being established is that the
  // authorised call and the unauthorised call do not look the same.
  const noSecret = await app('/api/cron/purge', { method: 'POST' })
  report(
    noSecret.status === 401,
    'purge with no secret is refused',
    `${noSecret.status} ${noSecret.body?.code}`,
  )

  const wrongSecret = await app('/api/cron/purge', {
    method: 'POST',
    headers: { 'x-cron-secret': 'w'.repeat(env.CRON_SECRET.length) },
  })
  report(
    wrongSecret.status === 401,
    'purge with a wrong secret of the right length is refused',
    `${wrongSecret.status} ${wrongSecret.body?.code}`,
  )

  const afterRefusal = await rowsFor(expired.id)
  report(
    afterRefusal.rooms === 1,
    'and a refused call deleted nothing',
    JSON.stringify(afterRefusal),
  )

  // --- the real thing ------------------------------------------------------
  const purged = await app('/api/cron/purge', {
    method: 'POST',
    headers: { 'x-cron-secret': env.CRON_SECRET },
  })
  report(
    purged.status === 200 && purged.body?.ok === true,
    'purge with the right secret runs',
    `${purged.status} ${JSON.stringify(purged.body)}`,
  )
  report(
    (purged.body?.deleted ?? 0) >= 1,
    'and reports what it deleted',
    `deleted ${purged.body?.deleted}`,
  )

  const gone = await rowsFor(expired.id)
  report(gone.rooms === 0, 'the expired room is gone', JSON.stringify(gone))
  report(
    gone.participants === 0 && gone.submissions === 0,
    'and its members and answers went with it',
    JSON.stringify(gone),
  )

  // The control. Without this, "delete from rooms" with no WHERE clause passes
  // every assertion above.
  const survivor = await rowsFor(live.id)
  report(
    survivor.rooms === 1 && survivor.participants === 1 && survivor.submissions === 1,
    'the room that has not expired is untouched',
    JSON.stringify(survivor),
  )

  // 410 said "expired but still here". Once purged there is nothing to expire.
  const afterPurge = await app(`/api/rooms/${expired.code}`)
  report(
    afterPurge.status === 404,
    'the purged code now reads as 404, not 410',
    `${afterPurge.status} ${afterPurge.body?.code}`,
  )

  // --- the verb Vercel actually uses ---------------------------------------
  // Vercel Cron sends a GET with the secret as a bearer token and cannot be made
  // to send anything else, so the POST above does not prove the deployed path
  // works.
  const second = await plantRoom(past)
  const viaGet = await app('/api/cron/purge', {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  })
  report(
    viaGet.status === 200 && (viaGet.body?.deleted ?? 0) >= 1,
    'GET with a bearer token purges too, which is how Vercel Cron calls it',
    `${viaGet.status} ${JSON.stringify(viaGet.body)}`,
  )
  const secondRows = await rowsFor(second.id)
  report(
    secondRows.rooms === 0,
    'and that room is gone as well',
    JSON.stringify(secondRows),
  )
  const stillThere = await rowsFor(live.id)
  report(
    stillThere.rooms === 1,
    'while the live room survives the second run too',
    JSON.stringify(stillThere),
  )
} catch (error) {
  failures++
  console.log(`\nABORTED  ${error.message.split('\n')[0]}`)
} finally {
  for (const id of planted) {
    await db(`rooms?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
  }
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} FAILED`)
  process.exitCode = failures === 0 ? 0 : 1
}
