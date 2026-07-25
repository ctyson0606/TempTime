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
