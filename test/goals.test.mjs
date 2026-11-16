import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { linkSessionToGoal, loadGoal, nextMilestone, saveGoal } from "../src/goals.mjs";
import { loadLearningState, recordCheckpointAssessment, saveLearningState } from "../src/progress.mjs";

process.env.CONCEPT_LOOM_HOME = "off";

async function workspace() {
  return mkdtemp(join(tmpdir(), "loom-goals-"));
}

function sessionInput(sessionId, extra = {}) {
  return { sessionId, topic: "Go", goal: "G", phase: "build", nextStep: "Next", ...extra };
}

async function passCheckpoint(root, sessionId, concept) {
  return recordCheckpointAssessment(
    root,
    { sessionId, nextStep: "Next", evidenceConcept: concept },
    { outcome: "accurate", format: "choice" },
  );
}

test("creates a goal and preserves it on a partial update", async () => {
  const root = await workspace();
  const goal = await saveGoal(root, {
    goalId: "go-backend",
    title: "Go backend",
    milestones: [{ name: "Goroutines" }, { name: "Channels" }],
  });
  assert.deepEqual(goal.milestones.map((item) => item.status), ["todo", "todo"]);

  const renamed = await saveGoal(root, { goalId: "go-backend", title: "Go services" });
  assert.equal(renamed.title, "Go services");
  assert.equal(renamed.milestones.length, 2);
  assert.equal(renamed.revision, 2);
});

test("validates goal input", async () => {
  const root = await workspace();
  await assert.rejects(saveGoal(root, { goalId: "../x", title: "T", milestones: [{ name: "A" }] }), /goalId/);
  await assert.rejects(saveGoal(root, { goalId: "g", title: "T", milestones: [] }), /milestones/);
  await assert.rejects(saveGoal(root, { goalId: "g", title: "T", milestones: [{ name: "A" }, { name: "A" }] }), /more than once/);
  await assert.rejects(saveGoal(root, { goalId: "g", title: "T", milestones: [{ name: "A", status: "done" }] }), /status/);
});

test("a milestone cannot be secured without evidence", async () => {
  const root = await workspace();
  await assert.rejects(
    saveGoal(root, { goalId: "g", title: "T", milestones: [{ name: "A", status: "secured" }] }),
    /cannot be secured/,
  );

  await saveLearningState(root, sessionInput("go-1"));
  await assert.rejects(
    saveGoal(root, { goalId: "g", title: "T", milestones: [{ name: "A", status: "secured", sessionId: "go-1" }] }),
    /cannot be secured/,
  );

  await passCheckpoint(root, "go-1", "Goroutines");
  const goal = await saveGoal(root, { goalId: "g", title: "T", milestones: [{ name: "A", status: "secured", sessionId: "go-1" }] });
  assert.equal(goal.milestones[0].status, "secured");
});

test("a session with goalId and milestone moves the milestone to in-progress", async () => {
  const root = await workspace();
  await saveGoal(root, { goalId: "g", title: "T", milestones: [{ name: "A" }, { name: "B" }] });
  const state = await saveLearningState(root, sessionInput("go-1", { goalId: "g", milestone: "A" }));
  await linkSessionToGoal(root, state);

  const goal = await loadGoal(root, "g");
  assert.deepEqual(goal.milestones[0], { name: "A", status: "in-progress", sessionId: "go-1" });
  assert.equal(goal.milestones[1].status, "todo");

  // goalId and milestone survive partial saves.
  const partial = await saveLearningState(root, sessionInput("go-1"));
  assert.equal(partial.goalId, "g");
  assert.equal(partial.milestone, "A");
});

test("linking is a no-op for unknown goals and milestones", async () => {
  const root = await workspace();
  const orphan = await saveLearningState(root, sessionInput("s", { goalId: "missing", milestone: "A" }));
  assert.equal(await linkSessionToGoal(root, orphan), null);
  await saveGoal(root, { goalId: "g", title: "T", milestones: [{ name: "A" }] });
  const unknown = await saveLearningState(root, sessionInput("t", { goalId: "g", milestone: "Nope" }));
  assert.equal(await linkSessionToGoal(root, unknown), null);
});

test("next milestone: start, continue, review overdue, complete", async () => {
  const root = await workspace();
  await saveGoal(root, { goalId: "g", title: "T", milestones: [{ name: "A" }, { name: "B" }] });
  assert.deepEqual(await nextMilestone(root, { goalId: "g" }), { action: "start", goalId: "g", milestone: "A" });

  const stateA = await saveLearningState(root, sessionInput("a", { goalId: "g", milestone: "A" }));
  await linkSessionToGoal(root, stateA);
  assert.equal((await nextMilestone(root, { goalId: "g" })).action, "continue");

  await passCheckpoint(root, "a", "Goroutines");
  await saveGoal(root, { goalId: "g", milestones: [{ name: "A", status: "secured", sessionId: "a" }, { name: "B" }] });
  assert.deepEqual(await nextMilestone(root, { goalId: "g" }), { action: "start", goalId: "g", milestone: "B" });

  const later = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const review = await nextMilestone(root, { goalId: "g", now: later });
  assert.equal(review.action, "review");
  assert.equal(review.milestone, "A");
  assert.deepEqual(review.dueConcepts, ["Goroutines"]);

  const stateB = await saveLearningState(root, sessionInput("b", { goalId: "g", milestone: "B" }));
  await linkSessionToGoal(root, stateB);
  await passCheckpoint(root, "b", "Channels");
  await saveGoal(root, { goalId: "g", milestones: [
    { name: "A", status: "secured", sessionId: "a" },
    { name: "B", status: "secured", sessionId: "b" },
  ] });
  assert.equal((await nextMilestone(root, { goalId: "g" })).action, "complete");
});

test("without goalId it lists goals and resolves a single one", async () => {
  const root = await workspace();
  assert.equal((await nextMilestone(root)).action, "no-goals");
  await saveGoal(root, { goalId: "one", title: "One", milestones: [{ name: "A" }] });
  assert.equal((await nextMilestone(root)).action, "start");
  await saveGoal(root, { goalId: "two", title: "Two", milestones: [{ name: "A" }] });
  const choose = await nextMilestone(root);
  assert.equal(choose.action, "choose-goal");
  assert.equal(choose.goals.length, 2);
});

test("sessions saved by older versions load without goal fields", async () => {
  const root = await workspace();
  await saveLearningState(root, sessionInput("legacy"));
  const { state } = await loadLearningState(root, { sessionId: "legacy" });
  assert.equal(state.goalId, undefined);
  assert.equal(state.schemaVersion, 3);
});
