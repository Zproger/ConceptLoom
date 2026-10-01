# Learning with books, courses, and files

[Documentation home](../../README.md) · [Русская версия](../ru/learning-with-source-materials.md)

Use the source for content and Concept Loom for questions, connections, practice, and evidence of understanding. Do not replace reading with a complete AI summary. Use only materials you are allowed to access.

## 1. Organize the workspace

```text
learning-workspace/
├── originals/    unchanged source files
├── prepared/     searchable text and index
├── notebook/     goal, route, and knowledge state
├── exercises/
└── projects/
```

Keep originals unchanged.

## 2. Prepare common formats

### PDF

```bash
pdfinfo "originals/book.pdf"
pdftotext -layout "originals/book.pdf" "prepared/book.txt"
pdftotext -f 25 -l 48 "originals/book.pdf" "prepared/chapter-02.txt"
```

An empty or broken extraction may require OCR. Verify important formulas, tables, negations, and page references against the original.

### EPUB

```bash
mkdir -p prepared/epub
unzip -q "originals/book.epub" -d prepared/epub
```

Ask the agent to use the EPUB manifest and spine—not alphabetical filenames—to determine chapter order. Preserve useful headings, footnotes, captions, formulas, and tables.

### Markdown, text, HTML, DOCX, and RTF

Markdown, text, and HTML are already searchable. Prefer one meaningful unit per file. On macOS, extract DOCX or RTF with:

```bash
textutil -convert txt -output "prepared/document.txt" "originals/document.docx"
```

Compare complex equations and tables with the original.

### Video and audio

Use official subtitles, transcripts, notes, or a trusted transcription tool. Keep timestamps. To extract audio:

```bash
ffmpeg -i "originals/lesson.mp4" -vn -ac 1 -ar 16000 "prepared/lesson.wav"
```

This does not transcribe speech. Export slides to PDF and preserve code or notebooks in their original structure.

## 3. Build an index, not a giant prompt

```text
Inspect prepared/ for navigation. Create prepared/index.md with each unit's title,
path, concepts, prerequisites, and source location. Do not summarize the entire
work or begin teaching.
```

Preserve chapter boundaries and let the agent read relevant files selectively.

## 4. Personalize the source order

```text
Use $concept-coach. My practical outcome is [OUTCOME]. Read prepared/index.md
and verify relevant source sections. Identify required, prerequisite, and optional
units; diagnose my knowledge; propose a personal dependency route; wait for approval.
```

## 5. Use a before–during–after cycle

- **Before:** ask why the unit matters and what questions to investigate, without revealing its conclusions.
- **During:** provide a file, page, section, or timestamp and ask for the first missing prerequisite—not a summary of everything.
- **After:** explain the author's problem, premises, conclusion, and limits from memory; then repair one mismatch at a time and apply it in a new context.

## 6. Separate author claims from current evidence

```text
Split the analysis into Source view (what the author claims, with location) and
Evidence view (whether important claims remain supported by current primary or
official sources). Show disagreements or outdated assumptions explicitly.
```

## 7. Protect exercises

```text
Do not read or reveal the solution before recording my attempt. Ask me to state
the goal, known information, and likely connection. Use the smallest possible
hint. After completion, give a new problem with different surface details.
```

## 8. Record evidence, not exposure

```text
secure         recalled and applied in a new problem
fragile        recognizable but unreliable in use
missing        not yet built
misconception  an incorrect model was detected
```

At the end of each session, update `notebook/knowledge-state.md` with source location, demonstrated evidence, remaining weakness, and the next review point.

## Starter prompt

```text
Use $concept-coach.

I am studying [BOOK OR COURSE]. Originals are in originals/ and searchable text
is in prepared/. My practical outcome is [OUTCOME]. Build or inspect the index,
separate source claims from claims needing verification, diagnose prerequisites,
and propose a personal route. Wait for approval. Require my attempt before help,
check one connection at a time, use transfer problems, preserve source references,
update concise state in notebook/, and never modify originals/.
```
