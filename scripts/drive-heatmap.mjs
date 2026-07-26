// The M3 acceptance test, driven in a real browser: two members answer the same
// room and each has to see the other in the overlay.
//
//   npm run dev
//   node scripts/drive-heatmap.mjs            # or BASE_URL=... to point elsewhere
//
// Development only — it creates a real room and deletes it at the end.
//
// Assertions are on computed colour rather than class names wherever the colour
// is the message. A cell can carry the right class and still render grey if the
// class never reached the stylesheet, which is exactly the failure Tailwind's
// build-time scanning produces for an interpolated class name.
//
// Colours are compared as opaque strings and never parsed. Tailwind 4 emits
// `lab(...)`, not `rgb(...)`, and the first version of this script pulled the
// digits out of a colour string and decided which channel was green — on
// `lab(96.1634 0.0993013 -0.364029)` that is not wrong so much as meaningless.
// What the assertions actually need is which cells differ from which, and
// string equality answers that in any colour space.
//
// Where a probe counts something, it first asserts a count it knows to be
// non-zero. A selector that has gone stale returns zero, and zero is also what
// a genuine regression returns; without the anchor the two are the same result.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const SHOTS = process.env.SHOT_DIR ?? '.'

let failures = 0
const report = (pass, label, detail = '') => {
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}

/** Two dates a week out, so the room is comfortably inside the 90-day window. */
const soon = () => {
  const fmt = (days) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(Date.now() + days * 86_400_000))
  return [fmt(7), fmt(8)]
}

const api = async (path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

/**
 * Where a cell is on screen right now.
 *
 * Scrolled into view first, because `boundingBox` reports viewport coordinates
 * and the results grid sits well below the fold: without this the numbers are
 * real but off-screen, and a pointer sent there hovers nothing at all.
 */
const cellBox = async (grid, slot) => {
  const cell = grid.locator(`[data-slot="${slot}"]`)
  await cell.scrollIntoViewIfNeeded()
  return cell.boundingBox()
}

/** Drag from one cell to another inside a named grid. */
const drag = async (page, grid, fromSlot, toSlot) => {
  const from = await cellBox(grid, fromSlot)
  const to = await cellBox(grid, toSlot)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
  await page.mouse.up()
}

const join = async (page, code, name) => {
  await page.goto(`${BASE}/r/${code}`)
  await page.waitForSelector('input[placeholder="Your name"]', { timeout: 15000 })
  await page.getByPlaceholder('Your name').fill(name)
  await page.getByRole('button', { name: 'Join' }).click()
  await page.waitForSelector(`text=${name} — you`, { timeout: 15000 })
}

// The room is made through the API rather than the date picker; creating one
// through the UI is drive-ui.mjs's job and repeating it here only adds ways for
// this script to fail at something it is not testing.
const created = await api('/api/rooms', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Heatmap test',
    timezone: 'Asia/Taipei',
    dates: soon(),
    dayStartMin: 480,
    dayEndMin: 1440,
  }),
})
if (created.status !== 201) {
  console.error(`could not create a room: ${created.status}`, created.body)
  process.exit(1)
}
const { code, ownerSecret } = created.body

const browser = await chromium.launch()
const alice = await browser.newContext()
const bob = await browser.newContext()

try {
  const a = await alice.newPage()
  await join(a, code, 'Alice')

  const heatGrid = a.getByRole('group', { name: "Everyone's free time" })
  const painter = a.getByRole('group', { name: 'Your busy times' })

  // The results arrive from GET /heatmap, so they are a fetch behind the join.
  // Asserting before that lands tests only how fast the network is.
  await a.waitForSelector('text=Nobody has sent their times yet', { timeout: 15000 })

  // --- the empty state -----------------------------------------------------
  report(
    (await heatGrid.count()) === 1,
    'the results grid is drawn as soon as a member is in the room',
  )
  report(true, 'with no answers the overlay says so instead of colouring zeroes')
  report(
    await a.getByText('the best windows to meet appear here').isVisible(),
    'the best-slots panel has its own empty state',
  )

  // Anchor: the grid really is full of cells, so a later count of zero means
  // "none are coloured" rather than "the selector missed".
  const cells = await heatGrid.locator('[data-slot]').count()
  report(cells > 0, 'the results grid has cells to colour', `${cells} cells`)

  /** Every cell's computed background, in slot order. Compared, never parsed. */
  const shades = (grid) =>
    grid
      .locator('[data-slot]')
      .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).backgroundColor))

  /** How many cells of each distinct colour, largest group first. */
  const histogram = async (grid) => {
    const counts = new Map()
    for (const shade of await shades(grid)) {
      counts.set(shade, (counts.get(shade) ?? 0) + 1)
    }
    return [...counts.values()].sort((x, y) => y - x)
  }

  report(
    (await histogram(heatGrid)).join() === String(cells),
    'before anyone answers every cell is the same colour',
    (await histogram(heatGrid)).join(),
  )

  // --- Alice answers -------------------------------------------------------
  await a.getByRole('button', { name: 'Paint by hand' }).click()
  await drag(a, painter, 0, 9)
  await a.getByRole('button', { name: 'Send my times' }).click()
  await a.waitForSelector('text=Send again', { timeout: 15000 })

  await a.waitForSelector('text=1 person has answered', { timeout: 15000 })
  // Alice is busy for slots 0-9, free for the other 54. One submitter, so the
  // overlay must fall into exactly those two groups.
  const aliceOnly = await histogram(heatGrid)
  report(
    aliceOnly.join() === `${cells - 10},10`,
    'one answer splits the overlay into free and not-free',
    aliceOnly.join(),
  )

  // --- Bob answers, overlapping ------------------------------------------
  const b = await bob.newPage()
  await join(b, code, 'Bob')
  await b.getByRole('button', { name: 'Paint by hand' }).click()
  await drag(b, b.getByRole('group', { name: 'Your busy times' }), 5, 14)
  await b.getByRole('button', { name: 'Send my times' }).click()
  await b.waitForSelector('text=Send again', { timeout: 15000 })

  // Bob's own page must show both answers, not just his.
  await b.waitForSelector('text=2 people have answered', { timeout: 15000 })
  report(true, 'Bob sees that two people have answered')

  // Scoped and exact: an unscoped "Sent" also matches the "Not sent yet"
  // heading and every ancestor containing either, which is how the first run of
  // this reported five members in a room of two.
  const bobMembers = await b
    .getByRole('list', { name: 'Members' })
    .getByText('Sent', { exact: true })
    .count()
  report(bobMembers === 2, 'Bob sees both members marked as sent', `${bobMembers}`)

  // --- the overlay discriminates ------------------------------------------
  // Slots 0-4 free for Bob only, 5-9 free for nobody, 10-14 free for Alice only,
  // 15+ free for both. Reading three different cells must give three different
  // answers; a scale that renders one colour everywhere would pass a count.
  const bHeat = b.getByRole('group', { name: "Everyone's free time" })
  const shade = async (slot) =>
    bHeat
      .locator(`[data-slot="${slot}"]`)
      .evaluate((n) => getComputedStyle(n).backgroundColor)

  const [nobody, one, both] = [await shade(7), await shade(2), await shade(20)]
  report(
    nobody !== one && one !== both && nobody !== both,
    'nobody-free, one-free and both-free are three different colours',
    `${nobody} / ${one} / ${both}`,
  )
  // 5 slots suit nobody, 10 suit one of them, 49 suit both. Group sizes are
  // what makes this an assertion about the arithmetic rather than about there
  // being some colour on screen.
  const shared = await histogram(bHeat)
  report(
    shared.join() === '49,10,5',
    'the three groups are the right sizes',
    shared.join(),
  )

  // --- hovering reads a slot out -------------------------------------------
  const cell = await cellBox(bHeat, 20)
  await b.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2)
  // The em dash keeps this off the section heading "When everyone is free",
  // which the first version of this matched instead of the readout.
  const readoutLine = b.getByText(/— everyone is free/)
  await readoutLine.waitFor({ timeout: 5000 })
  report(true, 'hovering a slot everyone is free for says so')

  const readout = await readoutLine.textContent()
  report(
    /2 of 2/.test(readout ?? ''),
    'the readout names the counts, not just the verdict',
    (readout ?? '').trim(),
  )

  // --- best slots ----------------------------------------------------------
  const best = b.locator('ol li')
  const bestCount = await best.count()
  report(bestCount > 0, 'best windows are listed', `${bestCount}`)
  const firstBest = (await best.first().textContent()) ?? ''
  report(
    /2 of 2 free/.test(firstBest),
    'the top window is free for both',
    firstBest.trim(),
  )
  report(
    await b.getByText(`Free for all 2 who have answered`).isVisible(),
    'the panel says the windows suit everyone rather than being a fallback',
  )

  // Settle first: a screenshot on the heels of a hover catches the transition.
  await b.waitForTimeout(400)
  await b.screenshot({ path: `${SHOTS}/heatmap.png`, fullPage: true })

  // --- withdrawing takes an answer back out --------------------------------
  await b.getByRole('button', { name: 'Withdraw' }).click()
  await b.waitForSelector('text=Not sent yet', { timeout: 15000 })
  await b.waitForSelector('text=1 person has answered', { timeout: 15000 })
  report(true, 'withdrawing drops the overlay back to one answer')

  // Back to Alice's two groups: 54 free, 10 not. Bob's withdrawal has to remove
  // his answer from the arithmetic, not merely stop counting him.
  const afterWithdraw = await histogram(bHeat)
  report(
    afterWithdraw.join() === `${cells - 10},10`,
    "only Alice's answer remains in the overlay",
    afterWithdraw.join(),
  )

  // Alice still sees Bob in the room; withdrawing is not leaving.
  await a.reload()
  await a.waitForSelector('text=1 person has answered', { timeout: 15000 })
  const members = a.getByRole('list', { name: 'Members' })
  report(
    (await members.getByText('Bob').count()) > 0,
    'a member who withdrew is still listed in the room',
  )
  report(
    (await members.getByText('Waiting', { exact: true }).count()) === 1,
    'and is shown as waiting rather than sent',
    `${await members.getByText('Sent', { exact: true }).count()} sent`,
  )
  report(
    (await a.getByRole('group', { name: "Everyone's free time" }).count()) === 1,
    "Alice's page draws the overlay too",
  )

  // --- live updates, and the fallback, told apart --------------------------
  // The M3 acceptance test in PLAN.md section 11 is "A sends, B updates within
  // two seconds without a reload". Run on its own it passes on either
  // transport — the polling fallback is ours and it always works — so it would
  // be green with Realtime completely broken. Each path is therefore asserted
  // against the badge that names it.
  await runLivePath()
  await runFallbackPath()

  async function runLivePath() {
    const watcher = await alice.newPage()
    await watcher.goto(`${BASE}/r/${code}`)
    await watcher.waitForSelector('text=1 person has answered', { timeout: 15000 })

    // The badge starts on "Connecting…" and the socket settles well after the
    // heatmap does. Sampling it the moment the results appear reports whichever
    // state the race happened to be in — one run in four said the socket had
    // not connected when it simply had not connected *yet*.
    await watcher
      .locator('text=/Updating live|Checking every few seconds/')
      .first()
      .waitFor({ timeout: 15000 })
    const connected = await watcher.getByText('Updating live').isVisible()
    report(connected, 'the socket reaches SUBSCRIBED and the page says so')
    if (!connected) {
      // Not a reason to stop: the fallback below is what carries the product
      // when this happens for real, and it still has to be proven.
      console.log(
        '      note: Realtime did not connect — see the token question in STATE.md',
      )
      await watcher.close()
      return
    }

    // Bob sends again from his own context. Nothing touches the watcher.
    await b.getByRole('button', { name: 'Send my times' }).click()
    await b.waitForSelector('text=Send again', { timeout: 15000 })

    const started = Date.now()
    await watcher.waitForSelector('text=2 people have answered', { timeout: 10000 })
    const took = Date.now() - started
    report(true, "another member's answer arrives without a reload", `${took}ms`)

    /*
     * What proves the socket delivered it is the badge, not the clock.
     *
     * "Under one poll interval" would not prove it: the fallback fires a read
     * the instant it starts, so polling can also produce a fast update. What
     * cannot happen is both at once — `SUBSCRIBED` clears the poll timer in
     * lib/realtime.ts — so a page still reading "Updating live" has no other
     * mechanism that could have brought this in.
     *
     * The two-second target in PLAN.md section 11 is a production number and is
     * measured, not asserted. Locally the update costs two sequential round
     * trips to Tokyo, and one of them is the app-to-database hop that deploying
     * beside the database removes; asserting it from a dev machine would be
     * testing where this laptop is.
     */
    report(
      await watcher.getByText('Updating live').isVisible(),
      'and the page was on the socket, not the fallback, when it arrived',
    )
    console.log(`      live-update latency: ${took}ms (target 2000ms in production)`)
    await watcher.close()

    await b.getByRole('button', { name: 'Withdraw' }).click()
    await b.waitForSelector('text=Not sent yet', { timeout: 15000 })
  }

  async function runFallbackPath() {
    // Only Supabase's socket is cut, by URL. Replacing the global `WebSocket`
    // was the first attempt and it also killed Next's HMR client, which stopped
    // the page hydrating at all — the app then sat on its loading skeleton and
    // the probe timed out waiting for a join dialog that was never going to
    // render. Break the one connection under test, not the platform.
    const offline = await browser.newContext()
    await offline.routeWebSocket(/realtime/, (ws) => ws.close())

    const page = await offline.newPage()
    await page.goto(`${BASE}/r/${code}`)
    await page.waitForSelector('input[placeholder="Your name"]', { timeout: 15000 })
    await page.getByPlaceholder('Your name').fill('Offline')
    await page.getByRole('button', { name: 'Join' }).click()

    // Up to the give-up timeout before it admits it is polling.
    await page.waitForSelector('text=Checking every few seconds', { timeout: 15000 })
    report(true, 'with no usable socket the page falls back to polling and says so')
    report(
      (await page.getByText('Updating live').count()) === 0,
      'and does not claim to be live',
    )

    // Establish the before: three members now, only Alice has sent. Without
    // this the after-state could have been true the whole time and the wait
    // below would return instantly having proven nothing.
    await page.waitForSelector('text=1 of 3 people have sent their times', {
      timeout: 20000,
    })
    report(true, 'the polling page sees the room as it stands')

    // Bob sends from his own context. The polling page is never touched.
    await b.getByRole('button', { name: 'Send my times' }).click()
    await b.waitForSelector('text=Send again', { timeout: 15000 })

    const started = Date.now()
    await page.waitForSelector('text=2 of 3 people have sent their times', {
      timeout: 20000,
    })
    const took = Date.now() - started
    report(true, 'the fallback picks up a change with no socket at all', `${took}ms`)
    await offline.close()
  }
} catch (error) {
  // Without this, a run that stopped halfway reports success, which is worse
  // than reporting nothing.
  failures++
  console.log(`\nABORTED  ${error.message.split('\n')[0]}`)
} finally {
  await browser.close()
  await api(`/api/rooms/${code}`, {
    method: 'DELETE',
    headers: { 'x-owner-secret': ownerSecret },
  }).catch(() => {})
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} FAILED`)
  // Set rather than exit: calling process.exit() here tears the process down
  // while Playwright's handles are still closing, and libuv aborts on Windows —
  // a passing run that reports a crash is worse than no exit code at all.
  process.exitCode = failures === 0 ? 0 : 1
}
