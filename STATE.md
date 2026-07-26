# STATE

> Last updated: 2026-07-26

Current working state of the project. Superseded content is deleted, not
archived — git holds the history. For durable rules and workflow, see
[METHOD.md](METHOD.md).

---

## Current Focus

Everything one member does now runs against the server. Create a room, send the
link, join it from another browser, paint or import your busy time, untick what
is private, send it, change your mind, withdraw. The stand-in is gone; two
browsers really do share a room, and it has been driven end to end rather than
reasoned about.

What is missing is the other half of the product: **seeing anyone else.** Masks
are stored but nothing reads them back in aggregate, so a room with four members
still shows each of them only their own answer. `GET /heatmap` and the three
components that draw it are the next thing, and they are the last piece before
the app does what it exists to do.

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
  `GET /api/rooms/:code/my-submission`.
- Two scripts that verify against the running system, both development-only
  because they write to the live database: `scripts/verify-rls.mjs` (the
  repeatable proof of `PLAN.md` §2.2) and `scripts/drive-ui.mjs` (the M1
  acceptance test in two browser contexts).
- 196 tests, with `format:check`, `lint`, `typecheck` and `next build` clean.
  The count fell from 205 because the stand-in's tests went with it.
- Milestone coverage: `PLAN.md` §11 holds the per-item state; do not duplicate it
  here. M1 and M2 are complete, acceptance tests included.

**In Progress**
- Nothing. The last task closed cleanly.

**Blocked**
- Nothing waits on an outside decision any more.

---

## Next Steps

1. `GET /api/rooms/:code/heatmap` — `aggregate` and `findBestSlots` already
   exist and are tested; the route reads every mask with the secret key and
   returns counts, never an individual mask.
2. `Heatmap`, `BestSlots` and `MemberList`. The grid already draws a gap between
   non-adjacent days, so the heatmap inherits it.
3. Settle the drag gesture before the heatmap is built on top of it — see the
   open question below.
4. `lib/realtime.ts` last: it degrades to polling, and polling needs nothing new.

---

## Open Questions

- **Will Realtime accept our room tokens?** Half answered. PostgREST verifiably
  accepts a token signed by `POST /join` — it returns that room's members and
  refuses `submissions` with a 403 — so the secret, the algorithm, and the `role`
  and `aud` claims in `lib/jwt.ts` are all right for *that* service. Realtime
  validates separately and has not been tried, which is why the `UNVERIFIED` note
  in `lib/jwt.ts` was narrowed rather than deleted. Unanswerable until something
  subscribes.
- **Where does the app itself run?** Deferrable; development runs locally. Two
  constraints are known. A public URL is a precondition for the two-browser test
  in `PLAN.md` §12 — a friend cannot reach `localhost`. And Vercel's free tier
  runs scheduled jobs once a day, not hourly, so the `api/cron/purge` backup is
  coarser there than `PLAN.md` §4.3 assumes; the `pg_cron` schedule is the
  primary path and is unaffected. Whatever is chosen should sit in Tokyo, to
  match the database.
- **Is a dragged block the right gesture?** Dragging marks a rectangle of
  day × time-of-day, so "Saturday 09:00 to Monday 10:00" means those three
  mornings. The alternative is painting whichever cells the pointer passes over,
  as When2meet does. The user has not compared them on a real screen yet; the
  choice is one pure function, `blockSlots`. Cheapest to settle before the
  heatmap is wired on top of it.

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
