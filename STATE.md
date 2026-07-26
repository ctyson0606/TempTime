# STATE

> Last updated: 2026-07-26

Current working state of the project. Superseded content is deleted, not
archived — git holds the history. For durable rules and workflow, see
[METHOD.md](METHOD.md).

---

## Current Focus

The store question is settled and answered in code: a Supabase project exists,
all three migrations are applied, and the four M1 routes create, read, join and
delete a real room. A room's data now survives leaving the browser.

The front end has not caught up. Every page still reads `lib/demoRoom.ts`, so
what a user can actually do is unchanged from before the database existed —
rooms live in one browser. Connecting the UI to the routes and deleting the
stand-in is the single thing between here and the M1 acceptance test.

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
  `SourcePicker` and `PrivacyChecklist` — **all still on the stand-in**.
- Live Supabase project: schema, RLS, explicit grants and the hourly `pg_cron`
  purge, all applied and verified against the running database.
- Server plumbing: `lib/env.ts`, `lib/schemas.ts` (Zod), `lib/rateLimit.ts`,
  `lib/api.ts`, `lib/supabase/server.ts`.
- Routes: `POST /api/rooms`, `GET` and `DELETE /api/rooms/:code`,
  `POST /api/rooms/:code/join`.
- `scripts/verify-rls.mjs` — the repeatable proof of `PLAN.md` §2.2. It creates
  two rooms in the live database and deletes them, so development only.
- 205 tests, with `format:check`, `lint`, `typecheck` and `next build` clean.
- Milestone coverage: `PLAN.md` §11 holds the per-item state; do not duplicate it
  here. Every M1 item now exists, but its acceptance test still fails, because
  existing and being wired together are different things.

**In Progress**
- Nothing. The last task closed cleanly.

**Blocked**
- Nothing waits on an outside decision any more.

---

## Next Steps

1. Replace `lib/demoRoom.ts` with `fetch` calls in `CreateRoomForm`, `RoomView`,
   `JoinDialog` and `RoomAdminBar`, then delete the stand-in and its test. This
   is what makes `PLAN.md` §11 M1's acceptance test — two browsers, one room —
   possible at all.
2. `POST /api/rooms/:code/submit` and `GET /api/rooms/:code/my-submission`, with
   `isValidMask` checking the length the schema cannot know.
3. `GET /api/rooms/:code/heatmap`, then `Heatmap`, `BestSlots` and `MemberList`
   against real submissions.
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
- **2026-07-26 — The API has a browser-local stand-in, and it is disposable.**
  `lib/demoRoom.ts` keeps rooms, names, owner secrets and masks in `localStorage`
  so the UI could be built before any database existed. It is now the last thing
  standing between the UI and the real routes, and it is deleted rather than
  adapted.
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
