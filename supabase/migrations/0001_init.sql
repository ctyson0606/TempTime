-- Schema for TempTime. See PLAN.md section 4.1.
--
-- Every cascade hangs off `rooms`, so destroying a room destroys everything
-- about it. Manual deletion and expiry-driven purge take the same path.

create table rooms (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  title              text,
  timezone           text not null,
  -- The upper bound repeats MAX_ROOM_DAYS from lib/dates.ts. It is the only
  -- place that constant lives outside TypeScript; raising it needs a migration.
  dates              date[] not null check (array_length(dates, 1) between 1 and 7),
  day_start_min      int  not null default 480,
  day_end_min        int  not null default 1440,
  slot_minutes       int  not null default 30 check (slot_minutes in (15, 30, 60)),
  owner_secret_hash  text not null,
  created_at         timestamptz not null default now(),
  -- Derived from max(dates), not from created_at: two rooms made the same day
  -- can expire three months apart. See PLAN.md section 4.3.
  expires_at         timestamptz not null,
  check (day_end_min > day_start_min),
  check ((day_end_min - day_start_min) % slot_minutes = 0)
);

-- The purge job scans on this.
create index on rooms (expires_at);

create table participants (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references rooms(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  joined_at    timestamptz not null default now(),
  -- Realtime pushes changes to this column as the "someone submitted" signal.
  -- The mask itself never reaches another member's browser.
  submitted_at timestamptz
);

create index on participants (room_id);

-- The only table holding per-person data, and the reason section 4.2 gives it
-- no client policy at all. `busy_mask` is a 0/1 string by construction: no
-- event titles, no original boundaries, no platform detail.
create table submissions (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references rooms(id) on delete cascade,
  participant_id uuid not null unique references participants(id) on delete cascade,
  busy_mask      text not null check (busy_mask ~ '^[01]+$'),
  sources        text[] not null default '{}',
  updated_at     timestamptz not null default now()
);

create index on submissions (room_id);

-- `dates` being ascending, duplicate-free and inside the selection window is
-- enforced by Zod in the Route Handler; the CHECK above only catches length.
-- That is sound because RLS grants clients no write path at all, so every
-- insert goes through that validation. The two halves depend on each other.
