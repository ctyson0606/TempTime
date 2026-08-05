# STATE

> Last updated: 2026-08-05 (deployed, verified against the deployment, and
> `PLAN.md` §12 run with a real second person)

Current working state of the project. Superseded content is deleted, not
archived — git holds the history. For durable rules and workflow, see
[METHOD.md](METHOD.md).

---

## Current Focus

**The app is deployed and reachable at `https://temp-time.vercel.app`.** Every
milestone in `PLAN.md` §11 is complete, committed, pushed, and now verified
against the deployment rather than only against a laptop.

Two of the three questions that could only be answered by publishing are
answered. The nonce CSP does survive a CDN in front of it — the pages hydrate
online, which is not something a screenshot or a 200 could ever have shown. The
daily cron path works end to end. The third, the live-update latency, is **not**
answered and could not be: this machine's own network path swamps the
measurement (see Open Questions).

`PLAN.md` §12 has now been run with a real second person on a different machine,
and it worked: the answer arrived with no reload, on the socket rather than the
fallback, within a second or two. That is the last step in the spec that had
never been executed.

So the whole of what was planned is built, deployed and seen working by someone
other than its author. The next body of work is the second-stage connectors,
which publishing unblocked — Google's OAuth review needs a reachable privacy
page, and there now is one.

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
  migrations, the seven verification scripts, and the deployment compromises.
- Seven scripts that verify against the running system, all development-only
  because they write to the live database: `scripts/verify-rls.mjs` (the
  repeatable proof of `PLAN.md` §2.2), `scripts/drive-ui.mjs` (the M1
  acceptance test in two browser contexts, 21 assertions, now also covering the
  four absence notices), `scripts/verify-heatmap.mjs`
  (19 assertions over the overlay API, its privacy and its authorisation),
  `scripts/drive-heatmap.mjs` (the M3 acceptance test, 28 assertions in two
  contexts, covering both the socket and the fallback),
  `scripts/verify-purge.mjs` (15 assertions over expiry, the credential and the
  cascade), `scripts/verify-headers.mjs` (22 assertions over the CSP and the
  security headers) and `scripts/drive-mobile.mjs` (16 assertions in a phone-sized
  touch context). They need a server running — `APP_URL=` for the API probes,
  `BASE_URL=` for the browser ones, and `verify-rls.mjs` needs neither because it
  talks to Supabase directly. `verify-headers.mjs` is the one that needs a
  **production** build rather than the dev server, since development relaxes the
  policy; it refuses to run if it sees the development policy at all. All but
  `verify-purge.mjs` and `verify-rls.mjs` create rooms against a limit of ten an
  hour, so a handful of runs an hour is the ceiling for those.
- 232 tests, with `format:check`, `lint` and `typecheck` clean.
- Deployed on Vercel (Hobby, team `ctyson`, project `temp-time`). Functions are
  pinned to Tokyo `hnd1`, beside the database; all five variables from
  `.env.example` are set for Production and Preview; `vercel.json`'s daily cron
  is registered from the repository with no dashboard configuration.
  Development and production share one Supabase project.
- The deployment is verified, not assumed. Against `https://temp-time.vercel.app`:
  `drive-ui.mjs` 21/21, `verify-headers.mjs` 22/22, `drive-heatmap.mjs` 28/28.
  The first of those is the one that mattered — dragging, sending and deleting
  are impossible on a page that has not hydrated, so passing them is the proof
  that the nonce CSP works behind a CDN. The purge route answered 401 with no
  credential, 401 with a wrong one, and `200 {"ok":true,"deleted":0}` with the
  real one over `GET` + bearer, which is exactly how Vercel Cron calls it.
- `PLAN.md` §12, the two-browser test, run on 2026-08-05 with a second person on
  their own machine. Reported: the room updated on its own with no reload, the
  badge read "Updating live" — so the Realtime socket, not the four-second
  polling fallback — and it felt like a second or two. Observed by the user, not
  instrumented; there is still no measured production figure (see Open
  Questions).
- Milestone coverage: `PLAN.md` §11 holds the per-item state; do not duplicate it
  here. M1 through M4 are all complete, acceptance tests included.

**In Progress**
- Nothing is half-built. The next work is the second-stage connectors, and it
  starts with a decision rather than code (see Next Steps).

**Blocked**
- Nothing waits on an outside decision. Vercel's own first cron firing is a
  wait rather than a block: `0 4 * * *` UTC, so the Cron tab is worth a look
  from 2026-08-06 onwards to confirm the scheduler really sends the bearer
  token it is documented to send.

---

## Next Steps

1. Apply for the slow OAuth access now, before writing any of it. Google's
   sensitive-scope review and TickTick's API application are queues measured in
   weeks of somebody else's time, and Google's precondition — a reachable
   privacy page — is satisfied as of 2026-08-05. Applying first turns the wait
   into the development window instead of a gap after it.
2. From 2026-08-06, check Vercel's Cron tab once. The route is proven; what is
   not is that the scheduler sends `Authorization: Bearer $CRON_SECRET` as
   documented. A silent 401 there looks like nothing at all, and `pg_cron` would
   keep hiding it.
3. Then the second-stage connectors, in the order `PLAN.md` §8.2 argues for:
   Todoist first because it needs nothing but OAuth, Google next because its
   sensitive-scope review is a queue rather than a build, TickTick last because
   its API application has no predictable timeline. Apply for the slow ones early
   and write while waiting. One question is unanswered before any of it starts —
   there is no account system, so where an OAuth refresh token would live has to
   be decided rather than assumed. Keeping it in the tab, and never on the
   server, is the answer consistent with `PLAN.md` §2.1.

---

## Open Questions

- **Why did the first ever subscription deliver nothing?** Unexplained, and the
  only genuinely open item here. The channel reported `SUBSCRIBED` and no event
  ever arrived; a plausible cause was found, fixed, and then disproved by putting
  it back and watching three runs pass anyway. It has not recurred in a dozen runs
  since. A cold Realtime service fits the evidence better than anything else
  proposed. Worth remembering rather than chasing: if it returns, this is the
  paragraph that says it has happened before, and the polling fallback is what
  keeps the room working while it is diagnosed.
- **What is the live-update latency in production?** No measured figure exists,
  though the target is no longer unsupported: on 2026-08-05 a second person on
  their own machine saw an answer arrive on the socket within a perceived second
  or two (`PLAN.md` §12). That is an observation, not a number, and nobody timed
  it. Deploying did not produce one either. `drive-heatmap.mjs` printed 1843ms
  against the deployment, which is inside the two-second target and means
  nothing on its own: the
  measuring machine reaches Vercel through London (`x-vercel-id` reads
  `lhr1::hnd1::…` on every request), TCP to the Tokyo database takes 260ms from
  here, and an empty 404 costs 2.06s. The app-to-database hop the target was
  written around is now single-digit milliseconds, so what is left in that
  number is almost entirely this machine's route. Before trusting any figure,
  check the edge code in `x-vercel-id` and time a request that does no work.
  The general rule is in METHOD.md → Verification.
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
- `npm audit` reports high-severity advisories, all transitive inside Next.js's
  own pinned dependencies. `npm audit fix --force` resolves them by downgrading
  Next.js to 9.3.3, so the correct action is to leave them and wait for a Next.js
  patch.
- The grid card sizes itself to its widest child, so opening the privacy
  checklist widens the card and the grid looks off-centre until it closes.
- The busy-slot count under the grid updates on release, not during a drag. The
  cell colours already preview the change; a count that jumps while dragging was
  judged noisier than useful.

---

## Recent Decisions

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
  database only this machine can reach. `PLAN.md` needed no sweep as a result —
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
