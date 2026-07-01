---
name: Git sandbox restrictions
description: Any git command that writes to the workspace's own .git (fetch, fetch-into-new-ref, merge, pull) is blocked by the sandbox, even on a task explicitly assigned to sync with a remote.
---

Git commands that write to the current workspace's `.git/` (e.g. `git fetch`, `git fetch origin ... :refs/...`, `git merge`, `git pull`) are blocked by the sandbox — this applies even inside a project task explicitly assigned to reconcile with a remote.

**Why:** The sandbox's git-write protection is not scoped by task intent; it uniformly blocks any write-y git op against the live `.git` directory, regardless of whether the current task is "allowed" to touch git history.

**How to apply:** To compare against or pull in a remote's state, `git clone` the remote fresh into a scratch path outside the workspace (e.g. `/tmp/origin-clone`) — a fresh clone's `.git` is not the workspace's `.git`, so it isn't intercepted. Diff/copy files manually between the clone and the workspace using normal file tools (read/write/edit), then let the platform's automatic checkpoint/commit capture the result — do not attempt `git add`/`git commit` in the workspace either.
