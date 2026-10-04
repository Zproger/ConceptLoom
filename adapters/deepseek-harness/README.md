# DeepSeek Harness Adapter for Concept Loom

This adapter connects Concept Loom to [DeepSeek Harness (`dsh`)](https://github.com/deepseek-ai/deepseek-harness).

## Quick Start

### 1. Workspace Installation

To install Concept Loom into a learning workspace:

```bash
# Using deepseek-harness or dsh
node scripts/setup.mjs deepseek-harness --target /path/to/learning-workspace
```

This installs:
- `.dsh/skills/concept-coach/` — the coaching skill and reference guide
- `.dsh/agents/evidence-scout.md` — claim-verification subagent definition
- `AGENTS.md` — workspace instructions for the harness
- `.dsh/cordis.patch.yml` — workspace-level Cordis patch configuration
- Registers the `concept-loom` MCP server in `$DSH_HOME/cordis.patch.yml`

To skip global MCP registration and only install workspace files:
```bash
node scripts/setup.mjs deepseek-harness --target /path/to/learning-workspace --skip-mcp
```

### 2. Start Learning

From your learning workspace:

```bash
cd /path/to/learning-workspace
npx @deepseek-ai/dsh
```

Or if `dsh` is in your PATH:
```bash
dsh web
```

### 3. Usage as a Profile Bundle

You can also register this adapter as a profile bundle in DeepSeek Harness:

```bash
dsh plugin --profile web add /path/to/ConceptLoom/adapters/deepseek-harness
```

## Features

- **MCP Tools**: Connected under `mcp__concept-loom__*` (or `loom_*`):
  - `loom_frame_checkpoint`
  - `loom_assess_checkpoint`
  - `loom_start_notebook`
  - `loom_add_note`
  - `loom_save_learning_state`
  - `loom_load_learning_state`
  - `loom_show_relation_map`
  - `loom_show_text_diagram`
- **Interactive Questioning**: Uses DeepSeek Harness's native `ask_user_question` tool.
- **Skill Discovery**: Automatically discovered via `@deepseek-ai/dsh-skill-filesystem`.
