import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

// Cross-project learner knowledge map.
//
// Stored once per user (default ~/.concept-loom/knowledge.json) so that what was
// learned in one project can inform the route of another. Set CONCEPT_LOOM_HOME to
// relocate it, or CONCEPT_LOOM_HOME=off to disable it entirely.

const SCHEMA_VERSION = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
// A concept that was secured but not verified for this long must be re-checked.
export const STALE_AFTER_DAYS = 90;

export function knowledgeHome(env = process.env) {
  const configured = env.CONCEPT_LOOM_HOME?.trim();
  if (configured && configured.toLowerCase() === "off") return null;
  return configured ? resolve(configured) : join(homedir(), ".concept-loom");
}

function knowledgePath(env) {
  const home = knowledgeHome(env);
  return home ? join(home, "knowledge.json") : null;
}

export function conceptSlug(name) {
  const slug = String(name ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("concept name must contain letters or numbers");
  return slug;
}

function tokens(slug) {
  return slug.split("-").filter(Boolean);
}

async function readStore(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { schemaVersion: SCHEMA_VERSION, concepts: {} };
    throw error;
  }
  let store;
  try {
    store = JSON.parse(text);
  } catch {
    throw new Error(`knowledge map at ${path} is not valid JSON; fix or delete the file`);
  }
  if (!store || typeof store !== "object" || typeof store.concepts !== "object" || store.concepts === null) {
    throw new Error(`knowledge map at ${path} has an unexpected structure; fix or delete the file`);
  }
  return store;
}

async function writeStore(path, store) {
  await mkdir(join(path, ".."), { recursive: true });
  const next = { ...store, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() };
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function workspaceKey(baseDirectory) {
  const hash = createHash("sha1").update(resolve(baseDirectory)).digest("hex").slice(0, 8);
  return hash;
}

function latest(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

// Collapse per-session sources into one picture of what the learner knows.
export function summarizeConcept(record, now = new Date()) {
  const sources = Object.values(record.sources ?? {});
  const successes = sources.reduce((sum, source) => sum + (source.successes ?? 0), 0);
  const attempts = sources.reduce((sum, source) => sum + (source.attempts ?? 0), 0);
  const bestStreak = sources.reduce((max, source) => Math.max(max, source.consecutiveSuccesses ?? 0), 0);
  const transferPassed = sources.some((source) => source.transferPassed === true);
  const lastVerifiedAt = sources.reduce((acc, source) => latest(acc, source.lastVerifiedAt), undefined);
  const lastAttemptAt = sources.reduce((acc, source) => latest(acc, source.lastAttemptAt), undefined);
  const lastOutcomeSource = sources
    .filter((source) => source.lastAttemptAt)
    .sort((left, right) => right.lastAttemptAt.localeCompare(left.lastAttemptAt))[0];

  let level = "gap";
  if (successes > 0) level = "developing";
  if (bestStreak >= 2 || transferPassed) level = "secured";
  // A fresh failure after the last success means the concept is shaky again.
  if (lastOutcomeSource && lastOutcomeSource.lastOutcome && lastOutcomeSource.lastOutcome !== "accurate") {
    level = successes > 0 ? "developing" : "gap";
  }

  const verifiedMs = lastVerifiedAt ? new Date(lastVerifiedAt).getTime() : NaN;
  const ageDays = Number.isNaN(verifiedMs) ? null : Math.floor((now.getTime() - verifiedMs) / DAY_MS);
  const forgotten = Boolean(record.forgottenAt) && !(lastVerifiedAt && lastVerifiedAt > record.forgottenAt);

  let status = level;
  if (level === "secured" && (forgotten || ageDays === null || ageDays > STALE_AFTER_DAYS)) {
    status = "needs-verification";
  } else if (forgotten && level !== "gap") {
    status = "needs-verification";
  }

  return {
    concept: record.name,
    slug: record.slug,
    status,
    level,
    attempts,
    successes,
    transferPassed,
    lastVerifiedAt: lastVerifiedAt ?? null,
    lastAttemptAt: lastAttemptAt ?? null,
    daysSinceVerified: ageDays,
    reportedForgotten: forgotten,
    learnedIn: sources
      .map((source) => source.topic)
      .filter((topic, index, all) => topic && all.indexOf(topic) === index),
  };
}

function matchesQuery(querySlug, record) {
  const slug = record.slug;
  if (slug === querySlug) return 3;
  const queryTokens = tokens(querySlug);
  const recordTokens = tokens(slug);
  if (queryTokens.length > 0 && queryTokens.every((token) => recordTokens.includes(token))) return 2;
  if (recordTokens.length > 0 && recordTokens.every((token) => queryTokens.includes(token))) return 2;
  if (querySlug.length >= 4 && slug.length >= 4 && (slug.includes(querySlug) || querySlug.includes(slug))) return 1;
  return 0;
}

function sourceFromEvidence(state, entry) {
  return {
    topic: state.topic,
    attempts: entry.attempts ?? 0,
    successes: entry.successes ?? 0,
    consecutiveSuccesses: entry.consecutiveSuccesses ?? 0,
    transferPassed: entry.transferPassed === true,
    lastOutcome: entry.lastOutcome,
    lastAttemptAt: entry.lastAttemptAt,
    lastVerifiedAt: entry.lastSuccessfulRetrieval,
    reviewAfter: entry.reviewAfter,
  };
}

function mergeSession(store, baseDirectory, state, onlyConcepts) {
  let changed = 0;
  const workspace = basename(resolve(baseDirectory));
  const sourceKey = `${workspaceKey(baseDirectory)}:${state.sessionId}`;
  for (const [concept, entry] of Object.entries(state.evidence ?? {})) {
    if (!entry || typeof entry !== "object") continue;
    if (onlyConcepts && !onlyConcepts.includes(concept)) continue;
    let slug;
    try {
      slug = conceptSlug(concept);
    } catch {
      continue;
    }
    const record = store.concepts[slug] ?? { name: concept.trim(), slug, sources: {} };
    record.sources[sourceKey] = { ...sourceFromEvidence(state, entry), sessionId: state.sessionId, workspace };
    store.concepts[slug] = record;
    changed += 1;
  }
  return changed;
}

// Record a session's evidence in the knowledge map. Never throws: the learning
// session must keep working even if the shared map is unavailable.
export async function syncKnowledge(baseDirectory, state, { concepts, env = process.env } = {}) {
  const path = knowledgePath(env);
  if (!path) return { enabled: false, updated: 0 };
  try {
    const store = await readStore(path);
    const updated = mergeSession(store, baseDirectory, state, concepts);
    if (updated > 0) await writeStore(path, store);
    return { enabled: true, updated };
  } catch (error) {
    return { enabled: true, updated: 0, warning: error instanceof Error ? error.message : String(error) };
  }
}

export async function importKnowledge(baseDirectory, states, { env = process.env } = {}) {
  const path = knowledgePath(env);
  if (!path) return { enabled: false, sessions: 0, concepts: 0 };
  const store = await readStore(path);
  let concepts = 0;
  for (const state of states) concepts += mergeSession(store, baseDirectory, state);
  if (concepts > 0) await writeStore(path, store);
  return { enabled: true, sessions: states.length, concepts, path };
}

export async function recallKnowledge({ concepts, now, env = process.env } = {}) {
  const path = knowledgePath(env);
  if (!path) return { enabled: false, matches: [], known: [] };
  const asOf = now ? new Date(now) : new Date();
  if (Number.isNaN(asOf.getTime())) throw new Error("now must be an ISO date");
  const store = await readStore(path);
  const records = Object.values(store.concepts);

  if (concepts === undefined) {
    const known = records
      .map((record) => summarizeConcept(record, asOf))
      .sort((left, right) => left.concept.localeCompare(right.concept));
    return { enabled: true, asOf: asOf.toISOString(), known };
  }
  if (!Array.isArray(concepts) || concepts.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error("concepts must be an array of non-empty strings");
  }

  const matches = concepts.map((query) => {
    const querySlug = conceptSlug(query);
    const found = records
      .map((record) => ({ score: matchesQuery(querySlug, record), record }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((entry) => summarizeConcept(entry.record, asOf));
    return { query, found };
  });
  return { enabled: true, asOf: asOf.toISOString(), matches };
}

export async function forgetKnowledge({ concept, action = "remove", env = process.env } = {}) {
  const path = knowledgePath(env);
  if (!path) return { enabled: false, changed: false };
  if (typeof concept !== "string" || !concept.trim()) throw new Error("concept must be a non-empty string");
  if (action !== "remove" && action !== "mark-forgotten") {
    throw new Error("action must be 'remove' or 'mark-forgotten'");
  }
  const slug = conceptSlug(concept);
  const store = await readStore(path);
  const record = store.concepts[slug];
  if (!record) return { enabled: true, changed: false, concept: slug };
  if (action === "remove") delete store.concepts[slug];
  else record.forgottenAt = new Date().toISOString();
  await writeStore(path, store);
  return { enabled: true, changed: true, concept: slug, action };
}
