# Skillport

One skill library. Only the skills you need, in the tools you choose.

Skillport is a lightweight CLI for managing Agent Skills: folders containing a
`SKILL.md` instruction file and any supporting resources. Keep frequently used
skills active, store occasional ones on a shelf, and connect the active library
to selected AI clients.

## What’s in it for me?

- **Less clutter for your AI.** Shelved skills stay on disk outside the active
  discovery folders. Find and activate them when needed instead of advertising
  the whole collection at startup.
- **One place to maintain skills.** Selected filesystem integrations point to the
  same active library, so you don’t maintain a separate copy for each tool.
- **A small install.** The standalone runtime has zero third-party npm
  dependencies. It excludes this website, Git history, tests, and example skill
  collections. An empty library is the default; the shelf manager is opt-in.
- **Your choice of workflow.** Use local storage with Node alone, import from
  GitHub when needed, or sync a Git-backed library you own.

Skillport does not install AI applications or automatically install the
dependencies an imported skill might need. Marketplace installations, manual
uploads, and project-local copies remain separate from the shared library.

[Website](https://eriic-builds.github.io/skillport/) ·
[Installation details](INSTALL.md) · [Usage reference](GUIDE.md) ·
[Changelog](CHANGELOG.md)

## Install on macOS or Windows

### 1. Get the small runtime

You need **Node.js 20 or newer** already installed. There is no `npm install`
step. Git is needed only for importing from GitHub and Git-backed sync; GitHub
CLI is optional.

The current runtime downloads are **GitHub Actions artifacts**:

1. Open [Runtime tests](https://github.com/eriic-builds/skillport/actions/workflows/test.yml)
   and select a successful run for `main`.
2. Download its `runtime-preview` artifact.
3. Unpack that artifact, then extract the inner `skillport-<version>.zip`
   (Windows) or `skillport-<version>.tar.gz` (macOS).
4. Open a terminal in the extracted `skillport` folder containing `bin/`.

The artifact also contains `SHA256SUMS` and `manifest.json` with checksums, file
lists, and exact sizes. CI checks both archive formats and enforces a 250 KB
compressed ceiling per archive.

The existing **v0.3.0 release predates the minimal-runtime improvements and has
no runtime assets attached**. Its GitHub “Source code” downloads are full source
archives, not the small runtime. The
[Minimal runtime artifacts workflow](https://github.com/eriic-builds/skillport/actions/workflows/release.yml)
also produces a `skillport-runtime` Actions artifact on tags or manual runs;
it does not automatically attach files to a GitHub release or publish to npm.

### 2. Choose your library and clients

These examples configure **Codex only** and explicitly add the small shelf
manager. Replace `codex` with the clients you use. Omit `--starter shelf` to
start with zero active skills.

macOS:

```sh
node bin/skills.mjs install --library "$HOME/skillport" --clients codex --starter shelf --yes
```

Windows PowerShell:

```powershell
node .\bin\skills.mjs install --library "$HOME\skillport" --clients codex --starter shelf --profile $PROFILE --yes
```

Keep the runtime folder separate from your writable library. A runtime upgrade
can then replace the program without replacing your skills.

Installation sets up a `skills` shell function. Open a new terminal, or run the
profile-loading command printed by the installer. Restart the selected AI client
to refresh skill discovery.

If you skip shell setup, keep invoking `node /path/to/runtime/bin/skills.mjs`
directly. On Windows, `bin\skills.cmd` is also available; `bin\skills.ps1`
passes the invoking PowerShell edition’s profile automatically. Skillport does
not change PowerShell execution policy or request administrator elevation.

Useful install options:

| Option | What it does |
| --- | --- |
| `--clients codex,claude` | Configure just those integrations. |
| `--clients auto` | Detect clients from known folders or executable probes; used when no selection is saved or supplied. |
| `--clients none` | Set up storage without configuring client integrations. |
| `--starter shelf` | Add only the shelf-manager skill; never overwrite a custom manager. |
| `--dry-run` | Preview installation without writing files or registering clients. Use instead of `--yes`. |
| `--no-shell` | Skip profile changes. |
| `--profile <path>` | Use an explicit shell profile; on PowerShell, pass `$PROFILE`. |
| `--library <path>` | Use a separate writable library. |

## Use the shelf

Your library has two skill stores:

```text
your-library/
├── skills/       Active skills exposed through selected integrations
├── shelf/        Stored skills, not linked into active discovery
└── .skillport/   Local client selection and shell-profile settings
```

```sh
skills list                    # List active skills
skills shelf                   # Browse stored skills and descriptions
skills unshelve my-skill        # Activate a shelved skill
skills shelve my-skill          # Put an active skill away
skills doctor                  # Check skills and selected integrations
```

With the optional shelf manager active, ask for a skill you need; it can search
the shelf and request approval to activate a match. It lists the shelf on demand,
rather than exposing all stored skill descriptions at startup.

Restart the client or start a new session after changing the active set.
**Shelving does not erase instructions already loaded in an ongoing chat.**
It also does not remove project copies, marketplace versions, or uploaded
snapshots. The shelf manager itself cannot be shelved.

## Add skills

### Create your own

```sh
skills new my-skill
# Edit skills/my-skill/SKILL.md in your library.
skills link
skills doctor
```

`new` creates only `SKILL.md` by default. You can also copy an existing skill
folder into the library’s `skills/` directory and run `skills link`.

HTML usage guides are optional: use `skills usecases my-skill`, or add
`--use-cases` to `new` or `import`. Imported supporting files, including HTML
assets, are preserved; Skillport does not filter resources by extension to
make the installation smaller.

### Import from GitHub

Replace the example repository and skill name with your source:

```sh
# Import one skill into the active library.
skills import https://github.com/OWNER/REPO my-skill

# Import a collection onto the shelf, without activating it.
skills import https://github.com/OWNER/REPO --all
```

Import currently accepts HTTPS GitHub repository URLs. If a repository contains
several skills, choose one by name, select interactively, or use `--all`.
Duplicate names in a batch are rejected instead of silently choosing a copy.

Each import records its source commit in `.source.json`. For a repeatable
revision, pass `--commit <full-40-character-SHA>`. Without that option, the
current remote HEAD is used.

Import scans for suspicious patterns and never runs the imported skill’s setup
commands. If blocked, inspect the reported content before retrying with the
printed `--reviewed <token>`. Use the same commit and options on the retry.
Review approval is bound to the imported content and rule version; editing a
reviewed skill invalidates it. Pattern checks are not a security guarantee.

Standalone imports save files locally without creating a Git repository.
Git-backed imports commit the additions; unrelated staged changes block the
import. A later client-registration failure retains saved files and reports how
to repair the integration.

## Choose integrations

Run `skills link --clients codex,claude` to save a different selection. Selection
is local to each library on each machine and is reused by linking, activation,
and health checks. Changing the selection does **not** uninstall old integrations
or remove previously created links; shared and personal paths are preserved.

These are the paths and operations Skillport currently configures:

| Selection | Integration |
| --- | --- |
| `claude` | Whole-library link at `~/.claude/skills`. |
| `codex` | Per-skill links in `~/.agents/skills` and `~/.codex/skills`; preserves client-owned `.system/`. |
| `copilot` | Registers the active directory with `copilot skill add`. |
| `vscode` | Uses the shared `~/.claude/skills` link. |
| `antigravity` | Whole-library link at `~/.gemini/config/skills`. |

Here `~` means your home directory. On Windows, directory links use junctions.
Existing real directories or foreign links cause a conflict rather than being
overwritten. Resolve conflicts deliberately; do not delete personal skills just
to make installation succeed.

For selected Copilot CLI integrations with multi-file skills, `skills shell-setup`
generates a wrapper with `--add-dir` for the library. Run it again after adding
supporting files if `doctor` reports a missing allowance. On Windows, use
`skills shell-setup --profile $PROFILE`.

Cowork marketplace installation is manual: refresh the marketplace and update
the installed plugin after publishing changes. Claude Desktop Chat uploads are
independent snapshots and need manual replacement. Neither is automatically
wired by `skills link`.

## Optional: sync your own Git-backed library

Use a clone of a repository **you own or can push to**. A full clone includes its
source, documentation, history and bundled examples; it is not the minimal
runtime download.

Replace `OWNER/YOUR-LIBRARY` before running:

```sh
git clone https://github.com/OWNER/YOUR-LIBRARY.git skillport-library
cd skillport-library
node bin/skills.mjs install --clients codex --yes
```

That example assumes a full Skillport-based repository with `bin/`. On
PowerShell, add `--profile $PROFILE`. Alternatively, use a separate extracted
runtime with `--library <path-to-your-clone>`.

The full template currently includes `commit-message`, `skill-shelf`, and
`universal-skill-probe` in its active store. Shelve examples you don’t need.
This differs from the standalone runtime’s empty default.

```sh
skills sync "Update my skills"
```

`sync` stages **all repository changes**, commits them, pulls with rebase,
reconciles active links, and pushes to the configured upstream. Review
`git status` first. It does not initialize a repository, configure an upstream,
or give you permission to push to this public template.

Marketplace metadata is optional for filesystem-only Git libraries. When a
plugin manifest exists, installation can adopt the GitHub origin identity, doctor
checks it, and sync can bump its patch version for skill changes. Cowork still
needs a separate marketplace refresh and plugin update.

## Project copies and troubleshooting

From a project directory, `skills use my-skill` copies an active skill into that
project’s skill locations. These copies do not follow later library edits or
shelf moves. Use `skills unuse my-skill` to remove Skillport-managed copies.

`skills doctor` and `skills doctor --json` run the same checks and return a
nonzero exit code for failures. They report problems without repairing them.
Use `skills link` for link reconciliation and `skills shell-setup` for profile
setup, then restart clients.

For multiple libraries, use direct Node invocation with `--library` to make
the target explicit. A generated shell function is bound to the library used
during setup.

## Development and verification

```sh
npm test
```

Tests use Node’s built-in test runner and isolated temporary homes. CI covers
macOS and Windows with Node 20 and 24, including PowerShell 5.1/7 launchers,
cross-volume imports, failed-operation recovery, and shelf reconciliation.
Client commands are tested with fixtures; a passing test is not proof that a
running third-party client has refreshed its inventory.

On a Linux build host with tar and zip available:

```sh
node scripts/package-runtime.mjs
node scripts/verify-runtime.mjs
```

Verification also needs unzip and npm. These are build-time tools, not end-user
runtime dependencies. The checks extract and install both archive formats,
validate checksums and file lists, and inspect `npm pack --dry-run`.
