import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const setupScript = join(projectRoot, "scripts", "setup.mjs");

test("installs deepseek-harness adapter workspace assets with --skip-mcp", async () => {
  const target = await mkdtemp(join(tmpdir(), "loom-dsh-target-"));
  try {
    const res = spawnSync("node", [setupScript, "deepseek-harness", "--target", target, "--skip-mcp"], {
      encoding: "utf8",
    });
    assert.equal(res.status, 0, `setup failed: ${res.stderr}`);

    // Check AGENTS.md
    const agentsMd = await readFile(join(target, "AGENTS.md"), "utf8");
    assert.ok(agentsMd.includes("Concept Loom"));
    assert.ok(agentsMd.includes("concept-coach"));
    assert.ok(agentsMd.includes("ask_user_question"));

    // Check skill and reference
    const skillMd = await readFile(join(target, ".dsh", "skills", "concept-coach", "SKILL.md"), "utf8");
    assert.ok(skillMd.includes("name: concept-coach"));
    assert.ok(skillMd.includes("ask_user_question"));

    const referenceMd = await readFile(join(target, ".dsh", "skills", "concept-coach", "references", "coaching-reference.md"), "utf8");
    assert.ok(referenceMd.includes("Connection-first coaching reference"));

    // Check subagent
    const scoutMd = await readFile(join(target, ".dsh", "agents", "evidence-scout.md"), "utf8");
    assert.ok(scoutMd.includes("name: evidence-scout"));

    // Check cordis.patch.yml
    const patchYml = await readFile(join(target, ".dsh", "cordis.patch.yml"), "utf8");
    assert.ok(patchYml.includes("concept-loom-mcp"));
    assert.ok(patchYml.includes("src/bridge.mjs"));
    assert.ok(!patchYml.includes("__SERVER_PATH__"));
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test("supports dsh alias for deepseek-harness", async () => {
  const target = await mkdtemp(join(tmpdir(), "loom-dsh-alias-"));
  try {
    const res = spawnSync("node", [setupScript, "dsh", "--target", target, "--skip-mcp"], {
      encoding: "utf8",
    });
    assert.equal(res.status, 0, `setup failed: ${res.stderr}`);

    const skillMd = await readFile(join(target, ".dsh", "skills", "concept-coach", "SKILL.md"), "utf8");
    assert.ok(skillMd.includes("name: concept-coach"));

    const patchYml = await readFile(join(target, ".dsh", "cordis.patch.yml"), "utf8");
    assert.ok(patchYml.includes("concept-loom-mcp"));
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test("refreshes deepseek-harness skill on existing workspace", async () => {
  const target = await mkdtemp(join(tmpdir(), "loom-dsh-refresh-"));
  try {
    const res1 = spawnSync("node", [setupScript, "deepseek-harness", "--target", target, "--skip-mcp"], {
      encoding: "utf8",
    });
    assert.equal(res1.status, 0);

    const res2 = spawnSync("node", [setupScript, "deepseek-harness", "--target", target, "--skip-mcp", "--refresh"], {
      encoding: "utf8",
    });
    assert.equal(res2.status, 0, `refresh failed: ${res2.stderr}`);
    assert.ok(res2.stdout.includes("Refreshed DeepSeek Harness skill"));
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test("registers global MCP server in mock DSH_HOME and updates on refresh", async () => {
  const mockDshHome = await mkdtemp(join(tmpdir(), "loom-dsh-home-"));
  const target = await mkdtemp(join(tmpdir(), "loom-dsh-ws-"));
  try {
    const env = { ...process.env, DSH_HOME: mockDshHome };
    const res1 = spawnSync("node", [setupScript, "deepseek-harness", "--target", target], {
      encoding: "utf8",
      env,
    });
    assert.equal(res1.status, 0, `setup failed: ${res1.stderr}`);
    assert.ok(res1.stdout.includes("Registered global DeepSeek Harness MCP server"));

    const patchContent = await readFile(join(mockDshHome, "cordis.patch.yml"), "utf8");
    assert.ok(patchContent.includes("id: concept-loom-mcp"));
    assert.ok(patchContent.includes("src/bridge.mjs"));

    // Running again reports already registered
    const res2 = spawnSync("node", [setupScript, "deepseek-harness", "--target", target, "--refresh"], {
      encoding: "utf8",
      env,
    });
    assert.equal(res2.status, 0);
    assert.ok(res2.stdout.includes("already registered"));
  } finally {
    await rm(mockDshHome, { recursive: true, force: true });
    await rm(target, { recursive: true, force: true });
  }
});

test("DeepSeek Harness CLI validates the generated cordis patch with --dump-config", async () => {
  const target = await mkdtemp(join(tmpdir(), "loom-dsh-validate-"));
  try {
    const resSetup = spawnSync("node", [setupScript, "deepseek-harness", "--target", target, "--skip-mcp"], {
      encoding: "utf8",
    });
    assert.equal(resSetup.status, 0);

    const patchPath = join(target, ".dsh", "cordis.patch.yml");
    const resDsh = spawnSync("npx", ["@deepseek-ai/dsh", "--profile", "web", "--patch", patchPath, "--dump-config"], {
      encoding: "utf8",
    });
    assert.equal(resDsh.status, 0, `dsh --dump-config failed: ${resDsh.stderr}`);
    assert.ok(resDsh.stdout.includes("concept-loom-mcp"));
    assert.ok(resDsh.stdout.includes("serverName: concept-loom"));
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});
