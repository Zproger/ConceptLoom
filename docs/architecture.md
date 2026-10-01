# Architecture notes

## Boundary

Concept Loom standardizes deterministic learning artifacts, not the surrounding chat UI.

The MCP process owns answer concealment, choice mixing, grading, notebook path enforcement, persistence, and diagram formatting. The host owns model interaction, native questions, web access, permissions, and subagent orchestration.

## Checkpoint lifecycle

```text
coach supplies claims + expected keys
                |
                v
loom_frame_checkpoint
  validates -> mixes -> stores private card -> returns public card + token
                |
                v
host presents public card and gathers learner keys
                |
                v
loom_assess_checkpoint
  consumes token -> exact-set comparison -> returns outcome + rationale
```

The answer and rationale never appear in the first result. A token is removed as soon as it is assessed, preventing accidental regrading with a different response.

## Persistence

Checkpoint cards deliberately remain ephemeral. Notebooks and learning-state files are persistent workspace artifacts. This avoids storing hidden answer material on disk while keeping the learner's useful record portable.

## Portability

The server implements the small JSON-RPC surface required for MCP initialization, tool discovery, and tool invocation directly on Node's standard library. There is no build step and no SDK version coupling. Each host adapter contains only the conventions that genuinely differ between hosts.
