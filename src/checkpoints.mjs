import { randomBytes } from "node:crypto";

const activeCards = new Map();
const CARD_TTL_MS = 6 * 60 * 60 * 1000;

function cleanText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function rearrange(items, random = Math.random) {
  const copy = [...items];
  for (let cursor = copy.length - 1; cursor > 0; cursor -= 1) {
    const swapWith = Math.floor(random() * (cursor + 1));
    [copy[cursor], copy[swapWith]] = [copy[swapWith], copy[cursor]];
  }
  return copy;
}

function discardExpired(now = Date.now()) {
  for (const [key, card] of activeCards) {
    if (now - card.createdAt > CARD_TTL_MS) activeCards.delete(key);
  }
}

export function composeCheckpoint(input, random = Math.random) {
  discardExpired();
  const prompt = cleanText(input.prompt, "prompt");
  const rationale = cleanText(input.rationale, "rationale");
  if (!Array.isArray(input.choices) || input.choices.length < 2) {
    throw new Error("choices must contain at least two entries");
  }

  const knownKeys = new Set();
  const choices = input.choices.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`choice ${index + 1} must be an object`);
    const key = cleanText(entry.key, `choice ${index + 1} key`);
    const label = cleanText(entry.label, `choice ${index + 1} label`);
    if (knownKeys.has(key)) throw new Error(`choice key '${key}' is duplicated`);
    knownKeys.add(key);
    return { key, label };
  });

  const expected = Array.isArray(input.expected) ? input.expected : [input.expected];
  if (expected.length === 0) throw new Error("expected must name at least one choice key");
  const expectedSet = new Set(expected.map((value) => cleanText(value, "expected key")));
  for (const key of expectedSet) {
    if (!knownKeys.has(key)) throw new Error(`expected key '${key}' is not present in choices`);
  }
  const multiple = input.multiple === true;
  if (!multiple && expectedSet.size !== 1) {
    throw new Error("a single-choice checkpoint must have exactly one expected key");
  }

  const arranged = input.mix === false ? choices : rearrange(choices, random);
  const token = randomBytes(18).toString("base64url");
  activeCards.set(token, {
    createdAt: Date.now(),
    prompt,
    rationale,
    choices: arranged,
    expectedSet,
    multiple,
  });

  return {
    token,
    prompt,
    multiple,
    choices: arranged,
    escapeChoice: { key: "__gap__", label: "I do not know yet" },
    instructions: multiple
      ? "Select every fitting key, or choose __gap__."
      : "Select one key, or choose __gap__.",
  };
}

export function assessCheckpoint(input) {
  discardExpired();
  const token = cleanText(input.token, "token");
  const card = activeCards.get(token);
  if (!card) throw new Error("checkpoint token is unknown or expired");
  activeCards.delete(token);

  const submitted = Array.isArray(input.selected) ? input.selected : [input.selected];
  const selected = submitted.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
  const admittedGap = selected.includes("__gap__");
  if (admittedGap && selected.length !== 1) throw new Error("__gap__ cannot be combined with another choice");
  if (!admittedGap && selected.length === 0) throw new Error("selected must contain an answer or __gap__");
  if (!card.multiple && selected.length !== 1) throw new Error("this checkpoint accepts one choice");

  const validKeys = new Set(card.choices.map((choice) => choice.key));
  for (const key of selected) {
    if (key !== "__gap__" && !validKeys.has(key)) throw new Error(`selected key '${key}' does not exist`);
  }

  const selectionSet = new Set(selected);
  const accurate = !admittedGap
    && selectionSet.size === card.expectedSet.size
    && [...selectionSet].every((key) => card.expectedSet.has(key));

  return {
    outcome: admittedGap ? "knowledge-gap" : accurate ? "accurate" : "needs-repair",
    accurate,
    selected,
    expected: [...card.expectedSet],
    rationale: card.rationale,
    note: typeof input.note === "string" && input.note.trim() ? input.note.trim() : undefined,
  };
}

export function resetCheckpointsForTests() {
  activeCards.clear();
}
