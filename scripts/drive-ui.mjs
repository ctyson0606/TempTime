// The M1 acceptance test, driven in a real browser: two independent contexts,
// one room, asserting on what the DOM actually says rather than on what the
// components look like they should render.
//
//   npm run dev
//   node scripts/drive-ui.mjs                 # or BASE_URL=... to point elsewhere
//
// Day cells in the picker are the buttons carrying aria-pressed; the month
// arrows are not. Finding nothing here almost always means the selector is
// wrong rather than the element being absent.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const SHOTS = process.env.SHOT_DIR ?? '.'

let failures = 0
const report = (pass, label, detail = '') => {
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}

const browser = await chromium.launch()
// Two contexts, not two pages: separate localStorage is the whole point. This
// is the two-browser acceptance test from PLAN.md section 11, M1.
const alice = await browser.newContext()
const bob = await browser.newContext()

try {
  // --- Alice creates a room ------------------------------------------------
  const a = await alice.newPage()
  await a.goto(BASE)
  await a.getByPlaceholder('Weekend dinner').fill('Two browser test')

  // Day cells are the buttons carrying aria-pressed; the month arrows are not.
  const days = a.locator('button[aria-pressed]:not([disabled])')
  const total = await days.count()
  report(total > 0, 'the date picker offers selectable days', `${total} shown`)

  await days.nth(0).click()
  await days.nth(1).click()
  // The third comes from next month, so the room spans a gap of weeks — the
  // case the whole dayIndex model exists for.
  await a.getByRole('button', { name: 'Next month' }).click()
  await days.nth(0).click()

  const chosen = await a.locator('text=/^Selected: /').textContent()
  report(
    (chosen ?? '').split(',').length === 3,
    'three days are selected',
    chosen ?? '',
  )

  await a.getByRole('button', { name: 'Create room' }).click()
  await a.waitForSelector('text=Save your admin link', { timeout: 15000 })

  const code = (await a.locator('p.font-mono').first().textContent())?.trim() ?? ''
  report(
    /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/.test(code),
    'a room code is shown',
    code,
  )

  await a.getByRole('link', { name: 'Go to the room' }).click()
  await a.waitForSelector('input[placeholder="Your name"]', { timeout: 15000 })

  await a.getByPlaceholder('Your name').fill('Alice')
  await a.getByRole('button', { name: 'Join' }).click()
  await a.waitForSelector('text=Alice — you', { timeout: 15000 })
  report(true, 'Alice joins and the room names her')

  // The creator sees the admin bar; it is keyed on holding the owner secret.
  report(
    await a.getByText('You created this room').isVisible(),
    'the creator sees the admin controls',
  )

  // --- Bob opens the same room in a separate browser context ---------------
  const b = await bob.newPage()
  await b.goto(`${BASE}/r/${code}`)
  await b.waitForSelector('input[placeholder="Your name"]', { timeout: 15000 })

  const bobSeesTitle = await b
    .getByRole('heading', { name: 'Two browser test' })
    .count()
  report(bobSeesTitle > 0, "Bob's browser loads a room it never created")
  report(
    (await b.getByText('You created this room').count()) === 0,
    'Bob does not see the admin controls',
  )

  await b.getByPlaceholder('Your name').fill('Bob')
  await b.getByRole('button', { name: 'Join' }).click()
  await b.waitForSelector('text=Bob — you', { timeout: 15000 })
  report(true, 'Bob joins the same room')

  // Settle before capturing: a screenshot taken on the click catches CSS
  // transitions mid-flight and looks broken when it is not.
  await b.waitForTimeout(400)
  await b.screenshot({ path: `${SHOTS}/room-bob.png`, fullPage: true })

  // --- a reload keeps the same seat ---------------------------------------
  await b.reload()
  await b.waitForSelector('text=Bob — you', { timeout: 15000 })
  report(
    (await b.locator('input[placeholder="Your name"]').count()) === 0,
    'reloading does not ask Bob to join again',
  )

  // --- painting, sending, and getting it back ------------------------------
  await b.getByRole('button', { name: 'Paint by hand' }).click()
  // Scoped to the painter: the page draws a second grid for the heatmap, and
  // both fill their cells with data-slot. An unscoped [data-slot="4"] matches
  // two elements and Playwright refuses to guess which.
  const painter = b.getByRole('group', { name: 'Your free times' })

  // The empty grid now means "free at no point", which is destructive rather
  // than merely useless, so it cannot be sent. Asserted before anything is
  // painted, which is the only moment it is true.
  report(
    await b.getByRole('button', { name: 'Send my times' }).isDisabled(),
    'an empty selection cannot be sent',
  )

  const from = await painter.locator('[data-slot="4"]').boundingBox()
  const to = await painter.locator('[data-slot="8"]').boundingBox()
  await b.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await b.mouse.down()
  await b.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
  await b.mouse.up()

  // Free cells carry the painter's fill class; they are plain divs with no
  // pressed state, so counting the class is the only thing that reflects them.
  const freeCells = () =>
    painter
      .locator('[data-slot]')
      .evaluateAll(
        (cells) => cells.filter((c) => c.className.includes('bg-indigo-500')).length,
      )

  const painted = await freeCells()
  report(painted > 0, 'dragging marks slots on the grid', `${painted} cells`)

  // Invert is what replaces a busy/free mode, so it has to be arithmetic rather
  // than "something changed": every slot flips, and twice is a no-op.
  const gridCells = await painter.locator('[data-slot]').count()
  await b.getByRole('button', { name: 'Invert' }).click()
  const inverted = await freeCells()
  report(
    inverted === gridCells - painted,
    'invert flips every slot rather than some of them',
    `${inverted} = ${gridCells} - ${painted}`,
  )
  await b.getByRole('button', { name: 'Invert' }).click()
  report(
    (await freeCells()) === painted,
    'and inverting twice puts the selection back',
    `${painted} cells`,
  )

  report(
    await b.getByText('Not sent yet').isVisible(),
    'the room says nothing is sent yet',
  )
  await b.getByRole('button', { name: 'Send my times' }).click()
  await b.waitForSelector('text=Send again', { timeout: 15000 })
  report(true, 'sending succeeds and the button changes')

  // The real test of my-submission: wipe the draft, reload, and see whether
  // what comes back is what the server was told.
  const cleared = await b.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('temptime:free:'))
    for (const k of keys) localStorage.removeItem(k)
    return keys.length
  })
  // If the key is ever renamed again, this assertion is what stops the restore
  // check below from passing on a draft that was never cleared.
  report(
    cleared > 0,
    'the local draft was actually there to clear',
    `${cleared} key(s)`,
  )

  await b.reload()
  await b.waitForSelector('text=Send again', { timeout: 15000 })
  const restored = await freeCells()
  report(
    restored > 0 && restored === painted,
    'the sent mask comes back as free time after the local draft is cleared',
    `${restored} of ${painted}`,
  )

  await b.getByRole('button', { name: 'Withdraw' }).click()
  await b.waitForSelector('text=Not sent yet', { timeout: 15000 })
  report(true, 'withdrawing puts the room back to not-sent')

  // --- Alice deletes the room ---------------------------------------------
  await a.getByRole('button', { name: 'Delete room' }).click()
  await a.getByRole('button', { name: 'Yes, delete it' }).click()
  // Exact: "Room deleted" is a prefix of the notice Bob gets, and a substring
  // match would report success for either of two different screens.
  await a.getByRole('heading', { name: 'Room deleted', exact: true }).waitFor({
    timeout: 15000,
  })
  report(true, 'the creator can delete the room')

  await b.reload()
  await b
    .getByRole('heading', { name: 'Room deleted by its creator' })
    .waitFor({ timeout: 15000 })
  report(true, "Bob's next reload says the room was deleted by its creator")
  report(
    (await b.getByText('No such room').count()) === 0,
    'and does not send him looking for a typo',
  )
  await b.waitForTimeout(400)
  await b.screenshot({ path: `${SHOTS}/room-deleted.png`, fullPage: true })

  // --- a code that never existed ------------------------------------------
  // A fresh context: what separates this from the screen above is that this
  // browser was never a member, so it is a different context, not a new page.
  const stranger = await browser.newContext()
  const c = await stranger.newPage()
  await c.goto(`${BASE}/r/ZZZZZZ`)
  await c.getByRole('heading', { name: 'No such room' }).waitFor({ timeout: 15000 })
  report(true, 'an unknown code says no such room')
  report(
    (await c.getByText('deleted by its creator').count()) === 0,
    'and does not claim a room was deleted that never existed',
  )

  // --- an expired room reads differently again -----------------------------
  // The 410 is stubbed rather than planted. That a genuinely expired row
  // produces ROOM_EXPIRED is proven against the real database in
  // scripts/verify-purge.mjs; what is under test here is only that the page
  // says something different when it arrives, and planting one would mean
  // handing this script the database's secret key. One API path is
  // intercepted, not the platform's fetch — the same rule as routeWebSocket in
  // drive-heatmap.mjs.
  const d = await stranger.newPage()
  await d.route('**/api/rooms/ZZZZZY', (route) =>
    route.fulfill({
      status: 410,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'this room has expired', code: 'ROOM_EXPIRED' }),
    }),
  )
  await d.goto(`${BASE}/r/ZZZZZY`)
  await d.getByRole('heading', { name: 'Room expired' }).waitFor({ timeout: 15000 })
  report(true, 'an expired room says it expired')
  report(
    (await d.getByText('deleted by its creator').count()) === 0,
    'and does not blame a creator for a room that ran out of dates',
  )
  await stranger.close()
} catch (error) {
  // Without this the finally block below announces success for a run that
  // stopped halfway, which is worse than no output at all.
  failures++
  console.log(`\nABORTED  ${error.message.split('\n')[0]}`)
} finally {
  await browser.close()
  console.log(failures === 0 ? 'all checks passed' : `${failures} FAILED`)
}
