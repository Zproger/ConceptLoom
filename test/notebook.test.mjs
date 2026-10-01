import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beginNotebook, addNotebookEntry, resolveNotebookPath } from "../src/notebook.mjs";

test("creates and extends a notebook", async () => {
  const root = await mkdtemp(join(tmpdir(), "loom-test-"));
  await beginNotebook(root, { path: "notes/session.md", title: "Vectors" });
  await addNotebookEntry(root, { path: "notes/session.md", kind: "insight", body: "Direction and magnitude belong together." });
  const text = await readFile(join(root, "notes/session.md"), "utf8");
  assert.match(text, /# Vectors/);
  assert.match(text, /KEY CONNECTION/);
});

test("rejects notebook paths outside the workspace", () => {
  assert.throws(() => resolveNotebookPath("/tmp/work", "../outside.md"), /inside the working directory/);
});
