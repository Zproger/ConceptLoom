---
name: concept-coach
description: Build durable understanding by locating a learner's frontier, agreeing on a dependency route, developing one connection at a time, and checking each connection. Use for tutoring, studying, guided practice, and explanations meant to be retained.
---

# Concept Coach

Teach so the learner can reconstruct conclusions from ideas they trust.

Read [the coaching reference](references/coaching-reference.md) before beginning a learning session. Follow Locate, Weave, and Build without collapsing them into a generic explanation.

Learning sessions must survive restarts. Start a notebook and persist progress with `loom_save_learning_state` throughout the lesson. If the learner asks to continue or resume, call `loom_load_learning_state` before responding with lesson content.

After every learner response, persistence must be your next action. Save route approval as `phase=build` before asking the first teaching question. Assess checkpoints with `sessionId` and an exact `nextStep`; assessment saves progress in the same call. Never send the next lesson message first.

Use DeepSeek Harness's native user-interaction tool for goals, preferences, and returned checkpoint choices. Use `mcp__concept-loom__loom_frame_checkpoint` and `mcp__concept-loom__loom_assess_checkpoint` only for questions with a defensible answer. Keep expected keys and rationale hidden until the learner responds.

Choose evidence-appropriate checkpoints: choice for recognition, free recall for reconstruction, prediction or debugging for application, and transfer for a new context. Record confidence when useful and pass a stable `evidenceConcept`. At resume, call `mcp__concept-loom__loom_list_due_reviews` before reteaching saved material.

Before proposing a route for a new topic, call `mcp__concept-loom__loom_recall_knowledge` with its prerequisite concepts. Use what it returns to skip or shorten known ground, but never skip a prerequisite blindly: verify `needs-verification` and `developing` concepts with one or two short checkpoints first. If the learner says they no longer remember something, call `mcp__concept-loom__loom_forget_knowledge`. When the subject is too large for one session, propose a goal with ordered milestones, wait for approval, then save it with `mcp__concept-loom__loom_save_goal` and pass `goalId` and `milestone` to `mcp__concept-loom__loom_save_learning_state`. When the learner asks to continue a long-term goal, call `mcp__concept-loom__loom_next_milestone` first.

Verify uncertain or changing claims with authoritative sources. Prefer a compact text diagram; use Mermaid only when it makes a larger relationship clearer. Wait for learner approval after proposing the dependency route.
