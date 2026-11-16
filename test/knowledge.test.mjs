import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { forgetKnowledge, importKnowledge, knowledgeHome, recallKnowledge, syncKnowledge } from "../src/knowledge.mjs";
import { listLearningStates, recordCheckpointAssessment, saveLearningState } from "../src/progress.mjs";

async function environment() {
  const home = await mkdtemp(join(tmpdir(), "loom-home-"));
  return { home, env: { CONCEPT_LOOM_HOME: home } };
}

function evidence(overrides = {}) {
  const now = new Date().toISOString();
  return {
    attempts: 3,
    successes: 3,
    consecutiveSuccesses: 3,
    transferPassed: false,
    lastOutcome: "accurate",
    lastAttemptAt: now,
    lastSuccessfulRetrieval: now,
    ...overrides,
  };
}

function session(sessionId, topic, conceptEvidence) {
  return { sessionId, topic, evidence: conceptEvidence };
}

test("CONCEPT_LOOM_HOME relocates or disables the knowledge map", () => {
  assert.equal(knowledgeHome({ CONCEPT_LOOM_HOME: "off" }), null);
  assert.equal(knowledgeHome({ CONCEPT_LOOM_HOME: "OFF" }), null);
  assert.ok(knowledgeHome({ CONCEPT_LOOM_HOME: "/tmp/x" }).endsWith("x"));
});

test("a disabled map is a no-op", async () => {
  const env = { CONCEPT_LOOM_HOME: "off" };
  const synced = await syncKnowledge("/ignored", session("s", "T", { Docker: evidence() }), { env });
  assert.deepEqual(synced, { enabled: false, updated: 0 });
  assert.equal((await recallKnowledge({ concepts: ["docker"], env })).enabled, false);
});

test("knowledge learned in one project is recalled from another", async () => {
  const { env } = await environment();
  const projectA = await mkdtemp(join(tmpdir(), "loom-a-"));
  await syncKnowledge(projectA, session("docker-1", "Docker basics", { "Docker images": evidence() }), { env });

  const result = await recallKnowledge({ concepts: ["docker", "kubernetes"], env });
  const [docker, kubernetes] = result.matches;
  assert.equal(docker.found.length, 1);
  assert.equal(docker.found[0].concept, "Docker images");
  assert.equal(docker.found[0].status, "secured");
  assert.deepEqual(docker.found[0].learnedIn, ["Docker basics"]);
  assert.deepEqual(kubernetes.found, []);
});

test("matching tolerates case, punctuation and containment", async () => {
  const { env } = await environment();
  await syncKnowledge("/p", session("s", "T", { "Linux networking": evidence() }), { env });
  for (const query of ["linux networking", "LINUX-Networking!", "networking"]) {
    const { matches } = await recallKnowledge({ concepts: [query], env });
    assert.equal(matches[0].found.length, 1, query);
  }
  const { matches } = await recallKnowledge({ concepts: ["databases"], env });
  assert.equal(matches[0].found.length, 0);
});

test("stale secured knowledge must be re-verified", async () => {
  const { env } = await environment();
  const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
  await syncKnowledge("/p", session("s", "T", { Docker: evidence({ lastSuccessfulRetrieval: old, lastAttemptAt: old }) }), { env });
  const { matches } = await recallKnowledge({ concepts: ["docker"], env });
  assert.equal(matches[0].found[0].level, "secured");
  assert.equal(matches[0].found[0].status, "needs-verification");
  assert.ok(matches[0].found[0].daysSinceVerified >= 199);
});

test("a recent failure downgrades a concept; gaps are recorded", async () => {
  const { env } = await environment();
  await syncKnowledge("/p", session("s", "T", {
    Volumes: evidence({ lastOutcome: "needs-repair", consecutiveSuccesses: 0 }),
    Swarm: { attempts: 1, successes: 0, consecutiveSuccesses: 0, lastOutcome: "knowledge-gap", lastAttemptAt: new Date().toISOString() },
  }), { env });
  const { known } = await recallKnowledge({ env });
  assert.equal(known.find((item) => item.concept === "Volumes").status, "developing");
  assert.equal(known.find((item) => item.concept === "Swarm").status, "gap");
});

test("same concept from two projects merges evidence", async () => {
  const { env } = await environment();
  await syncKnowledge("/a", session("one", "Docker A", { Docker: evidence({ consecutiveSuccesses: 1, successes: 1, attempts: 1 }) }), { env });
  await syncKnowledge("/b", session("one", "Docker B", { Docker: evidence({ consecutiveSuccesses: 1, successes: 1, attempts: 1, transferPassed: true }) }), { env });
  const { known } = await recallKnowledge({ env });
  assert.equal(known.length, 1);
  assert.equal(known[0].successes, 2);
  assert.equal(known[0].status, "secured");
  assert.deepEqual(known[0].learnedIn.sort(), ["Docker A", "Docker B"]);
});

test("repeating a sync does not double count", async () => {
  const { env } = await environment();
  const state = session("s", "T", { Docker: evidence() });
  await syncKnowledge("/p", state, { env });
  await syncKnowledge("/p", state, { env });
  const { known } = await recallKnowledge({ env });
  assert.equal(known[0].successes, 3);
});

test("forgetting removes a concept or marks it for re-verification", async () => {
  const { env } = await environment();
  await syncKnowledge("/p", session("s", "T", { Docker: evidence(), Git: evidence() }), { env });

  await forgetKnowledge({ concept: "docker", action: "mark-forgotten", env });
  let { known } = await recallKnowledge({ env });
  assert.equal(known.find((item) => item.concept === "Docker").status, "needs-verification");

  assert.equal((await forgetKnowledge({ concept: "git", env })).changed, true);
  assert.equal((await forgetKnowledge({ concept: "git", env })).changed, false);
  ({ known } = await recallKnowledge({ env }));
  assert.deepEqual(known.map((item) => item.concept), ["Docker"]);

  // A later successful check clears the forgotten mark.
  await new Promise((resolve) => setTimeout(resolve, 5));
  await syncKnowledge("/p", session("s", "T", { Docker: evidence() }), { env });
  ({ known } = await recallKnowledge({ env }));
  assert.equal(known[0].status, "secured");
});

test("a corrupted map never breaks a learning session", async () => {
  const { home, env } = await environment();
  await writeFile(join(home, "knowledge.json"), "{ not json", "utf8");
  const synced = await syncKnowledge("/p", session("s", "T", { Docker: evidence() }), { env });
  assert.equal(synced.updated, 0);
  assert.match(synced.warning, /not valid JSON/);
  await assert.rejects(recallKnowledge({ concepts: ["docker"], env }), /not valid JSON/);
});

test("checkpoint assessment feeds the shared map and survives a broken one", async () => {
  const { home } = await environment();
  const root = await mkdtemp(join(tmpdir(), "loom-project-"));
  const previousHome = process.env.CONCEPT_LOOM_HOME;
  process.env.CONCEPT_LOOM_HOME = home;
  try {
    const base = { sessionId: "k8s-1", topic: "Kubernetes", goal: "G", phase: "build", nextStep: "Next" };
    await saveLearningState(root, base);
    const saved = await recordCheckpointAssessment(
      root,
      { sessionId: "k8s-1", nextStep: "Next", evidenceConcept: "Pods" },
      { outcome: "accurate", format: "choice" },
    );
    assert.equal(saved.knowledgeWarning, undefined);
    const { known } = await recallKnowledge({ env: process.env });
    assert.equal(known[0].concept, "Pods");
    assert.equal(known[0].successes, 1);

    await writeFile(join(home, "knowledge.json"), "oops", "utf8");
    const warned = await recordCheckpointAssessment(
      root,
      { sessionId: "k8s-1", nextStep: "Next", evidenceConcept: "Pods" },
      { outcome: "accurate", format: "choice" },
    );
    assert.match(warned.knowledgeWarning, /not valid JSON/);
    assert.equal(warned.evidence.Pods.successes, 2);
  } finally {
    if (previousHome === undefined) delete process.env.CONCEPT_LOOM_HOME;
    else process.env.CONCEPT_LOOM_HOME = previousHome;
  }
});

test("importing past sessions fills the map and is repeatable", async () => {
  const { home, env } = await environment();
  const root = await mkdtemp(join(tmpdir(), "loom-project-"));
  const previousHome = process.env.CONCEPT_LOOM_HOME;
  process.env.CONCEPT_LOOM_HOME = "off";
  try {
    await saveLearningState(root, {
      sessionId: "old", topic: "Docker", goal: "G", phase: "complete", nextStep: "Done",
      evidence: { "Docker images": evidence() },
    });
  } finally {
    process.env.CONCEPT_LOOM_HOME = previousHome ?? "off";
    if (previousHome === undefined) delete process.env.CONCEPT_LOOM_HOME;
  }
  const states = await listLearningStates(root);
  const first = await importKnowledge(root, states, { env });
  const second = await importKnowledge(root, states, { env });
  assert.equal(first.concepts, 1);
  assert.equal(second.concepts, 1);
  const stored = JSON.parse(await readFile(join(home, "knowledge.json"), "utf8"));
  assert.equal(Object.keys(stored.concepts).length, 1);
  const { known } = await recallKnowledge({ env });
  assert.equal(known[0].successes, 3);
});
