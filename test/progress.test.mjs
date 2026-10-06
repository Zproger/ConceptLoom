import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listDueReviews, loadLearningState, recordCheckpointAssessment, saveLearningState } from "../src/progress.mjs";

test("persists and restores a learning session", async () => {
  const root = await mkdtemp(join(tmpdir(), "loom-progress-"));
  await saveLearningState(root, {
    sessionId: "ja4-basics",
    topic: "JA4",
    goal: "Understand JA4 fingerprints",
    phase: "build",
    route: ["TLS ClientHello", "JA4 components"],
    secured: ["TLS ClientHello"],
    gaps: [],
    currentStep: "TLS ClientHello",
    nextStep: "Explain JA4 components",
  });

  const restored = await loadLearningState(root, { sessionId: "ja4-basics" });
  assert.equal(restored.state.nextStep, "Explain JA4 components");
  assert.deepEqual(restored.state.secured, ["TLS ClientHello"]);
  const diskState = JSON.parse(await readFile(join(root, ".concept-loom/sessions/ja4-basics.json"), "utf8"));
  assert.equal(diskState.revision, 1);
});

test("returns the latest state and session summaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "loom-progress-"));
  await saveLearningState(root, {
    sessionId: "first",
    topic: "First",
    goal: "Learn first",
    phase: "locate",
    nextStep: "Probe",
  });
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 2));
  await saveLearningState(root, {
    sessionId: "second",
    topic: "Second",
    goal: "Learn second",
    phase: "weave",
    nextStep: "Approve route",
  });

  const restored = await loadLearningState(root);
  assert.equal(restored.state.sessionId, "second");
  assert.equal(restored.sessions.length, 2);
});

test("updates a session atomically and increments its revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "loom-progress-"));
  const base = {
    sessionId: "topic",
    topic: "Topic",
    goal: "Learn topic",
    phase: "build",
    nextStep: "Step one",
  };
  await saveLearningState(root, base);
  const updated = await saveLearningState(root, { ...base, secured: ["Step one"], nextStep: "Step two" });
  assert.equal(updated.revision, 2);
  assert.deepEqual(updated.secured, ["Step one"]);
});

test("records checkpoint outcome before the lesson continues", async () => {
  const root = await mkdtemp(join(tmpdir(), "loom-progress-"));
  await saveLearningState(root, {
    sessionId: "ja4",
    topic: "JA4",
    goal: "Understand JA4",
    phase: "build",
    route: ["TLS", "JA4"],
    nextStep: "Check TLS understanding",
  });

  const updated = await recordCheckpointAssessment(root, {
    sessionId: "ja4",
    currentStep: "TLS",
    nextStep: "Explain JA4 fields",
    securedConnection: "TLS ClientHello structure",
  }, {
    outcome: "accurate",
    selected: ["client-hello"],
  });

  assert.equal(updated.nextStep, "Explain JA4 fields");
  assert.deepEqual(updated.secured, ["TLS ClientHello structure"]);
  assert.equal(updated.lastCheckpoint.outcome, "accurate");
  assert.equal(updated.evidence["TLS ClientHello structure"].dimensions.recognition, "demonstrated");
  assert.equal(updated.evidence["TLS ClientHello structure"].attempts, 1);
  assert.equal(updated.revision, 2);
});

test("tracks transfer evidence, confidence, hints, and delayed review", async () => {
  const root = await mkdtemp(join(tmpdir(), "loom-progress-"));
  await saveLearningState(root, {
    sessionId: "transactions",
    topic: "Transactions",
    goal: "Choose isolation levels",
    phase: "build",
    mode: "practice",
    route: ["Atomicity", "Isolation"],
    routeExtensions: [{ concept: "Write skew", dependsOn: ["Isolation"], reason: "Found during practice" }],
    nextStep: "Try a transfer problem",
  });

  const updated = await recordCheckpointAssessment(root, {
    sessionId: "transactions",
    currentStep: "Isolation",
    nextStep: "Review tomorrow",
    evidenceConcept: "Isolation trade-offs",
    hintUsed: false,
  }, {
    format: "transfer",
    outcome: "accurate",
    response: "Use serializable because the invariant spans rows.",
    confidence: 85,
    calibration: "well-calibrated",
  });

  const evidence = updated.evidence["Isolation trade-offs"];
  assert.equal(updated.mode, "practice");
  assert.equal(updated.routeExtensions[0].concept, "Write skew");
  assert.equal(evidence.dimensions.transfer, "demonstrated");
  assert.equal(evidence.transferPassed, true);
  assert.equal(evidence.lastConfidence, 85);
  assert.match(evidence.reviewAfter, /^\d{4}-\d{2}-\d{2}T/);

  const reviews = await listDueReviews(root, { now: "2100-01-01T00:00:00.000Z" });
  assert.equal(reviews.due.length, 1);
  assert.equal(reviews.due[0].concept, "Isolation trade-offs");
});
