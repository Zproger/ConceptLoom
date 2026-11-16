import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { listDueReviews, loadLearningState } from "./progress.mjs";

// Long-term goals made of milestones. Each milestone is worked on in its own
// focused learning session; the goal file only tracks the sequence and status.

const STATUSES = new Set(["todo", "in-progress", "secured"]);

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function safeGoalId(value) {
  const id = requiredText(value, "goalId");
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id)) {
    throw new Error("goalId may contain only letters, numbers, underscores, and hyphens");
  }
  return id;
}

function goalsDirectory(baseDirectory) {
  return resolve(baseDirectory, ".concept-loom", "goals");
}

function goalPath(baseDirectory, goalId) {
  return join(goalsDirectory(baseDirectory), `${safeGoalId(goalId)}.json`);
}

async function readGoal(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeGoal(path, goal) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(goal, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function sessionHasEvidence(baseDirectory, sessionId) {
  try {
    const { state } = await loadLearningState(baseDirectory, { sessionId });
    return Object.values(state.evidence ?? {}).some((entry) => (entry?.successes ?? 0) > 0);
  } catch {
    return false;
  }
}

async function normalizeMilestones(baseDirectory, value, previous) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("milestones must be a non-empty array");
  const seen = new Set();
  const result = [];
  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`milestones[${index}] must be an object`);
    }
    const name = requiredText(entry.name, `milestones[${index}].name`);
    if (seen.has(name)) throw new Error(`milestone '${name}' is listed more than once`);
    seen.add(name);
    const earlier = previous?.find((item) => item.name === name);
    const status = entry.status ?? earlier?.status ?? "todo";
    if (!STATUSES.has(status)) throw new Error(`milestones[${index}].status must be one of: ${[...STATUSES].join(", ")}`);
    const sessionId = entry.sessionId ? requiredText(entry.sessionId, `milestones[${index}].sessionId`) : earlier?.sessionId;
    if (status === "secured" && !(sessionId && await sessionHasEvidence(baseDirectory, sessionId))) {
      throw new Error(`milestone '${name}' cannot be secured without a linked session that has a successful checkpoint`);
    }
    result.push({ name, status, ...(sessionId ? { sessionId } : {}) });
  }
  return result;
}

export async function saveGoal(baseDirectory, input) {
  const goalId = safeGoalId(input.goalId);
  const path = goalPath(baseDirectory, goalId);
  const previous = await readGoal(path);
  const now = new Date().toISOString();
  const milestones = input.milestones === undefined && previous
    ? previous.milestones
    : await normalizeMilestones(baseDirectory, input.milestones, previous?.milestones);
  const goal = {
    schemaVersion: 1,
    goalId,
    title: input.title === undefined && previous ? previous.title : requiredText(input.title, "title"),
    milestones,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    revision: (previous?.revision ?? 0) + 1,
  };
  await writeGoal(path, goal);
  return goal;
}

export async function loadGoal(baseDirectory, goalId) {
  const goal = await readGoal(goalPath(baseDirectory, goalId));
  if (!goal) throw new Error(`goal '${goalId}' was not found`);
  return goal;
}

export async function listGoals(baseDirectory) {
  let names;
  try {
    names = (await readdir(goalsDirectory(baseDirectory))).filter((name) => name.endsWith(".json"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const goals = (await Promise.all(names.map((name) => readGoal(join(goalsDirectory(baseDirectory), name))))).filter(Boolean);
  return goals.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

// When a session declares goalId + milestone, reflect that in the goal file.
// A milestone moves from todo to in-progress; it is never marked secured here.
export async function linkSessionToGoal(baseDirectory, state) {
  if (!state.goalId || !state.milestone) return null;
  const path = goalPath(baseDirectory, state.goalId);
  const goal = await readGoal(path);
  if (!goal) return null;
  const milestone = goal.milestones.find((item) => item.name === state.milestone);
  if (!milestone) return null;
  if (milestone.sessionId === state.sessionId && milestone.status !== "todo") return goal;
  milestone.sessionId = state.sessionId;
  if (milestone.status === "todo") milestone.status = "in-progress";
  goal.updatedAt = new Date().toISOString();
  goal.revision = (goal.revision ?? 0) + 1;
  await writeGoal(path, goal);
  return goal;
}

export async function nextMilestone(baseDirectory, input = {}) {
  if (!input.goalId) {
    const goals = await listGoals(baseDirectory);
    const summaries = goals.map(({ goalId, title, milestones }) => ({
      goalId,
      title,
      progress: `${milestones.filter((item) => item.status === "secured").length}/${milestones.length}`,
    }));
    if (goals.length !== 1) return { action: goals.length === 0 ? "no-goals" : "choose-goal", goals: summaries };
    return nextMilestone(baseDirectory, { ...input, goalId: goals[0].goalId });
  }

  const goal = await loadGoal(baseDirectory, input.goalId);
  const { due } = await listDueReviews(baseDirectory, { now: input.now });

  // Earlier secured milestones whose retention check is overdue come first.
  for (const milestone of goal.milestones) {
    if (milestone.status !== "secured" || !milestone.sessionId) continue;
    const concepts = due.filter((item) => item.sessionId === milestone.sessionId).map((item) => item.concept);
    if (concepts.length > 0) {
      return { action: "review", goalId: goal.goalId, milestone: milestone.name, sessionId: milestone.sessionId, dueConcepts: concepts };
    }
  }
  const active = goal.milestones.find((item) => item.status === "in-progress");
  if (active) return { action: "continue", goalId: goal.goalId, milestone: active.name, sessionId: active.sessionId };
  const upcoming = goal.milestones.find((item) => item.status === "todo");
  if (upcoming) return { action: "start", goalId: goal.goalId, milestone: upcoming.name };
  return { action: "complete", goalId: goal.goalId };
}
