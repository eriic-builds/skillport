---
name: commit-message
description: Use this skill when writing a Git commit message from a completed diff or set of changes.
---

# commit-message

Write a concise, accurate Git commit message from the changes the user made.

1. Inspect the diff and identify the dominant user-facing change.
2. Use an imperative subject line under 72 characters.
3. Prefer a conventional-commit prefix such as `feat:`, `fix:`, `docs:`, or
   `chore:` when the repository uses that convention.
4. Add a short body only when it explains important context, tradeoffs, or
   behavior that is not obvious from the subject.
5. Never claim changes that are not present in the diff. Return the proposed
   message in a copyable code block and briefly explain the choice.
