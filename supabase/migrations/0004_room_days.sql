-- Raise how many days a room may cover from 7 to 91. See PLAN.md section 14.
--
-- 91 is every day the selection window offers, today included, and it repeats
-- MAX_ROOM_DAYS from lib/dates.ts. The Route Handler enforces the same bound
-- before anything reaches this table; the CHECK is the backstop, so the two
-- have to move together.
--
-- `rooms_dates_check` is the name Postgres gave the inline column CHECK in
-- 0001_init.sql. Dropped with `if exists` and re-added, so this file can be run
-- again, and run on a database where the old bound is already gone.
--
-- Loosening at the top: every existing room already satisfies the new bound,
-- and a deployment still validating at 7 keeps working unchanged.
--
-- `cardinality`, not the `array_length(dates, 1)` 0001 used. For an empty
-- array `array_length` is NULL, and a CHECK that evaluates to NULL passes, so
-- the old constraint never enforced its own lower bound: inserting `'{}'`
-- directly was accepted, and only the Route Handler stood in the way.
-- `cardinality('{}')` is 0, which fails `between 1 and 91` as intended.

alter table rooms drop constraint if exists rooms_dates_check;

alter table rooms
  add constraint rooms_dates_check
  check (cardinality(dates) between 1 and 91);
