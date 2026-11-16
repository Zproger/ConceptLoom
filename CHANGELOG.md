# Changelog

All notable changes to Concept Loom are documented here.

## Unreleased

### Added

- Cross-project knowledge map (`~/.concept-loom/knowledge.json`) fed by checkpoint evidence, with `loom_recall_knowledge`, `loom_forget_knowledge`, and `loom_import_knowledge`.
- Stale-knowledge detection: concepts not verified for 90 days or reported forgotten are shown as `needs-verification`.
- Long-term goals with ordered milestones: `loom_save_goal` and `loom_next_milestone`.
- Optional `goalId` and `milestone` on learning sessions (session schema version 3; older sessions load unchanged).
- `CONCEPT_LOOM_HOME` to relocate or disable (`off`) the knowledge map.

### Fixed

- A partial `loom_save_learning_state` no longer erases the route, secured connections, or gaps (#5).
- Claude Code and OpenCode installers now JSON-escape the server path, fixing invalid config on Windows (#5).

## 1.1.0 — 2026-10-06

### Added

- DeepSeek Harness adapter with native `.dsh/skills` discovery.
- Generated Harness MCP patch for Web and headless profiles.
- Installer coverage for normal and `--skip-mcp` DeepSeek Harness setup.
- Open-response checkpoints for free recall, prediction, debugging, and transfer.
- Confidence calibration and per-concept evidence for recognition, recall, application, and transfer.
- Guided, practice, review, and challenge session modes.
- Delayed review scheduling and due-review discovery across sessions.
- Explicit route extensions for prerequisites discovered during Build.

## 1.0.0 — 2026-10-01

First public release.

### Included

- Portable Concept Coach skill for Codex, Claude Code, and OpenCode.
- Locate → Weave → Build learning workflow.
- Concealed-answer checkpoints with explicit knowledge-gap handling.
- Persistent Markdown notebooks and resumable learning state.
- Save-before-continue behavior after learner responses.
- Terminal-readable text and Mermaid diagrams without image renderers.
- Learning workflows for both supplied source materials and foundational topics.
- Safe workspace installer and bilingual English/Russian documentation.
