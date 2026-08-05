# TempTime

Find a time everyone is free, without anyone signing up — and without anyone,
including whoever runs the server, learning what is in your calendar.

You create a room, pick some dates, and send people a six-character code. They
drag across a grid to mark when they are free, and can import a calendar file to
take back the hours that are already spoken for — an import only ever subtracts,
because an empty hour on a calendar is not the same as an hour someone is
available. What leaves their browser is a row of `0`s and `1`s, one digit per
half-hour slot. Event names, real start and end times, and which app they came
from never go anywhere. The room shows everyone's overlap, then destroys itself
once its last date has passed.

The full statement of what is stored and for how long is at `/privacy` in the
running app.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind 4 ·
Supabase (Postgres, RLS, Realtime, `pg_cron`) · Zod · Luxon · `jose` ·
Vitest · Playwright.

## Requirements

- Node 20.9 or newer. Developed on 24.13.
- A Supabase project. The free tier is enough.

## Setup

```sh
npm install
cp .env.example .env.local
```

Then fill in `.env.local`. Every variable is documented in `.env.example`,
including which tab of the Supabase dashboard each key comes from — the
publishable/secret pair, not the legacy anon/service_role pair beside it.

### The Supabase project

1. **Create it in Tokyo (`ap-northeast-1`)** if you can. Every write goes
   through a Route Handler, so the hop that matters is server-to-database, not
   user-to-database. The region cannot be changed after creation.
2. In the project's API settings, turn **"Automatically expose new tables"
   off** and leave **automatic RLS on**. `submissions` is a table no client may
   ever reach, and both defaults should fail closed.
3. Run the migrations in order, in the SQL editor:

   | File | What it does |
   | --- | --- |
   | `supabase/migrations/0001_init.sql` | The three tables and their cascades |
   | `supabase/migrations/0002_rls.sql` | Policies **and** the explicit grants |
   | `supabase/migrations/0003_cron.sql` | The hourly purge of expired rooms |

   They are written to be re-runnable, so applying one twice is safe.

   `0002_rls.sql` grants the server role its own privileges explicitly. That is
   not redundant with "this role bypasses RLS": the grant decides whether the
   role may touch the table at all, and the policy decides which rows. With the
   expose-new-tables default off, skipping the grant makes every insert fail
   with a flat `permission denied` that reads like a policy bug.

4. Put the project's **legacy HS256 shared secret** in `SUPABASE_JWT_SECRET`.
   New projects sign with asymmetric keys by default, so this may need enabling
   under Settings → API.

   This one is not optional and does not fail softly: it signs the token issued
   when someone joins, so leaving it empty makes joining a room return 500. It
   is also what lets Supabase itself — not just this app's own routes — verify a
   token we minted, which is what live updates run on.

   Once rooms exist, **do not rotate the project's JWT keys**. The verification
   list holds one current and one previous key, another rotation pushes HS256
   out of it, and room tokens can live for up to three months. Moving the key to
   "standby" has the same effect: standby keys are not used for verification.

## Running

```sh
npm run dev          # http://localhost:3000
npm run build        # production build
npm start            # production server
```

## Checks

```sh
npm test             # Vitest, no Supabase needed
npm run lint
npm run typecheck
npm run format:check
```

## Verifying against a running system

Unit tests cover the pure logic. Everything that depends on a browser, a
database or a real HTTP round trip is verified by driving it, using the scripts
below. **They are development-only: they write to whatever database
`.env.local` points at.**

| Script | Needs | What it proves |
| --- | --- | --- |
| `verify-rls.mjs` | `.env.local` only | A room token reads `participants` and is refused on `submissions` — it talks to Supabase directly, so the app need not be running |
| `verify-heatmap.mjs` | `APP_URL` | The overlay API's shape, its privacy, and that a token valid elsewhere is rejected |
| `verify-purge.mjs` | `APP_URL` | Expiry, the cron credential, and the cascade |
| `verify-headers.mjs` | `BASE_URL`, **production build** | The CSP and security headers, including controls that try to inject a script |
| `drive-ui.mjs` | `BASE_URL` | The room lifecycle in two browser contexts, including the four ways a room can be gone |
| `drive-heatmap.mjs` | `BASE_URL` | The overlay, the live socket, and the polling fallback |
| `drive-mobile.mjs` | `BASE_URL` | A phone-sized touch context: layout, tap targets, finger painting, the tap readout |

```sh
node scripts/drive-ui.mjs                       # defaults to localhost:3000
BASE_URL=http://localhost:3000 node scripts/drive-mobile.mjs
```

Two things to know before running them:

- **`verify-headers.mjs` must run against `npm run build && npm start`**, not
  the dev server. Development relaxes the policy on purpose — `'unsafe-eval'`
  for Fast Refresh, `ws:` for hot reload — so a green run against `npm run dev`
  would prove nothing about what ships. The script refuses to run if it detects
  the development policy.
- **All but `verify-purge.mjs` create real rooms**, against a rate limit of ten
  an hour per address. A handful of runs an hour is the ceiling.
  `verify-purge.mjs` plants its fixtures directly and costs nothing against it.

Screenshots land in the repo root by default and are git-ignored; set
`SHOT_DIR` to put them elsewhere.

## Deploying

Nothing in the app is tied to a particular host, but `vercel.json` is written
for Vercel and encodes one compromise worth knowing about:

- **Put the app in the same region as the database.** A live update costs two
  sequential round trips, and one of them is the app-to-database hop.
- **Set every variable from `.env.example`** in the host's environment.
- **The cron schedule is daily, not hourly.** Vercel's Hobby plan will not
  deploy anything more frequent, and Vercel Cron only ever issues `GET` and
  cannot send a custom header. The purge route therefore accepts both `GET` and
  `POST` and reads its secret from either `x-cron-secret` or a bearer token.
  This is a backstop: the hourly guarantee comes from `pg_cron` inside the
  database, which is unaffected.

If you deploy somewhere else, `vercel.json` is a single file to delete.

## Notes on the repository

- `METHOD.md` — how work is done here: verification rules, conventions, and the
  approaches that were tried and rejected, with reasons.
- `STATE.md` — where the project currently is.
- `PLAN.md` is the implementation spec and is deliberately **not** committed, so
  references to it from `STATE.md` will not resolve in a fresh clone.

## Licence

MIT. See `LICENSE`.
