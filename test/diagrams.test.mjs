import test from "node:test";
import assert from "node:assert/strict";
import { prepareMermaid, prepareTextDiagram } from "../src/diagrams.mjs";

test("returns Mermaid as a terminal-visible fenced block", () => {
  const result = prepareMermaid({ label: "Flow", source: "flowchart LR\n  A --> B" });
  assert.equal(result.format, "mermaid");
  assert.equal(result.markdown, "```mermaid\nflowchart LR\n  A --> B\n```");
});

test("returns a monospace text diagram", () => {
  const result = prepareTextDiagram({ source: "Dockerfile -> Image -> Container" });
  assert.equal(result.format, "text");
  assert.match(result.markdown, /^```text/);
});

test("rejects nested Markdown fences", () => {
  assert.throws(() => prepareMermaid({ source: "```mermaid\ngraph LR" }), /must not include/);
});
