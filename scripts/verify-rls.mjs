// Temporary probe: do the migrations actually enforce PLAN.md section 4.2?
// Creates two rooms, checks what a room token can and cannot reach, then
// deletes them. Deleted once it has answered.
import { readFileSync } from 'node:fs'
import { SignJWT } from 'jose'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '')
const secret = {
  apikey: env.SUPABASE_SECRET_KEY,
  Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
}

let failures = 0
function report(pass, label, detail = '') {
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}

async function api(path, init = {}) {
  const res = await fetch(`${base}/rest/v1/${path}`, init)
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

const asRoom = async (roomId) => ({
  apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${await new SignJWT({
    role: 'authenticated',
    room_id: roomId,
    participant_id: '00000000-0000-0000-0000-000000000001',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(env.SUPABASE_JWT_SECRET))}`,
})

async function makeRoom(code) {
  const { status, body } = await api('rooms', {
    method: 'POST',
    headers: {
      ...secret,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      code,
      timezone: 'Asia/Taipei',
      dates: ['2026-12-24', '2026-12-25'],
      owner_secret_hash: 'x'.repeat(64),
      expires_at: '2026-12-27T00:00:00Z',
    }),
  })
  if (status !== 201)
    throw new Error(`room insert failed: ${status} ${JSON.stringify(body)}`)
  const room = body[0]

  const p = await api('participants', {
    method: 'POST',
    headers: {
      ...secret,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ room_id: room.id, display_name: `member-${code}` }),
  })
  if (p.status !== 201) throw new Error(`participant insert failed: ${p.status}`)

  const s = await api('submissions', {
    method: 'POST',
    headers: { ...secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_id: room.id,
      participant_id: p.body[0].id,
      busy_mask: '01'.repeat(32),
    }),
  })
  if (s.status !== 201) throw new Error(`submission insert failed: ${s.status}`)

  return room
}

const suffix = Math.random().toString(36).slice(2, 5).toUpperCase()
const a = await makeRoom(`AAA${suffix}`)
const b = await makeRoom(`BBB${suffix}`)

try {
  // 1. Constraints from 0001 are live.
  const bad = await api('rooms', {
    method: 'POST',
    headers: { ...secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: `ZZZ${suffix}`,
      timezone: 'Asia/Taipei',
      dates: [
        '2026-12-01',
        '2026-12-02',
        '2026-12-03',
        '2026-12-04',
        '2026-12-05',
        '2026-12-06',
        '2026-12-07',
        '2026-12-08',
      ],
      owner_secret_hash: 'x'.repeat(64),
      expires_at: '2026-12-27T00:00:00Z',
    }),
  })
  report(
    bad.status >= 400,
    'an 8-day room is rejected by the CHECK constraint',
    `got ${bad.status}`,
  )

  const badMask = await api('submissions', {
    method: 'POST',
    headers: { ...secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_id: a.id,
      participant_id: a.id,
      busy_mask: 'not-a-mask',
    }),
  })
  report(
    badMask.status >= 400,
    'a non-0/1 busy_mask is rejected',
    `got ${badMask.status}`,
  )

  // 2. The server credential reaches everything.
  const asServer = await api('submissions?select=busy_mask', { headers: secret })
  report(
    asServer.status === 200,
    'secret key reads submissions',
    `got ${asServer.status}`,
  )

  // 3. THE PRIVACY PROMISE: a room token must not reach submissions at all.
  const tokenA = await asRoom(a.id)
  const leak = await api('submissions?select=*', { headers: tokenA })
  const leaked = Array.isArray(leak.body) ? leak.body.length : 0
  report(
    leak.status >= 400 || leaked === 0,
    'room token cannot read submissions',
    `status ${leak.status}, ${leaked} rows`,
  )

  // 4. Room isolation.
  const rooms = await api('rooms?select=code', { headers: tokenA })
  const codes = Array.isArray(rooms.body) ? rooms.body.map((r) => r.code) : []
  report(
    codes.length === 1 && codes[0] === a.code,
    'room token sees only its own room',
    JSON.stringify(codes),
  )

  const members = await api('participants?select=display_name', { headers: tokenA })
  const names = Array.isArray(members.body)
    ? members.body.map((m) => m.display_name)
    : []
  report(
    names.length === 1 && names[0] === `member-AAA${suffix}`,
    'room token sees only its own members',
    JSON.stringify(names),
  )

  // 5. A token for room B must not see room A, even though both exist.
  const membersB = await api('participants?select=display_name', {
    headers: await asRoom(b.id),
  })
  const namesB = Array.isArray(membersB.body)
    ? membersB.body.map((m) => m.display_name)
    : []
  report(
    namesB.length === 1 && namesB[0] === `member-BBB${suffix}`,
    'a second room is isolated from the first',
    JSON.stringify(namesB),
  )

  // 6. Publishable key with no token reaches nothing.
  const anon = await api('participants?select=*', {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
  })
  const anonRows = Array.isArray(anon.body) ? anon.body.length : 0
  report(
    anon.status >= 400 || anonRows === 0,
    'publishable key alone reads nothing',
    `status ${anon.status}, ${anonRows} rows`,
  )

  // 7. Cascade: deleting a room takes its participants and submissions.
  await api(`rooms?id=eq.${a.id}`, { method: 'DELETE', headers: secret })
  const orphans = await api(`participants?room_id=eq.${a.id}&select=id`, {
    headers: secret,
  })
  report(
    Array.isArray(orphans.body) && orphans.body.length === 0,
    'deleting a room cascades to its members',
    JSON.stringify(orphans.body),
  )
} finally {
  await api(`rooms?id=eq.${a.id}`, { method: 'DELETE', headers: secret })
  await api(`rooms?id=eq.${b.id}`, { method: 'DELETE', headers: secret })
  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}`)
}
