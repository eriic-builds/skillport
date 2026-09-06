---
name: skill-shelf
description: Find and activate skills stored on the shelf when the user needs them.
---

# Skill shelf

The active library is intentionally small. Shelved skills stay available on disk
without being advertised to the AI client at startup.

1. Run `skills shelf` only when a user needs a skill that is not active.
2. Match the request to the descriptions and present only relevant skill names.
3. Ask permission before activating a skill, unless the user already explicitly
   requested that activation. Run `skills unshelve <name>` after approval.
4. Tell the user to restart the client or start a new session to refresh skill
   discovery. Activation does not inject instructions into the current session.

When asked to put a skill away, run `skills shelve <name>` and explain that it
remains available on the shelf. Restart the client to clear its cached discovery
list. Shelving does not erase instructions already loaded in a conversation.
Project-local copies made with `skills use` are independent; shelving the library
skill does not remove them. Use `skills unuse` in that project when requested.
Never execute setup scripts from a skill merely because it has been activated.
