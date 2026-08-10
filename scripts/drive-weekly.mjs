// The weekly-timetable acceptance test, driven in a real browser.
//
//   npm run dev
//   node scripts/drive-weekly.mjs             # or BASE_URL=... to point elsewhere
//
// Development only — it creates two real rooms and deletes them at the end.
//
// The feature exists because an `.ics` cannot say "every Monday": every event in
// one is anchored to a real date, and a university export ends each course with
// UNTIL at the close of term. So the two things worth proving here are the two
// an import cannot do — one pattern reaching *several* Mondays in one room, and
// the same pattern still being there in the next room.
//
// Assertions are on counts rather than on "something changed". A pattern that
// marked every cell, or none, would satisfy "the grid looks different" and is
// exactly the plausible way this breaks.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const SHOTS = process.env.SHOT_DIR ?? '.'

let failures = 0
const report = (pass, label, detail = '') => {
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}

const api = async (path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

/**
 * Two Mondays and the Tuesday between them.
 *
 * The Tuesday is the control: a Monday pattern must leave it alone, and without
 * it "the pattern applied" is satisfied by a bug that marks every day.
 */
const dates = () => {
  const taipei = (date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  const day = new Date()
  // Next Monday, always in the future so the room is valid.
  do {
    day.setDate(day.getDate() + 1)
  } while (day.getDay() !== 1)
  const monday = new Date(day)
  const tuesday = new Date(day.getTime() + 86_400_000)
  const nextMonday = new Date(day.getTime() + 7 * 86_400_000)
  return [monday, tuesday, nextMonday].map(taipei)
}

const DAY_START_MIN = 480
const SLOT_MINUTES = 30
/** 10:00 and 10:30, as row offsets into a day that starts at 08:00. */
const FIRST_ROW = (600 - DAY_START_MIN) / SLOT_MINUTES
const LAST_ROW = FIRST_ROW + 1

const makeRoom = async (title) => {
  const created = await api('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({
      title,
      timezone: 'Asia/Taipei',
      dates: dates(),
      dayStartMin: DAY_START_MIN,
      dayEndMin: 1440,
    }),
  })
  if (created.status !== 201) {
    console.error(`could not create a room: ${created.status}`, created.body)
    process.exit(1)
  }
  return created.body
}

const join = async (page, code, name) => {
  await page.goto(`${BASE}/r/${code}`)
  await page.waitForSelector('input[placeholder="Your name"]', { timeout: 15000 })
  await page.getByPlaceholder('Your name').fill(name)
  await page.getByRole('button', { name: 'Join' }).click()
  await page.waitForSelector(`text=${name} — you`, { timeout: 15000 })
}

/** Drag from one cell to another inside a named grid. */
const drag = async (page, grid, fromSlot, toSlot) => {
  const box = async (slot) => {
    const cell = grid.locator(`[data-slot="${slot}"]`)
    await cell.scrollIntoViewIfNeeded()
    return cell.boundingBox()
  }
  const from = await box(fromSlot)
  const to = await box(toSlot)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 })
  await page.mouse.up()
}

const countCells = (grid, className) =>
  grid
    .locator('[data-slot]')
    .evaluateAll(
      (cells, name) => cells.filter((cell) => cell.className.includes(name)).length,
      className,
    )

const browser = await chromium.launch()
const context = await browser.newContext()
let first
let second

try {
  first = await makeRoom('Weekly pattern')
  const page = await context.newPage()
  await join(page, first.code, 'Student')

  const painter = page.getByRole('group', { name: 'Your free times' })
  await page.getByRole('button', { name: 'Paint by hand' }).click()

  // Everything free first, so what the pattern removes is unambiguous: any drop
  // in the count below is the pattern and nothing else.
  await page.getByRole('button', { name: 'Select all' }).click()
  const allFree = await countCells(painter, 'bg-indigo-500')
  const slotsPerDay = (1440 - DAY_START_MIN) / SLOT_MINUTES
  report(
    allFree === 3 * slotsPerDay,
    'the room starts with every slot free',
    `${allFree} of ${3 * slotsPerDay}`,
  )

  // --- painting a week ------------------------------------------------------
  await page.getByRole('button', { name: 'Weekly timetable' }).click()
  const week = page.getByRole('group', { name: 'Your usual week' })
  await week.waitFor({ timeout: 15000 })

  const weekCells = await week.locator('[data-slot]').count()
  report(
    weekCells === 7 * slotsPerDay,
    'the weekly grid is seven days on the room’s own time axis',
    `${weekCells} cells`,
  )
  // Weekday names, and no dates: a date here would invite the reader to think
  // the pattern is about that particular day.
  const headers = await week.locator('[data-slot]').first().isVisible()
  report(headers, 'the weekly grid is drawn')
  report(
    (await week.getByText('Mon', { exact: true }).count()) === 1 &&
      (await week.getByText(/^\d\d\/\d\d$/).count()) === 0,
    'its columns are weekdays without dates',
  )

  // Monday 10:00–11:00. Monday is the first column, so its slots start at 0.
  await drag(page, week, FIRST_ROW, LAST_ROW)
  const marked = await countCells(week, 'bg-rose-400')
  report(marked === 2, 'dragging marks the weekly pattern', `${marked} cells`)

  // Two Mondays in this room, two slots each. Asserting the arithmetic rather
  // than "some cells": a pattern applied to every day would give 6.
  const apply = page.getByRole('button', {
    name: /Take \d+ slots? out of my free time/,
  })
  report(
    (await apply.textContent())?.includes('Take 4 slots'),
    'the button says how much it will take from *this* room',
    (await apply.textContent())?.trim(),
  )

  const previewed = await countCells(painter, 'bg-rose-400')
  report(
    previewed === 4,
    'and the same four slots are previewed on the room’s own grid',
    `${previewed} cells`,
  )

  await apply.click()
  await page.waitForSelector('text=Your week is still saved', { timeout: 15000 })
  const afterApply = await countCells(painter, 'bg-indigo-500')
  report(
    afterApply === allFree - 4,
    'applying removes exactly those slots and nothing else',
    `${afterApply} of ${allFree}`,
  )

  // The control the whole feature turns on: the Tuesday between the two Mondays
  // must be untouched, or "it applied" is satisfied by marking everything.
  const tuesdayFree = await painter
    .locator('[data-slot]')
    .evaluateAll(
      (cells, [perDay, cls]) =>
        cells.slice(perDay, perDay * 2).filter((cell) => cell.className.includes(cls))
          .length,
      [slotsPerDay, 'bg-indigo-500'],
    )
  report(
    tuesdayFree === slotsPerDay,
    'the day between the two Mondays is untouched',
    `${tuesdayFree} of ${slotsPerDay}`,
  )

  await page.screenshot({ path: `${SHOTS}/weekly-applied.png`, fullPage: true })

  // --- it survives a reload -------------------------------------------------
  await page.reload()
  await page.waitForSelector('text=Student — you', { timeout: 15000 })
  await page.getByRole('button', { name: 'Weekly timetable' }).click()
  await week.waitFor({ timeout: 15000 })
  report(
    (await countCells(week, 'bg-rose-400')) === 2,
    'the pattern is still there after a reload',
  )
  await page.getByRole('button', { name: 'Done' }).click()

  // --- and it is there in the next room, which is the point of it ------------
  second = await makeRoom('Second room')
  await join(page, second.code, 'Student')
  await page.getByRole('button', { name: 'Weekly timetable' }).click()
  await week.waitFor({ timeout: 15000 })
  const carried = await countCells(week, 'bg-rose-400')
  report(
    carried === 2,
    'a different room opens with the same week already painted',
    `${carried} cells`,
  )
  // Nothing is free in this room yet, so there is nothing to take: the button
  // must say so rather than look like it works.
  report(
    await page
      .getByRole('button', { name: /Take 0 slots out of my free time/ })
      .isDisabled(),
    'and it offers to remove nothing until something has been offered',
  )
} catch (error) {
  failures++
  console.log(`\nABORTED  ${error.message.split('\n')[0]}`)
} finally {
  await browser.close()
  for (const room of [first, second]) {
    if (room === undefined) continue
    await api(
      `/api/rooms/${room.code}?secret=${encodeURIComponent(room.ownerSecret)}`,
      { method: 'DELETE' },
    ).catch(() => {})
  }
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} FAILED`)
  // Not process.exit(): it tears the process down while the driver's handles are
  // still closing, and libuv aborts on Windows.
  process.exitCode = failures === 0 ? 0 : 1
}
