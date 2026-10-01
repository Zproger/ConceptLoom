# How Concept Loom works

[Documentation home](../../README.md) · [Русская версия](../ru/how-it-works.md)

Concept Loom is not another AI model or a standalone teaching application. It is a learning workflow plus a small local MCP server connected to Codex, Claude Code, or OpenCode.

## The simple model

```text
You                 choose the goal, attempt answers, and practise
AI client           conducts the lesson and reads your materials
concept-coach skill tells the AI how to teach
MCP server          handles checks, notes, and terminal diagrams
workspace files     preserve useful progress between sessions
```

The AI remains the teacher. The MCP server only performs operations that should be consistent and predictable.

## The learning cycle

### 1. Locate

The coach turns a broad subject into an observable outcome and finds the edge of your understanding. “Deploy a small application in a container and diagnose common failures” is more useful than “learn Docker.” Short checks establish what is secure, where uncertainty begins, and whether a mistake is a slip or a misconception.

### 2. Weave

The coach proposes the smallest dependency path from what you know to the outcome:

```text
known idea → necessary connection → new idea → practical outcome
```

You approve this map before teaching begins. Irrelevant branches are deliberately left out.

### 3. Build

Each connection follows one loop:

1. Explain why it is needed now.
2. Establish it from something already understood.
3. Make the dependency explicit.
4. Let the learner attempt an answer or task.
5. Check the connection.
6. Repair it before moving forward if needed.

Important ideas should also be explained freely or applied in a new situation. Selecting the right option once is not proof of mastery.

## Architecture

```text
┌──────────────────────────────────────┐
│ Codex / Claude Code / OpenCode       │
│ conversation, files, research, UI    │
└──────────────────┬───────────────────┘
                   │ MCP calls
┌──────────────────▼───────────────────┐
│ Concept Loom                         │
│ checkpoints · notebook · diagrams    │
└──────────────────┬───────────────────┘
                   │ files
┌──────────────────▼───────────────────┐
│ Learning workspace                   │
│ Markdown notes · state · materials   │
└──────────────────────────────────────┘
```

### Skills and adapters

The shared method lives in `shared/coaching-reference.md`. Directories under `adapters/` translate it into each client's conventions. `scripts/setup.mjs` installs the right adapter without overwriting existing configuration.

### MCP bridge

`src/bridge.mjs` is a local Node.js MCP process. It communicates over standard input/output, opens no network listener, and exposes eight tools:

| Tool | Purpose |
|---|---|
| `loom_frame_checkpoint` | Validate and shuffle a question without returning its answer. |
| `loom_assess_checkpoint` | Grade a response and reveal the rationale. |
| `loom_start_notebook` | Create or open a Markdown notebook. |
| `loom_add_note` | Append a useful learning event. |
| `loom_save_learning_state` | Persist the route and exact resume point. |
| `loom_load_learning_state` | Restore the latest or a named learning session. |
| `loom_show_relation_map` | Return a Mermaid block for the conversation. |
| `loom_show_text_diagram` | Return a monospace diagram for the terminal. |

### Checkpoints

`src/checkpoints.mjs` stores expected choice keys behind a random token. The learner receives the prompt, shuffled choices, token, and an “I do not know yet” option—but not the expected keys or rationale.

Results are `accurate`, `needs-repair`, or `knowledge-gap`. Tokens live in memory for up to six hours, work once, and disappear when the MCP process restarts.

### Notebook and diagrams

`src/notebook.mjs` writes selected learning events to Markdown and restricts paths to the active workspace. It does not record the whole conversation automatically.

`src/diagrams.mjs` prepares fenced Mermaid and text blocks. They are shown directly in the conversation and can also be appended to the notebook. No renderer or separate image file is required.

## What persists

Saved between sessions: skills, host instructions, notebooks, your materials, Codex MCP registration, and learning state in `.concept-loom/sessions/`.

The saved learning state includes the goal, route, secured connections, known gaps, and exact next step. Unfinished checkpoint cards, the whole conversation, and a review schedule are not persisted.

## Current limitations

- There is no separate UI; the host client supplies it.
- Free-form explanations are judged by the model, not deterministic code.
- Research depends on the host's web tools and permissions.
- Review dates can be recorded but are not scheduled automatically.
- A skill guides a model but cannot guarantee perfect compliance.

## Repository map

```text
src/          MCP implementation
shared/       host-neutral learning method
adapters/     client integrations
scripts/      safe installer
test/         Node test suite
docs/en/      English documentation
docs/ru/      Russian documentation
```

Next: [learn from scratch](learning-from-scratch.md) or [use books and courses](learning-with-source-materials.md).
