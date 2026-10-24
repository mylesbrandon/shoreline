# CLAUDE.md

**All project rules live in [`AGENTS.md`](AGENTS.md). Read it first and follow it exactly.** This file only adds Claude Code specifics; it never overrides `AGENTS.md`.

@AGENTS.md

## Claude Code specifics

- At the start of a session, run `git branch --show-current` to infer which developer you're working for (see the branch → developer map in `AGENTS.md`), then read that developer's section of `docs/TASKS.md`.
- Before editing a file, check it against the ownership table in `AGENTS.md`. If it belongs to someone else or is a shared contract, stop and explain the needed change instead of editing.
- Finish every task by running `npm run check` and reporting the actual output.
- Don't create commits or push unless the human asks. Never use destructive git commands.
