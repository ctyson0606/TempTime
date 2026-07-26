# STATE

> Last updated: 2026-07-26 (realtime)

Current working state of the project. Superseded content is deleted, not
archived — git holds the history. For durable rules and workflow, see
[METHOD.md](METHOD.md).

---

## Current Focus

**M3 is closed.** A room shows the overlay of everyone's answers, the ranked
windows to meet, and who has answered — and somebody else's answer now arrives on
its own, over a Realtime subscription, with a polling fallback that has been
verified separately by cutting the socket. All of it was driven in two browser
contexts, not merely compiled.

What is left is **M4**: the purge route, the CSP header, and the rest of
`PLAN.md` §11's last list. Nothing about it is blocked, and none of it needs a
decision that has not been taken.

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
- Four scripts that verify against the running system, all development-only
  because they write to the live database: `scripts/verify-rls.mjs` (the
  repeatable proof of `PLAN.md` §2.2), `scripts/drive-ui.mjs` (the M1
  acceptance test in two browser contexts), `scripts/verify-heatmap.mjs`
  (19 assertions over the overlay API, its privacy and its authorisation) and
  `scripts/drive-heatmap.mjs` (the M3 acceptance test, 28 assertions in two
  contexts, covering both the socket and the fallback). The last three need the
  dev server — `APP_URL=` for the API probe,
  `BASE_URL=` for the browser ones — and each creates rooms against a limit of
  ten an hour, so a handful of runs an hour is the ceiling for all of them
  together.
- 203 tests, with `format:check`, `lint` and `typecheck` clean.
- Milestone coverage: `PLAN.md` §11 holds the per-item state; do not duplicate it
  here. M1, M2 and M3 are complete, acceptance tests included. M4 has not been
  started.

**In Progress**
- Nothing. The last task closed cleanly.

**Blocked**
- Nothing waits on an outside decision any more.

---

## Next Steps

1. M4, from `PLAN.md` §11: `POST /api/cron/purge` behind `x-cron-secret`, the CSP
   header, and the remaining hardening. The `pg_cron` schedule already does the
   purging, so the route is the backup path rather than the primary one.
2. Deploying, which is what turns three deferred things into answerable ones: the
   two-browser test with a real friend (`PLAN.md` §12), the coarser cron cadence
   on a free tier, and the live-update latency target.

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
- **Where does the app itself run?** Deferrable; development runs locally. Two
  constraints are known. A public URL is a precondition for the two-browser test
  in `PLAN.md` §12 — a friend cannot reach `localhost`. And Vercel's free tier
  runs scheduled jobs once a day, not hourly, so the `api/cron/purge` backup is
  coarser there than `PLAN.md` §4.3 assumes; the `pg_cron` schedule is the
  primary path and is unaffected. Whatever is chosen should sit in Tokyo, to
  match the database — and that is also what makes the live-update target
  measurable, since one of the two round trips an update costs is the
  app-to-database hop.
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
