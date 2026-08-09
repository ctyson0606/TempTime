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

The rule governs the *working* language, so it has one exception: documentation
written for a reader rather than for us may be translated when the user asks for
it. `README.md` carries `README.zh-TW.md` and `README.zh-CN.md` for that reason.
Nothing else moves — memory files, specs, comments and commit messages stay
English, because a second copy of those would be a second store to keep in step.
Each translation is exactly that cost paid deliberately: every README change is
now three changes, and no test can see them disagree.

### Verification

A suite that passes on its first run is unverified, not correct. It is equally
consistent with tests that assert nothing discriminating. Before trusting a new
suite, break the code it covers on purpose — pick the one or two behaviours most
likely to be got wrong — confirm the expected tests fail and read *which* ones,
then revert and re-run.

This is cheap and it is the only evidence that a green suite means anything.

**A green suite is evidence only for the code it actually runs.** 221 unit tests
passed over a component whose two notices were wired the wrong way round: the
member of a room that had just been deleted was told to check for a typo, and a
stranger who guessed a code was told a room had been deleted — the one thing the
404 exists to withhold. Nothing in the unit suite touches that component, and the
browser script that does cover it had been written in the same session as the bug
and never run. A probe written and not run is worse than no probe, because its
presence in the tree reads as evidence to whoever comes next. Run the suite that
covers what you changed; if none does, that is the finding.

**Some assertions cannot be sabotaged safely, and those stay unproven.** Sabotage
is cheap where the blast radius is the check itself — refusing a credential,
dropping a header branch. It is not cheap where the only way to falsify an
assertion is to destroy live data: the purge suite's control, that a room which
has not expired survives, can only be broken by removing or inverting the filter
that decides what gets deleted, and that empties the table on the live database.
Sabotage what you can, name what you could not, and never let one round of it
vouch for a whole file.

A sabotage also has to be *aimed*. One meant to test a layout assertion — a
900px element dropped into the page — broke interaction so thoroughly that the
run aborted at an unrelated click, several assertions before the one under test.
That says the suite is fragile, not that the assertion works. Pick a sabotage
whose blast radius is the assertion you are testing, move it somewhere with
fewer neighbours if it is not, and treat "the run died first" as a result that
has not answered the question.

A run can also die on the project's own defences. Three control runs aborted at
room creation rather than reaching the assertion under test, because repeated
probing had used up a rate limit — a result that looks like the sabotage working
and is not. The limiter counts in memory, so restarting the dev server clears it;
whatever the mechanism, check that the harness is not the thing that failed
before reading anything into a control.

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

**Instrumentation has the same requirement, and it is easier to get wrong there
because nobody sabotages a debug log.** Chasing why a tap left a readout blank,
the first probe recorded every *change* of the state behind it. It could not
distinguish "the handler never ran" from "the handler ran and computed the same
value it already held", because a write of the value already present is not a
change. Both hypotheses produced an identical empty log, and the empty log was
read as evidence for the wrong one. Log the call, not only the transition.

**An intermittent failure has a rate, and one run does not measure it.** A probe
that failed, then passed once a candidate fix was in, was very nearly written
down as fixed; four more runs put it back at roughly one failure in two, with the
"fix" still in place and irrelevant. Anything that does not fail every time needs
a count before and after — three or four runs each — and the comparison is
between rates, not between outcomes.

The other half of that rule: **an added probe is part of the experiment.** The
same failure disappeared whenever the instrumentation for diagnosing it was
present, because each extra round trip into the page changed the timing. Compare
runs whose instrumentation is identical, and be suspicious of a bug that only
survives when nobody is looking at it.

**So is the driver's own version, and that one is invisible in the diff.** The
same script, unmodified, failed 4 out of 4 on a second machine where the first
had been failing about 1 in 2 — a difference worth acting on, except that the
second machine had just installed a newer browser build, because the driver pins
its download to the library version and the library had moved. Two variables
changed at once and only one of them is visible in the working tree. A
cross-machine rate is not a clean comparison until the toolchain versions are
compared too: either match them, or name the confound beside the number rather
than reporting the rate as though the machine were the only difference.

**An observation window has to outlast the event it is meant to observe, and
that is a property of the platform rather than of the plan.** A step written as
"check the dashboard once and confirm the scheduler authenticated" turned out
not to be executable: the provider's cron page lists the schedule and offers Run
and View Logs but reports no outcome for past runs, and on the plan in use
runtime logs are retained for one hour while the job fires once a day. The
evidence expires some nineteen hours before anyone can arrive, so the check
returns an empty list that means nothing at all — neither success nor failure,
and it reads like the former. Before writing "go and look" into a task,
establish that the record will still exist when you get there. If it will not,
there are three ways out: be present inside the window, trigger the event
yourself, or make the event leave a durable trace. Triggering it yourself is
usually cheapest, and it costs one named gap — a manual invocation exercises the
same handler and the same credential but not the scheduler, so state which of
the two you proved.

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

**Sabotage also finds lines that do nothing.** A comment saying "without this the
page does not hydrate" is a testable prediction, so test it. One such line —
copied from the framework's own documentation, and explained in a comment as
load-bearing — was commented out and changed nothing: Next 16.2.11 reads a CSP
nonce from the *response* header, not the request header the docs name. The line
was kept, because documented behaviour is a better bet across upgrades than an
undocumented path, but the comment now records both observations instead of
asserting the one that turned out to be false. Every "this is required" written
into a comment costs one build to check and is worth exactly that.

The same applies to setup documentation, where being wrong is more expensive
because the reader has no working system to check it against. `.env.example`
told anyone setting the project up that one variable could be left empty and
Realtime would degrade to polling. Emptying it and calling the endpoint returned
500: the value signs the token issued at join, so nothing works without it, and
restoring it took the same request back to 200. A sentence describing what
happens when a value is missing is verified by removing the value.

**A production number is not asserted from a machine that is not production.**
Where a target describes deployed behaviour — a latency, a throughput — measure
it and print it, but do not fail a local run against it, and say in the spec why.
Asserting it locally tests where the laptop is. The corollary is that this only
holds where the difference is structural and named: "it is slow here" is not a
reason to stop asserting something.

Deploying does not fix this by itself, because the measuring machine is still
not production. Measure the transport floor before attributing any latency to
the system under test: one request that does no work, and whatever the platform
will say about where the request arrived. A live-update figure of 1843ms read
like the application until the floor was taken — a request that does nothing
cost seconds, and `x-vercel-id` reported every request entering the provider's
network in London, a continent away from both the app and its database. A
measurement whose floor is unknown is not a slow result; it is an unread
instrument.

**And measure that floor the way the system under test uses the network.** The
first attempt here did not, and the number written down was wrong by a factor of
four. A single `curl` pays DNS, TCP and a TLS handshake, so it reports 2–3s where
the second and third requests on the same connection take 0.52s; the application
holds a warm connection and an open socket and never pays the handshake twice.
The giveaway was an observed live update arriving in 806ms — *faster than the
floor*, which is impossible and therefore means the floor was measuring something
the application does not do. Send several requests over one connection and take
the later ones. A floor measured cold does not overstate the latency a little; it
overstates it by however long a handshake takes, which on a bad route is most of
the number.

(One trap in taking that measurement: `curl` given several URLs on one command
line applies each `-o` to one URL, so a single `-o /dev/null` discards the first
response and prints the rest as a body. The first attempt here reported one cold
sample and looked like six.)

**And there is not one floor — there is one per tier the request reaches.** From
one machine over one warm connection, a CDN-cached static asset came back in
0.27–0.36s while a dynamic 404 that runs a function in another continent took
0.64–1.15s. Both are honest floors; they answer different questions. Take the
one whose request travels as far as the thing being measured, because a floor
taken at the edge makes everything behind the edge look like the application's
own cost.

**UI is verified by driving it, not by reading it.** A component that type-checks
and builds has been proven to compile, nothing more. Drive the running app in a
real browser, assert on what the DOM actually says — computed styles, element
counts, the text a user would read — and screenshot it to look at. Six traps
found this way: a screenshot taken immediately after a click captures CSS
transitions mid-flight and looks broken when it is not, so settle before
capturing; a probe that finds nothing is usually a wrong selector rather than a
real absence, so make it assert something known-present first; anything fetched
after the page loads is a round trip behind it, so wait for the text that proves
the data arrived rather than for the page; an element below the fold has real
coordinates that are off-screen, so scroll it into view before sending a pointer
anywhere near it; an unscoped text match finds whichever element happens to
contain the words, so scope it to the one under test — a readout assertion
matched the *heading* above it, which contained the same phrase, and would have
passed had the readout never rendered at all; and a coordinate measured on a page
that updates itself is stale by the time it is used, so wait for the page to
settle and then ask what is actually under the point before dispatching to it.

**The waiting trap has a sharper form: the thing you waited for exists in both
states.** "Wait for the data, not the page" is not enough when the empty state
renders the *same shell* as the loaded one. `Heatmap` draws its grid either way —
same `role="group"`, same `aria-label`, same `data-slot` cells — and the
placeholder version carries no pointer handlers and no readout. A probe that
waited for that group was satisfied by an inert copy, measured a cell on it, and
tapped something that could not respond; five days of "the handler never runs"
followed, all of it true and none of it a bug. Wait for something **only the
loaded state can produce** — here the readout element, which does not exist until
a submitter has arrived. Then ask, of any empty state you write: is there
anything on screen that tells it apart from the real thing? If not, that is the
same defect for a screen reader as it was for the probe.

Two corollaries, both of which cost this investigation time. **"The handler never
ran" has a boring explanation before it has an interesting one** — the element
under the pointer may belong to a different render branch of the same component,
so establish *which* variant is mounted before suspecting the framework or the
input layer. And **a rate that differs between two machines may be caused by
neither of them**: the difference here was the round trip to a shared database,
0.52s from one machine and 0.8s from the other, which decided whether the fetch
had landed by the time the probe tapped. The browser build the two machines
disagreed on turned out to be irrelevant — which is exactly why a confound gets
*named* beside the number rather than concluded from.

That last one is the one that bites hardest, because it does not fail every time.
A room page whose badge and member list fill in asynchronously shifts everything
below them; a probe that measured a cell, then touched those coordinates a moment
later, passed twice and failed once with the feature working perfectly
throughout. An intermittent assertion is worse than a failing one — it gets
re-run until it passes. Fix the timing, do not retry the probe.

Assert the shape of the answer, not its presence. "Some cells are coloured" is
satisfied by a scale that renders one colour everywhere; grouping the cells by
computed colour and requiring the group sizes to come out `49,10,5` is an
assertion about the arithmetic behind the picture. Any probe that would pass on a
plausibly broken render is measuring the wrong thing.

Where an assertion needs a threshold, prefer one the codebase can defend over one
borrowed from a guideline. "No control is a smaller tap target than the primary
buttons already are" is a rule this design can be held to and can argue about;
"44 points, because Apple says so" invites a redesign of every control that has
never bothered anyone, and is the kind of number that gets loosened the first
time it is inconvenient.

**A translation is verified on what gets copied out of it, not on how it reads.**
The prose can be clumsy and still work; a command that got translated along with
the sentence around it cannot, and the reader will paste it without suspecting
the document. So diff the copy-pasteable parts mechanically — strip the fences
and the comments, compare the remaining lines against the original — rather than
scanning them by eye. Structure is worth the same treatment: matching counts of
headings, code blocks and table rows is what catches a section that was dropped
during translation, and both checks together took one command here.

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
  anyone who clones the repository — including a second machine of one's own,
  which needs `PLAN.md` and `.env.local` carried across by hand because a clone
  brings neither. Cite it by section number rather than copying its content
  across, and never mirror its decisions into `STATE.md`.
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
  so name both at the moment the second appears. The same problem arrives a
  second way and is harder to see: one component in two *states* — loaded and
  empty — that render the same shell under the same name is equally
  indistinguishable, to a reader and to anything selecting by role. See
  Verification.
- **A connection that reports success has proved the handshake, not the
  delivery.** A Supabase channel returns `SUBSCRIBED` on the strength of the join
  alone; whether any event then arrives depends on the RLS policy the socket's
  token resolves to, and a subscription that connects and stays silent looks
  exactly like a quiet room. The same gap exists for any queue, webhook or
  stream. Assert that something arrived, never that something connected.
- **A per-request value stamped into rendered HTML rules out prerendering that
  page.** A CSP nonce is minted per response; a prerendered page keeps whatever
  it was built with, and nothing in a framework's response cache knows the
  difference. What you get is a 200 that never hydrates, because the page's own
  bootstrap is blocked by our own header — a symptom that looks nothing like a
  caching problem and is invisible to every check short of driving a browser.
  Either render per request or keep per-request values out of the output; there
  is no third option. Decide which before writing the header, because the answer
  is a rendering-strategy change, not a header tweak. The same policy also
  prices every later add-on: with `script-src` at `'self'` plus a nonce and no
  `'strict-dynamic'`, a hosted analytics or monitoring snippet is a CSP decision
  rather than a checkbox — and the host's dashboard will show it enabled while
  the browser silently refuses to run it.
- **When the interface and the store disagree about polarity, convert at one
  boundary.** A grid that collects free time and a column that holds busy time
  are complements, so either could be the stored one; what cannot happen is both
  meanings living in the same table, because then every read needs a second field
  telling it how to interpret the first, and every reader has to remember to
  check. Pick the meaning the schema, the constraints and the existing tests
  already use, convert immediately before writing and immediately after reading,
  and say in the module where those two places are.
- **Fetched data is evidence about itself, not about its complement.** A
  calendar's events are the hours that are taken; the gaps between them are not
  hours anyone is available — they hold sleep, travel, family, and everything
  nobody bothered to write down. Turning fetched busy time into offered free time
  announces a commitment the person never made, and the error lands on the
  expensive side: someone gets invited to a slot they cannot make. An import may
  subtract from what a person stated, never add to it. Where the old behaviour is
  genuinely wanted, give them one button that states it themselves.
- **Put the compute next to the hop that is paid per query.** A visitor pays the
  distance to the application once per request; the application pays the
  distance to the database once per *query*, and a route rarely makes only one.
  A region chosen to sit nearer the visitor than the database therefore trades a
  single saving against a repeated cost, and loses as soon as a route reads
  twice. Rendering every page per request does not reverse this — there is no
  static page for an edge to serve — because the render itself touches no
  database.
- **A tap is not a small hover.** A finger that lands without travelling fires
  `pointerdown` and `pointerup` and *no* `pointermove` at all, so anything
  driven off movement alone simply does not exist on a phone — a readout that
  was the only place the numbers behind a colour were written down stayed on its
  placeholder text forever. Touch also fires `pointerleave` immediately after
  `pointerup`, so clearing state there blanks whatever the tap just set: gate the
  clear on `pointerType === 'mouse'`. Any hover-driven affordance needs a tap
  path, and the wording needs to name both.
- **Caller errors return, configuration errors throw.** A bad credential or
  malformed input is the caller's problem: return `null` or a typed result the
  route maps to a status code, without revealing which check failed. A missing or
  malformed secret is our deployment problem: throw at the call site so it
  surfaces on the first request instead of degrading into blanket 401s that look
  like users mistyping.
- **A lockfile records the platform that generated it.** `package-lock.json`
  written on Windows omitted the top-level `@emnapi/runtime` that
  `@img/sharp-wasm32` depends on — a package win32 never installs — and the first
  `npm ci` on macOS refused outright with `Missing: @emnapi/runtime@1.11.3 from
  lock file`, leaving no `node_modules` at all. `npm ci` is defined not to write
  the lockfile, so `npm install` is the repair. Read the diff before committing
  it: the correct one adds an entry marked `"optional": true` and touches no
  `version`, `resolved` or `integrity` line, which is what separates filling a
  platform's gap from an upgrade that arrived uninvited. This recurs every time a
  dependency is added and installed on only one machine, and the repaired
  lockfile is proven only by running `npm ci` on the *other* platform — the one
  whose behaviour the edit put at risk, and the one that cannot report on itself.
- **A driver's browser download is pinned to the driver's version, so installing
  it is not one-time setup.** Playwright fetches a specific build number and
  refuses to launch anything else: after a library bump arrived through a
  lockfile repair, four consecutive runs died before a single assertion with
  `Executable doesn't exist … chromium_headless_shell-1234`, which reads as a
  broken machine rather than a stale download. Re-run `npx playwright install
  chromium` whenever the library version moves, not only on a new machine — and
  see Verification on what that bump does to a comparison between two machines.

---

## Anti-Patterns

- **Adding a mode where a one-shot action would do.** Offering "paint busy" and
  "paint free" as a setting was rejected: a mode gives every label, colour, count
  and help sentence in that flow a second version to keep in step, and the two
  drift somewhere no test can see, because both versions render *something*. A
  single "Invert" button serves the same person — paint it the way you think
  about it, then flip once — and leaves one vocabulary to maintain.
- **Duplicating memory into a second store.** These two files are the single
  source of truth; a parallel copy elsewhere drifts and creates contradictions.
- **Logging progress into `METHOD.md`.** It turns a rulebook into a diary and
  makes the rules unfindable.
- **Keeping stale entries in `STATE.md`.** An outdated "next step" is worse than
  no next step, because it is followed. The surest way to manufacture one is to
  describe the repository's own state in a file the same commit is about to
  change: "not committed and not deployed" was written into `STATE.md`, committed
  alongside the work it described, and was false a second later. Two later memory
  updates edited the sections about the new work and left it standing, so the
  file spent two days telling its reader to push something already pushed. Two
  rules follow. Never write a claim into `STATE.md` that the act of committing
  falsifies — *verification* status belongs there, *publication* status is git's
  and can be read from it in one command. And a memory update re-reads the whole
  file, not the sections its own task touched, because the stale entry is never
  in those sections.
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
- **A suite that freezes the clock but lets one call reach the real one.** Two
  assertions in the calendar suite called the helper without the frozen `now`
  the rest of the file passes everywhere, so they read the system date and
  asserted values true only during one particular month. They passed for eight
  days and then failed on a day nobody had touched them — noise that arrives
  attached to whatever change happens to be in flight, and reads as that
  change's fault. A default parameter falling back to `new Date()` is what hides
  the omission: if a suite freezes time, every call in it takes the frozen
  value, and the ones that look like they do not need it are the ones to check.
- **PowerShell here-strings (`@'...'@`) in the Bash tool.** Bash does not parse
  them; the `@` characters end up inside the string. This silently corrupted a
  commit message. Two shells are available in this environment and each needs its
  own syntax — see Git and publishing for the commit-message form.
- **Building a transfer tool for files that could be copied by hand.** Setting up
  a second machine needs two git-ignored files, moved once. A pack/unpack script
  — one text bundle, a SHA-256 per file, drift detection, three sabotages run to
  prove the checks bite — was written, verified and then deleted at the user's
  word. It was working and still wrong for the job: it put a second copy of
  `.env.local` in the working tree, added a file that itself has to be kept in
  step with the originals, and replaced two drags with three commands to learn.
  Count the files and how often they move before automating a transfer. Two
  files, once, is not a pipeline.
