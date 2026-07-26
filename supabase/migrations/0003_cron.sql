-- Scheduled destruction of expired rooms. See PLAN.md section 4.3.
--
-- This is the primary path. `app/api/cron/purge/route.ts` is the backup, hit by
-- an external scheduler with `x-cron-secret`. Both run the same delete, and the
-- cascades in 0001_init.sql take participants and submissions with the room.
--
-- If `create extension` fails on a hosted project, enable pg_cron from
-- Dashboard -> Database -> Extensions and re-run from the grant below.

create extension if not exists pg_cron;

grant usage on schema cron to postgres;

-- Re-running this file re-points the existing job rather than adding a second
-- one: cron.schedule treats the job name as the key.
select cron.schedule(
  'purge-expired-rooms',
  '0 * * * *',
  $$delete from public.rooms where expires_at < now()$$
);

-- Hourly, not nightly, because `expires_at` already includes a 24-hour grace
-- period. A room is never removed while anyone could still reasonably be
-- reading it, so there is no reason to leave dead rooms sitting for a day.
--
-- To inspect:   select * from cron.job;
-- To stop:      select cron.unschedule('purge-expired-rooms');
