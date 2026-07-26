# METHOD

Workflow methodology and decision logic for this project. This file holds
knowledge that stays true across tasks. For what is happening *right now*, see
[STATE.md](STATE.md).

Read this file at the start of a work session. Update it only when a new
reusable rule emerges — never to record progress.

---

## Core Principles

- **Two-file memory.** `METHOD.md` = how we work. `STATE.md` = where we are.
  Nothing else is treated as durable project memory.
- **Durability decides placement.** If a fact is still useful after the current
  task ships, it belongs here. If it expires on completion, it belongs in
  `STATE.md`.
- **Write for a cold reader.** Both files must make sense to someone who has
  none of the conversation context.

---

## Workflow

### Memory protocol

Memory is updated **on request only**. The trigger is the user saying
"更新記憶" / "update memory". No automatic writes.

On trigger:

1. Read the current `METHOD.md` and `STATE.md`.
2. Classify the session's context using the Decision Rules below.
3. Apply updates: **accumulate/refine** in `METHOD.md`, **overwrite** in
   `STATE.md`.
4. Stamp `Last updated` in `STATE.md`.
5. Report back to the user, in Chinese, what changed and where.

**Exception — delegated agents.** A subagent defined in `.claude/agents/`
updates memory automatically when it finishes a task, applying the same Decision
Rules and update semantics as above. The trigger requirement applies to the main
conversation only. Reason: a delegated run holds context the main thread never
sees, so deferring the write until the user asks would lose it.

The exception turns on the run being *delegated*, not on the agent definition
being *visible*. Attaching `.claude/agents/*.md` to a message in the main
conversation supplies those principles as context and nothing more — the main
thread still waits for the trigger. Only a genuinely spawned subagent writes on
its own.

### Language rule

- Conversation with the user: **Chinese**.
- All written output — these files, code, comments, commit messages: **English**.

### Verification

A suite that passes on its first run is unverified, not correct. It is equally
consistent with tests that assert nothing discriminating. Before trusting a new
suite, break the code it covers on purpose — pick the one or two behaviours most
likely to be got wrong — confirm the expected tests fail and read *which* ones,
then revert and re-run.

This is cheap and it is the only evidence that a green suite means anything.

**A probe whose outcomes cannot differ proves nothing.** Confirming a credential
by watching a request fail says only that something failed. Two rounds were lost
this way: a JWT secret was tested against an endpoint that rejects every
publishable key regardless of the token, so the real secret and a deliberately
wrong one both returned an identical 401 and the value looked broken when it was
merely untested. Pick a target where success and failure look different, and run
the known-bad control in the same breath as the real one — if they match, the
test has not started yet.

The corollary is that a credential is not verified by where it was copied from.
A dashboard shows a key's ID next to its value, and the ID sailed through our own
length guard; only the live service could tell them apart.

The same trap hides inside assertions that pass. `restored === painted` reported
success while both were zero — a comparison satisfied by two absences, which is
the shape every equality check takes when the thing being measured never
appeared. Anchor on a value known to be non-empty (`restored > 0 && restored ===
painted`) so that finding nothing fails instead of agreeing with itself.

**A failure that stops after a change is not a failure the change fixed.** Put
the suspected cause back and confirm the failure returns. Skipping that step
costs more than the time it saves, because what gets written down is a diagnosis
rather than a coincidence, and the next reader has no way to tell which they are
holding.

This is not hypothetical here. A subscription delivered nothing, a plausible race
was found in a library's source, the fix went in, the run went green, and the
cause was written into two files as established fact. Reverting the fix later
produced three green runs in a row: the race was real in the source and had
nothing to do with the failure, which remains unexplained. The comments had to be
rewritten to say so. Note the asymmetry — sabotaging the *code* proves a test has
power, and sabotaging your own *fix* proves the diagnosis does.

**A production number is not asserted from a machine that is not production.**
Where a target describes deployed behaviour — a latency, a throughput — measure
it and print it, but do not fail a local run against it, and say in the spec why.
Asserting it locally tests where the laptop is. The corollary is that this only
holds where the difference is structural and named: "it is slow here" is not a
reason to stop asserting something.

**UI is verified by driving it, not by reading it.** A component that type-checks
and builds has been proven to compile, nothing more. Drive the running app in a
real browser, assert on what the DOM actually says — computed styles, element
counts, the text a user would read — and screenshot it to look at. Four traps
found this way: a screenshot taken immediately after a click captures CSS
transitions mid-flight and looks broken when it is not, so settle before
capturing; a probe that finds nothing is usually a wrong selector rather than a
real absence, so make it assert something known-present first; anything fetched
after the page loads is a round trip behind it, so wait for the text that proves
the data arrived rather than for the page; and an element below the fold has real
coordinates that are off-screen, so scroll it into view before sending a pointer
anywhere near it.

Assert the shape of the answer, not its presence. "Some cells are coloured" is
satisfied by a scale that renders one colour everywhere; grouping the cells by
computed colour and requiring the group sizes to come out `49,10,5` is an
assertion about the arithmetic behind the picture. Any probe that would pass on a
plausibly broken render is measuring the wrong thing.

### Spec changes

When a requirement changes after the spec is written, patching the section that
states it is not enough. Sweep the whole spec for values and safeguards that were
*sized against* the old assumption — those never mention it by name, so they do
not surface by search. Then record the relaxed assumption and its blast radius in
a dedicated section of the spec, so the next change does not have to rediscover
the same dependencies.

One case made the rule: extending a lifetime also invalidated an identifier
length, a rate-limit table and a token expiry, none of which said "lifetime".

The reverse direction has its own rule. When a tool's current output differs from
what the spec names — a newer major version, a renamed flag — and the reason the
spec gave for the choice still holds, change the spec. Pinning backwards to make
a document true costs more than editing the document.

**A spec that names a vendor prices the next comparison.** Once the schema, the
security model, the milestones and the verification steps are all written against
one product, moving to a technically similar one is not a change of connection
string: it is a sweep of every section that was sized against the old choice,
paid before a line of new code is written. That cost belongs *inside* the
comparison, not discovered after it. It can still be worth paying — but say so
with the number attached, and be honest that "we already wrote it this way" is a
real reason rather than a technical one.

### Git and publishing

- Commit and push only when the user asks for it.
- Before the first push of a set of new files, audit what is about to leave the
  machine: credentials and API keys, machine-local tool settings, and absolute
  local paths. Report the findings and get approval **before** committing, not
  after.
- Multi-line commit messages go through a file: write it to the scratchpad and
  use `git commit -F <file>`. Do not pass a multi-line `-m` inline.

---

## Decision Rules

Classification, applied in order:

1. **Reusable across future tasks?** → `METHOD.md`.
   Test: *"Would I want to know this again next time?"*
2. **Loses meaning once the current work is done?** → `STATE.md`.
   Test: *"Is this irrelevant after this task closes?"*
3. **A decision?** → split it.
   - The *principle* behind it → `METHOD.md`.
   - The *specific choice and its situational reason* → `STATE.md`
     (`Recent Decisions`).
4. **Already recorded by the repo** (code structure, git history, config files)
   → record nothing. Do not duplicate what the codebase already states.
5. **Rejected approach with a reason?** → `METHOD.md` → `Anti-Patterns`.

Update semantics:

- `METHOD.md` — additive. Correct an existing rule in place rather than
  appending a contradicting one. Deleting a rule requires a stated reason.
- `STATE.md` — replacing. Drop anything no longer true. Do not keep history
  here; git holds that.

---

## Conventions

- Written language: English, plain and direct.
- Dates: absolute `YYYY-MM-DD`, never "last week" or "recently".
- Cross-references between the two files use relative markdown links.
- `METHOD.md` and `STATE.md` live at the project root and are tracked in git.
- `PLAN.md` at the project root is the **implementation spec**, not memory: scope,
  stack, data model, API contract, milestones, verification. It answers *what is
  being built*; `STATE.md` answers *how far along it is*. It is git-ignored and
  stays on the local machine, so references to it from `STATE.md` will dangle for
  anyone who clones the repository — cite it by section number rather than
  copying its content across, and never mirror its decisions into `STATE.md`.
- `CLAUDE.md` is **pointer-only**: it imports the two memory files and states the
  language and update-trigger rules. Project knowledge never goes in it.
- Agent definitions live in `.claude/agents/`, tracked in git. They carry
  principles of *how* work is done; anything situational stays in the two memory
  files.
- **Browser-only values are read through `useSyncExternalStore`.** The timezone,
  the page origin, anything in storage: none of them exist during the server
  render, and setting them from an effect is both a cascading render and
  something React's lint now rejects. `useSyncExternalStore` states the two
  answers explicitly — one for the server pass, one for the browser. Its snapshot
  must be a primitive or a cached reference; returning a fresh object each call
  re-renders forever.
- **Anything that might run in a browser or on the Edge uses Web Crypto.**
  `node:crypto` decides the runtime by accident, which is the same reason `jose`
  was chosen over `jsonwebtoken`. Server-only primitives with no Web Crypto
  equivalent — `timingSafeEqual`, for one — are the exception, and they belong in
  modules that never reach the client bundle.
- **An empty answer is not a missing one.** Withdrawing a submission deletes the
  row rather than blanking the mask, because all-zero means "free the whole
  time" — a real answer someone chose — and the aggregate counts the two
  differently. Wherever a value can legitimately be empty, absence needs its own
  representation rather than sharing one with the empty value.
- **Migrations are re-runnable.** `drop policy if exists` before each
  `create policy`, an existence check around anything that appends to a
  publication or a schedule. A migration gets edited after it has already been
  applied — the first one here did, within an hour — and the alternative is
  hand-picking which statements to skip, in a SQL console, against the live
  database.
- **An aggregate over one contributor is that contributor's data.** Overlaying a
  single mask reproduces it exactly, so an aggregate endpoint anonymises nothing
  until a second person answers. Whether that is acceptable is a product decision
  to take deliberately; it is not a property to assume from the word "aggregate".
- **Two of the same component on one page need telling apart.** The room draws
  two grids — the one you paint and the one showing everyone — and they share
  every attribute their cells carry. Give each an accessible name (`role="group"`
  with `aria-label`): a screen reader needs it, and it is also the only stable way
  to select one of them. Adding the second is what breaks the first one's tests,
  so name both at the moment the second appears.
- **A connection that reports success has proved the handshake, not the
  delivery.** A Supabase channel returns `SUBSCRIBED` on the strength of the join
  alone; whether any event then arrives depends on the RLS policy the socket's
  token resolves to, and a subscription that connects and stays silent looks
  exactly like a quiet room. The same gap exists for any queue, webhook or
  stream. Assert that something arrived, never that something connected.
- **Caller errors return, configuration errors throw.** A bad credential or
  malformed input is the caller's problem: return `null` or a typed result the
  route maps to a status code, without revealing which check failed. A missing or
  malformed secret is our deployment problem: throw at the call site so it
  surfaces on the first request instead of degrading into blanket 401s that look
  like users mistyping.

---

## Anti-Patterns

- **Duplicating memory into a second store.** These two files are the single
  source of truth; a parallel copy elsewhere drifts and creates contradictions.
- **Logging progress into `METHOD.md`.** It turns a rulebook into a diary and
  makes the rules unfindable.
- **Keeping stale entries in `STATE.md`.** An outdated "next step" is worse than
  no next step, because it is followed.
- **Encoding project specifics into an agent definition.** Stack, paths,
  commands and current goals hardcoded into `.claude/agents/` become a third
  memory store that silently goes stale. Agent files state principles and point
  at the memory files for the rest.
- **Recording the repository's location, branch or commit in `STATE.md`.** git
  already holds all three, and an absolute local path is published to the remote
  on the next push. A `Context Notes` section written this way was deleted for
  exactly this reason.
- **Running a scaffolding generator inside a populated project directory.**
  Generators write files under conventional names — `README.md`, `.gitignore`,
  `CLAUDE.md`, `AGENTS.md` — and will either refuse to run or overwrite what is
  already there. Generate into the scratchpad, then copy in only what is wanted
  and merge the rest by hand.
- **Running `npm audit fix --force` on what it reports.** It optimises for zero
  advisories, not for a working project: on this repo it proposed resolving three
  advisories in Next.js's own bundled dependencies by downgrading Next from 16 to
  9.3.3. Read the proposed changes; a transitive advisory inside a framework's
  pinned dependencies is usually the framework's to fix, not ours.
- **Spot-fixing a spec when a core assumption changes.** Editing only the section
  that names the assumption leaves every value quietly sized against it wrong,
  and those are the ones that fail silently later rather than loudly now. See
  Workflow → Spec changes.
- **Decoding a stored hash before validating its shape.** `Buffer.from(s, 'hex')`
  truncates at the first invalid character rather than failing, so a stored hash
  with trailing garbage decodes to the same bytes as the genuine one and
  `timingSafeEqual` returns true — an authentication bypass. Match the expected
  format with a regex first. Every happy-path test still passed; only deliberately
  breaking the guard exposed it.
- **Calling `jwtVerify` without an `algorithms` allow-list.** It then trusts the
  token's own `alg` header. Demonstrated here: with the allow-list removed, a
  token signed HS512 passed a verifier that must only accept HS256.
- **Turning an iCalendar time into an instant with `toJSDate()`.** A `DTSTART`
  with no zone is "floating": local time wherever you happen to be. `toJSDate()`
  resolves that against the machine doing the reading, so the same file imported
  by two members lands on different slots, and the server would disagree with
  both. Resolve by TZID through the tz database, and read a floating time in the
  room's timezone — the room has exactly one, and every grid label is drawn in it.
- **Seeding a recurrence iterator with a later date to skip ahead.** It looks
  like a fast-forward and is not: ical.js treats the seed as the previous
  occurrence, so a daily 09:00 meeting comes back at whatever hour the seed
  carried. Expansion has to start at DTSTART and walk. Cap the walk, and *report*
  hitting the cap — an event that silently fails to appear is the worst outcome
  available.
- **Using `??` for a default the caller can legitimately return empty.** It only
  fires on null and undefined, so a callback returning `''` keeps the empty
  string and the fallback never runs. Found when refactoring the grid: cells lost
  their background because the painter returned `''` for "nothing special here".
  Either return `undefined` and mean it, or test for the value you actually get.
- **Treating a valid signature as authorisation.** Verifying a token proves who
  minted it and that it has not expired — not that it belongs to the thing being
  addressed. Removing one comparison of the token's own room against the room in
  the URL let a member of one room write into another and get a 200 back. Bind
  every credential to the resource, and test it with a token that is genuinely
  valid for somewhere else, because a forged or expired one exercises a
  different branch entirely.
- **Assuming a role that bypasses RLS can also reach the table.** They are two
  independent layers: the GRANT decides whether the role may touch the table at
  all, the policy decides which rows. With a project's "expose new tables"
  default turned off, the server role held no privilege on anything and every
  insert came back as a flat `permission denied`, which reads like a policy bug
  and is not one. Grant the server role explicitly, and never conclude from
  "this role ignores RLS" that it needs nothing else.
- **Proving nothing leaked by searching for the field's name.** A privacy check
  that greps a response for `busy_mask` passes the instant the leak arrives under
  any other key. Demonstrated here: a route deliberately returning every mask
  under `masks` sailed straight through that assertion, and only a content-shaped
  one — anything `totalSlots` long made solely of 0 and 1 — caught it. Match the
  shape of the secret, not the name it usually travels under. Note that the weak
  check had passed on the honest route too, so nothing but breaking it on purpose
  could have told the two apart.
- **A test double that replaces a platform primitive globally.** Simulating a
  dropped connection by overwriting `window.WebSocket` also took out Next's HMR
  client, so the page never hydrated and the probe sat waiting for a dialog that
  was never going to render — a failure with nothing to do with the feature under
  test. Cut the one connection being tested, by URL
  (`routeWebSocket(/realtime/)`), not the capability the whole platform uses.
- **Reading colour channels out of a computed style.** Tailwind 4 reports
  `lab(96.1634 0.0993013 -0.364029)`, not `rgb(...)`, so pulling the digits out
  and asking which channel is largest is not wrong so much as meaningless — it
  counted every grey cell as green. A probe rarely needs to know what colour
  something is, only which cells match which, and comparing the strings for
  equality answers that in any colour space the framework decides to emit.
- **`process.exit()` in a `finally` that has just closed a browser.** It tears
  the process down while the driver's handles are still closing and libuv aborts
  on Windows, so a run where every assertion passed reports a crash and a
  non-zero status. Set `process.exitCode` and let Node exit on its own.
- **PowerShell here-strings (`@'...'@`) in the Bash tool.** Bash does not parse
  them; the `@` characters end up inside the string. This silently corrupted a
  commit message. Two shells are available in this environment and each needs its
  own syntax — see Git and publishing for the commit-message form.
