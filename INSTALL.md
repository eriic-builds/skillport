# Install Skillport

Use this when the library is not installed on the current machine yet.

```sh
git clone <your-repo-url> ~/skillport
cd ~/skillport
./bin/skills install --yes
./bin/skills doctor
```

The install command does three safe, idempotent things:

1. matches the library metadata to the GitHub origin;
2. links the library into supported clients;
3. adds the `skills` shell alias and Copilot `--add-dir` allowance when needed.

If you are testing a fresh machine, run the dry run first:

```sh
cd ~/skillport
./bin/skills install --dry-run
```

Then restart your AI clients so they pick up the new library links. For multi-file
skills, the shell alias and Copilot allowlist are what make the library readable.
