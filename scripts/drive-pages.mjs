// A room longer than one page, driven in a real browser: the calendar of its
// dates, zooming into a page of days, moving between pages, and the results
// following the same model.
//
//   npm run dev
//   node scripts/drive-pages.mjs              # or BASE_URL=... / DAYS=...
//
// Development only — it creates a real room and deletes it at the end. A room
// of more than seven days needs supabase/migrations/0004_room_days.sql applied;
// without it the create call fails on the CHECK constraint and this says so.
//
// The page size is read off the screen rather than assumed, so the same script
// covers whatever DAYS_PER_PAGE is. What it asserts about slot numbers is the
// load-bearing part: a cell on a later page must carry the index it would have
// on a grid of every day, because the mask, the heatmap counts and the server
// all index the whole room. A page that renumbered from zero would still paint,
// still look right, and send an answer about the wrong days.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const SHOTS = process.env.SHOT_DIR ?? '.'
const DAYS = Number(process.env.DAYS ?? 20)
const PER_DAY = 32 // 08:00–24:00 in half hours, as created below.
/** The day the probe zooms into: not the first, so a zero-based page would show. */
const PICKED = 2

let failures = 0
const report = (pass, label, detail = '') => {
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}

const fmt = (days) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + days * 86_400_000))

// A gap after every fifth day, so the room is not one contiguous run and a page
// crossing a gap has to draw the break.
const dates = Array.from({ length: DAYS }, (_, i) => fmt(3 + i + Math.floor(i / 5)))

const api = async (path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

/** Both ends on screen before either is measured; see drive-heatmap.mjs. */
const drag = async (page, grid, fromSlot, toSlot) => {
  await grid.locator(`[data-slot="${toSlot}"]`).scrollIntoViewIfNeeded()
  await grid.locator(`[data-slot="${fromSlot}"]`).scrollIntoViewIfNeeded()
  const from = await grid.locator(`[data-slot="${fromSlot}"]`).boundingBox()
  const to = await grid.locator(`[data-slot="${toSlot}"]`).boundingBox()
  const height = page.viewportSize().height
  if (from.y < 0 || to.y + to.height > height) {
    throw new Error(`slots ${fromSlot}–${toSlot} do not fit on screen together`)
  }
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
  await page.mouse.up()
}

/** Every cell's index in a grid, in DOM order. */
const slotsOf = (grid) =>
  grid
    .locator('[data-slot]')
    .evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute('data-slot'))))

const shadeOf = (locator) =>
  locator.evaluate((n) => getComputedStyle(n).backgroundColor)
/** The ring marking the days just viewed is a box-shadow, not a background. */
const ringOf = (locator) => locator.evaluate((n) => getComputedStyle(n).boxShadow)

/** How many cells of each distinct colour, largest group first. */
const histogram = async (grid) => {
  const shades = await grid
    .locator('[data-slot]')
    .evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).backgroundColor))
  const counts = new Map()
  for (const shade of shades) counts.set(shade, (counts.get(shade) ?? 0) + 1)
  return [...counts.values()].sort((x, y) => y - x)
}

const created = await api('/api/rooms', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Paging test',
    timezone: 'Asia/Taipei',
    dates,
    dayStartMin: 480,
    dayEndMin: 1440,
  }),
})
if (created.status !== 201) {
  console.error(`could not create a ${DAYS}-day room: ${created.status}`, created.body)
  if (created.status === 500 && DAYS > 7) {
    console.error('is supabase/migrations/0004_room_days.sql applied?')
  }
  process.exit(1)
}
const { code, ownerSecret } = created.body
const browser = await chromium.launch()

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const a = await context.newPage()
  await a.goto(`${BASE}/r/${code}`)
  await a.waitForSelector('input[placeholder="Your name"]', { timeout: 15000 })
  await a.getByPlaceholder('Your name').fill('Alice')
  await a.getByRole('button', { name: 'Join' }).click()
  await a.waitForSelector('text=Alice — you', { timeout: 15000 })

  // --- the calendar comes first ---------------------------------------------
  const paintCalendar = a.getByRole('group', { name: 'Pick days to paint' })
  const painter = a.getByRole('group', { name: 'Your free times' })
  await paintCalendar.waitFor({ timeout: 15000 })
  // Anchor before counting: a stale selector returns zero, and so would a
  // calendar that dropped every date.
  const offered = await paintCalendar.locator('button[data-date]').count()
  report(
    offered === DAYS,
    'the calendar offers every date the room covers',
    `${offered}`,
  )
  report((await painter.count()) === 0, 'and no grid is drawn until a date is picked')

  await a.waitForTimeout(300)
  await a.screenshot({ path: `${SHOTS}/pages-calendar.png`, fullPage: true })

  // --- zooming in ----------------------------------------------------------
  await paintCalendar.locator(`button[data-date="${dates[PICKED]}"]`).click()
  await painter.waitFor({ timeout: 5000 })
  const firstPage = await slotsOf(painter)
  const pageSize = firstPage.length / PER_DAY
  report(
    Number.isInteger(pageSize) && pageSize > 0 && pageSize < DAYS,
    'the zoomed grid draws a page of whole days, fewer than the room has',
    `${pageSize} days`,
  )
  report(
    Math.min(...firstPage) === PICKED * PER_DAY &&
      Math.max(...firstPage) === (PICKED + pageSize) * PER_DAY - 1,
    'the page starts on the picked date and keeps room-wide slot numbers',
    `${Math.min(...firstPage)}–${Math.max(...firstPage)}`,
  )
  const range = a.locator('[data-page-range]').first()
  report(
    (await range.textContent()).includes(
      `days ${PICKED + 1}–${PICKED + pageSize} of ${DAYS}`,
    ),
    'the pager says which days are in view',
    (await range.textContent()).trim(),
  )

  // --- painting on a page lands in the room's mask --------------------------
  const p0 = PICKED * PER_DAY
  await drag(a, painter, p0, p0 + 3)
  report(
    await a.getByText(`4 of ${DAYS * PER_DAY} slots marked free`).isVisible(),
    'four slots painted on a page count against the whole room',
  )

  // --- the next page is someone else's days ---------------------------------
  await a.getByRole('button', { name: 'Later' }).first().click()
  const secondPage = await slotsOf(painter)
  report(
    Math.min(...secondPage) === (PICKED + pageSize) * PER_DAY,
    'Later moves to the next page of days',
    `${Math.min(...secondPage)}–${Math.max(...secondPage)}`,
  )
  // The neighbour that must not be touched: nothing was painted here.
  const untouched = await histogram(painter)
  report(
    untouched.length === 1 && untouched[0] === secondPage.length,
    'and nothing painted on the first page shows up on it',
    untouched.join(),
  )

  await a.getByRole('button', { name: 'Earlier' }).first().click()
  const painted = await shadeOf(painter.locator(`[data-slot="${p0}"]`))
  report(
    painted === (await shadeOf(painter.locator(`[data-slot="${p0 + 3}"]`))) &&
      painted !== (await shadeOf(painter.locator(`[data-slot="${p0 + 4}"]`))),
    'Earlier comes back to the painted slots, still painted and no more',
  )

  // --- the last page runs short --------------------------------------------
  await a.getByRole('button', { name: 'All dates' }).first().click()
  await paintCalendar.waitFor({ timeout: 5000 })
  const viewed = await ringOf(
    paintCalendar.locator(`button[data-date="${dates[PICKED]}"]`),
  )
  report(
    viewed !==
      (await ringOf(paintCalendar.locator(`button[data-date="${dates[0]}"]`))) &&
      viewed ===
        (await ringOf(
          paintCalendar.locator(`button[data-date="${dates[PICKED + pageSize - 1]}"]`),
        )),
    'back on the calendar, the days just viewed are marked and the others are not',
  )
  await paintCalendar.locator(`button[data-date="${dates[DAYS - 1]}"]`).click()
  await painter.waitFor({ timeout: 5000 })
  const lastPage = await slotsOf(painter)
  report(
    lastPage.length === PER_DAY && Math.min(...lastPage) === (DAYS - 1) * PER_DAY,
    'picking the last date shows that one day',
    `${lastPage.length} cells`,
  )
  report(
    await a.getByRole('button', { name: 'Later' }).first().isDisabled(),
    'and there is no later page',
  )

  report(
    (await a.getByRole('button', { name: `Clear all ${DAYS} days` }).count()) === 1,
    'the whole-room actions say they reach every day, not the page',
  )

  // --- the results follow the same model -----------------------------------
  await a.getByRole('button', { name: 'Send my times' }).click()
  await a.waitForSelector('text=1 person has answered', { timeout: 15000 })

  // A second member, through the API: free for the same four slots as Alice,
  // and for four more on the next day that only he offers. That gives the
  // calendar three different things to say — everyone, one of two, nobody —
  // so a calendar that coloured every date alike, or counted the wrong day,
  // fails rather than agreeing with itself.
  const bob = await api(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: JSON.stringify({ displayName: 'Bob' }),
  })
  const bobFree = new Set([
    ...[0, 1, 2, 3].map((i) => p0 + i),
    ...[10, 11, 12, 13].map((i) => (PICKED + 1) * PER_DAY + i),
  ])
  const bobBusy = Array.from({ length: DAYS * PER_DAY }, (_, i) =>
    bobFree.has(i) ? '0' : '1',
  ).join('')
  const bobSent = await api(`/api/rooms/${code}/submit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bob.body.token}` },
    body: JSON.stringify({ busyMask: bobBusy, sources: ['manual'] }),
  })
  if (bobSent.status !== 200) throw new Error(`Bob could not submit: ${bobSent.status}`)
  await a.waitForSelector('text=2 people have answered', { timeout: 15000 })
  const resultsCalendar = a.getByRole('group', { name: "Overview of the room's dates" })
  report(
    (await resultsCalendar.count()) === 1,
    'the results open on their own calendar',
  )
  // --- the calendar says something about each date --------------------------
  const dateButton = (i) => resultsCalendar.locator(`button[data-date="${dates[i]}"]`)
  const dayNumber = (i) => dates[i].slice(8).replace(/^0/, '')
  const notes = await Promise.all(
    [PICKED, PICKED + 1, 0].map(async (i) =>
      (await dateButton(i).textContent()).trim(),
    ),
  )
  report(
    notes[0] === `${dayNumber(PICKED)}✓ 2/2` &&
      notes[1] === `${dayNumber(PICKED + 1)}1/2` &&
      notes[2] === `${dayNumber(0)}0/2`,
    'each date shows the most people free at once that day',
    notes.join(' | '),
  )
  const [both, one, none] = await Promise.all(
    [PICKED, PICKED + 1, 0].map((i) => shadeOf(dateButton(i))),
  )
  report(
    both !== one && one !== none && both !== none,
    'and everyone, one of two and nobody are three different colours',
    `${both} / ${one} / ${none}`,
  )
  const everyoneName = await dateButton(PICKED).getAttribute('aria-label')
  report(
    /everyone free \(2 of 2\) for 2h$/.test(everyoneName ?? ''),
    'a screen reader hears the same fact, with how long it lasts',
    everyoneName ?? '',
  )
  const summary = `All 2 who have answered are free at some point on 1 date of ${DAYS}.`
  report(
    (await a.getByText(summary, { exact: true }).count()) === 1,
    'a sentence above the calendar gives the answer before any date is opened',
  )
  // Each card keeps its own place: the painter is still on its last page.
  report(
    (await painter.count()) === 1 &&
      Math.min(...(await slotsOf(painter))) === (DAYS - 1) * PER_DAY,
    'and opening them did not move the painter',
  )

  // Only now back to the painter's calendar: the check above needs it zoomed.
  await a.getByRole('button', { name: 'All dates' }).first().click()
  await paintCalendar.waitFor({ timeout: 5000 })
  report(
    (await paintCalendar.locator('button[data-date]').first().textContent()).trim() ===
      dayNumber(0),
    'the calendar you paint from carries no counts — it is not a results view',
  )

  await resultsCalendar.locator(`button[data-date="${dates[PICKED]}"]`).click()
  const heat = a.getByRole('group', { name: "Everyone's free time" })
  await heat.waitFor({ timeout: 5000 })
  const heatSlots = await slotsOf(heat)
  report(
    Math.min(...heatSlots) === p0,
    'the results page starts on the picked date with room-wide numbers',
    `${Math.min(...heatSlots)}`,
  )
  // Four slots both are free for, four only Bob is, and the rest nobody: an
  // assertion about the arithmetic, not about there being some green on screen.
  const heatGroups = await histogram(heat)
  report(
    heatGroups.join() === `${heatSlots.length - 8},4,4`,
    'the overlay shows the four slots painted on the other page, and Bob’s four',
    heatGroups.join(),
  )

  // Everyone-free is a shape as well as a shade: a tick on exactly the slots
  // both are free for, and on none of Bob's own four. Counted on the grid so a
  // tick drawn everywhere, or nowhere, fails.
  const ticked = await heat
    .locator('[data-slot]')
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => getComputedStyle(n, '::after').content.includes('✓'))
        .map((n) => Number(n.getAttribute('data-slot'))),
    )
  report(
    ticked.join() === [p0, p0 + 1, p0 + 2, p0 + 3].join(),
    'only the slots everyone is free for carry a tick',
    ticked.join(),
  )
  const legend = (await a.locator('[data-legend]').textContent()).trim()
  report(
    /2 people have answered · Free at once:\s*0\s*1\s*✓?\s*all 2/.test(legend),
    'the key above the grid names what each colour means in people',
    legend,
  )

  const cell = heat.locator(`[data-slot="${p0 + 1}"]`)
  await cell.scrollIntoViewIfNeeded()
  const box = await cell.boundingBox()
  await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const readout = a.locator('[data-readout]')
  await a.waitForFunction(
    () =>
      /— everyone is free/.test(
        document.querySelector('[data-readout]')?.textContent ?? '',
      ),
    null,
    { timeout: 5000 },
  )
  const said = (await readout.textContent()).trim()
  const [, mm, dd] = dates[PICKED].split('-')
  report(
    said.startsWith(`${mm}/${dd}`) && said.includes('08:30'),
    'hovering a cell on a page names that cell’s own date and time',
    said,
  )

  await a.waitForTimeout(300)
  await a.screenshot({ path: `${SHOTS}/pages-zoomed.png`, fullPage: true })

  // --- a phone ------------------------------------------------------------
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const m = await phone.newPage()
  await m.goto(`${BASE}/r/${code}`)
  await m.waitForSelector('input[placeholder="Your name"]', { timeout: 15000 })
  await m.getByPlaceholder('Your name').fill('Phone')
  await m.getByRole('button', { name: 'Join' }).click()
  // Wait for the join itself, not for the calendar: a visitor who has not
  // joined yet sees the same calendar under the same name behind the join
  // dialog, so waiting for it proves nothing about the page a member uses. The
  // first run of this measured that one.
  await m.waitForSelector('text=Phone — you', { timeout: 15000 })
  const phoneCalendar = m.getByRole('group', { name: 'Pick days to paint' })
  await phoneCalendar.waitFor({ timeout: 15000 })
  const sideways = await m.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  report(
    sideways <= 0,
    'on a phone the calendar does not scroll the page sideways',
    `${sideways}px`,
  )
  const smallest = await phoneCalendar
    .locator('button[data-date]')
    .evaluateAll((nodes) =>
      Math.min(...nodes.map((n) => n.getBoundingClientRect().height)),
    )
  // The floor the other small controls are held to: min-h-9.
  report(
    smallest >= 36,
    'and every date is at least a 36px target',
    `${smallest.toFixed(1)}px`,
  )
  await m.screenshot({ path: `${SHOTS}/pages-phone.png`, fullPage: true })
  await phone.close()
} catch (error) {
  failures++
  console.log(`\nABORTED  ${error.message.split('\n')[0]}`)
} finally {
  await browser.close()
  await api(`/api/rooms/${code}`, {
    method: 'DELETE',
    headers: { 'x-owner-secret': ownerSecret },
  }).catch(() => {})
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} FAILED`)
  process.exitCode = failures === 0 ? 0 : 1
}
