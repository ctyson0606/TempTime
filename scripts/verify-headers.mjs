// Drives a real browser against the security headers.
//
//   npm run build && npx next start -p 3100
//   BASE_URL=http://localhost:3100 node scripts/verify-headers.mjs
//
// It must be a production server. Development relaxes the policy on purpose
// (lib/csp.ts), so a green run against `next dev` says nothing about what ships.
// The script refuses to run if it sees the development policy.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:3100'

let failures = 0
const report = (pass, label, detail = '') => {
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}

/** The values of one directive of a policy string. */
const directive = (policy, name) => {
  const found = policy
    .split(';')
    .map((p) => p.trim().split(/\s+/))
    .find((p) => p[0] === name)
  return found ? found.slice(1) : null
}

const browser = await chromium.launch()

try {
  // --- the headers themselves ----------------------------------------------
  const res = await fetch(BASE, { redirect: 'manual' })
  const csp = res.headers.get('content-security-policy') ?? ''

  if (csp.includes("'unsafe-eval'")) {
    throw new Error(
      'this is the development policy — run against `next build && next start`',
    )
  }

  report(csp !== '', 'a Content-Security-Policy is sent')
  report(
    (directive(csp, 'script-src') ?? []).some((v) => v.startsWith("'nonce-")),
    'script-src carries a nonce',
  )
  report(
    !(directive(csp, 'script-src') ?? []).includes("'unsafe-inline'"),
    'script-src does not permit inline script',
  )
  for (const [name, expected] of [
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY'],
    ['referrer-policy', 'no-referrer'],
    ['cross-origin-opener-policy', 'same-origin'],
  ]) {
    report(
      res.headers.get(name) === expected,
      `${name}: ${expected}`,
      res.headers.get(name) ?? 'absent',
    )
  }
  report(
    (res.headers.get('permissions-policy') ?? '').includes('geolocation=()'),
    'Permissions-Policy denies the features we never use',
  )
  report(
    (res.headers.get('strict-transport-security') ?? '').startsWith('max-age='),
    'HSTS is set in production',
  )
  report(
    res.headers.get('x-powered-by') === null,
    'the framework is not advertised',
    res.headers.get('x-powered-by') ?? '',
  )

  // A nonce reused across responses is a nonce an attacker can read off one
  // page and use on the next, which is the same as having none.
  const second = await fetch(BASE, { redirect: 'manual' })
  const nonceOf = (policy) =>
    (directive(policy, 'script-src') ?? []).find((v) => v.startsWith("'nonce-"))
  report(
    nonceOf(csp) !== nonceOf(second.headers.get('content-security-policy') ?? ''),
    'the nonce is different on the next request',
  )

  // The API is excluded from the proxy but must still carry the constant
  // headers, which come from next.config.ts.
  const api = await fetch(`${BASE}/api/rooms/ZZZZZZ`)
  report(
    api.headers.get('x-content-type-options') === 'nosniff' &&
      api.headers.get('referrer-policy') === 'no-referrer',
    'API responses carry the constant headers too',
    `status ${api.status}`,
  )

  // --- the policy as the browser applies it --------------------------------
  const page = await browser.newPage()
  const violations = []
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text())
  })
  page.on('pageerror', (e) => violations.push(`pageerror: ${e.message}`))

  await page.goto(BASE)
  // The date picker is drawn by a client component, so its buttons existing is
  // the evidence that hydration ran — that the page's own inline scripts were
  // not blocked by our own header. Checking for the heading would not: that is
  // in the server HTML and survives a page that never hydrated.
  await page.waitForSelector('button[aria-pressed]', { timeout: 15000 })
  report(true, 'the home page hydrates under the policy')
  report(violations.length === 0, 'no violations on the home page', violations[0] ?? '')

  // Every route the app serves, not just the busy one. The privacy page is
  // reached from the footer on every page, so a policy that broke it would be
  // found by whoever went looking for exactly the reassurance it offers.
  await page.getByRole('link', { name: 'Privacy' }).click()
  await page.waitForURL('**/privacy', { timeout: 15000 })
  await page.getByRole('heading', { name: 'Privacy', exact: true }).waitFor({
    timeout: 15000,
  })
  report(violations.length === 0, 'the privacy page loads clean', violations[0] ?? '')
  await page.goBack()
  await page.waitForSelector('button[aria-pressed]', { timeout: 15000 })

  // --- the control: prove the policy is enforced, not merely present -------
  //
  // Everything above passes on a page that hydrates. So would a policy the
  // browser silently ignored. These two are the outcomes that have to differ:
  // if an injected script runs, the header is decoration.
  const inlineRan = await page.evaluate(() => {
    const el = document.createElement('script')
    el.textContent = 'window.__csp_inline_ran = true'
    document.head.append(el)
    return window.__csp_inline_ran === true
  })
  report(!inlineRan, 'an injected inline script does not run')

  const externalBlocked = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const el = document.createElement('script')
        el.src = 'https://example.com/x.js'
        el.onload = () => resolve(false)
        el.onerror = () => resolve(true)
        document.head.append(el)
        setTimeout(() => resolve(true), 3000)
      }),
  )
  report(externalBlocked, 'a script from another origin is refused')

  // frame-ancestors, from the other side: a page of ours loaded in an iframe.
  const framed = await browser.newPage()
  await framed.setContent(`<iframe src="${BASE}" width="400" height="300"></iframe>`, {
    waitUntil: 'domcontentloaded',
  })
  await framed.waitForTimeout(1500)
  const frameLoaded = await framed.evaluate(() => {
    const frame = document.querySelector('iframe')
    try {
      return frame.contentDocument?.body?.childElementCount > 0
    } catch {
      return false
    }
  })
  report(!frameLoaded, 'the app refuses to be framed')

  // The two controls above each logged a violation, which is what "blocked"
  // sounds like from the console's side. Requiring exactly two before clearing
  // the list says both fired and nothing else did — a weaker `>= 2` would let
  // a genuine violation hide inside the count.
  report(
    violations.length === 2,
    'the controls logged their own two violations and no others',
    `${violations.length}`,
  )
  violations.length = 0

  // --- and the parts of the app the policy could break silently ------------
  // The QR code is a data: URL, and the Realtime socket is a wss: origin that
  // is not us. Both are one directive away from being blocked, and both fail
  // quietly: a blank dialog, and a room that just never updates.
  await page.getByPlaceholder('Weekend dinner').fill('Header check')
  const days = page.locator('button[aria-pressed]:not([disabled])')
  await days.nth(0).click()
  await page.getByRole('button', { name: 'Create room' }).click()
  await page.waitForSelector('text=Save your admin link', { timeout: 20000 })

  await page.getByRole('button', { name: 'Show QR' }).click()
  const qr = page.locator('img[alt^="QR code"]')
  await qr.waitFor({ timeout: 10000 })
  // Present is not enough: a blocked data: URL leaves a broken image with a
  // src and no pixels, which is what naturalWidth reads.
  const drawn = await qr.evaluate((img) => img.naturalWidth)
  report(drawn > 0, 'the QR image decodes under img-src', `${drawn}px`)
  await page.keyboard.press('Escape')

  await page.getByRole('link', { name: 'Go to the room' }).click()
  await page.waitForSelector('input[placeholder="Your name"]', { timeout: 15000 })
  await page.getByPlaceholder('Your name').fill('Probe')
  await page.getByRole('button', { name: 'Join' }).click()
  await page.waitForSelector('text=Probe — you', { timeout: 15000 })

  // The badge reads "Updating live" only once the socket reached SUBSCRIBED.
  // If connect-src were missing the wss: origin it would fall back to polling
  // after five seconds and the room would still work — which is exactly why
  // this needs asserting rather than eyeballing.
  await page
    .getByText('Updating live')
    .waitFor({ timeout: 15000 })
    .then(() => report(true, 'the Realtime socket connects under connect-src'))
    .catch(() =>
      report(
        false,
        'the Realtime socket connects under connect-src',
        'fell back to polling',
      ),
    )

  report(
    violations.length === 0,
    'no violations across the whole flow',
    violations.slice(0, 3).join(' | '),
  )
} catch (error) {
  failures++
  console.log(`\nABORTED  ${error.message.split('\n')[0]}`)
} finally {
  await browser.close()
  console.log(failures === 0 ? 'all checks passed' : `${failures} FAILED`)
  // Not process.exit(): the browser's handles are still closing and libuv
  // aborts on Windows if the process is torn down under them.
  process.exitCode = failures === 0 ? 0 : 1
}
