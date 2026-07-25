# STATE

> Last updated: 2026-07-25

Current working state of the project. Superseded content is deleted, not
archived — git holds the history. For durable rules and workflow, see
[METHOD.md](METHOD.md).

---

## Current Focus

Setting up the project's memory structure. The repository is otherwise empty:
`LICENSE` and one initial commit, no source code yet.

---

## Status

**Done**
- `METHOD.md` and `STATE.md` created at the project root, with the memory
  protocol itself as the first entry in `METHOD.md`.

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
