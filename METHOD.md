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

### Language rule

- Conversation with the user: **Chinese**.
- All written output — these files, code, comments, commit messages: **English**.

### Spec changes

When a requirement changes after the spec is written, patching the section that
states it is not enough. Sweep the whole spec for values and safeguards that were
*sized against* the old assumption — those never mention it by name, so they do
not surface by search. Then record the relaxed assumption and its blast radius in
a dedicated section of the spec, so the next change does not have to rediscover
the same dependencies.

One case made the rule: extending a lifetime also invalidated an identifier
length, a rate-limit table and a token expiry, none of which said "lifetime".

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
- **Spot-fixing a spec when a core assumption changes.** Editing only the section
  that names the assumption leaves every value quietly sized against it wrong,
  and those are the ones that fail silently later rather than loudly now. See
  Workflow → Spec changes.
- **PowerShell here-strings (`@'...'@`) in the Bash tool.** Bash does not parse
  them; the `@` characters end up inside the string. This silently corrupted a
  commit message. Two shells are available in this environment and each needs its
  own syntax — see Git and publishing for the commit-message form.
