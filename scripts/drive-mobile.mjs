// The mobile pass, driven on a real phone-sized touch context.
//
//   npm run dev
//   node scripts/drive-mobile.mjs             # or BASE_URL=... to point elsewhere
//
// Development only — it creates a real room through the UI and deletes it at the
// end.
//
// Touch is dispatched through CDP rather than through `page.mouse`, because the
// things that break on a phone are the ones a mouse cannot reproduce: whether a
// drag on the grid paints or scrolls the page is decided by `touch-action`, and
// a mouse never consults it. A synthetic PointerEvent from `evaluate` has the
// same problem — it arrives after the browser has already decided what the
// gesture meant.
//
// The room is built at the maximum seven days on purpose. That is the width the
// layout is worst at, and a probe on a two-day room would pass on a page that is
// unusable for the case the grid exists for.
import { chromium, devices } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const SHOTS = process.env.SHOT_DIR ?? '.'

let failures = 0
const report = (pass, label, detail = '') => {
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}

const phone = devices['iPhone 12']

/**
 * An element's box once it has stopped moving.
 *
 * This page updates itself after it loads — the transport badge resolves, the
 * member list fills in, the heatmap arrives — and each one shifts everything
 * below it. Waiting a fixed 500ms is a guess about how long that takes; sampling
 * until two consecutive reads agree measures it instead. Anything still moving
 * after the full budget is a finding, not something to tap at and hope.
 *
 * It does *not* fix the intermittent readout assertion below, and was kept only
 * because measuring beats guessing. That failure was chased far enough to rule
 * this out as its cause: the coordinate is identical on passing and failing
 * runs, the cell under it is the right one, and a native pointerdown listener
 * sees the event arrive on that cell — while `Heatmap`'s own `onPointerDown`
 * does not run at all, on roughly half of runs, in a production build as well as
 * in development. Unexplained. Do not "fix" it by waiting longer: the handler
 * never runs, so there is nothing to wait for.
 */
const stableBox = async (locator, { gap = 150, tries = 20 } = {}) => {
  let previous = null
  for (let i = 0; i < tries; i++) {
    const box = await locator.boundingBox()
    if (
      box !== null &&
      previous !== null &&
      Math.round(box.x) === Math.round(previous.x) &&
      Math.round(box.y) === Math.round(previous.y)
    ) {
      return box
    }
    previous = box
    await locator.page().waitForTimeout(gap)
  }
  throw new Error(`element never stopped moving after ${tries * gap}ms`)
}

/**
 * Does the *page* scroll sideways, and if so what is sticking out?
 *
 * The offenders are filtered to elements with no horizontally scrollable
 * ancestor: a grid wider than the screen inside its own scroller is the design,
 * not the bug, and listing it every time would bury the one element that is
 * actually pushing the document wide.
 */
const horizontalOverflow = (page) =>
  page.evaluate(() => {
    const doc = document.documentElement
    const scrollable = (el) => {
      for (let node = el.parentElement; node; node = node.parentElement) {
        const overflow = getComputedStyle(node).overflowX
        if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') {
          return true
        }
      }
      return false
    }
    const offenders = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
      .filter((el) => !scrollable(el))
      .slice(0, 4)
      .map((el) => {
        const cls = typeof el.className === 'string' ? el.className.slice(0, 48) : ''
        return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}@${Math.round(el.getBoundingClientRect().right)}`
      })
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders }
  })

/** Smallest side of every visible control, so a thumb-sized target can be checked. */
const tapTargets = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('button:not([disabled]), a[href]')]
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          text: (el.textContent ?? '').trim().slice(0, 24),
          w: Math.round(r.width),
          h: Math.round(r.height),
        }
      })
      .filter((t) => t.w > 0 && t.h > 0),
  )

const browser = await chromium.launch()
const context = await browser.newContext({ ...phone })
let code = ''

try {
  const page = await context.newPage()
  const touch = await context.newCDPSession(page)
  /** A real touch drag: down, a few moves, up. */
  const drag = async (from, to, steps = 6) => {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: from.x, y: from.y }],
    })
    for (let i = 1; i <= steps; i++) {
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: from.x + ((to.x - from.x) * i) / steps,
            y: from.y + ((to.y - from.y) * i) / steps,
          },
        ],
      })
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  // --- the create page ------------------------------------------------------
  await page.goto(BASE)
  await page.waitForSelector('button[aria-pressed]', { timeout: 15000 })

  const home = await horizontalOverflow(page)
  report(
    home.scrollWidth <= home.clientWidth + 1,
    'the create page does not scroll sideways',
    `${home.scrollWidth} vs ${home.clientWidth}${home.offenders.length ? ` — ${home.offenders.join(', ')}` : ''}`,
  )

  const days = page.locator('button[aria-pressed]:not([disabled])')
  const dayBox = await days.nth(0).boundingBox()
  report(
    Math.min(dayBox.width, dayBox.height) >= 32,
    'a day in the picker is big enough to tap',
    `${Math.round(dayBox.width)}x${Math.round(dayBox.height)}`,
  )

  // --- the privacy page, reached the way a reader would ---------------------
  // Checked before the room flow so the form is still empty and going back
  // costs nothing.
  await page.getByRole('link', { name: 'Privacy' }).click()
  await page.waitForURL('**/privacy', { timeout: 15000 })
  await page.getByRole('heading', { name: 'Privacy', exact: true }).waitFor({
    timeout: 15000,
  })
  // A specific claim, not just the page: a privacy page that renders its
  // headings and none of its content would pass a check for the title.
  report(
    (await page.getByText('one digit per half-hour slot').count()) > 0,
    'the privacy page explains what is actually sent',
  )
  const privacy = await horizontalOverflow(page)
  report(
    privacy.scrollWidth <= privacy.clientWidth + 1,
    'the privacy page does not scroll sideways',
    `${privacy.scrollWidth} vs ${privacy.clientWidth}${privacy.offenders.length ? ` — ${privacy.offenders.join(', ')}` : ''}`,
  )
  await page.goBack()
  await page.waitForSelector('button[aria-pressed]', { timeout: 15000 })

  await page.getByPlaceholder('Weekend dinner').fill('Mobile pass')
  // Seven days: the maximum, and the width the layout is worst at.
  for (let i = 0; i < 7; i++) await days.nth(i).click()
  const chosen = await page.locator('text=/^Selected: /').textContent()
  report(
    (chosen ?? '').split(',').length === 7,
    'seven days are selected',
    `${(chosen ?? '').split(',').length}`,
  )

  await page.getByRole('button', { name: 'Create room' }).click()
  await page.waitForSelector('text=Save your admin link', { timeout: 20000 })
  code = (await page.locator('p.font-mono').first().textContent())?.trim() ?? ''

  const created = await horizontalOverflow(page)
  report(
    created.scrollWidth <= created.clientWidth + 1,
    'the created-room panel does not scroll sideways',
    `${created.scrollWidth} vs ${created.clientWidth}${created.offenders.length ? ` — ${created.offenders.join(', ')}` : ''}`,
  )
  // The admin link is long, unbreakable and printed in full. If it is not
  // wrapped it is the single most likely thing to widen the page.
  await page.screenshot({ path: `${SHOTS}/mobile-created.png`, fullPage: true })

  // --- the room -------------------------------------------------------------
  await page.getByRole('link', { name: 'Go to the room' }).click()
  await page.waitForSelector('input[placeholder="Your name"]', { timeout: 15000 })
  await page.getByPlaceholder('Your name').fill('Phone')
  await page.getByRole('button', { name: 'Join' }).click()
  await page.waitForSelector('text=Phone — you', { timeout: 15000 })

  const room = await horizontalOverflow(page)
  report(
    room.scrollWidth <= room.clientWidth + 1,
    'the room page does not scroll sideways',
    `${room.scrollWidth} vs ${room.clientWidth}${room.offenders.length ? ` — ${room.offenders.join(', ')}` : ''}`,
  )

  // 36px is not borrowed from a platform guideline; it is the height the
  // primary buttons on this page already are. The rule is that nothing is a
  // smaller target than the controls the design already treats as tappable,
  // which is a threshold this codebase can defend rather than one it inherits.
  const small = (await tapTargets(page)).filter((t) => t.h < 36)
  report(
    small.length === 0,
    'no control is a smaller target than the primary buttons (36px)',
    small.map((t) => `${t.text}:${t.h}`).join(', '),
  )

  // --- the grid's own scroller ---------------------------------------------
  const painter = page.getByRole('group', { name: 'Your free times' })
  const scroller = await painter.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }))
  report(
    scroller.scrollWidth > scroller.clientWidth,
    'a seven-day grid overflows its own scroller rather than the page',
    `${scroller.scrollWidth} in ${scroller.clientWidth}`,
  )

  // The last day has to be reachable. A scroller that cannot actually be
  // scrolled to its end hides a whole column with no indication it exists.
  await painter.evaluate((el) => {
    el.scrollLeft = el.scrollWidth
  })
  const reached = await painter.evaluate(
    (el) => el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
  )
  report(reached, 'the grid scrolls as far as its last day')
  await painter.evaluate((el) => {
    el.scrollLeft = 0
  })

  // --- painting with a finger ----------------------------------------------
  const before = await page.evaluate(() => window.scrollY)
  const cell = (slot) => painter.locator(`[data-slot="${slot}"]`)
  const from = await cell(4).boundingBox()
  const to = await cell(8).boundingBox()
  await drag(
    { x: from.x + from.width / 2, y: from.y + from.height / 2 },
    { x: to.x + to.width / 2, y: to.y + to.height / 2 },
  )
  await page.waitForTimeout(200)

  const freeCells = () =>
    painter
      .locator('[data-slot]')
      .evaluateAll(
        (cells) => cells.filter((c) => c.className.includes('bg-indigo-500')).length,
      )
  const painted = await freeCells()
  report(painted > 0, 'a finger drag paints slots', `${painted} cells`)
  report(
    (await page.evaluate(() => window.scrollY)) === before,
    'and does not scroll the page while painting',
  )

  await page.getByRole('button', { name: 'Send my times' }).click()
  await page.waitForSelector('text=Send again', { timeout: 15000 })

  // --- the heatmap ----------------------------------------------------------
  const overlay = page.getByRole('group', { name: "Everyone's free time" })
  await overlay.waitFor({ timeout: 15000 })
  await overlay.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)

  const withHeatmap = await horizontalOverflow(page)
  report(
    withHeatmap.scrollWidth <= withHeatmap.clientWidth + 1,
    'the heatmap does not widen the page',
    `${withHeatmap.scrollWidth} vs ${withHeatmap.clientWidth}${withHeatmap.offenders.length ? ` — ${withHeatmap.offenders.join(', ')}` : ''}`,
  )

  // The readout is the only way to learn how many people a slot suits. On a
  // phone there is no hover, so a tap has to produce it — otherwise the
  // information exists only for people with a mouse.
  // The cell, not the group around it. Scrolling the group into view leaves the
  // cell itself below the fold with real coordinates that are off-screen, and
  // the tap then lands on whatever is there instead — which reads as "the
  // readout is broken" when it is the probe that missed.
  // Settle first. This page updates itself: the transport badge flips once the
  // socket resolves and the member list fills in, and either one shifts
  // everything below it. Waiting for the badge is a precondition rather than a
  // settle — it proves the transport resolved, not that the layout has stopped —
  // so the coordinate itself is taken from `stableBox`, which watches until the
  // cell stops moving.
  await page
    .getByText(/Updating live|Checking every few seconds/)
    .first()
    .waitFor({ timeout: 15000 })

  const slotCell = overlay.locator('[data-slot="4"]')
  await slotCell.scrollIntoViewIfNeeded()
  const target = await stableBox(slotCell)
  const point = { x: target.x + target.width / 2, y: target.y + target.height / 2 }

  // Belt to the braces: ask the page what is actually under the point about to
  // be touched. A stale coordinate then reports itself as a missed tap instead
  // of being blamed on the readout it was meant to test.
  const under = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y)
      return el?.closest('[data-slot]')?.getAttribute('data-slot') ?? 'nothing'
    },
    [point.x, point.y],
  )
  report(
    under === '4',
    'the point about to be tapped is over the intended slot',
    `${Math.round(point.x)},${Math.round(point.y)} → ${under}`,
  )
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(300)
  // Scoped to the readout itself. An unscoped text match finds the heading
  // "When everyone is free" and reports success whether or not this line ever
  // renders — which is what the first version of this assertion did.
  const readout = (await page.locator('[data-readout]').textContent()) ?? ''
  report(
    /\d+ of \d+ free|everyone is free \(|nobody is free/.test(readout),
    'tapping a slot reads it out',
    readout.slice(0, 60),
  )

  await page.screenshot({ path: `${SHOTS}/mobile-room.png`, fullPage: true })
} catch (error) {
  failures++
  console.log(`\nABORTED  ${error.message.split('\n')[0]}`)
} finally {
  await browser.close()
  if (code) console.log(`(room ${code} was left behind; it expires on its own)`)
  console.log(failures === 0 ? 'all checks passed' : `${failures} FAILED`)
  process.exitCode = failures === 0 ? 0 : 1
}
