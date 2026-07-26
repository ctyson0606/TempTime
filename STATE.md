# STATE

> Last updated: 2026-07-26

Current working state of the project. Superseded content is deleted, not
archived — git holds the history. For durable rules and workflow, see
[METHOD.md](METHOD.md).

---

## Current Focus

The whole front end a single member touches now works: create a room, share it,
join it, and say when you are busy — by dragging on the grid or by importing an
`.ics` file and unticking whatever is private. It runs against a browser-local
stand-in for the API (`lib/demoRoom.ts`), so a room exists only in the browser
that made it.

That stand-in is the boundary. Everything still missing — other members, the
heatmap that is worth looking at, submitting, real-time updates — needs more than
one browser, which means the database question below is now the only thing
between this and a product.

---

## Status

**Done**
- Two-file memory, a pointer-only `CLAUDE.md`, and a `temptime-engineer` agent
  definition.
- `PLAN.md` written, then revised for the room-lifetime and date-selection change
  (`PLAN.md` §14) and again to match what actually got built.
- Pure logic: `lib/dates.ts`, `lib/roomCode.ts`, `lib/slots.ts`,
  `lib/aggregate.ts`, `lib/ownerSecret.ts`, `lib/jwt.ts`, `lib/calendar.ts`,
  `lib/providers/manual.ts`, `lib/providers/ics.ts`, `lib/importCache.ts`.
- UI: create-room page with a month `DatePicker`, room page with a three-size
  grid, QR and admin links, join-by-name, owner-only delete, `ManualPainter`,
  `SourcePicker` and `PrivacyChecklist`.
- 171 tests, with `format:check`, `lint`, `typecheck` and `next build` all clean.
- Milestone coverage: M1 9/13 (only the API-dependent items left), M2 6/8,
  M3 1/7, M4 0/8. `PLAN.md` §11 holds the per-item state; do not duplicate it
  here.

**In Progress**
- Nothing. The last task closed cleanly.

**Blocked**
- Every remaining item. Each one needs the database: the M1 routes, submitting,
  the member list, the heatmap being more than one person's own mask, Realtime.

---

## Next Steps

1. Settle where the data lives — see the first open question below. It unblocks
   everything else, and choosing is the one step that cannot be done from this
   side.
2. With a database: the M1 routes, then `POST /submit`, then the heatmap and
   `BestSlots` on real submissions. Deleting `lib/demoRoom.ts` is part of that
   work, not a follow-up.
3. Without one: `Heatmap` and `BestSlots` can be built against fake members, but
   half of that work is then for the fake data rather than the product.

---

## Open Questions

- **Where does the data live?** Still unanswered, and still the only thing
  blocking every remaining item. The option set, after being widened on
  2026-07-26:

  | Option | What it buys | What it costs |
  |---|---|---|
  | Supabase | The spec is already written against it; Realtime included | Free projects pause after a week idle, and rooms live for months |
  | Neon or Vercel Postgres | Plain Postgres, wakes on connection | No push, so Realtime becomes polling |
  | Local Postgres in Docker | No account, no card, nothing leaves the machine | Only reachable from that machine, so no two-person test |
  | Upstash Redis | TTL *is* room expiry, which deletes `PLAN.md` §4.3 entirely | Not SQL: the data model is rewritten, and no push |
  | Self-hosted VPS | Full control | Backups, updates and TLS become ours |

  The requirements are smaller than they look: every write already goes through a
  Route Handler, so nothing but Realtime needs the client to touch the database
  at all, and dropping push to polling makes the store a commodity.

  **The honest argument for Supabase is now the spec, not the technology** — see
  METHOD.md → Spec changes. Switching means sweeping `PLAN.md` §4, §5, §7.2 and
  the M4 milestones first.

  What the user still has to answer: is the goal right now to run the whole flow
  alone, or to send a friend a link? The first points at Docker, the second at
  Supabase.
- **Will Supabase accept our room tokens?** Only matters if Supabase is chosen,
  and unanswerable until a project exists. First, whether an HS256 JWT secret can
  be obtained at all; if not, Realtime degrades to polling (`PLAN.md` §5) — which
  also removes Supabase's main advantage over a plain Postgres. Second, whether
  the `role` and `aud` claims we sign are what Realtime's RLS actually requires —
  `lib/jwt.ts` carries an `UNVERIFIED` comment at the exact constant to check.
- **Where does the app itself run?** Independent of the store, and deferrable:
  development runs locally. Two things are known. A public URL is a precondition
  for the two-browser acceptance test in `PLAN.md` §12 — a friend cannot reach
  `localhost`. And Vercel's free tier runs scheduled jobs once a day, not hourly,
  so the `api/cron/purge` backup is coarser there than `PLAN.md` §4.3 assumes;
  the primary database-side schedule is unaffected.
- **Is a dragged block the right gesture?** Dragging marks a rectangle of
  day × time-of-day, so "Saturday 09:00 to Monday 10:00" means those three
  mornings. The alternative is painting whichever cells the pointer passes over,
  as When2meet does. The user has not compared them on a real screen yet; the
  choice is one pure function, `blockSlots`.

---

## Known Annoyances

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

- **2026-07-26 — The API has a browser-local stand-in, and it is disposable.**
  `lib/demoRoom.ts` keeps rooms, names, owner secrets and masks in
  `localStorage` so the UI could be built and clicked through before any
  database exists. It notifies subscribers on write, which is what lets
  components read it through `useSyncExternalStore`. It is deleted when the
  routes land, not adapted.
- **2026-07-26 — Imported events are cached in `sessionStorage`, not
  `localStorage`.** `lib/importCache.ts` is the only place event titles are
  written down at all. Session scope means they die with the tab; the
  alternative was either re-importing the file after every reload or leaving
  private titles on disk indefinitely. See `PLAN.md` §2.1.
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
