# Changelog

All notable changes to this template are documented here. This is the
**repository's own version** (`package.json`), not the Claude plugin
version in `.claude-plugin/plugin.json` — that one tracks the marketplace
plugin separately and is bumped automatically by `skills sync` whenever
`skills/` changes.

There is no update-pulling tool in this template by design (see `GUIDE.md`):
if you forked this repo earlier, use this file to see what changed upstream
and hand-apply anything you want.

## [0.2.0] — 2026-08-22

### Changed
- Rebuilt `HOW_TO_USE.html` for real client parity. The guide previously
  gave a full panel to Claude Code / Cowork / Desktop Chat while GitHub
  Copilot CLI, VS Code, Codex, and Antigravity only got a one-line mention.
  The "Add to Claude" panel is now "Connect clients": a parity table
  covering all seven surfaces up front, then a dedicated walkthrough for
  the five local clients that one `skills link` wires together, correctly
  scoped to "whichever are installed" rather than an unconditional promise.
- Fixed several leftover inaccuracies from the original private-repo
  genericization pass in `HOW_TO_USE.html`: job-search-flavored example
  text, a mislabeled "private" marketplace, an inaccurate worked shelf
  example, a wrong claim about internet/hosting requirements, and a
  `skills list` output example missing a field the CLI always prints.
- Added a missing onboarding step: Setup now walks through aliasing
  `skills` to the repo's `bin/skills`, since every later command in the
  guide assumes the short form works.

### Fixed
- `README.md` and `GUIDE.md` both had a literal personal path
  (`/Users/ericlam/skillport`) baked into the Copilot CLI `--add-dir`
  alias example. Replaced with `~/skillport` so the example is correct
  for anyone who clones the template.

## [0.1.0] — 2026-08-22

### Added
- Initial public release: forked from a private skills library into a
  clean, template-flagged repository.
- `bin/skills` (Node.js CLI): `link`, `doctor`, `list`, `sync`, `use`,
  `unuse`, `import`, `usecases`, `shelf`, `shelve`, `unshelve`, `new`.
- Starter skills: `commit-message` (worked example), `skill-shelf`
  (meta-skill for the shelf), `universal-skill-probe` (client wiring
  check).
- `README.md`, `GUIDE.md`, and an interactive `HOW_TO_USE.html` guide,
  published live via GitHub Pages.
- `.claude-plugin/plugin.json` and `marketplace.json` so the library can
  also be installed as a Claude Cowork plugin.
- MIT license.
