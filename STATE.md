# STATE

> Last updated: 2026-07-25

Current working state of the project. Superseded content is deleted, not
archived — git holds the history. For durable rules and workflow, see
[METHOD.md](METHOD.md).

---

## Current Focus

TempTime now has a defined product and a complete implementation spec in
`PLAN.md`: a registration-free tool for aligning free time across several people,
whose selling point is importing busy blocks from the calendars users already
have and letting them uncheck individual entries before anything is sent. No
source code exists yet. The immediate blocker is how the database gets
provisioned.

---

## Status

**Done**
- Two-file memory in place: [METHOD.md](METHOD.md) and this file, alongside a
  pointer-only `CLAUDE.md` and a `temptime-engineer` agent definition.
- `PLAN.md` written and then revised for a change of requirements covering room
  lifetime and date selection. The four relaxed assumptions and everything each
  one touched are recorded in `PLAN.md` §14 — not restated here.

**In Progress**
- Nothing. No scaffold, no source files.

**Blocked**
- The API layer of milestone M1 and every end-to-end check, pending the database
  question below. The pure-logic modules are not blocked by it.

---

## Next Steps

1. Answer the database question below.
2. Scaffold Next.js 15 + TypeScript + Tailwind (`PLAN.md` §11, M1).
3. Build the pure-logic modules and their tests — `lib/dates.ts`,
   `lib/roomCode.ts`, `lib/slots.ts`, `lib/aggregate.ts`. These touch no database
   and can proceed before step 1 resolves.

---

## Open Questions

- **How does Postgres get provisioned?** Three options were put to the user and
  none was chosen: a Supabase cloud project, Supabase CLI running locally under
  Docker, or an in-memory storage adapter that defers the choice. The user's
  stated concern was whether every end user would need an account — they do not;
  one project serves every room, and only the operator holds an account.
- **Can an HS256 JWT secret be obtained from the Supabase project?** Unknown
  until a project exists. If it cannot, Realtime degrades to polling
  (`PLAN.md` §5). Worth checking before the realtime layer is built, not after.

---

## Recent Decisions

Earlier entries about the memory structure itself were dropped: their outcome is
now stated as convention in [METHOD.md](METHOD.md), and repeating it here would
be the duplication that file warns against.

- **2026-07-25 — `PLAN.md` is the implementation spec and stays local.**
  Git-ignored at the user's request. This file cites it by section number instead
  of copying it, so the two cannot drift.
- **2026-07-25 — Room lifetime is derived from the dates chosen, not fixed at 24
  hours.** A room is destroyed when its creator deletes it, or once every date it
  covers has passed. Reason: the user wants rooms that can be planned months
  ahead rather than used once and discarded. See `PLAN.md` §4.3.
- **2026-07-25 — Dates are an explicit array, not a contiguous range.** Any days
  within the next 90 days, up to `MAX_ROOM_DAYS = 7`, not necessarily adjacent.
  The cap is a single constant precisely because the user expects to raise it.
  See `PLAN.md` §3.1.
- **2026-07-25 — Only a room's creator can delete it, using a secret issued once
  at creation.** Letting any member delete was rejected: one mistaken click
  destroys everyone's submissions, which is an asymmetric cost. See `PLAN.md`
  §2.4.
