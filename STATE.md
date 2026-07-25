# STATE

> Last updated: 2026-07-25

Current working state of the project. Superseded content is deleted, not
archived — git holds the history. For durable rules and workflow, see
[METHOD.md](METHOD.md).

---

## Current Focus

The memory structure is in place and published. The project still has no source
code and no defined purpose — that is the next thing to settle.

---

## Status

**Done**
- Two-file memory in place: [METHOD.md](METHOD.md) (workflow, decision rules,
  anti-patterns) and this file.
- `CLAUDE.md` as a pointer-only loader, and a `temptime-engineer` agent
  definition holding principles only.
- `.gitignore` covering machine-local Claude settings, OS metadata and editor
  state.
- All of the above committed and pushed to `origin/main`.

**In Progress**
- Nothing.

**Blocked**
- Nothing.

---

## Next Steps

1. Define what TempTime is and what it should do.
2. Choose the language and runtime, then scaffold the project accordingly.

---

## Open Questions

- What is the intended scope and purpose of TempTime? Nothing in the repository
  indicates it yet.

---

## Recent Decisions

- **2026-07-25 — Memory files live at the project root, tracked in git.**
  Chosen over `.claude/` so the user can open them directly and so they travel
  with the repository. No conflict with a future `CLAUDE.md`.
- **2026-07-25 — `METHOD.md` + `STATE.md` are the single source of project
  memory.** Claude Code's personal memory store keeps only a pointer to them,
  so the two stores cannot drift apart.
- **2026-07-25 — `.claude/agents/` is tracked, `.claude/settings.local.json` is
  ignored.** The agent definition is shared project knowledge and belongs on the
  remote; the settings file is per-machine permission state and would create
  noise and conflicts for anyone else cloning the repository.
