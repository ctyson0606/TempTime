# STATE

> Last updated: 2026-07-25

Current working state of the project. Superseded content is deleted, not
archived — git holds the history. For durable rules and workflow, see
[METHOD.md](METHOD.md).

---

## Current Focus

Every part of TempTime that can be written as a pure function now exists and is
tested. Six modules under `lib/` cover date selection, room codes, the time grid,
availability aggregation, owner secrets and room tokens. Nothing above that layer
has been started — no UI, no API routes, no database, and `app/page.tsx` is still
the generated welcome page. The database question below is now the only thing
standing between the library and a running product.

---

## Status

**Done**
- Two-file memory, a pointer-only `CLAUDE.md`, and a `temptime-engineer` agent
  definition.
- `PLAN.md` written, then revised for the room-lifetime and date-selection change
  (`PLAN.md` §14) and again to match what actually got built.
- Next.js scaffold with TypeScript, Tailwind and ESLint, plus Luxon, jose and
  Vitest.
- `lib/dates.ts`, `lib/roomCode.ts`, `lib/slots.ts`, `lib/aggregate.ts`,
  `lib/ownerSecret.ts`, `lib/jwt.ts` — 100 passing tests, with `tsc --noEmit` and
  `eslint` clean.
- Milestone coverage: M1 5/13, M2 0/8, M3 1/7, M4 0/8. `PLAN.md` §11 holds the
  per-item state; do not duplicate it here.

**In Progress**
- Nothing. The last task closed cleanly.

**Blocked**
- Everything remaining. The pure-logic seam is exhausted: each open item needs
  the database, the UI, or both.

---

## Next Steps

Two ways forward, and they are independent:

1. Answer the database question below, then build the M1 API routes on top of the
   existing library.
2. Or start the UI against fake data — the create-room form, `DatePicker` and
   room-page skeleton need no backend to take shape.

Also outstanding: Prettier, which the Next.js scaffold does not include.

---

## Open Questions

- **How does Postgres get provisioned?** Three options were put to the user and
  none was chosen: a Supabase cloud project, Supabase CLI running locally under
  Docker, or an in-memory storage adapter that defers the choice. The user's
  stated concern was whether every end user would need an account — they do not;
  one project serves every room, and only the operator holds an account.
- **Will Supabase accept our room tokens?** Two unknowns, both unanswerable until
  a project exists. First, whether an HS256 JWT secret can be obtained at all; if
  not, Realtime degrades to polling (`PLAN.md` §5). Second, whether the
  `role` and `aud` claims we sign are what Realtime's RLS actually requires —
  `lib/jwt.ts` carries an `UNVERIFIED` comment at the exact constant to check.

---

## Known Annoyances

- `npm audit` reports 12 high-severity advisories, 3 of them in production
  dependencies. All are transitive inside Next.js's own pinned `postcss` and
  `sharp`. `npm audit fix --force` resolves them by downgrading Next.js to
  9.3.3, so the correct action is to leave them and wait for a Next.js patch.

---

## Recent Decisions

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
