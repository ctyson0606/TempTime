# STATE

> Last updated: 2026-08-11 (the weekly timetable is built and driven; the
> question the `.ics` crash raised is answered by building it)

Current working state of the project. Superseded content is deleted, not
archived — git holds the history. For durable rules and workflow, see
[METHOD.md](METHOD.md).

---

## Current Focus

**The app is deployed at `https://temp-time.vercel.app`, and what is deployed is
the free-time version.** Every milestone in `PLAN.md` §11 is complete, and so is
the product change that followed them: the grid collects the time someone *is*
free, and an import can only subtract from it (`PLAN.md` §3.4, §10, §14, and the
Recent Decisions below). All of it is committed, pushed, and verified against the
deployment rather than only against a laptop.

All three questions that could only be answered by publishing are now closed. The
nonce CSP does survive a CDN in front of it — the pages hydrate online, which is
not something a screenshot or a 200 could ever have shown. The daily purge route
works end to end, and the provider's own invoker does authenticate against it — a
manual run on 2026-08-07 returned `GET 200`; only the *scheduled* firing, as
opposed to a manual one, is still unobserved (see Next Steps). The live-update
latency is closed as measured rather than solved: 806ms from one machine and
1809ms from the other, both inside the two-second target, and the remaining
variation is the measuring machine's route rather than the application (see
Recent Decisions).

`PLAN.md` §12 has been run with a real second person on a different machine, and
it worked: the answer arrived with no reload, on the socket rather than the
fallback, within a second or two. That was the last step in the spec that had
never been executed.

The heatmap tap failure, open since 2026-08-02, is closed: it was
`scripts/drive-mobile.mjs` tapping a placeholder, not a defect in the app, and
the placeholder now carries a name of its own so the two grids cannot be
confused again (see Recent Decisions). Chasing it surfaced a real defect in
`GET /heatmap` — two halves of "who has answered" read from two tables, and a
window in which they disagreed — which is also fixed and proven both ways.

**The newest work is the weekly timetable**, chosen over starting the OAuth
connectors and built on 2026-08-11: a week painted once, kept on the device, and
subtracted from the free time in whichever room is open. It is the answer to the
thing an `.ics` structurally cannot say, and it came out of a real file that
could not be imported at all. Nothing is open and nothing is in flight. The next
body of work is the second-stage connectors, which publishing unblocked —
Google's OAuth review needs a reachable privacy page, and there now is one.

---

## Status

**Done**
- Two-file memory, a pointer-only `CLAUDE.md`, and a `temptime-engineer` agent
  definition.
- `PLAN.md` written, then revised for the room-lifetime and date-selection change
  (`PLAN.md` §14), for what actually got built, and for the renamed Supabase key
  pair (§13).
- Pure logic: `lib/dates.ts`, `lib/roomCode.ts`, `lib/slots.ts`,
  `lib/aggregate.ts`, `lib/ownerSecret.ts`, `lib/jwt.ts`, `lib/calendar.ts`,
  `lib/providers/manual.ts`, `lib/providers/ics.ts`, `lib/importCache.ts`.
- UI: create-room page with a month `DatePicker`, room page with a three-size
  grid, QR and admin links, join-by-name, owner-only delete, `ManualPainter`,
  `SourcePicker`, `PrivacyChecklist`, and send / send-again / withdraw — all
  talking to the real API through `lib/roomClient.ts`.
- `lib/roomSession.ts` holds what stays in this browser: token, participant id,
  owner secret, display name, and the unsent draft mask.
- Live Supabase project: schema, RLS, explicit grants and the hourly `pg_cron`
  purge, all applied and verified against the running database.
- Server plumbing: `lib/env.ts`, `lib/schemas.ts` (Zod), `lib/rateLimit.ts`,
  `lib/api.ts`, `lib/supabase/server.ts`.
- Routes: `POST /api/rooms`, `GET` and `DELETE /api/rooms/:code`,
  `POST /api/rooms/:code/join`, `POST` and `DELETE /api/rooms/:code/submit`,
  `GET /api/rooms/:code/my-submission`, `GET /api/rooms/:code/heatmap`.
- `fetchHeatmap` in `lib/roomClient.ts` and the results UI it feeds: `Heatmap`
  (five-step colour scale, hover readout, empty state), `BestSlots` and
  `MemberList`, all wired into `RoomView`.
- `lib/realtime.ts`: subscribes to `participants` for the room and refetches
  `/heatmap` on any change, falling back to polling every four seconds if the
  channel does not reach `SUBSCRIBED` within five. The pushed payload is
  discarded — answers keep their single route into a browser. `RoomView` shows
  which transport is live, and that badge is what proves the socket delivered
  anything, since `SUBSCRIBED` clears the poll timer and the two cannot overlap.
- `formatSlotWindow` in `lib/room.ts`, shared by the two components that print a
  time range so they cannot disagree about what the end of a day is called.
- `POST` and `GET /api/cron/purge`, the backup destruction path, with its
  credential in `lib/cronAuth.ts` and `vercel.json` scheduling it. Both verbs run
  one handler; the secret is read from `x-cron-secret` or a bearer token and both
  sides are hashed before `timingSafeEqual`, so there is no length check in front
  of the comparison to answer how long the real secret is.
- `RoomView` tells four kinds of absence apart and says something different for
  each: a room that ran out of dates, one deleted by its creator, that same
  deletion seen by the creator who did it, and a code nothing was ever stored
  under.
- Security headers. The one that cannot be constant — the CSP, whose script
  nonce is minted per response — is built in `lib/csp.ts` and attached in
  `proxy.ts` (Next 16's name for `middleware.ts`). The rest are in
  `next.config.ts`, where they also cover static assets and the API: nosniff,
  `X-Frame-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, COOP,
  HSTS in production, and `X-Powered-By` switched off. Development relaxes
  `script-src` and `connect-src` on purpose; production has neither
  `'unsafe-inline'` nor `'unsafe-eval'`.
- The mobile pass: nothing scrolls the page sideways at 390px, the seven-day grid
  overflows its own scroller and reaches its last day, a finger drag paints
  without scrolling, and no control is a smaller tap target than the primary
  buttons. Two fixes came out of it — `min-h-9` below `sm` on the three controls
  that were 20–28px, and a tap path for the heatmap readout.
- `app/privacy/page.tsx`, linked from a footer in `app/layout.tsx` so every route
  reaches it. Written against the schema and `lib/rateLimit.ts` rather than from
  the pitch, so it also states the unflattering parts: IP addresses counted in
  memory, room titles and display names stored verbatim, and an aggregate of one
  submitter being that submitter's answer.
- `README.md`: local setup, the Supabase project's two settings and three
  migrations, a second-machine section that skips all of that, the seven
  verification scripts, and the deployment compromises. Translated in full as
  `README.zh-TW.md` and `README.zh-CN.md`, cross-linked from a language line at
  the top of each. The three agree on 12 headings, 6 code blocks and 13 table
  rows, and their 16 lines of commands were diffed rather than read.
- Eight scripts that verify against the running system, all development-only
  because they write to the live database: `scripts/verify-rls.mjs` (the
  repeatable proof of `PLAN.md` §2.2), `scripts/drive-ui.mjs` (the M1
  acceptance test in two browser contexts, 25 assertions, also covering the
  four absence notices and the three one-shot painter actions),
  `scripts/verify-heatmap.mjs`
  (20 assertions over the overlay API, its privacy, its authorisation and the
  agreement between its member flags and its count),
  `scripts/drive-heatmap.mjs` (the M3 acceptance test, 28 assertions in two
  contexts, covering both the socket and the fallback, and that the empty
  overlay does not answer to the live one's accessible name),
  `scripts/verify-purge.mjs` (15 assertions over expiry, the credential and the
  cascade), `scripts/verify-headers.mjs` (22 assertions over the CSP and the
  security headers), `scripts/drive-mobile.mjs` (15 assertions in a phone-sized
  touch context; it waits for the heatmap's readout element before it taps,
  because the overlay's own accessible name is also carried by its placeholder —
  see Recent Decisions) and `scripts/drive-weekly.mjs` (12 assertions over the
  weekly timetable, in a room of two Mondays and the Tuesday between them, and
  across two rooms because outliving one is the whole point). They need a server running — `APP_URL=` for the API probes,
  `BASE_URL=` for the browser ones, and `verify-rls.mjs` needs neither because it
  talks to Supabase directly. `verify-headers.mjs` is the one that needs a
  **production** build rather than the dev server, since development relaxes the
  policy; it refuses to run if it sees the development policy at all. All but
  `verify-purge.mjs` and `verify-rls.mjs` create rooms against a limit of ten an
  hour, so a handful of runs an hour is the ceiling for those.
- 255 tests, with `format:check`, `lint` and `typecheck` clean. 236 of them were
  re-run on 2026-08-08 after a clean reinstall, on both machines, with all three
  checks green on Windows; the 19 added since cover the `.ics` import's
  robustness and the weekly pattern.
- **A weekly timetable**, the one input that outlives the room it was painted in.
  `lib/weekly.ts` converts between a painted week and a room's own grid;
  `lib/weeklyStore.ts` keeps it in `localStorage`. `WeeklyPainter` is the panel,
  reached from the source picker beside Paint by hand and Import .ics, and like
  an import it can only subtract. The drag itself moved to `GridPainter`, shared
  with `ManualPainter`, when this second grid made it a second caller. Also
  touched: `ProviderId` and the submit schema gained `weekly`, `deriveSources`
  reads the pattern from the device, `SlotGrid` gained `weekdayOnly`, and the
  privacy page names it as the one thing kept for longer than a room.
- **Development runs on two machines**, a Windows desktop and a MacBook Air, both
  against the same Supabase project. Setting the second one up needed a clone,
  `npm install`, `npx playwright install chromium` for the driver scripts, and
  two files carried by hand — `PLAN.md` and `.env.local`, neither of which a
  clone brings. Verified there on 2026-08-08 in three widening steps: 236 tests
  (code and dependencies), `verify-rls.mjs` 9/9 (four of the five credentials,
  and the RLS guarantees on the live database), and a room created through the
  dev server (the whole path). On 2026-08-09 the browser scripts joined that
  list: `drive-mobile.mjs` against the local dev server and `drive-heatmap.mjs`
  against the deployment. `npx playwright install chromium` had to be run a
  second time first — the lockfile repair moved the library, and its pinned
  browser build moved with it, so four runs died before any assertion.
  `CRON_SECRET` is the one variable nothing has
  exercised there; it is needed only by `verify-purge.mjs`, and a wrong value
  fails loudly as a 401.
- Deployed on Vercel (Hobby, team `ctyson`, project `temp-time`). Functions are
  pinned to Tokyo `hnd1`, beside the database; all five variables from
  `.env.example` are set for Production and Preview; `vercel.json`'s daily cron
  is registered from the repository with no dashboard configuration.
  Development and production share one Supabase project.
- The deployment is verified, not assumed, and the run that counts is the one
  taken **after** the free-time flip: against `https://temp-time.vercel.app`,
  `drive-ui.mjs` 25/25 and `drive-heatmap.mjs` 27/27 including both transports,
  with the live update at 806ms; re-run from the MacBook on 2026-08-09, 27/27
  again with the live update at 1809ms and the fallback at 3326ms.
  `verify-headers.mjs` 22/22 was taken before the
  flip and nothing it covers changed. `drive-ui.mjs` is the one that mattered —
  dragging, sending and deleting are impossible on a page that has not hydrated,
  so passing them is the proof that the nonce CSP works behind a CDN. The purge
  route answered 401 with no credential, 401 with a wrong one, and
  `200 {"ok":true,"deleted":0}` with the real one over `GET` + bearer, which is
  exactly how Vercel Cron calls it.
- Vercel's own invoker authenticates against that route. Pressing **Run** on the
  Cron Jobs settings page on 2026-08-07 produced `GET 200 /api/cron/purge` in the
  runtime logs, so the platform does send `CRON_SECRET` as a bearer token and our
  branch accepts it. The 200 carries weight only because the negative controls
  were run first against the same deployment — no credential and a wrong
  credential both returned 401 — so the route is not something that answers 200
  to everything.
- `PLAN.md` §12, the two-browser test, run on 2026-08-05 with a second person on
  their own machine. Reported: the room updated on its own with no reload, the
  badge read "Updating live" — so the Realtime socket, not the four-second
  polling fallback — and it felt like a second or two. Observed by the user, not
  instrumented; there is still no measured production figure (see Open
  Questions).
- The grid collects free time. The browser holds a free-time mask; `invertMask`
  converts it to `busy_mask` immediately before a submission leaves and
  immediately after `my-submission` comes back, and nothing else in the system
  changed meaning — schema, constraints, RLS, API contract, `lib/aggregate.ts`
  and the three `verify-*.mjs` scripts were all swept and are untouched.
  `subtractMask` is how an import lands. `ManualPainter` carries Select all,
  Invert and Clear all; there is no busy/free mode. The draft key moved from
  `temptime:draft:` to `temptime:free:` so a pre-flip draft cannot be read
  inverted. All three driver scripts were swept for the painter's accessible name
  and every one of them now asks for `Your free times`; `drive-heatmap.mjs`
  needed more than the label, because which slots suit whom inverted with it.
- Milestone coverage: `PLAN.md` §11 holds the per-item state; do not duplicate it
  here. M1 through M4 are all complete, acceptance tests included. The six
  free-time items added to M2 on 2026-08-05 had been left unticked there while
  this file called the flip finished, so §11 was the one per-item record and it
  was wrong in the "not done" direction; corrected on 2026-08-09 after checking
  each of the six against the code rather than against this file.

**In Progress**
- Nothing. The repository, the deployment and this file agree.

**Blocked**
- Nothing waits on an outside decision. One item waits on somebody else's queue
  and has not been entered yet: Google's sensitive-scope review and TickTick's
  API application, both of which have to be applied for before the connector
  work they gate can be finished. See Next Steps.

---

## Next Steps

1. Apply for the slow OAuth access now, before writing any of it. Google's
   sensitive-scope review and TickTick's API application are queues measured in
   weeks of somebody else's time, and Google's precondition — a reachable
   privacy page — is satisfied as of 2026-08-05. Applying first turns the wait
   into the development window instead of a gap after it.
2. Then the second-stage connectors, in the order `PLAN.md` §8.2 argues for:
   Todoist first because it needs nothing but OAuth, Google next because its
   sensitive-scope review is a queue rather than a build, TickTick last because
   its API application has no predictable timeline. Apply for the slow ones early
   and write while waiting. One question is unanswered before any of it starts —
   there is no account system, so where an OAuth refresh token would live has to
   be decided rather than assumed. Keeping it in the tab, and never on the
   server, is the answer consistent with `PLAN.md` §2.1.
3. Optional, and only inside a one-hour window: watch one *scheduled* purge fire.
   The credential question is answered — see Done — but by a manual Run rather
   than by the scheduler. The remaining gap can only be closed by being present
   while the evidence exists: the job fires between 04:00 and 04:59 UTC, and this
   plan keeps runtime logs for one hour, so 05:00–05:59 UTC — 13:00–13:59 in
   Taipei — is the only window in which the record can be read. Everything else
   here is proven, `pg_cron` deletes the same rows hourly regardless, and the only
   thing that could newly break it is `CRON_SECRET` changing. Worth one look if
   convenient; deliberately not worth building durable logging for (see Recent
   Decisions).

---

## Open Questions

- **Why did the first ever subscription deliver nothing?** Unexplained, and not
  currently reproducible. The channel reported `SUBSCRIBED` and no event
  ever arrived; a plausible cause was found, fixed, and then disproved by putting
  it back and watching three runs pass anyway. It has not recurred in a dozen runs
  since. A cold Realtime service fits the evidence better than anything else
  proposed. Worth remembering rather than chasing: if it returns, this is the
  paragraph that says it has happened before, and the polling fallback is what
  keeps the room working while it is diagnosed.
- **How should the scale read with very few submitters?** With two people the
  levels in use are the third and the fifth, so "one of two is free" already looks
  fairly strong. It is legible and nobody has complained; whether it should
  stretch to the ends of the scale instead is a judgement to make while looking at
  a real room with three or four people in it.

---

## Known Annoyances

- **The free Supabase project pauses after a week idle**, while rooms can live
  for months. A room that will not load is worth checking in the dashboard before
  it is debugged as a bug.
- **Nothing on Vercel Hobby remembers a cron run for longer than an hour.** The
  Cron Jobs settings page shows the path, the expression and two buttons — Run
  and View Logs — and no outcome for any past invocation; runtime logs are
  retained for one hour on this plan. A daily job therefore cannot be audited
  after the fact, and the empty log list that results looks like success. Hobby
  also spreads the trigger across the whole named hour rather than firing on the
  minute. The general rule is in METHOD.md → Verification.
- `npm audit` reports high-severity advisories, all transitive inside Next.js's
  own pinned dependencies. `npm audit fix --force` resolves them by downgrading
  Next.js to 9.3.3, so the correct action is to leave them and wait for a Next.js
  patch.
- The grid card sizes itself to its widest child, so opening the privacy
  checklist widens the card and the grid looks off-centre until it closes. The
  source picker is now the widest child at rest, because it gained a sixth
  button on 2026-08-11, so a narrow room sits noticeably right of centre even
  with nothing open. Fixing it means deciding what the card's width should be
  driven by, which is more than a class change.
- The count under the grid — "N of M slots marked free" — updates on release,
  not during a drag. The cell colours already preview the change; a count that
  jumps while dragging was judged noisier than useful.

---

## Recent Decisions

- **2026-08-11 — The weekly timetable is built, and it is kept on the device
  rather than in the room.** Chosen by the user over starting the OAuth
  connectors. The case that decided it: a real HKUST export ends every course
  with `UNTIL` at the close of term, so a timetable stops importing the day term
  ends, while "Mondays, two till six" does not expire — and an `.ics` has no way
  at all to say the latter. `localStorage`, not the `sessionStorage` the import
  cache uses, was the user's call and is the whole value: a pattern that died
  with the tab would be repainted per room, which is barely better than painting
  the room. What that buys is stated on the privacy page. What is stored is
  weekday and clock time only — no titles — and it is stored as minutes rather
  than as a mask, because a mask is shaped by one room's day window and the
  pattern has to survive the next one. The general rule is in METHOD.md →
  Conventions.
- **2026-08-11 — The drag moved into `GridPainter` when the second grid needed
  it, not before.** Copying forty lines of pointer handling into the weekly
  painter would have left two versions of the one gesture that is hardest to get
  right on a phone, and they would have drifted where no test looks. What stayed
  above the extraction is everything that differs: the colours, the counts, and
  every word. `ManualPainter` and `WeeklyPainter` share the gesture and nothing
  else. All four driver scripts were re-run after the refactor rather than
  reasoned about.
- **2026-08-10 — One unreadable event costs one event, not the whole `.ics`.**
  A real HKUST timetable export writes `EXDATE;TZID=Asia/Hong_Kong:20260619` —
  a TZID makes the values date-*times*, and the values are bare dates — so
  ical.js throws `invalid date-time value` on the first `iterator()` call. The
  throw escaped `parseIcs`, whose guard covered only the initial parse, and
  landed in `void read(file)`, where it rejected a promise nobody awaits: the
  import button did nothing at all, with no error and no message. Expansion is
  now guarded per event and reported as `skipped.unreadable`, and `BusyInput`
  catches as a backstop. Repairing the malformed `EXDATE` and recovering those
  events was considered and not done: it would silently mark the excluded weeks
  as busy, and that is a judgement to take deliberately rather than while fixing
  a crash. Every event now also leaves a trace — a recurrence that ends before
  the room used to produce zero blocks and zero reasons, which reads exactly like
  an empty file. Both fixes have a test and both tests were sabotaged. The
  general rules are in METHOD.md → Conventions and → Verification.
- **2026-08-10 — `GET /heatmap` derives "who answered" from the submissions, not
  from `participants.submitted_at`.** The two were read in two concurrent
  queries while `POST /submit` wrote them in two separate statements, so a read
  in between returned `submittedCount: 2` beside a member the list still called
  Waiting — the page said "2 people have answered" next to a row reading
  "Waiting". Found at roughly one run in four in `drive-heatmap.mjs`, then made
  deterministic: hold the window open, fire the submit without awaiting it, and
  read from a *third* caller. Disagrees every time without the fix, agrees every
  time with it, and `drive-heatmap.mjs` went from 2 failures in 8 to 0 in 8.
  Wrapping the two writes in a transaction was rejected as the smaller fix — it
  narrows the window instead of removing it, and the reader would still be
  making two queries. `submitted_at` is still written and still the column
  Realtime watches; nothing else about it changed. `verify-heatmap.mjs` gains
  the invariant. The general rule is in METHOD.md → Conventions, and what the
  first failed sabotage taught is in Verification.
- **2026-08-10 — The heatmap's empty state gets an accessible name of its own,
  sharing no words with the live one.** It is `Results, no answers yet` against
  `Everyone's free time`. Adding to the live name rather than replacing it was
  rejected outright: role-name matching is substring-based, so
  `Everyone's free time (nothing yet)` would still answer to a search for the
  live name and would have fixed nothing. This closes the app-side half of the
  tap failure — the probe-side half was fixed the day before — and it is a real
  accessibility fix rather than a test convenience, because a screen reader
  announced an inert grid and a live one identically. `drive-heatmap.mjs` gains
  the assertion that the empty grid does **not** answer to the live name, which
  is what stops the two drifting back together. Its cell-count anchor moved to
  the empty grid at the same time and caught the omission on the first run,
  which is the whole reason that anchor exists. The general rule is in
  METHOD.md → Conventions.
- **2026-08-09 — The heatmap tap failure was the probe, and the fix is one wait
  rather than any change to the app.** `Heatmap` renders its grid in both states,
  and the placeholder — `role="group"`, `aria-label="Everyone's free time"`, the
  same `data-slot` cells — carries no pointer handlers and no readout. Sending
  returns before the overlay has re-read `/heatmap`, so waiting for that group
  proved only that the page had rendered; the probe then measured a cell on the
  inert copy and tapped it. Instrumented, the tap dispatches normally, reaches
  `document`, and `elementFromPoint` resolves to the right cell — while the
  readout element does not exist at that moment and "Nobody has sent their times
  yet" is on the page. The machine difference was the round trip to Tokyo, 0.8s
  here against 0.52s on Windows, deciding whether the fetch had landed; the
  Chromium version the two machines disagreed on was irrelevant. `drive-mobile.mjs`
  now waits for `[data-readout]`, which only the loaded state renders. Proven both
  ways: five consecutive passes with the wait, three consecutive failures with it
  removed. The app is unchanged on purpose — a real finger has never missed,
  because a person taps a grid they can see has answers in it. The general rules
  are in METHOD.md → Verification.
- **2026-08-09 — The live-update latency question is closed as measured, and the
  London routing is deliberately not chased.** Two figures now exist against the
  deployment from two machines — 806ms and 1809ms — and both are inside the
  two-second target, which is what the target was for. The gap between them is
  the measuring machine, not the application: on the MacBook, over one warm
  connection, a CDN-cached static asset costs 0.27–0.36s while a dynamic 404 that
  reaches the function in Tokyo costs 0.64–1.15s, so a live update is about one
  function-tier round trip plus the `/heatmap` refetch. The one thing that did
  change: `x-vercel-id` reads `lhr1::hnd1::…` from **both** machines, so entering
  Vercel's network in London is a property of this network path rather than of
  the Windows machine, which is how the earlier note read it. The user's call was
  not to pursue it — nothing in the codebase can move where a request enters a
  CDN, and the number it produces is already inside target. Reopen only if a
  figure from somewhere else lands outside two seconds. The general rules, both
  the cold-floor mistake and the one-floor-per-tier correction, are in METHOD.md
  → Verification.
- **2026-08-09 — `PLAN.md` §11 M2 is corrected rather than left to the reader.**
  The six free-time items added on 2026-08-05 were still unticked four days after
  they shipped and were verified. This file explicitly delegates per-item
  milestone state to §11, so §11 was the only record and it said the work was not
  done. Each item was checked against the code before ticking — the painter's
  three one-shot actions, `invertMask` at the two conversion points,
  `subtractMask` on import, the disabled send with its explanation, and the copy
  sweep — and a `目前狀態` paragraph now names `drive-ui.mjs` as what executes the
  added acceptance, including why clearing the local draft before the reload is
  the step that gives it any power.
- **2026-08-08 — The README is translated into both Chinese scripts, and the
  language rule gains its first exception.** Asked for directly by the user. The
  English-only rule was written for working output — memory, specs, comments,
  commit messages — where a second copy is a second store that drifts, and that
  reasoning does not reach a document whose whole purpose is to be read by
  someone else. The cost was named before it was paid rather than discovered
  after: every README change is now three changes, and nothing in the test suite
  can see the three disagree. Accepted on the grounds that this README changes
  rarely. If it stops being worth it, the cheap retreat is to cut the two Chinese
  files back to a quick-start and point the detail at the English one. The
  general rule is in METHOD.md → Workflow → Language rule, and how a translation
  is checked is in Verification.
- **2026-08-08 — A second machine is set up by copying two files by hand, and the
  tool built to automate it was deleted.** A clone brings everything except the
  git-ignored files, and only two of those cannot be regenerated: `PLAN.md` and
  `.env.local`. Everything else ignored — `node_modules`, `.next`,
  `next-env.d.ts`, `tsconfig.tsbuildinfo`, the driver screenshots — is
  platform-native or path-bearing and has to be rebuilt rather than carried. A
  bundle script that packed the two into one text file, with hashes and drift
  detection, was written and verified and then reverted at the user's word as
  more machinery than the job needs; the general form is in METHOD.md →
  Anti-Patterns. Playwright's browsers are the one thing outside both git and
  `node_modules`, so `npx playwright install chromium` is a separate step on any
  new machine.
- **2026-08-08 — The lockfile repaired on macOS was committed back, not left
  local, and the commit was proved on Windows.** `npm ci` failed on the MacBook
  because `package-lock.json` had been generated on Windows and lacked a
  darwin-side optional dependency. Keeping two platform lockfiles was never
  considered — the repaired one is a superset, and the entry it gains is marked
  `"optional": true`, so Windows skips it. The diff also removed thirteen
  `"peer": true` lines, which is npm correcting its own stale metadata and
  changes no version. That reasoning was checked rather than trusted: `npm ci`
  was run on Windows against the pulled lockfile and succeeded, followed by 236
  tests and a clean `lint`, `typecheck` and `format:check`. The general rule is
  in METHOD.md → Conventions.
- **2026-08-07 — The purge route is not given durable run logging, and the
  scheduler question is closed by a manual Run instead.** Writing a timestamp on
  every successful purge would make the job auditable at any time, which is the
  thing Hobby's one-hour log retention denies. It was rejected as
  disproportionate: the primary destruction path is `pg_cron`, this route is the
  backup, and the only failure mode left after the manual Run returned `GET 200`
  is somebody changing `CRON_SECRET`, which does not happen on its own. Revisit
  if the backup ever becomes the primary, or if a second scheduled job appears —
  at two jobs the durable trace stops being a one-off and starts being
  infrastructure.
- **2026-08-05 — The grid collects free time, not busy time.** Three reasons, in
  the order they carry weight: people answer "when are you free" accurately and
  "when are you busy" approximately; an hour with nothing on the calendar is not
  an hour someone is available, so the old model systematically over-reported
  availability in the expensive direction; and painting free time sends *less*,
  because nobody paints the whole complement — you mark the few windows that suit
  you and the rest goes out as unavailable without saying why. The manual path is
  now deliberately the same gesture as When2meet; the difference the product
  sells is that a calendar can carve time back out of it.
- **2026-08-05 — Storage keeps busy semantics; the conversion lives at the
  browser edge.** `busy_mask`, its check constraint, the API contract and every
  script and test already speak busy, and the complement is lossless, so flipping
  the stored meaning would buy nothing and cost a sweep. The column is not
  renamed for the same reason: it describes what is stored, and what is stored
  did not change. See `PLAN.md` §3.4, and METHOD.md → Conventions for the general
  rule about polarity.
- **2026-08-05 — An import subtracts and never adds.** Turning fetched events
  into free time would assert an availability nobody claimed. The cost is that
  "import only, paint nothing" now yields an empty answer, which is what the
  Select all button is for — the person states "all of it except my calendar"
  themselves rather than having it assumed. METHOD.md → Conventions carries the
  general form.
- **2026-08-05 — No busy/free mode; Select all, Invert and Clear all instead.**
  A mode doubles every label, colour and count in the flow and the two copies
  drift where no test can see, because both render something. Invert serves the
  person who thinks in busy time at the cost of one button. In METHOD.md →
  Anti-Patterns.
- **2026-08-05 — An empty selection cannot be sent, reversing the old rule
  deliberately.** An all-zero *busy* mask meant "free the whole time", a real
  answer that was knowingly allowed. Inverted, the same empty grid means "free at
  no point", which counts towards `submittedCount` and makes "everyone is free"
  impossible in every slot — it flattens the room into the `PLAN.md` §3.5
  fallback. Not sending says the same thing more accurately, because the member
  list then shows the person as still to answer. The draft key also moved to
  `temptime:free:` so a mask painted before the flip cannot be read inverted.
- **2026-08-05 — Vercel, with the functions in Tokyo `hnd1`.** Hong Kong `hkg1`
  was the live alternative and was rejected on arithmetic: it would save a
  visitor roughly 20ms once per request and cost roughly 50ms on *every* query
  a route makes, and the routes make more than one. Rendering every page per
  request does not change that, since the render itself reads nothing. The
  general rule is in METHOD.md → Conventions. Confirmed rather than assumed
  after the redeploy: `x-vercel-id` reports `hnd1` as the function region.
- **2026-08-05 — Development and production share one Supabase project, and the
  triggers for splitting are written down.** A second project is not a
  connection string: it is the three migrations, the region (fixed at creation),
  "expose new tables" off, and enabling the legacy HS256 secret — two of which
  have already gone wrong once each, and both failures read as something else.
  It also doubles the idle-pause surface. The cost accepted in exchange is that
  there is nowhere to rehearse a migration. Split when either arrives: someone
  other than the user holds a room worth not destroying, or a migration appears
  that is not purely additive. Note that `verify-purge.mjs` deletes only rooms
  already past `expires_at`, which `pg_cron` deletes hourly anyway, so running
  it against production costs nothing.
- **2026-08-05 — Speed Insights is left off.** It injects a script from a Vercel
  origin, and `script-src` is `'self'` plus a nonce with no `'strict-dynamic'`,
  so it would be blocked while the dashboard reported it enabled. Turning it on
  means opening the policy, which is a decision to take on its own terms rather
  than a checkbox during setup.
- **2026-08-05 — M4 shipped as one commit rather than three.** The work came in
  three rounds, but `app/layout.tsx` and `components/RoomView.tsx` each carry
  hunks from two of them, so splitting meant hand-built patches — and, worse,
  three commits assert three verified states while only the final tree had been
  run. Honestly producing three would have meant checking out and re-verifying
  each intermediate, including a production build for the headers round. The
  explanations live in the commit message instead, where `git log -S` finds
  them anyway.
- **2026-08-02 — The tap-target floor is 36px, taken from the design rather than
  from a platform guideline.** Apple's 44pt would have forced a redesign of
  controls nobody has complained about; "no control is a smaller target than the
  primary buttons already are" is a rule this codebase can defend. Three
  controls were below it — the grid-size picker at 24px, the source picker at
  28px, the room's back link at 20px — and all three got `min-h-9` below `sm`
  only, so desktop density is untouched. The general form is in METHOD.md →
  Verification.
- **2026-08-02 — The heatmap readout is driven by `pointerdown`, not only
  `pointermove`.** On a phone the line never left its placeholder: a tap that
  does not travel fires no `pointermove` at all, and the readout is the only
  place the counts behind a colour are written down. `pointerleave` now clears
  only for a mouse, because touch fires it immediately after `pointerup` and
  would blank what the tap had just set. Wording changed to "Tap or hover".
- **2026-08-02 — `scripts/drive-mobile.mjs` is kept, and dispatches touch through
  CDP rather than `page.mouse`.** Whether a drag on the grid paints or scrolls
  the page is decided by `touch-action`, which a mouse never consults, and a
  synthetic `PointerEvent` arrives after the browser has already decided what the
  gesture meant. It builds its room at the full seven days because that is the
  width the layout is worst at. Re-run it after touching `SlotGrid`, `Heatmap` or
  any of the page-level width constants.
- **2026-08-02 — `.env.example` was wrong about `SUPABASE_JWT_SECRET` and is
  now corrected.** It said the variable could be left empty and Realtime would
  degrade to polling. It signs the token issued at join, so empty means join
  returns 500 and nothing works; emptying it and calling the endpoint proved it,
  and restoring it took the same request back to 200. The rule this produced is
  in METHOD.md → Verification.
- **2026-08-02 — The privacy page states the unflattering parts on purpose.** IP
  addresses counted in memory for rate limiting, room titles and display names
  stored verbatim, and an aggregate over one submitter being that submitter's
  answer. A page that lists only the good parts is worth nothing to the person
  who has to trust it, and the last of those is a property METHOD.md →
  Conventions already says not to paper over.
- **2026-08-02 — The CSP is nonce-based, and the price is that every page
  renders per request.** `app/layout.tsx` carries `dynamic = 'force-dynamic'`
  for the whole tree. Next's inline bootstrap and streamed flight data leave
  three options — permit inline script, hash it, or nonce it — and only the
  nonce is both strict and stable across builds. A nonce cannot coexist with a
  prerendered page, which is not a theory here: with `/` static the home page
  returned 200 and never hydrated. The full route cache was worth close to
  nothing anyway, since both pages fetch everything they display after
  hydration. No `'strict-dynamic'`: it would replace `'self'` rather than add to
  it, making every chunk depend on a nonce propagating through a
  `createElement('script')` we do not control, and our chunks are same-origin.
  The general rule is in METHOD.md → Conventions.
- **2026-08-02 — `Referrer-Policy: no-referrer`, not the framework default.**
  Our URLs are credentials: the admin link carries the owner secret in its query
  string (`PLAN.md` §2.4) and the room link is the only thing needed to enter a
  room. Nothing here reads `Referer`, so there is nothing to trade against it.
- **2026-08-02 — `proxy.ts` sets the policy on the request as well as the
  response, and only the response is proven to matter.** Commenting out the
  request line changed nothing — the page hydrated and the HTML still carried 16
  nonces — so Next 16.2.11 reads the nonce from the response header, not the
  request header its documentation names. Kept on the same reasoning as the
  `setAuth` call in `lib/realtime.ts`: one line, and the alternative is betting
  that an undocumented path stays that way across upgrades. The file's comment
  states both observations rather than the claim that turned out to be false.
- **2026-08-02 — `scripts/verify-headers.mjs` is kept, like the other five, and
  needs a production build.** Three sabotages were run and all three were
  caught: permitting `'unsafe-inline'` failed 2 unit tests and 5 script
  assertions — including the control, where an injected script genuinely
  executed; dropping the `wss:` origin from `connect-src` failed 1 unit test and
  dropped the room to polling, which is the silent failure the assertion exists
  for. The third sabotage caught nothing, and that is what established the
  request-header finding above. Re-run this script after touching `lib/csp.ts`,
  `proxy.ts` or `next.config.ts`.
- **2026-07-27 — The scheduler's constraints are absorbed by the purge route, not
  pushed back onto the spec.** `PLAN.md` §6 names `POST` and §4.3 asks for
  hourly; Vercel Cron only ever issues `GET`, cannot send a custom header, and
  the Hobby plan refuses to deploy anything more frequent than daily. So both
  verbs run the same handler, `Authorization: Bearer` is accepted alongside
  `x-cron-secret`, and `vercel.json` says `0 4 * * *`. The hourly guarantee comes
  from `pg_cron` either way. JSON carries no comments, so the reason lives in the
  route's header comment. See METHOD.md → Spec changes.
- **2026-07-27 — The purge route is deliberately not rate-limited**, unlike the
  five endpoints in `PLAN.md` §7.2. Nothing touches the database before the
  credential matches, so an unauthenticated flood costs one SHA-256 per request;
  a bucket would buy that back at the price of refusing the scheduler after a few
  retries.
- **2026-07-27 — A deleted room and a mistyped code read differently, and the
  difference is decided in the browser.** The API answers both with 404 on
  purpose — "there used to be a room here" is not something a stranger with a
  guessed code should be told — so `RoomView` uses its own stored membership as
  the evidence that the room once existed. The condition was written inverted and
  shipped nothing: it was caught by running `drive-ui.mjs`, which had been written
  to catch exactly this and never run. See METHOD.md → Verification.
- **2026-07-27 — One assertion in `scripts/verify-purge.mjs` is knowingly
  unproven.** Two sabotages were run and both were caught: dropping the bearer
  branch failed 2 script assertions and 3 unit tests, and making the credential
  always match failed 4. The control that a live room survives the purge was left
  unproven, because the only sabotage that would falsify it — removing or
  inverting the `expires_at` filter — deletes every room in the live database.
  The general rule is in METHOD.md → Verification.
- **2026-07-26 — The two-second live-update target is measured, not asserted.**
  `PLAN.md` §11 M3 now asserts the *transport* — the update arrives with no
  reload while the page still reads "Updating live" — and prints the latency
  beside the target. An update costs two sequential Tokyo round trips, one of
  which is the app-to-database hop that deploying beside the database removes;
  locally it lands between 1.4 and 3.0 seconds. The user chose this over keeping
  a hard assertion that would fail about a third of the time for reasons outside
  the code. See METHOD.md → Verification.
- **2026-07-26 — `lib/realtime.ts` attaches the token with an explicit `setAuth`
  before joining, though this is not proven necessary.** supabase-js does reach
  `setAuth` from the `accessToken` option, but in a promise it does not await.
  Reverting to the bare `subscribe()` did not reproduce any failure. Kept because
  the cost is one `await` and the alternative is depending on the timing of a
  promise the library chose not to await; the comment in the file says exactly
  this rather than claiming a fix.
- **2026-07-26 — The transport is shown in the UI, not hidden.** `LiveBadge`
  reads "Updating live" or "Checking every few seconds". On the fallback an
  answer can be four seconds stale, and someone waiting on a friend deserves to
  tell "nothing has happened" from "this page is behind". It doubles as the only
  honest way to prove which path delivered an update.
- **2026-07-26 — Nobody-is-free is drawn as the grid's plain empty cell, not a
  colour of its own.** The eye is hunting for where the green is, and giving the
  impossible times their own shade only competes with that. The hover readout
  still names them explicitly, so the information is not lost, only unhighlighted.
- **2026-07-26 — Both grids carry an accessible name, added when the second one
  appeared.** `SlotGrid` grew a `label` prop rendering `role="group"` with
  `aria-label`; the painter is "Your busy times", the overlay is "Everyone's free
  time". Without it `[data-slot="4"]` matched two elements and `drive-ui.mjs`
  broke — the general rule is in METHOD.md → Conventions.
- **2026-07-26 — `scripts/drive-heatmap.mjs` is kept, and creates its room
  through the API rather than the date picker.** Driving the picker is
  `drive-ui.mjs`'s job; repeating it here only adds ways for this script to fail
  at something it is not testing.
- **2026-07-26 — The drag stays a rectangle of day × time-of-day.** Compared
  against painting whichever cells the pointer passes over, as When2meet does,
  and the user judged the current gesture good enough on a real screen. `blockSlots`
  is unchanged and the heatmap can now be built on top of it.
- **2026-07-26 — No minimum-submitter threshold on the heatmap.** With one
  submitter the counts are that person's mask inverted, and showing it anyway was
  the explicit choice: hiding the overlay until a second person answers would
  blank the page for whoever is testing their own room, which is the common case
  early in a room's life. Accepted knowingly — see METHOD.md → Conventions on
  what an aggregate of one actually is.
- **2026-07-26 — `/heatmap` gets its own rate-limit bucket at 120 a minute.** It
  cannot enumerate room codes, since it needs a token this room issued, so the
  60-a-minute limit that makes the sixth code character worth having does not
  apply to it. What does apply is the polling fallback at one call every four
  seconds per open tab. `PLAN.md` §7.2 carries the table row and a test in
  `tests/rateLimit.test.ts` encodes the reason.
- **2026-07-26 — `scripts/verify-heatmap.mjs` is kept, like the other two.** It
  is the executable form of `PLAN.md` §12's privacy step for the aggregate, and
  the only thing that exercises authorisation against a token valid elsewhere.
  Re-run it after touching the route, `lib/aggregate.ts` or `roomMember`.
- **2026-07-26 — Supabase, decided by the goal rather than the technology.** The
  question that settled it was whether the point right now is to run the flow
  alone or to send a friend a link; the answer was the link, which rules out a
  database only one machine can reach. `PLAN.md` needed no sweep as a result —
  that is the bill METHOD.md → Spec changes warned about, and picking the product
  the spec already named is what avoided paying it.
- **2026-07-26 — The project sits in Tokyo (`ap-northeast-1`), and cannot be
  moved.** Chosen for the server-to-database hop, not the user-to-database one:
  every write goes through a Route Handler, so where the functions run matters
  more than where anyone is sitting. Region is fixed at creation.
- **2026-07-26 — The new publishable/secret key pair, not the legacy
  anon/service_role one.** They map one to one and the legacy pair is being
  retired, so a new project has no reason to start on it. `.env.local` and
  `PLAN.md` §13 follow the new names.
- **2026-07-26 — "Automatically expose new tables" is off; "automatic RLS" is
  on.** Fail-closed on both axes, because `submissions` is a table no client may
  ever reach. The price is that every privilege is explicit in `0002_rls.sql` —
  including the server role's own, which is the part that was missed first time
  round and only surfaced by running it.
- **2026-07-26 — Room tokens are signed with the project's legacy HS256 shared
  secret, and that key must stay in the verification set.** It is what lets
  Supabase, not just our own routes, verify a token we minted. Do not revoke it
  and do not rotate the JWT keys again: the list holds a current and a previous
  slot, so another rotation pushes HS256 out, and room tokens live up to three
  months. Moving it to "standby" has the same effect — standby keys are not used
  for verification.
- **2026-07-26 — `scripts/verify-rls.mjs` is kept rather than thrown away.**
  `PLAN.md` §12 makes privacy verification a required step, and this is the only
  executable form of it: one token, reads `participants`, refused on
  `submissions`. Re-run it after touching RLS.
- **2026-07-26 — Withdrawing deletes the submission row rather than blanking the
  mask.** An all-zero mask is a real answer — "I am free the whole time" — and
  the aggregate has to count it differently from someone who has not answered.
  The `submitted_at` column on `participants` moves with it, which is the signal
  Realtime will push.
- **2026-07-26 — `sources` is reconstructed at submit time, not tracked through
  the UI.** It is descriptive metadata that changes no slot, so `deriveSources`
  works it out from the import cache and the mask instead of threading state up
  through the painter and the checklist.
- **2026-07-26 — `scripts/drive-ui.mjs` is kept, and Playwright is a real
  devDependency.** METHOD.md makes driving the UI the only accepted form of
  verifying it, and a script that cannot run is worse than none. The cost is a
  114 MB browser download on a fresh clone. Reversible if that stops being worth
  it — the script is self-contained.
- **2026-07-26 — Imported events are cached in `sessionStorage`, not
  `localStorage`.** `lib/importCache.ts` is the only place event titles are
  written down at all. Session scope means they die with the tab; the alternative
  was either re-importing the file after every reload or leaving private titles
  on disk indefinitely. See `PLAN.md` §2.1.
- **2026-07-26 — All-day events are ignored on import, and so are events the
  calendar marks `TRANSP:TRANSPARENT` or `STATUS:CANCELLED`.** Birthdays and
  public holidays are not busy time, and an event the source itself calls free
  should not become busy here. Every skipped event is counted and reported in the
  UI rather than silently dropped.
- **2026-07-26 — An imported event on a calendar day the room did not select is
  not listed.** It cannot mark a slot, so offering a tick box for it would offer
  a choice that changes nothing. It is counted as "outside these days" instead.
- **2026-07-26 — Sources add to each other rather than replace.** Importing after
  painting keeps both, via `unionMasks`. Someone who did both meant both.
- **2026-07-26 — Manual painting is deliberately not a `BusyProvider`.** There is
  nothing to connect to and nothing to fetch; the drag is the input.
  `lib/providers/manual.ts` holds mask arithmetic only, and the interface in
  `lib/providers/types.ts` is for sources that really fetch.
- **2026-07-26 — `lib/roomCode.ts` uses Web Crypto, not `node:crypto`.** The
  browser needs to generate a code while the API does not exist, and the same
  reasoning that chose `jose` applies: staying runtime-agnostic costs nothing
  here. `lib/ownerSecret.ts` stays on `node:crypto` — `timingSafeEqual` is
  server-side by nature.
- **2026-07-26 — The grid has three fixed sizes rather than a zoom control.**
  Small, medium and large; large fits a full seven-day room on screen at once and
  labels every half-hour, and the card sizes itself to whichever is chosen.
- **2026-07-26 — Prettier ignores Markdown.** `METHOD.md` and `STATE.md` are read
  as prose and hand-wrapped; reflowing them turns a memory update into an
  unreviewable diff.
- **2026-07-25 — `PLAN.md` is the implementation spec and stays local.**
  Git-ignored at the user's request. This file cites it by section number instead
  of copying it, so the two cannot drift.
- **2026-07-25 — Room lifetime is derived from the dates chosen, not fixed at 24
  hours.** A room is destroyed by its creator or once every date it covers has
  passed. The user wants rooms planned months ahead rather than used once. See
  `PLAN.md` §4.3.
- **2026-07-25 — Dates are an explicit array, not a contiguous range.** Any days
  within the next 90 days, up to `MAX_ROOM_DAYS = 7`, not necessarily adjacent.
  The cap is one constant precisely because the user expects to raise it. See
  `PLAN.md` §3.1.
- **2026-07-25 — Only a room's creator can delete it, using a secret issued once
  at creation.** Letting any member delete was rejected: one mistaken click
  destroys everyone's submissions, an asymmetric cost. See `PLAN.md` §2.4.
- **2026-07-25 — Next.js 16, not the 15 the spec named.** `create-next-app`
  produces 16 and every reason the spec gave for choosing Next still holds, so
  the spec was corrected rather than the toolchain pinned backwards.
- **2026-07-25 — `jose` for JWTs, not `jsonwebtoken`.** `jsonwebtoken` is
  Node-only; `jose` also runs on the Edge runtime, which keeps the choice of
  runtime for Route Handlers open rather than deciding it by accident.
- **2026-07-25 — Owner secrets are base64url.** They travel in the admin link's
  query string, and base64url survives that without escaping.
- **2026-07-25 — `blocksToMask` scans every slot against every interval.** The
  alternative, mapping interval edges to indices, is where a gap in `dates`
  silently produces wrong answers. At 224 slots the cost of the naive scan does
  not matter and the failure mode disappears.
- **2026-07-25 — The best-slot fallback drops the duration floor to one slot.**
  Otherwise "everyone is free, but only for 30 minutes" is filtered out by both
  tiers and the UI shows nothing at all. See `PLAN.md` §3.5.
