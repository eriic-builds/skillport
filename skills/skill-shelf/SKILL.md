---
name: skill-shelf
description: Activate skills from the shelf — the repository of skills you keep available but don't load by default. Use this when you need a skill that isn't currently active.
---

# skill-shelf

Activate skills from the shelf — the repository of skills you keep available but don't load by default. Use this when you need a skill that isn't currently active.

When the user asks for a skill that may be shelved:

1. Run `skills shelf` to inspect the available shelved skills.
2. Match the user's request to the listed descriptions and show the matching names.
3. Ask for confirmation before changing anything. Never activate a skill just because it seems relevant.
4. After confirmation, run `skills unshelve <name>...` and tell the user to restart the AI client so it discovers the newly active skills.

If the user asks to put an active skill away, run `skills shelve <name>...` only after confirmation, then mention that it is now stored in `shelf/` and no longer loaded.

Restart the client or begin a new session to refresh discovery. Shelving cannot
erase instructions already loaded in an ongoing conversation. Project-local
copies created by `skills use`, manually uploaded copies, and marketplace
installations are independent; update or remove them separately when requested.
