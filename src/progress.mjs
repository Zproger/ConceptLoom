import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const PHASES = new Set(["locate", "weave", "build", "complete"]);

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function optionalText(value, label) {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, label);
}

function textList(value, label) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => requiredText(entry, `${label}[${index}]`));
}

function safeSessionId(value) {
  const id = requiredText(value, "sessionId");
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id)) {
    throw new Error("sessionId may contain only letters, numbers, underscores, and hyphens");
  }
  return id;
}

function storageDirectory(baseDirectory) {
  return resolve(baseDirectory, ".concept-loom", "sessions");
}

function statePath(baseDirectory, sessionId) {
  return join(storageDirectory(baseDirectory), `${safeSessionId(sessionId)}.json`);
}

async function readState(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function saveLearningState(baseDirectory, input) {
  const sessionId = safeSessionId(input.sessionId);
  const destination = statePath(baseDirectory, sessionId);
  const previous = await readState(destination);
  const phase = requiredText(input.phase, "phase").toLowerCase();
  if (!PHASES.has(phase)) throw new Error(`phase must be one of: ${[...PHASES].join(", ")}`);

  const now = new Date().toISOString();
  const state = {
    schemaVersion: 1,
    sessionId,
    topic: requiredText(input.topic, "topic"),
    goal: requiredText(input.goal, "goal"),
    phase,
    notebookPath: optionalText(input.notebookPath, "notebookPath"),
    route: textList(input.route, "route") ?? [],
    secured: textList(input.secured, "secured") ?? [],
    gaps: textList(input.gaps, "gaps") ?? [],
    currentStep: optionalText(input.currentStep, "currentStep"),
    nextStep: requiredText(input.nextStep, "nextStep"),
    learnerContext: optionalText(input.learnerContext, "learnerContext"),
    lastCheckpoint: input.lastCheckpoint ?? previous?.lastCheckpoint,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    revision: (previous?.revision ?? 0) + 1,
  };

  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
  return state;
}

export async function loadLearningState(baseDirectory, input = {}) {
  if (input.sessionId) {
    const sessionId = safeSessionId(input.sessionId);
    const state = await readState(statePath(baseDirectory, sessionId));
    if (!state) throw new Error(`learning session '${sessionId}' was not found`);
    return { state };
  }

  const directory = storageDirectory(baseDirectory);
  let names;
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if (error?.code === "ENOENT") return { state: null, sessions: [] };
    throw error;
  }

  const states = (await Promise.all(names.map((name) => readState(join(directory, name)))))
    .filter(Boolean)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return {
    state: states[0] ?? null,
    sessions: states.map(({ sessionId, topic, goal, phase, nextStep, updatedAt }) => ({
      sessionId,
      topic,
      goal,
      phase,
      nextStep,
      updatedAt,
    })),
  };
}

function addUnique(items, value) {
  return value && !items.includes(value) ? [...items, value] : items;
}

export async function recordCheckpointAssessment(baseDirectory, input, assessment) {
  const sessionId = safeSessionId(input.sessionId);
  const { state: previous } = await loadLearningState(baseDirectory, { sessionId });
  const securedConnection = optionalText(input.securedConnection, "securedConnection");
  const gap = optionalText(input.gap, "gap");
  const secured = assessment.outcome === "accurate"
    ? addUnique(previous.secured ?? [], securedConnection)
    : previous.secured ?? [];
  const gaps = assessment.outcome === "knowledge-gap"
    ? addUnique(previous.gaps ?? [], gap ?? input.currentStep ?? previous.currentStep)
    : previous.gaps ?? [];

  return saveLearningState(baseDirectory, {
    ...previous,
    currentStep: input.currentStep ?? previous.currentStep,
    nextStep: requiredText(input.nextStep, "nextStep"),
    secured,
    gaps,
    lastCheckpoint: {
      outcome: assessment.outcome,
      selected: assessment.selected,
      assessedAt: new Date().toISOString(),
    },
  });
}
