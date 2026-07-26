-- Row Level Security and Data API grants. See PLAN.md section 4.2.
--
-- Two independent layers have to pass before a role reads a row: the table
-- privilege (GRANT) and the policy (RLS). This project was created with
-- "Automatically expose new tables" turned off, so nothing is granted by
-- default and every line below is deliberate.
--
-- The client reads exactly two tables, both filtered to its own room, and only
-- so Realtime can deliver a "someone submitted" signal. Every write, and every
-- read of `submissions`, goes through a Route Handler using the secret key.
--
-- Safe to re-run.

alter table rooms        enable row level security;
alter table participants enable row level security;
alter table submissions  enable row level security;

-- Start from nothing rather than assuming the project's defaults.
revoke all on rooms, participants, submissions from anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;

-- The server credential. It bypasses RLS, but bypassing RLS is not the same as
-- holding a table privilege: without this it cannot read or write anything, and
-- the failure is a flat 403 that looks nothing like a policy problem.
grant all on rooms, participants, submissions to service_role;

-- Room tokens carry `role: authenticated` (lib/jwt.ts), so `anon` — a
-- publishable key with no token — gets no table access at all.
grant select on rooms to authenticated;
grant select on participants to authenticated;

-- `submissions` is granted to no client role. Deliberate: it is the whole
-- privacy promise. Do not add a policy here "for convenience" later.

-- Claims are read as text, so the uuid columns are cast rather than the claim.
drop policy if exists "read own room" on rooms;
create policy "read own room"
  on rooms for select
  to authenticated
  using (
    id::text = auth.jwt() ->> 'room_id'
    and expires_at > now()
  );

-- The expiry check is duplicated from the room because a token's own `exp` is
-- set to the room's `expires_at`, and belt-and-braces here costs one index hit.
drop policy if exists "read own room members" on participants;
create policy "read own room members"
  on participants for select
  to authenticated
  using (
    room_id::text = auth.jwt() ->> 'room_id'
    and exists (
      select 1 from rooms
      where rooms.id = participants.room_id
        and rooms.expires_at > now()
    )
  );

-- Postgres Changes only delivers rows from tables in this publication. Without
-- it the policies above are correct and nothing is ever pushed, which looks
-- exactly like a broken subscription. RLS still applies per subscriber.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'participants'
  ) then
    alter publication supabase_realtime add table participants;
  end if;
end
$$;
