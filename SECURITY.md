# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub Security Advisories instead of opening a public issue. Include reproduction steps, affected files, and the expected impact when possible.

## Local data model

Concept Loom runs as a local stdio MCP server. It does not open a network listener. Learning notes and resumable state are written inside the selected learning workspace.

The connected AI client may still read local source materials or use network tools according to that client's permissions. Review the client's permission prompts and avoid placing credentials or unrelated private files in a learning workspace.

## Before publishing a fork

- Do not commit `.env`, `.mcp.json`, `opencode.json`, credentials, private keys, books, courses, or generated learning state.
- Inspect `git diff --cached` before every push.
- If a secret was ever committed, revoke it first; removing it in a later commit is not sufficient.
