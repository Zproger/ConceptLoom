import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const PHASES = new Set(["locate", "weave", "build", "transfer", "review", "complete"]);
const MODES = new Set(["guided", "practice", "review", "challenge"]);
const CHECKPOINT_DIMENSIONS = {
  choice: "recognition",
  "free-recall": "recall",
  prediction: "application",
  debugging: "application",
  transfer: "transfer",
};

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

function objectValue(value, label) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function routeExtensionList(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("routeExtensions must be an array");
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`routeExtensions[${index}] must be an object`);
    }
    return {
      concept: requiredText(entry.concept, `routeExtensions[${index}].concept`),
      dependsOn: textList(entry.dependsOn, `routeExtensions[${index}].dependsOn`) ?? [],
      reason: optionalText(entry.reason, `routeExtensions[${index}].reason`),
      addedAt: optionalText(entry.addedAt, `routeExtensions[${index}].addedAt`) ?? new Date().toISOString(),
    };
  });
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
  const mode = optionalText(input.mode, "mode")?.toLowerCase() ?? previous?.mode ?? "guided";
  if (!MODES.has(mode)) throw new Error(`mode must be one of: ${[...MODES].join(", ")}`);

  const now = new Date().toISOString();
  const state = {
    schemaVersion: 2,
    sessionId,
    topic: requiredText(input.topic, "topic"),
    goal: requiredText(input.goal, "goal"),
    phase,
    mode,
    notebookPath: optionalText(input.notebookPath, "notebookPath"),
    route: textList(input.route, "route") ?? [],
    secured: textList(input.secured, "secured") ?? [],
    gaps: textList(input.gaps, "gaps") ?? [],
    evidence: objectValue(input.evidence, "evidence") ?? previous?.evidence ?? {},
    routeExtensions: routeExtensionList(input.routeExtensions) ?? previous?.routeExtensions ?? [],
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

export async function listDueReviews(baseDirectory, input = {}) {
  const now = input.now ? new Date(requiredText(input.now, "now")) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("now must be an ISO date");
  const { sessions } = await loadLearningState(baseDirectory);
  const due = [];
  for (const summary of sessions) {
    const { state } = await loadLearningState(baseDirectory, { sessionId: summary.sessionId });
    for (const [concept, evidence] of Object.entries(state.evidence ?? {})) {
      if (!evidence?.reviewAfter) continue;
      const reviewAt = new Date(evidence.reviewAfter);
      if (!Number.isNaN(reviewAt.getTime()) && reviewAt <= now) {
        due.push({
          sessionId: state.sessionId,
          topic: state.topic,
          concept,
          reviewAfter: evidence.reviewAfter,
          lastFormat: evidence.lastFormat,
          transferPassed: evidence.transferPassed === true,
        });
      }
    }
  }
  due.sort((left, right) => left.reviewAfter.localeCompare(right.reviewAfter));
  return { asOf: now.toISOString(), due };
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
  const evidenceConcept = optionalText(input.evidenceConcept, "evidenceConcept")
    ?? securedConnection
    ?? input.currentStep
    ?? previous.currentStep;
  const evidence = { ...(previous.evidence ?? {}) };
  if (evidenceConcept) {
    const earlier = evidence[evidenceConcept] ?? {};
    const format = assessment.format ?? "choice";
    const dimension = CHECKPOINT_DIMENSIONS[format] ?? "recognition";
    const dimensionResult = assessment.outcome === "accurate" ? "demonstrated" : "needs-work";
    const consecutiveSuccesses = assessment.outcome === "accurate" ? (earlier.consecutiveSuccesses ?? 0) + 1 : 0;
    evidence[evidenceConcept] = {
      ...earlier,
      attempts: (earlier.attempts ?? 0) + 1,
      successes: (earlier.successes ?? 0) + (assessment.outcome === "accurate" ? 1 : 0),
      consecutiveSuccesses,
      dimensions: { ...(earlier.dimensions ?? {}), [dimension]: dimensionResult },
      lastFormat: format,
      lastOutcome: assessment.outcome,
      lastConfidence: assessment.confidence,
      lastCalibration: assessment.calibration,
      hintUsed: input.hintUsed === true,
      transferPassed: earlier.transferPassed === true || (format === "transfer" && assessment.outcome === "accurate"),
      lastAttemptAt: new Date().toISOString(),
      lastSuccessfulRetrieval: assessment.outcome === "accurate"
        ? new Date().toISOString()
        : earlier.lastSuccessfulRetrieval,
      reviewAfter: nextReviewDate(consecutiveSuccesses, assessment.outcome),
    };
  }

  return saveLearningState(baseDirectory, {
    ...previous,
    currentStep: input.currentStep ?? previous.currentStep,
    nextStep: requiredText(input.nextStep, "nextStep"),
    secured,
    gaps,
    evidence,
    lastCheckpoint: {
      outcome: assessment.outcome,
      selected: assessment.selected,
      response: assessment.response,
      format: assessment.format ?? "choice",
      confidence: assessment.confidence,
      calibration: assessment.calibration,
      assessedAt: new Date().toISOString(),
    },
  });
}

function nextReviewDate(consecutiveSuccesses, outcome) {
  const intervals = [1, 3, 7, 14, 30];
  const days = outcome === "accurate"
    ? intervals[Math.min(Math.max(consecutiveSuccesses - 1, 0), intervals.length - 1)]
    : 1;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
