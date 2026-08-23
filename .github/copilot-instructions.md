# Copilot instructions for Skillport

## First-run bootstrap

If this library is not installed on this machine yet, follow `INSTALL.md` first:

```sh
git clone <your-repo-url> ~/skillport
cd ~/skillport
./bin/skills install --yes
```

## Repository purpose and architecture

This repository is a cross-client AI skills library. The canonical
inventory is `skills/`: each immediate child directory containing `SKILL.md` is
one skill. Supporting resources stay beside that file. Do not add category
directories under `skills/`, because clients scan only the immediate children.

`bin/skills.mjs` is the Node.js ESM CLI and the source of truth for operational
behavior. `bin/skills` and `bin/skills.ps1` are thin launchers. The CLI:

- validates skill frontmatter, references, use-case pages, links, client
  integration, and Git state (`doctor`);
- links the canonical library into Claude Code, Codex, shared `~/.agents`,
  optional Antigravity, and Copilot;
- copies selected skills into another project's `.claude/skills/` and
  `.agents/skills/` (`use`/`unuse`);
- imports GitHub skills at a pinned commit and records `.source.json`;
- publishes changes through `sync`, including versioning
  `.claude-plugin/plugin.json` when skill content changes.

`.claude-plugin/plugin.json` and `marketplace.json` publish the inventory to
Claude Desktop Cowork. `README.md` is the setup overview; `GUIDE.md` is the
detailed command and workflow reference. Keep both aligned when delivery paths
or CLI behavior changes.

## Commands and validation

Node.js 20 or newer is required. There are no dependencies, build step,
automated test suite, or lint configuration.

```sh
# Integration validation: skills, links, plugin metadata, and Git state
npm run doctor

# Syntax validation
node --check bin/skills.mjs

# Read-only CLI smoke checks
./bin/skills --help
./bin/skills list
```

There is no single-test command because this repository has no automated tests.
Do not use `link`, `use`, `unuse`, `import`, or `sync` as validation: they
modify client configuration, another project, the working tree, or remote Git.

## Skill conventions

- A skill folder and its frontmatter `name` must match and use lowercase
  hyphenated names. Frontmatter must include a trigger-oriented `description`;
  this description is the only content loaded at startup.
- Every skill needs `USE_CASES.html` beside `SKILL.md`. After creating a skill,
  run `./bin/skills usecases <name>` and replace the generated starter prompts
  with real prompts. Never reference `USE_CASES.html` from `SKILL.md`; it is
  human-facing documentation and is excluded from multi-file detection.
- Keep Markdown resources referenced by `SKILL.md` inside the same skill
  directory, using relative paths that cannot escape it. Do not use names
  reserved by Codex built-ins: `imagegen`, `openai-docs`, `plugin-creator`,
  `skill-creator`, and `skill-installer`.
- Imported skills are pinned with `.source.json`. Review imported content, but
  never execute setup scripts or dependency files without explicit approval;
  the importer only warns when these files are present.
- A skill with supporting files is a multi-file skill. Copilot CLI needs the
  library path allowed with `--add-dir` when such a skill is used outside the
  repository; project copies made by `use` avoid that boundary.
- Preserve refusal and safety semantics: managed links must not overwrite real
  directories; imports and project copies reject symlinks; `unuse` removes only
  `.from-library.json`-marked copies; path checks must continue preventing
  writes outside intended roots.
- Reusable personal skills belong directly under `skills/`, not in this
  repository's `.claude/skills/`. Preserve Codex's client-owned
  `~/.codex/skills/.system/` directory.

## Change guidance

Read the relevant sections of `GUIDE.md` (including the shelf commands `shelve`,
`unshelve`, and `shelf`) and the implementation in `bin/skills.mjs` before changing
command behavior. Prefer existing helpers and preserve actionable error messages and
refusal behavior. When changing a delivery path, command, or publishing rule, update
`README.md` and `GUIDE.md` as well as this file if the Copilot workflow is affected.
