import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("DeepSeek Harness installer creates a native skill and MCP patch", async () => {
  const target = await mkdtemp(join(tmpdir(), "concept-loom-dsh-"));
  const result = spawnSync(
    process.execPath,
    [join(projectRoot, "scripts", "setup.mjs"), "deepseek-harness", "--target", target],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  const skill = await readFile(join(target, ".dsh", "skills", "concept-coach", "SKILL.md"), "utf8");
  const reference = await readFile(join(target, ".dsh", "skills", "concept-coach", "references", "coaching-reference.md"), "utf8");
  const patch = await readFile(join(target, ".dsh", "concept-loom.patch.yml"), "utf8");
  await stat(join(target, "AGENTS.md"));

  assert.match(skill, /name: concept-coach/);
  assert.match(reference, /# Connection-first coaching reference/);
  assert.match(patch, /name: '@deepseek-ai\/dsh-mcp-client'/);
  assert.match(patch, new RegExp(join(projectRoot, "src", "bridge.mjs").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(patch, /__SERVER_PATH__/);
});

test("DeepSeek Harness --skip-mcp installs only workspace guidance", async () => {
  const target = await mkdtemp(join(tmpdir(), "concept-loom-dsh-skip-"));
  const result = spawnSync(
    process.execPath,
    [join(projectRoot, "scripts", "setup.mjs"), "deepseek-harness", "--target", target, "--skip-mcp"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  await stat(join(target, ".dsh", "skills", "concept-coach", "SKILL.md"));
  await assert.rejects(stat(join(target, ".dsh", "concept-loom.patch.yml")), { code: "ENOENT" });
});

test("Pi installer creates a native skill and a valid .pi/mcp.json", async () => {
  const target = await mkdtemp(join(tmpdir(), "concept-loom-pi-"));
  const result = spawnSync(
    process.execPath,
    [join(projectRoot, "scripts", "setup.mjs"), "pi", "--target", target],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  const skill = await readFile(join(target, ".pi", "skills", "concept-coach", "SKILL.md"), "utf8");
  const reference = await readFile(join(target, ".pi", "skills", "concept-coach", "references", "coaching-reference.md"), "utf8");
  const config = JSON.parse(await readFile(join(target, ".pi", "mcp.json"), "utf8"));
  await stat(join(target, "AGENTS.md"));

  assert.match(skill, /name: concept-coach/);
  assert.match(skill, /ask_user_question/);
  assert.match(reference, /# Connection-first coaching reference/);
  assert.deepEqual(config.mcpServers["concept-loom"], { command: "node", args: [join(projectRoot, "src", "bridge.mjs")] });
});

test("Pi --skip-mcp installs only skill and workspace guidance", async () => {
  const target = await mkdtemp(join(tmpdir(), "concept-loom-pi-skip-"));
  const result = spawnSync(
    process.execPath,
    [join(projectRoot, "scripts", "setup.mjs"), "pi", "--target", target, "--skip-mcp"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  await stat(join(target, ".pi", "skills", "concept-coach", "SKILL.md"));
  await stat(join(target, "AGENTS.md"));
  await assert.rejects(stat(join(target, ".pi", "mcp.json")), { code: "ENOENT" });
});

test("Claude Code installer writes a valid .mcp.json", async () => {
  const target = await mkdtemp(join(tmpdir(), "concept-loom-claude-"));
  const result = spawnSync(
    process.execPath,
    [join(projectRoot, "scripts", "setup.mjs"), "claude-code", "--target", target],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(await readFile(join(target, ".mcp.json"), "utf8"));
  assert.deepEqual(config.mcpServers["concept-loom"].args, [join(projectRoot, "src", "bridge.mjs")]);
});
