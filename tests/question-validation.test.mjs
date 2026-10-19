// ============================================================================
// MCQ Junction — Question Server-Side Validation Test Suite (Phase 8)
// File: tests/question-validation.test.mjs
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import {
  singleCorrectQuestionSchema,
  multipleCorrectQuestionSchema,
  assertionReasonQuestionSchema,
  questionAuthoringSchema,
  validateQuestionConfiguration,
} from "../src/lib/questions/validation.ts";

const validPaperId = "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d";

// ----------------------------------------------------------------------------
// 1. Single-Correct Validation Tests
// ----------------------------------------------------------------------------

test("VAL-01: singleCorrectQuestionSchema accepts valid single-correct configuration", () => {
  const payload = {
    paperId: validPaperId,
    primarySubject: "Database Systems",
    defaultTopic: "Indexing",
    questionType: "SINGLE_CORRECT",
    questionText: "What is the primary lookup structure for B-Trees?",
    options: [
      { optionLabel: "A", optionText: "Balanced hierarchy of page nodes", isCorrect: true },
      { optionLabel: "B", optionText: "Linear linked list of keys", isCorrect: false },
      { optionLabel: "C", optionText: "Unordered heap block", isCorrect: false },
      { optionLabel: "D", optionText: "Single hash bucket", isCorrect: false },
    ],
  };

  const res = validateQuestionConfiguration(payload);
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.errors.length, 0);
});

test("VAL-02: singleCorrectQuestionSchema rejects 0 correct options", () => {
  const payload = {
    paperId: validPaperId,
    primarySubject: "Database Systems",
    defaultTopic: "Indexing",
    questionType: "SINGLE_CORRECT",
    questionText: "What is the primary lookup structure for B-Trees?",
    options: [
      { optionLabel: "A", optionText: "Option A", isCorrect: false },
      { optionLabel: "B", optionText: "Option B", isCorrect: false },
    ],
  };

  const res = validateQuestionConfiguration(payload);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(
    res.errors.some((e) => e.includes("requires exactly 1 correct option")),
    true
  );
});

test("VAL-03: singleCorrectQuestionSchema rejects multiple correct options", () => {
  const payload = {
    paperId: validPaperId,
    primarySubject: "Database Systems",
    defaultTopic: "Indexing",
    questionType: "SINGLE_CORRECT",
    questionText: "What is the primary lookup structure for B-Trees?",
    options: [
      { optionLabel: "A", optionText: "Option A", isCorrect: true },
      { optionLabel: "B", optionText: "Option B", isCorrect: true },
    ],
  };

  const res = validateQuestionConfiguration(payload);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(
    res.errors.some((e) => e.includes("requires exactly 1 correct option")),
    true
  );
});

test("VAL-04: singleCorrectQuestionSchema rejects duplicate option labels", () => {
  const payload = {
    paperId: validPaperId,
    primarySubject: "Database Systems",
    defaultTopic: "Indexing",
    questionType: "SINGLE_CORRECT",
    questionText: "What is the primary lookup structure for B-Trees?",
    options: [
      { optionLabel: "A", optionText: "Option A", isCorrect: true },
      { optionLabel: "A", optionText: "Duplicate Option A", isCorrect: false },
    ],
  };

  const res = validateQuestionConfiguration(payload);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(
    res.errors.some((e) => e.includes("Duplicate option label")),
    true
  );
});

// ----------------------------------------------------------------------------
// 2. Multiple-Correct Validation Tests
// ----------------------------------------------------------------------------

test("VAL-05: multipleCorrectQuestionSchema accepts 2+ correct options", () => {
  const payload = {
    paperId: validPaperId,
    primarySubject: "Algorithms",
    defaultTopic: "Trees",
    questionType: "MULTIPLE_CORRECT",
    questionText: "Which of the following data structures guarantee O(log n) search time?",
    options: [
      { optionLabel: "A", optionText: "Unsorted Array", isCorrect: false },
      { optionLabel: "B", optionText: "Red-Black Tree", isCorrect: true },
      { optionLabel: "C", optionText: "Hash Table", isCorrect: false },
      { optionLabel: "D", optionText: "B+ Tree", isCorrect: true },
    ],
  };

  const res = validateQuestionConfiguration(payload);
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.errors.length, 0);
});

test("VAL-06: multipleCorrectQuestionSchema rejects 0 correct options", () => {
  const payload = {
    paperId: validPaperId,
    primarySubject: "Algorithms",
    defaultTopic: "Trees",
    questionType: "MULTIPLE_CORRECT",
    questionText: "Which of the following data structures guarantee O(log n) search time?",
    options: [
      { optionLabel: "A", optionText: "Unsorted Array", isCorrect: false },
      { optionLabel: "B", optionText: "Hash Table", isCorrect: false },
    ],
  };

  const res = validateQuestionConfiguration(payload);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(
    res.errors.some((e) => e.includes("requires at least 1 correct option")),
    true
  );
});

// ----------------------------------------------------------------------------
// 3. Assertion-Reason Validation Tests
// ----------------------------------------------------------------------------

test("VAL-07: assertionReasonQuestionSchema accepts valid assertion, reason, and choices", () => {
  const payload = {
    paperId: validPaperId,
    primarySubject: "Database Systems",
    defaultTopic: "Integrity",
    questionType: "ASSERTION_REASON",
    questionText: "Evaluate the relational integrity statements below:",
    assertionText: "Foreign keys eliminate orphaned rows in relational database schemas.",
    reasonText: "Relational engines enforce constraints during DML execution, aborting violating transactions.",
    options: [
      { optionLabel: "A", optionText: "Both A and R are true and R explains A", isCorrect: true },
      { optionLabel: "B", optionText: "Both A and R are true but R does not explain A", isCorrect: false },
      { optionLabel: "C", optionText: "A is true but R is false", isCorrect: false },
      { optionLabel: "D", optionText: "A is false but R is true", isCorrect: false },
    ],
  };

  const res = validateQuestionConfiguration(payload);
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.errors.length, 0);
});

test("VAL-08: assertionReasonQuestionSchema rejects missing assertion or reason text", () => {
  const missingAssertion = {
    paperId: validPaperId,
    primarySubject: "Database Systems",
    defaultTopic: "Integrity",
    questionType: "ASSERTION_REASON",
    questionText: "Evaluate the statements:",
    assertionText: "", // Empty
    reasonText: "Valid reason statement text",
    options: [
      { optionLabel: "A", optionText: "Option A", isCorrect: true },
      { optionLabel: "B", optionText: "Option B", isCorrect: false },
    ],
  };

  const res = validateQuestionConfiguration(missingAssertion);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(
    res.errors.some((e) => e.includes("Assertion (A) statement must be at least 5 characters")),
    true
  );
});

test("VAL-09: assertionReasonQuestionSchema rejects multiple correct options", () => {
  const payload = {
    paperId: validPaperId,
    primarySubject: "Database Systems",
    defaultTopic: "Integrity",
    questionType: "ASSERTION_REASON",
    questionText: "Evaluate the statements:",
    assertionText: "Assertion statement proposition",
    reasonText: "Reason statement explanation",
    options: [
      { optionLabel: "A", optionText: "Option A", isCorrect: true },
      { optionLabel: "B", optionText: "Option B", isCorrect: true }, // Invalid: 2 correct
    ],
  };

  const res = validateQuestionConfiguration(payload);
  assert.strictEqual(res.valid, false);
  assert.strictEqual(
    res.errors.some((e) => e.includes("requires exactly 1 correct option")),
    true
  );
});
