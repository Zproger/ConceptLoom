import test from "node:test";
import assert from "node:assert/strict";
import { composeCheckpoint, assessCheckpoint, resetCheckpointsForTests } from "../src/checkpoints.mjs";

test.beforeEach(() => resetCheckpointsForTests());

test("frames a checkpoint without leaking its key or rationale", () => {
  const card = composeCheckpoint({
    prompt: "Which shape has three sides?",
    choices: [{ key: "triangle", label: "Triangle" }, { key: "square", label: "Square" }],
    expected: "triangle",
    rationale: "A triangle is defined by its three sides.",
  }, () => 0.5);
  assert.equal(card.choices.length, 2);
  assert.equal("expected" in card, false);
  assert.equal("rationale" in card, false);
});

test("grades an exact multi-selection", () => {
  const card = composeCheckpoint({
    prompt: "Pick primes",
    choices: [{ key: "2", label: "2" }, { key: "3", label: "3" }, { key: "4", label: "4" }],
    expected: ["2", "3"],
    rationale: "Two and three have exactly two positive divisors.",
    multiple: true,
    mix: false,
  });
  const result = assessCheckpoint({ token: card.token, selected: ["3", "2"] });
  assert.equal(result.outcome, "accurate");
});

test("treats an admitted gap separately from a wrong guess", () => {
  const card = composeCheckpoint({
    prompt: "Pick one",
    choices: [{ key: "a", label: "A" }, { key: "b", label: "B" }],
    expected: "a",
    rationale: "A is expected.",
  });
  const result = assessCheckpoint({ token: card.token, selected: "__gap__" });
  assert.equal(result.outcome, "knowledge-gap");
  assert.equal(result.accurate, false);
});

test("checkpoint tokens can only be assessed once", () => {
  const card = composeCheckpoint({
    prompt: "Pick one",
    choices: [{ key: "a", label: "A" }, { key: "b", label: "B" }],
    expected: "a",
    rationale: "A is expected.",
  });
  assessCheckpoint({ token: card.token, selected: "a" });
  assert.throws(() => assessCheckpoint({ token: card.token, selected: "a" }), /unknown or expired/);
});
