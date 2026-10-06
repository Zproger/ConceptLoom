#!/usr/bin/env node
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const host = args[0];
const targetFlag = args.indexOf("--target");
const target = resolve(targetFlag >= 0 ? args[targetFlag + 1] : process.cwd());
const skipMcp = args.includes("--skip-mcp");
const refresh = args.includes("--refresh");
const allowedHosts = new Set(["codex", "claude-code", "opencode", "deepseek-harness"]);

if (!allowedHosts.has(host) || (targetFlag >= 0 && !args[targetFlag + 1])) {
  process.stderr.write("Usage: node scripts/setup.mjs <codex|claude-code|opencode|deepseek-harness> [--target PATH] [--skip-mcp] [--refresh]\n");
  process.exit(2);
}

async function exists(path) {
  try { await stat(path); return true; } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function copyNew(source, destination) {
  if (await exists(destination)) {
    throw new Error(`refusing to overwrite existing path: ${destination}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, errorOnExist: true });
}

async function materializeTemplate(source, destination, replacements) {
  if (await exists(destination)) throw new Error(`refusing to overwrite existing file: ${destination}`);
  let text = await readFile(source, "utf8");
  for (const [needle, value] of Object.entries(replacements)) text = text.replaceAll(needle, value);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, text, "utf8");
}

function yamlSingleQuoted(value) {
  return value.replaceAll("'", "''");
}

async function installReference(skillDirectory) {
  const destination = join(skillDirectory, "references", "coaching-reference.md");
  await writeFile(destination, await readFile(join(projectRoot, "shared", "coaching-reference.md"), "utf8"), "utf8");
}

async function installSkill(source, destination) {
  if (!refresh) return copyNew(source, destination);
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

async function installGuidance(source, preferredName, fallbackName) {
  const preferred = join(target, preferredName);
  if (await exists(preferred)) {
    await copyNew(source, join(target, fallbackName));
    return fallbackName;
  }
  await copyNew(source, preferred);
  return preferredName;
}

function runCodexMcp(args) {
  return spawnSync("codex", ["mcp", ...args], { encoding: "utf8" });
}

function registerCodexMcp() {
  if (skipMcp) {
    process.stdout.write("Skipped global Codex MCP registration (--skip-mcp).\n");
    return;
  }

  const serverPath = join(projectRoot, "src", "bridge.mjs");
  const current = runCodexMcp(["get", "concept-loom"]);
  if (current.error?.code === "ENOENT") {
    throw new Error("Codex CLI was not found on PATH. Install Codex or rerun with --skip-mcp.");
  }
  if (current.status === 0) {
    if (current.stdout.includes(serverPath)) {
      process.stdout.write("Codex MCP server 'concept-loom' is already registered with this installation.\n");
      return;
    }
    throw new Error(
      "a different Codex MCP server named 'concept-loom' already exists; " +
      "review it with `codex mcp get concept-loom`, then remove or rename it before retrying",
    );
  }

  const added = runCodexMcp(["add", "concept-loom", "--", "node", serverPath]);
  if (added.error?.code === "ENOENT") {
    throw new Error("Codex CLI was not found on PATH. Install Codex or rerun with --skip-mcp.");
  }
  if (added.status !== 0) {
    throw new Error(`failed to register Codex MCP server: ${(added.stderr || added.stdout).trim()}`);
  }
  process.stdout.write("Registered global Codex MCP server 'concept-loom'.\n");
}

async function installCodex() {
  const source = join(projectRoot, "adapters", "codex");
  const skillDestination = join(target, ".codex", "skills", "concept-coach");
  await installSkill(join(source, ".codex", "skills", "concept-coach"), skillDestination);
  await installReference(skillDestination);
  if (refresh) {
    process.stdout.write(`Refreshed Codex skill in ${skillDestination}\n`);
    registerCodexMcp();
    process.stdout.write(`\nStart a new Codex session from the learning workspace:\n  cd ${JSON.stringify(target)}\n  codex\n`);
    return;
  }
  const guidance = await installGuidance(join(source, "AGENTS.md"), "AGENTS.md", "CONCEPT_LOOM_AGENTS.md");
  process.stdout.write(`Installed Codex skill in ${skillDestination}\n`);
  if (guidance !== "AGENTS.md") process.stdout.write("Merge CONCEPT_LOOM_AGENTS.md into your existing AGENTS.md.\n");
  registerCodexMcp();
  process.stdout.write(`\nStart a new Codex session from the learning workspace:\n  cd ${JSON.stringify(target)}\n  codex\n`);
}

async function installClaude() {
  const source = join(projectRoot, "adapters", "claude-code");
  const skillDestination = join(target, ".claude", "skills", "concept-coach");
  await installSkill(join(source, ".claude", "skills", "concept-coach"), skillDestination);
  await installReference(skillDestination);
  if (refresh) {
    process.stdout.write(`Refreshed Claude Code skill in ${skillDestination}\n`);
    return;
  }
  await copyNew(join(source, ".claude", "agents"), join(target, ".claude", "agents"));
  const guidance = await installGuidance(join(source, "CLAUDE.md"), "CLAUDE.md", "CONCEPT_LOOM_CLAUDE.md");
  await materializeTemplate(join(source, ".mcp.json.template"), join(target, ".mcp.json"), {
    __SERVER_PATH__: join(projectRoot, "src", "bridge.mjs"),
  });
  process.stdout.write(`Installed Claude Code assets in ${target}\n`);
  if (guidance !== "CLAUDE.md") process.stdout.write("Merge CONCEPT_LOOM_CLAUDE.md into your existing CLAUDE.md.\n");
}

async function installOpenCode() {
  const source = join(projectRoot, "adapters", "opencode");
  const skillDestination = join(target, ".opencode", "skills", "concept-coach");
  await installSkill(join(source, ".opencode", "skills", "concept-coach"), skillDestination);
  await installReference(skillDestination);
  if (refresh) {
    process.stdout.write(`Refreshed OpenCode skill in ${skillDestination}\n`);
    return;
  }
  await copyNew(join(source, ".opencode", "agents"), join(target, ".opencode", "agents"));
  const guidance = await installGuidance(join(source, "AGENTS.md"), "AGENTS.md", "CONCEPT_LOOM_AGENTS.md");
  await materializeTemplate(join(source, "opencode.json.template"), join(target, "opencode.json"), {
    __SERVER_PATH__: join(projectRoot, "src", "bridge.mjs"),
  });
  process.stdout.write(`Installed OpenCode assets in ${target}\n`);
  if (guidance !== "AGENTS.md") process.stdout.write("Merge CONCEPT_LOOM_AGENTS.md into your existing AGENTS.md.\n");
}

async function installDeepSeekHarness() {
  const source = join(projectRoot, "adapters", "deepseek-harness");
  const skillDestination = join(target, ".dsh", "skills", "concept-coach");
  await installSkill(join(source, ".dsh", "skills", "concept-coach"), skillDestination);
  await installReference(skillDestination);

  const patchDestination = join(target, ".dsh", "concept-loom.patch.yml");
  if (!skipMcp && (refresh || !(await exists(patchDestination)))) {
    if (refresh) {
      await writeFile(
        patchDestination,
        (await readFile(join(source, "concept-loom.patch.yml.template"), "utf8"))
          .replaceAll("__SERVER_PATH__", yamlSingleQuoted(join(projectRoot, "src", "bridge.mjs"))),
        "utf8",
      );
    } else {
      await materializeTemplate(join(source, "concept-loom.patch.yml.template"), patchDestination, {
        __SERVER_PATH__: yamlSingleQuoted(join(projectRoot, "src", "bridge.mjs")),
      });
    }
  }

  if (refresh) {
    process.stdout.write(`Refreshed DeepSeek Harness skill in ${skillDestination}\n`);
  } else {
    const guidance = await installGuidance(join(source, "AGENTS.md"), "AGENTS.md", "CONCEPT_LOOM_AGENTS.md");
    process.stdout.write(`Installed DeepSeek Harness skill in ${skillDestination}\n`);
    if (guidance !== "AGENTS.md") process.stdout.write("Merge CONCEPT_LOOM_AGENTS.md into your existing AGENTS.md.\n");
  }

  if (skipMcp) {
    process.stdout.write("Skipped DeepSeek Harness MCP patch generation (--skip-mcp).\n");
    return;
  }
  process.stdout.write(
    `\nStart DeepSeek Harness with Concept Loom:\n` +
    `  cd ${JSON.stringify(target)}\n` +
    `  npx @deepseek-ai/dsh --profile web --patch .dsh/concept-loom.patch.yml\n`,
  );
}

try {
  await mkdir(target, { recursive: true });
  if (host === "codex") await installCodex();
  if (host === "claude-code") await installClaude();
  if (host === "opencode") await installOpenCode();
  if (host === "deepseek-harness") await installDeepSeekHarness();
} catch (error) {
  process.stderr.write(`Setup stopped: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
