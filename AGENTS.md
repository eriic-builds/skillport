# Skillport

- `skills/` is the canonical inventory; each child directory contains one `SKILL.md`.
- Use `bin/skills new <name>` to scaffold a skill, then edit its instructions and
  replace its generated `USE_CASES.html` prompts with real examples.
- Use `bin/skills link`, `doctor`, `sync`, `shelve`, `unshelve`, and `import` to
  manage the library. See [GUIDE.md](GUIDE.md) for the full reference.
- Keep supporting Markdown resources inside the skill directory and use lowercase
  hyphenated names. Never run setup code from an imported skill without approval.
- Preserve Codex's client-owned `~/.codex/skills/.system/` directory.
