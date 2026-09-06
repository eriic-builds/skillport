# How to use this library

This repository is one canonical copy of your skills. Filesystem-based AI
clients read from it directly. Claude cloud chat is the exception: it has no
access to your computer and needs a deliberate manual upload.

Three commands cover almost everything:

```sh
skills list                     # what do I have?
skills import <GitHub URL>      # add someone else's skill
skills usecases <name>          # write the "how do I use this?" page
skills sync "what changed"      # save and publish
```

---

## Part 1 — Using skills

### Skills are already everywhere

After `skills link`, every skill in this library is available to Claude Code,
Codex, Copilot CLI, Copilot in VS Code, and Antigravity on this machine. You do
not load, enable, or import anything per session. You just describe what you
want, and the client picks the matching skill.

```
"Tailor my project for this job posting."
```

Copilot, Claude, or Codex reads the matching skill and follows it. You can also
name it directly: *"Use the commit-message skill."*

### Seeing what is available

```sh
skills list          # the library, with descriptions and single/multi-file
copilot skill list   # what Copilot actually sees right now, grouped by source
```

`copilot skill list` is the honest one. It groups skills by where they came
from, so it tells you whether a skill is arriving from the library, from the
project you are standing in, or from Copilot's built-ins.

### Checking that everything is wired

```sh
skills doctor
```

This validates each skill, every client link, the Copilot registration, and
Git state. Run it after moving machines or when a skill stops being found.

It exits `0` when everything it can check is healthy and `1` when something is
genuinely wrong, so it is safe to use in a script. A client you have not
installed is reported as `INFO` and does not fail the run — links are
legitimately prepared before a client exists. A client that *is* installed but
fails, a missing or dangling link, a skill without a `USE_CASES.html`, or a
leftover link pointing at a skill you deleted are all errors.

`doctor` only reports. It never creates, repairs, or deletes anything, which is
what makes it safe to run at any time. `skills link` is the command that
repairs.

---

## Part 2 — Adding skills

### Option A — have Claude write one

Ask Claude Code for a **personal skill**. It writes to `~/.claude/skills/`,
which is a link into this library, so the file lands in the repo automatically.
Then:

```sh
cd ~/skillport
skills doctor
skills sync "add commit-message skill"
```

### Option B — import one from GitHub

```sh
skills import https://github.com/your-name/your-skill-repo
```

This clones the repo at its current commit, lets you pick the skill directory,
validates it, copies in any supporting Markdown the `SKILL.md` references, and
records the exact commit in `.source.json`. Nothing is linked live, so an
upstream change can never alter your copy without you asking.

Some repositories ship a whole collection rather than one skill. Name the one
you want, or take the lot:

```sh
skills import https://github.com/your-name/skill-collection commit-message
skills import https://github.com/your-name/skill-collection --all
```

Importing many skills is all-or-nothing. If any single skill fails validation,
the ones already written are removed and nothing is committed, so a partial
collection never lands in the library.

### Option C — write one by hand

Create `skills/<name>/SKILL.md`:

```markdown
---
name: my-skill
description: Use when ... . Say what triggers it, not just what it does.
---

# My Skill

Steps the agent should follow.
```

The `name` must be lowercase-with-hyphens and match the folder name. The
`description` is the only part loaded up front, so it must contain the trigger
words you would actually type.

### Option D — drop a folder in

Copy or move a skill folder straight into `skills/`, then run one command:

```sh
cp -R ~/Downloads/my-skill ~/skillport/skills/
skills link
```

`skills link` finishes the job: it scaffolds the missing `USE_CASES.html`,
creates the per-skill links Codex and `~/.agents` need, and prints what it
wired. Run `skills sync` afterwards to publish and back it up.

You do not have to register the folder anywhere. But half your clients see it
before `link` runs and half do not, which is why the command is not optional.
Measured on this machine with a folder containing only a `SKILL.md`:

| Client | Sees it before `skills link` | Why |
| --- | --- | --- |
| `skills list`, `doctor` | Yes | they scan `skills/` directly |
| Claude Code, VS Code | Yes, after a restart | `~/.claude/skills` links the whole folder |
| Antigravity | Yes, after a restart | same whole-folder link |
| Copilot CLI | Yes | the library path is registered, so a new child is already inside it |
| Codex CLI | **No** | needs its own `~/.codex/skills/<name>` link |
| `~/.agents/skills` | **No** | same one-link-per-skill wiring |
| Claude Desktop Cowork | **No** | needs `skills sync` to publish the commit |

The folder must be a **real directory**, not a symlink. A symlinked entry is
skipped by every client, and `doctor` says so by name.

### Then write down how to use it

However the skill arrived, give it a use-case page:

```sh
skills usecases my-skill
open ~/skillport/skills/my-skill/USE_CASES.html
```

That writes `skills/<name>/USE_CASES.html` — a page you open in a browser
showing what the skill does, how to trigger it in each client, and sample
prompts with copy buttons. The generated prompts are placeholders derived from
the `description`; replace them with prompts you would really type, then delete
the `SKILLS-DRAFT` comment line so `skills doctor` stops calling it a draft.
`skills import` and `skills link` both write the page for you, and
`skills doctor` fails when a skill does not have one.

The page is for you, not the agent. Nothing reads it at runtime, and it is
deliberately excluded from the multi-file check, so adding it never triggers the
Copilot `--add-dir` requirement. Do not link to it from `SKILL.md`, or the agent
will start loading your notes as instructions.

### Publishing

```sh
skills sync "add my-skill"
```

Commits, rebase-pulls, and pushes. It refuses to run in the middle of a rebase
or merge, and prints every Git command it runs.

---

## Part 3 — Pulling specific skills into a project

### First, the honest cost

The global library is the default. Use project copies only when a project must
carry a skill in Git, pin an older version, or work around a GUI client's file
access boundary.

Skills use **progressive disclosure**. At startup a client loads only the `name`
and `description` from each skill — roughly 50–100 tokens each. The body of
`SKILL.md` is read only when the agent decides the skill applies, and supporting
files only when the instructions reach for them. Ten skills cost about a
paragraph of context, not ten instruction manuals.

So the default — everything available everywhere — is cheap and is the right
choice most of the time.

### When scoping is actually worth it

| Reason | What happens without scoping |
| --- | --- |
| **Large libraries** | Each client caps the startup listing. Claude Code uses about 1% of the context window and drops *descriptions* when it overflows, keeping every name. Codex uses about 2% (or 8,000 characters) and **may drop entire skills**, with a warning. |
| **Wrong skill firing** | A project skill sitting in a backend repo is one ambiguous sentence away from triggering. |
| **Sharing with others** | Collaborators cloning your project get the skill only if it lives in the project. |
| **A project pinned to an older version** | A project copy stays put while the library moves on. |

### Bringing in one skill

From inside the project that needs it:

```sh
cd ~/Projects/job-search
skills use commit-message
```

That copies the skill into the project:

```
job-search/
  .claude/skills/commit-message/     <- Claude Code reads this
  .agents/skills/commit-message/     <- Codex reads this
```

Copilot reads both locations and still lists the skill once, so there are no
duplicates. Take several at a time with `skills use commit-message cover-letter`.

To remove them again:

```sh
skills unuse commit-message
```

`unuse` only deletes directories that `skills use` created — it recognises them
by the `.from-library.json` marker and refuses to touch anything you wrote
yourself.

### Why these are copies, not links

Copilot resolves a symlink to its real path, then refuses to read outside the
working directory. A symlink works only when its resolved target is inside the
project. A link back to `~/skillport` therefore fails for supporting files;
a real project copy works without the `--add-dir` wrapper.

The tradeoff is that a copy can go stale. `skills use` records the library
commit it came from in `.from-library.json`, and re-running `skills use`
refreshes the copy in place.

### Should the copy be committed?

`skills use` tells you when the project is a Git repository. Commit
`.claude/skills/` and `.agents/skills/` when the skill is part of how the team
works. Add both to `.gitignore` when the skill is personal — a project skill does
not belong in your employer's repository.

### Turning a skill off without deleting it

In Claude Code, `/skills` lets you cycle a skill's visibility with `Space` and
save with `Enter`. It writes `skillOverrides` to `.claude/settings.local.json`
in that project:

```json
{
  "skillOverrides": {
    "commit-message": "off"
  }
}
```

Values are `on`, `name-only`, `user-invocable-only`, and `off`. Anything not
listed is treated as `on`, so this is a denylist: you switch off what you do not
want rather than listing what you do.

Claude also supports a `paths` field in frontmatter that limits a skill to files
matching a glob, which is often a better fix than removing the skill.

### The strict version

If you want a project where *only* the skills you chose are available, remove
the machine-wide registration first:

```sh
copilot skill remove ~/skillport/skills   # unregister the library from Copilot
rm ~/.claude/skills                           # remove the Claude link (it is a symlink)
```

Then `skills use` in each project decides everything. This is more upkeep, so
reach for it only if the library has grown past the listing budgets above.
`skills link` puts everything back.

---

## How it works

There is **one real copy** of each skill, in `~/skillport/skills/`. Every
client reaches it through a link, so editing it once updates all of them:

```
~/skillport/skills/commit-message/     the only real copy
   ^ ~/.claude/skills                        symlink to the whole folder
   ^ ~/.codex/skills/<skill>                 symlink per skill
   ^ ~/.agents/skills/<skill>                symlink per skill
   ^ Copilot CLI                             no file: a path in settings.json
```

You can prove it with inode numbers — all four paths report the same one:

```sh
stat -f '%i %N' ~/skillport/skills/*/SKILL.md ~/.claude/skills/*/SKILL.md
```

Codex gets a link **per skill** rather than one link for the folder, because
`~/.codex/skills` also holds Codex's own built-in `.system/` skills; replacing
the whole directory would hide them.

### The folder is flat on purpose

`skills/` is exactly one level deep. Every skill is its own folder directly
inside it, and there are no category folders:

```
skills/commit-message/SKILL.md          found
skills/project_skills/commit-message/   NOT found by any client
```

This is not a choice this library makes. Claude Code, Codex CLI, and Copilot
CLI all scan only the immediate children of their skills directory, so anything
nested one folder deeper is invisible. Grouping related skills into a parent
folder would silently switch them all off.

Keep them organised by name instead. Related skills sort together when they
share a prefix, which is why the project set reads `universal-skill-probe`,
`commit-message`, `universal-skill-probe`, and so on. `skills list` shows the
whole inventory alphabetically, so a shared prefix is the grouping.

`skills use` is the one exception. It makes **real copies** inside a project,
because Copilot resolves a symlink to its real path and then refuses to read it
from outside the working directory. Those copies are frozen snapshots: re-run
`skills use` to refresh them, or `skills unuse` to fall back to the shared copy.

## Client matrix

| Client surface | Delivery path | How to add a skill | How updates arrive |
| --- | --- | --- | --- |
| Claude Code | Symlink: `~/.claude/skills/` → this library | Add/import it here, then run `skills link` | Immediately |
| Codex CLI | Symlink: `~/.agents/skills/<name>` → this library | Add/import it here, then run `skills link` | Immediately |
| Copilot CLI | Registered library path in `~/.copilot/settings.json` | Add/import/drop it here | Immediately; multi-file skills also need the shell wrapper |
| Copilot in VS Code | Symlink: `~/.claude/skills/` | Add/import it here; restart VS Code | After restart; use a project copy if GUI file reads fail |
| Antigravity | Symlink: `~/.gemini/config/skills/` → this library | Add/import it here, then run `skills link` | Immediately |
| Claude Desktop Cowork | Private GitHub plugin marketplace | Add/import it here, run `skills sync`, then update the marketplace in Cowork | After Cowork refreshes the marketplace |
| Claude Desktop Chat and claude.ai | Anthropic's servers | Zip one stable skill directory and upload it in **Customize → Skills** | **No**; upload again after changes |

`~/.gemini/config/` is shared with Gemini CLI, so Gemini CLI may also discover
the Antigravity link. `skills link` only creates it when Antigravity is installed.

Claude Code is the only Claude surface that reads `~/.claude/skills/`.
Cowork has a local plugin system, while Desktop Chat and claude.ai use
Anthropic's cloud-managed skills list. Installing a Claude Code skill does not
add it to either one.

### Add this library to Cowork

The repository is also a Claude plugin marketplace. In **Cowork**, run this
once:

```text
/plugin marketplace add YOUR_GITHUB_USERNAME/YOUR_REPOSITORY
/plugin install skillport@skillport
```

The terminal-side Claude client can clone your repository using the Git
credentials already on this machine. Cowork may ask for its own GitHub
authorization the first time. The Claude Code CLI and Cowork keep separate
marketplace lists, so running `claude plugin marketplace add` in a terminal does
**not** install it in Cowork.

After adding or changing a skill:

```sh
skills sync "feat: add or update a skill"
```

Then refresh the catalog **and** update the installed plugin in Cowork:

```text
/plugin marketplace update
/plugin update skillport@skillport
```

Restart the Cowork session if it still has the old inventory. Refreshing the
marketplace alone only updates its catalog; it does not replace the installed
plugin. This is a Git-backed local plugin update, not an upload to Anthropic's
cloud. `skills sync` automatically increments the plugin's patch version when
anything under `skills/` changed, so Cowork can detect the update.

Do not also install this marketplace in Claude Code. Claude Code already reads
the same skills through `~/.claude/skills`; installing the plugin there would
load a second delivery path for the same skill names.

For Desktop Chat and claude.ai, package one chosen skill with its directory at
the ZIP root:

```sh
cd ~/skillport/skills
zip -r ~/Downloads/commit-message.zip commit-message/
```

Upload that file in **Customize → Skills**, then enable it. The enabled skill
should appear in Desktop Chat, Cowork, and claude.ai for the same account. Do
not mirror the whole library: cloud uploads are copies and drift after the
source changes.

`~/.codex/skills/` still works but is deprecated in favour of `~/.agents/skills/`.
`skills link` maintains both.

In Claude Code, a personal skill takes precedence over a project skill of the
same name. In Copilot, the project copy wins. Either way you get one copy of the
same content, so this matters only if you deliberately pin a project to an older
version.

---

## Command reference

| Command | What it does |
| --- | --- |
| `skills link` | Connects every filesystem client to this library. Run once per machine. |
| `skills list` | Lists library skills with descriptions. |
| `skills usecases [name]...` | Writes `USE_CASES.html`, the human-facing page for a skill. Add `--force` to overwrite. |
| `skills use <name>...` | Copies skills into the current project. |
| `skills unuse <name>...` | Removes copies that `skills use` made. |
| `skills doctor` | Validates skills, links, client wiring, and Git state. |
| `skills sync [message]` | Commits, rebase-pulls, and pushes. |
| `skills import <URL> [skill]` | Imports a skill from GitHub at a pinned commit. Name a skill to skip the prompt, or pass `--all` to import every skill in the repo. |

---

## Troubleshooting

**A skill's supporting files fail to read in Copilot.** Copilot only reads below
the working directory. Either add the wrapper to your shell profile:

```sh
alias copilot='copilot --add-dir ~/skillport'
```

or bring the skill into the project with `skills use <name>`, which sidesteps the
problem entirely. `skills doctor` fails loudly when a multi-file skill is
installed without the wrapper.

The shell alias applies only to terminals. It does not change Copilot Chat
inside the VS Code GUI. If VS Code can list a multi-file skill but cannot read
its supporting files, run `skills use <name>` in that workspace.

**A client cannot see a new skill.** Run `skills link`, then `skills doctor`.
Restart VS Code. Codex only loads project config in trusted projects.

**The same skill is listed twice in VS Code's Configure Skills panel.** Expected,
and not a fault in this library. VS Code enumerates each personal skills
location separately, and every skill legitimately exists in two of them:
`~/.claude/skills` and `~/.agents/skills`. Both are links to the one real copy,
so the two entries open the same file. Nothing is duplicated on disk. The
Copilot CLI deduplicates by name and lists each skill once.

Do not delete a root to silence it. `~/.claude/skills` serves Claude Code and VS
Code, and `~/.agents/skills` is the shared cross-tool path. Removing either
breaks a working client to fix a cosmetic listing.

**`skills use` refuses to run.** It will not run inside the library itself, and
it will not overwrite a skill directory it did not create. Both are guards
against destroying originals.

**A skill stopped matching.** Its `description` is the only thing loaded at
startup, so it has to contain the words you actually say. Rewrite it as *"Use
when ..."* rather than a summary of what the skill contains.

## The shelf: optional skills

All skills are visible to your AI tools by default. If you find yourself managing
too many, or if you work in specific domains with dedicated skill collections,
use the shelf to hide some while keeping them safe in Git.

**The short version:** `skills shelf` lists shelved skills, `skills unshelve
<name>` activates them, and `skills shelve <name>` deactivates them. The `skill-shelf`
meta-skill does this conversationally: say *"I need a skill for writing release notes"* and it
finds, confirms, and activates matching ones for you.

**A few things to know:**
- Shelving is a move, not a delete. Everything stays in Git and syncs across machines.
- You must restart your AI client after unshelving a skill for it to load.
- Bulk imports (`skills import --all`) land on the shelf, so they don't flood an existing workflow.
- Name collisions (the same skill in both `skills/` and `shelf/`) are an error; `doctor` catches them.
# Runtime and library modes

Use `--library <path>` to keep the CLI separate from a writable skill library.
Standalone installation starts with an empty skills directory and does not
require Git. Git-backed libraries retain import commits and `skills sync`.
Client selection is stored locally in `.skillport/local.json`; do not synchronize
that machine-specific configuration. Use `link --clients none`, `auto`, or a
comma-separated selection to change it. Dry-run does not create directories.

Both `doctor` and `doctor --json` run the same selected-client checks and exit
nonzero on failure. JSON stdout is a single parseable object.

After a successful sync pull, Skillport reconciles active per-skill links,
including remote additions and shelving changes. Restart clients to refresh
their cached skill inventory. Project copies, Cowork marketplace versions, and
manually uploaded Chat skills require separate updates.

Reviewed shelf imports can activate while their content and review rules remain
unchanged. Editing a skill invalidates that approval. Review checks identify
patterns worth inspecting; they do not prove arbitrary imported code safe.
# Reproducible, minimal imports

Import copies the skill's required assets without generating an extra HTML guide.
Use `skills import <GitHub URL> --all --use-cases` to opt into generated
`USE_CASES.html` documentation. Existing upstream HTML assets are always preserved.
For repeatable review, pass `--commit <full-40-character-SHA>` on both the initial
import and the retry with `--reviewed <token>`. Skillport fetches and verifies that
exact commit; it fails if the server cannot provide it. Without `--commit`, import
uses the remote HEAD and a changed source invalidates the previous review token.
