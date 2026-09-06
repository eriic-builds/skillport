# Install Skillport

## Minimal standalone library

The runtime ZIP/tar.gz contains only the CLI, license, runtime metadata, and a
small optional shelf-manager template.
It does not include the website, Git history, an AI application, or a collection
of active skills. Node.js 20 or newer must already be installed. There is no
`npm install` step and no third-party runtime dependency.

Extract the runtime archive into a folder of your choice, then run from that
folder on macOS:

```sh
node bin/skills.mjs install --library "$HOME/skillport" --clients codex --yes
```

On Windows PowerShell:

```powershell
node .\bin\skills.mjs install --library "$HOME\skillport" --clients codex --profile $PROFILE --yes
```

The Windows `bin\skills.cmd` launcher also works from Command Prompt without
changing PowerShell execution policy. `bin\skills.ps1` supplies the invoking
PowerShell edition's profile automatically. Node invocation is available if
your policy prevents running unsigned PowerShell scripts.

Choose `--clients none` for a library without client integration, `--clients auto`
for detected clients, or a comma-separated selection of `claude,codex,copilot,vscode,antigravity`.
Selections are saved per machine. Existing client folders are checked before
linking; conflicts must be resolved without overwriting personal skills.
Add `--no-shell` to skip shell setup, or `--dry-run` to preview without writes.

The empty standalone library starts with no active examples. Add your own skill
with `node bin/skills.mjs --library "$HOME/skillport" new my-skill`.
Add `--starter shelf` to the install command to activate only the shelf manager.
It helps find shelved skills on demand without listing every skill to the AI at
startup. Existing custom shelf managers are never overwritten. Client discovery
may require a restart; shelving does not erase content from an ongoing chat or
remove independent project-local copies.
Git is needed for imports and for Git-backed sync, but not for standalone
listing, linking, shelving, or health checks. GitHub CLI is optional.

## Git-backed library

Use a clone of your own GitHub repository if you want to push and sync changes.
Cloning the public template does not grant permission to push to its owner's
repository. This workflow includes repository documentation and history; use
the standalone runtime above when you only want the CLI.

Use this when the library is not installed on the current machine yet.

```sh
git clone <your-repo-url> ~/skillport
cd ~/skillport
./bin/skills install --yes
./bin/skills doctor
```

For a Git-backed library, installation performs these steps:

1. matches the library metadata to the GitHub origin;
2. links the library into selected clients;
3. configures the `skills` command in the selected shell profile unless disabled.

If you are testing a fresh machine, run the dry run first:

```sh
cd ~/skillport
./bin/skills install --dry-run
```

Then restart your AI clients so they pick up the new library links. For multi-file
skills, the shell alias and Copilot allowlist are what make the library readable.

Cowork marketplace installation and updates are separate manual steps. Claude
Desktop Chat uploads and project-local skill copies do not automatically change
when a global skill is shelved. See GUIDE.md for those workflows.
