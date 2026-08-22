# Skillport

**One skill library. Every AI tool.**

Skillport keeps one canonical folder of Agent Skills and connects it to
Claude Code, Codex, GitHub Copilot, VS Code, Antigravity, and Claude Desktop.
Add a skill once; the clients on your computer can all use the same copy.

The source of truth is `skills/`. Each skill is a directory containing a
`SKILL.md` file and any supporting resources it needs.

**New here?** Start with the interactive guide:
**[eriic-builds.github.io/skillport/HOW_TO_USE.html](https://eriic-builds.github.io/skillport/HOW_TO_USE.html)**.
GitHub Pages renders it live, so no download is needed. If you forked this
repo, the same guide is served from your own copy at
`https://<you>.github.io/<your-repo>/HOW_TO_USE.html` once GitHub Pages is
enabled for it (Settings → Pages → Deploy from a branch → `main` / `/`).

You can also open the file locally instead:

```sh
open ~/skillport/HOW_TO_USE.html
```

[GUIDE.md](GUIDE.md) is the detailed text reference. See [CHANGELOG.md](CHANGELOG.md)
for what changed between releases.

## Set up your own library

The public repository is a template. Use GitHub's **Use this template** button
to create your own copy first. That gives you a repository you can push to and
sync from every computer.

Install Git, GitHub CLI, and Node.js 20 or newer, then:

```sh
gh auth login
gh repo clone YOUR_GITHUB_USERNAME/YOUR_REPOSITORY ~/skillport
# Edit .claude-plugin/plugin.json and marketplace.json with your repo identity.
~/skillport/bin/skills link
~/skillport/bin/skills doctor
```

On Windows PowerShell:

```powershell
gh repo clone YOUR_GITHUB_USERNAME/YOUR_REPOSITORY "$HOME\skillport"
# Edit .claude-plugin/plugin.json and marketplace.json with your repo identity.
& "$HOME\skillport\bin\skills.ps1" link
& "$HOME\skillport\bin\skills.ps1" doctor
```

The Windows link command uses directory junctions, which normally do not
require Administrator access or Developer Mode.

`skills doctor` checks that your plugin metadata matches your GitHub remote.
If it reports a mismatch after creating your copy, edit the `repository` and
author fields in `.claude-plugin/plugin.json` to match your repository.

## Multi-file skills and Copilot CLI

Copilot CLI only reads files beneath the current working directory. A skill
whose `SKILL.md` is the only file works anywhere, because Copilot injects that
file itself. A skill that keeps supporting files beside `SKILL.md` cannot read
them from an unrelated project, and the reads fail with a permission error.

Allow the library once, in your shell profile:

```sh
# ~/.zshrc or ~/.bashrc
alias copilot='copilot --add-dir ~/skillport'
```

```powershell
# PowerShell profile
function copilot { copilot.exe --add-dir "$HOME\skillport" @args }
```

`skills doctor` fails while any multi-file skill is installed without this, and
`skills link` prints the same line after wiring the clients. There is no
persistent setting for it: `permissions-config.json` grants only `write` and
`commands`, never read paths, and Copilot does not implicitly trust its own
`~/.copilot/skills` directory.

## Everyday use

Create a reusable skill with Claude Code by asking for a **personal skill**.
Claude writes it through `~/.claude/skills` directly into this repository.
Project skills under a project's `.claude/skills/` are not global.

```sh
# Add a skill by dropping its folder in. skills link scaffolds its
# USE_CASES.html and connects it to every filesystem client.
cp -R ~/Downloads/my-skill ~/skillport/skills/
~/skillport/bin/skills link

# See every skill in the library.
~/skillport/bin/skills list

# Write the "how do I use this?" page for a new skill.
~/skillport/bin/skills usecases commit-message
open ~/skillport/skills/commit-message/USE_CASES.html

# Give one project its own copy of specific skills.
cd ~/Projects/job-search && skills use commit-message

# Publish local changes and receive remote changes.
~/skillport/bin/skills sync "feat: add commit-message skill"

# Import a complete skill from GitHub at a pinned commit.
~/skillport/bin/skills import \
  https://github.com/your-name/your-skill-repo

# Import every skill from a repository that ships a whole collection.
~/skillport/bin/skills import \
  https://github.com/your-name/skill-collection --all

# Diagnose skills, links, Copilot registration, and Git state.
~/skillport/bin/skills doctor
```

## Make it yours

The template starts with a small probe skill, the shelf manager, and a commit
message example. Remove or edit those, then add your own with:

```sh
~/skillport/bin/skills new commit-message
~/skillport/bin/skills doctor
~/skillport/bin/skills sync "add commit-message skill"
```

The repository name and plugin name can be changed independently. If you rename
the repository, update `.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json`, then run `skills doctor`.

Restart an AI client after adding or updating skills; clients may cache their
skill inventory for the lifetime of a session.

## The shelf

Too many skills loaded at once causes AI tools to pick the wrong one. Use the
shelf to hide skills you keep available but don't use regularly.

```sh
# See what's on the shelf (stored, not loaded).
~/skillport/bin/skills shelf

# Activate some shelved skills.
~/skillport/bin/skills unshelve commit-message universal-skill-probe

# Deactivate a skill, moving it to the shelf.
~/skillport/bin/skills shelve universal-skill-probe
```

Bulk imports (`skills import --all`) land on the shelf by default, so they don't
flood an active workflow. Or ask the `skill-shelf` skill conversationally: *"I
need a skill for writing release notes"* and it will find, confirm, and activate matches for you.

See [GUIDE.md](GUIDE.md) and the [interactive guide](https://eriic-builds.github.io/skillport/HOW_TO_USE.html) for the full reference.

## Client integration

- **Claude Code:** `~/.claude/skills` links to this repository's `skills/`.
- **Codex CLI:** each shared skill is linked separately into `~/.agents/skills`
  and the deprecated `~/.codex/skills`, so Codex retains its client-owned
  `.system/` skills.
- **GitHub Copilot CLI:** the directory is registered with `copilot skill add`.
- **Copilot in VS Code:** discovers the personal `~/.claude/skills` location.
  Its Configure Skills panel lists each skill twice, once for `~/.claude/skills`
  and once for `~/.agents/skills`. Both are links to the one real copy, so this
  is cosmetic; the Copilot CLI deduplicates and lists each skill once.
- **Google Antigravity:** `~/.gemini/config/skills` links to this repository
  when Antigravity is installed. That configuration root is shared with Gemini
  CLI, which may discover the same skills.
- **Claude Desktop Cowork:** add your repository once as a plugin
  marketplace from Cowork with `/plugin marketplace add
  YOUR_GITHUB_USERNAME/YOUR_REPOSITORY`, then install `skillport@skillport`.
  After `skills sync`, refresh the marketplace **and** update
  `skillport@skillport` in Cowork. Do not install the marketplace in
  Claude Code; its symlink already delivers the same skills. Cowork may request
  separate GitHub authorization for your repository.
- **Claude Desktop Chat and claude.ai:** do not read Claude Code's local
  `~/.claude/skills` folder or Cowork's plugins. Upload individual stable skills
  manually through **Customize → Skills**. Uploaded copies do not update when
  this repository changes.

Per-project copies go to `.claude/skills/` and `.agents/skills/`; see
[GUIDE.md](GUIDE.md).

## Safety

- `link` refuses to overwrite a real client directory or create a dangling link.
- `doctor` explains failures and their fixes.
- `doctor` rejects unexpected files or client-owned directories at the root of
  the canonical `skills/` store.
- `doctor` requires every skill to carry a `USE_CASES.html`, so a skill cannot
  quietly arrive without instructions for using it.
- `doctor` validates the Claude plugin marketplace with Claude's first-party
  validator when Claude Code is installed.
- `sync` aborts a conflicted rebase rather than leaving Git half-finished.
- `sync` increments the Claude plugin patch version when skill content changes,
  allowing Cowork to recognize the new marketplace release.
- `import` copies a full skill at an exact commit and never runs setup commands.
- Skill names must be lowercase-hyphen names matching their folder and must not
  collide with Codex built-ins.

The `universal-skill-probe` skill is temporary. It verifies client discovery by
responding with `GLOBAL_SKILLS_PROBE_OK`.
