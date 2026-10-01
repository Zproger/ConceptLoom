# Learning without existing materials

[Documentation home](../../README.md) · [Русская версия](../ru/learning-from-scratch.md)

Use this workflow when you have a subject in mind but no book, course, or syllabus.

> [!WARNING]
> This mode is best limited to **basic, widely documented concepts** for which reliable information is abundant and current AI models are generally well informed. Do not rely on material-free learning for a new or rapidly changing technology, deep real-world case studies, or the firsthand experience of practitioners. An AI has no personal human experience and cannot replace an author, teacher, or professional who actually lived through the situation being discussed. It may summarize published stories, but that does not make them its own experience or guarantee every detail is accurate. For deeper study, stronger grounding, real cases, and practitioner experience, use the [books, courses, and source materials workflow](learning-with-source-materials.md).

## 1. Create a workspace

```bash
node scripts/setup.mjs codex --target /path/to/learning-workspace
cd /path/to/learning-workspace
codex
```

## 2. Define an outcome, not a subject

```text
Use $concept-coach.

I want to learn [TOPIC], but I do not have materials yet. Help me turn this
into a practical, observable outcome. Ask where I will use it, the depth I need,
and my available time. Do not begin teaching yet.
```

A good outcome describes something you will be able to do, explain, decide, or build.

## 3. Build a source map

```text
Find a small set of authoritative sources for this outcome. Prefer official
documentation, standards, primary research, and maintained university material.
Record each source's link, date or version, purpose, and limitations in
notebook/sources.md. Separate established facts from contextual or disputed claims.
```

Require stronger verification for medicine, law, finance, safety, security, and rapidly changing topics. Concept Loom is a learning aid, not a licensed professional.

## 4. Locate your frontier

```text
Diagnose only the prerequisite strands needed for my outcome. On each strand,
find something I understand reliably and the point where errors or honest
uncertainty begin. Determine whether a mistake is a slip, local gap, or misconception.
```

Use “I do not know yet” instead of guessing.

## 5. Approve the route

```text
Propose the smallest dependency path from what I understand to my outcome.
Show what we are leaving out and define a practical completion task. Save it to
notebook/learning-map.md, then wait for my approval.
```

## 6. Work one connection at a time

```text
Take the first unsecured node. Explain why it is needed, help me derive it from
established ideas, and let me try before giving the answer. Then use a checkpoint,
ask me to explain the connection, and give one new application problem. Do not
advance until the weakness is repaired.
```

When stuck, use a hint ladder: restate the problem, identify the missing connection, ask a guiding question, give a minimal hint, show one next step, and reveal the full solution only when requested. After help, solve a similar problem unaided.

## 7. Make something small

```text
Give me a 30–60 minute mini-project using only secured nodes. Agree on completion
criteria first. Do not implement it for me; review my decisions and result.
```

## 8. Preserve progress

```text
notebook/
├── goal.md
├── sources.md
├── learning-map.md
├── knowledge-state.md
├── misconceptions.md
└── sessions/
```

At the end, record demonstrated knowledge, fragile points, corrected misconceptions, and the exact starting question for next time—not a full transcript. At the next session, retrieve important connections before rereading them.

## 9. Finish with transfer

You are ready to stop when you can reconstruct the main chain without notes, explain why its steps are needed, apply them in a new situation, recognize their limits, and complete the original outcome.

```text
Test the original outcome with a new integrated situation. Do not reuse earlier
examples. Ask me to justify my choices, then report what is secure, what remains
fragile, and the minimum work needed to close the gap.
```
