// Drives GET /api/rooms/:code/heatmap against the running app.
//
// Development only: it creates real rooms in the live database and deletes them
// again at the end. Start `npm run dev` first, then `node scripts/verify-heatmap.mjs`.
//
// What it is actually testing, in the order that matters:
//
//   1. The overlay is arithmetic, not a coincidence. Two members submit masks
//      chosen so that the answer contains a slot free for both, a slot free for
//      one, and a slot free for neither. A comparison that passes because
//      everything is zero passes for the wrong reason (METHOD.md -> Verification),
//      so all three values have to appear.
//   2. Nobody's mask leaves. The whole response body is scanned as text.
//   3. Runs never cross a day boundary, which is the one thing findBestSlots
//      cannot be trusted about by reading it.
//   4. A token for a *different* room is refused — run in the same breath as the
//      genuine one, so "both fail" is distinguishable from "the check works".

const APP = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

// Only used to pick dates inside the selection window; the app supplies
// everything else through its own API.
const TZ = 'Asia/Taipei'

let failures = 0
function report(pass, label, detail = '') {
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}

async function api(path, init = {}) {
  const res = await fetch(`${APP}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`${path} returned non-JSON (${res.status}): ${text.slice(0, 200)}`)
  }
  return { status: res.status, body, text }
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` })

/** Two dates a week out, formatted in the room's timezone. */
function soon() {
  const at = (days) => {
    const d = new Date(Date.now() + days * 86_400_000)
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  }
  return [at(7), at(8)]
}

/** A mask of `total` slots, busy across [from, to). */
function busyRange(total, from, to) {
  let mask = ''
  for (let i = 0; i < total; i++) mask += i >= from && i < to ? '1' : '0'
  return mask
}

async function makeRoom(title) {
  const created = await api('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({
      title,
      timezone: TZ,
      dates: soon(),
      dayStartMin: 480,
      dayEndMin: 1440,
    }),
  })
  // 201, and each run makes two rooms against a limit of 10 an hour: five runs
  // in an hour is the ceiling before POST /api/rooms starts returning 429.
  if (created.status !== 201) {
    throw new Error(`create failed: ${created.status} ${created.text}`)
  }
  const detail = await api(`/api/rooms/${created.body.code}`)
  if (detail.status !== 200) {
    throw new Error(`read back failed: ${detail.status} ${detail.text}`)
  }
  return { ...created.body, ...detail.body }
}

async function join(code, displayName) {
  const { status, body, text } = await api(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: JSON.stringify({ displayName }),
  })
  if (status !== 200) throw new Error(`join failed: ${status} ${text}`)
  return body
}

const heatmap = (code, token) =>
  api(`/api/rooms/${code}/heatmap`, { headers: bearer(token) })

async function main() {
  const room = await makeRoom('heatmap probe')
  // A second room exists only to mint a token that is genuinely valid — just not
  // for `room`. A forged or expired token exercises a different branch.
  const elsewhere = await makeRoom('somewhere else')

  const rooms = [room, elsewhere]
  try {
    const { totalSlots, slotsPerDay } = room
    console.log(
      `room ${room.code}: ${room.dates.join(', ')}, ` +
        `${slotsPerDay} slots/day, ${totalSlots} total\n`,
    )

    const ann = await join(room.code, 'Ann')
    const bob = await join(room.code, 'Bob')
    const stranger = await join(elsewhere.code, 'Stranger')

    // Overlapping but not identical, so the counts have to come out 0, 1 and 2
    // in different places. Both stay inside day 0.
    await api(`/api/rooms/${room.code}/submit`, {
      method: 'POST',
      headers: bearer(ann.token),
      body: JSON.stringify({
        busyMask: busyRange(totalSlots, 0, 10),
        sources: ['manual'],
      }),
    })
    await api(`/api/rooms/${room.code}/submit`, {
      method: 'POST',
      headers: bearer(bob.token),
      body: JSON.stringify({
        busyMask: busyRange(totalSlots, 5, 15),
        sources: ['manual'],
      }),
    })

    // --- the real call, and the two controls, together ---------------------
    const mine = await heatmap(room.code, ann.token)
    const foreign = await heatmap(room.code, stranger.token)
    const anonymous = await api(`/api/rooms/${room.code}/heatmap`)

    report(
      mine.status === 200,
      'a member of this room is served',
      `status ${mine.status}`,
    )
    report(
      foreign.status === 401,
      'a valid token for another room is refused',
      `status ${foreign.status}`,
    )
    report(
      anonymous.status === 401,
      'no token is refused',
      `status ${anonymous.status}`,
    )
    // The controls are only worth anything if they disagree with the real call.
    report(
      mine.status !== foreign.status && mine.status !== anonymous.status,
      'the controls differ from the genuine call',
    )

    if (mine.status !== 200) throw new Error('cannot continue without a heatmap')
    const h = mine.body

    // --- the overlay -------------------------------------------------------
    report(
      h.freeCounts.length === totalSlots,
      'freeCounts covers the grid',
      `${h.freeCounts.length} of ${totalSlots}`,
    )
    report(
      h.submittedCount === 2,
      'both submissions counted',
      `got ${h.submittedCount}`,
    )

    const expected = Array.from({ length: totalSlots }, (_, i) => {
      const annBusy = i < 10
      const bobBusy = i >= 5 && i < 15
      return 2 - (annBusy ? 1 : 0) - (bobBusy ? 1 : 0)
    })
    report(
      h.freeCounts.every((n, i) => n === expected[i]),
      'every slot matches the hand-computed overlay',
    )
    // Anchored so that "all zero equals all zero" cannot pass: the three
    // possible counts must each actually occur.
    const seen = new Set(h.freeCounts)
    report(
      seen.has(0) && seen.has(1) && seen.has(2),
      'the answer discriminates: 0, 1 and 2 all appear',
      `saw ${[...seen].sort().join(',')}`,
    )

    // --- privacy -----------------------------------------------------------
    // Content, not key names. Checking for `busy_mask` was the first version of
    // this and it is a fake guard: a leak under any other key sails past it,
    // which is exactly what happened when the check was tried against a route
    // deliberately leaking under `masks`. Anything the length of the grid made
    // only of 0 and 1 is a mask, whatever it is called.
    const maskShaped = mine.text.match(new RegExp(`[01]{${totalSlots}}`, 'g')) ?? []
    report(
      maskShaped.length === 0,
      'nothing mask-shaped appears in the body, under any key name',
      maskShaped.length ? `found ${maskShaped.length}` : '',
    )
    report(
      !mine.text.includes(busyRange(totalSlots, 5, 15)),
      "Bob's exact mask is not in the body",
    )
    report(
      h.participants.length === 2 &&
        h.participants.every(
          (p) => Object.keys(p).sort().join(',') === 'displayName,id,submitted',
        ),
      'members carry only id, name and a submitted flag',
      JSON.stringify(h.participants),
    )
    report(h.mySubmitted === true, 'mySubmitted reflects the caller')

    // --- best slots --------------------------------------------------------
    report(h.bestSlots.length > 0, 'best slots were found', JSON.stringify(h.bestSlots))
    report(
      h.bestSlots.every((s) => s.isEveryone && s.freeCount === 2),
      'the top runs are everyone-is-free',
    )
    report(
      h.bestSlots.every(
        (s) =>
          Math.floor(s.startSlot / slotsPerDay) ===
          Math.floor((s.endSlot - 1) / slotsPerDay),
      ),
      'no run crosses a day boundary',
    )
    // Slots 15..31 and 32..63 are both free for everyone. Reported as one run
    // they would be a 49-slot window spanning two calendar days.
    report(
      !h.bestSlots.some((s) => s.startSlot < slotsPerDay && s.endSlot > slotsPerDay),
      'the free time either side of midnight is two runs, not one',
    )

    // --- withdrawing -------------------------------------------------------
    await api(`/api/rooms/${room.code}/submit`, {
      method: 'DELETE',
      headers: bearer(bob.token),
    })
    const after = await heatmap(room.code, ann.token)
    report(
      after.body.submittedCount === 1,
      'withdrawing drops the count',
      `got ${after.body.submittedCount}`,
    )
    report(
      after.body.participants.find((p) => p.id === bob.participantId)?.submitted ===
        false,
      'the withdrawn member is listed as not submitted',
    )
    report(
      after.body.freeCounts.slice(10, 15).every((n) => n === 1),
      "Bob's slots went back to free-for-one",
    )
  } finally {
    for (const r of rooms) {
      await api(`/api/rooms/${r.code}`, {
        method: 'DELETE',
        headers: { 'x-owner-secret': r.ownerSecret },
      }).catch(() => {})
    }
  }

  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} failed`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
