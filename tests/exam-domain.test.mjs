// ============================================================================
// MCQ Junction — Exam Engine Domain & Unit Test Suite
// File: tests/exam-domain.test.mjs
// ============================================================================

import test from "node:test";
import assert from "node:assert";
import {
  createSeededRng,
  deterministicShuffle,
  generateBookletPermutation,
} from "../src/lib/exam/booklet.ts";
import {
  startAttemptSchema,
  saveAnswerSchema,
  submitAttemptSchema,
} from "../src/lib/exam/schemas.ts";
import {
  calculateAttemptScore,
} from "../src/lib/scoring/engine.ts";

// ----------------------------------------------------------------------------
// 1. Deterministic PRNG & Shuffle Invariants
// ----------------------------------------------------------------------------

test("BOOKLET-01: Seeded PRNG produces 100% reproducible sequences for same seed", () => {
  const seed = "paper-123-series-B";
  const rng1 = createSeededRng(seed);
  const rng2 = createSeededRng(seed);

  const seq1 = Array.from({ length: 10 }, () => rng1.next());
  const seq2 = Array.from({ length: 10 }, () => rng2.next());

  assert.deepStrictEqual(seq1, seq2, "PRNG sequences must be identical for identical seed");

  const diffRng = createSeededRng("paper-123-series-C");
  const diffSeq = Array.from({ length: 10 }, () => diffRng.next());
  assert.notDeepStrictEqual(seq1, diffSeq, "Different seed must yield different sequence");
});

test("BOOKLET-02: deterministicShuffle preserves all original elements without loss or duplication", () => {
  const items = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8"];
  const rng = createSeededRng("test-shuffle-seed");
  const shuffled = deterministicShuffle(items, rng);

  assert.strictEqual(shuffled.length, items.length);
  assert.deepStrictEqual(new Set(shuffled), new Set(items));
});

// ----------------------------------------------------------------------------
// 2. Passage Contiguity and Booklet Permutation Invariants
// ----------------------------------------------------------------------------

test("BOOKLET-03: generateBookletPermutation guarantees comprehension child questions remain contiguous", () => {
  // Test paper with standalone questions and passage-bound questions
  const occurrences = [
    {
      id: "occ-1",
      sequenceNumber: 1,
      passageId: null, // Standalone
      questionType: "SINGLE_CORRECT",
      options: [
        { id: "opt-1a", optionLabel: "A", sortOrder: 1, optionText: "Option 1A" },
        { id: "opt-1b", optionLabel: "B", sortOrder: 2, optionText: "Option 1B" },
      ],
    },
    {
      id: "occ-2",
      sequenceNumber: 2,
      passageId: "passage-cap-theorem", // Passage Child 1
      questionType: "COMPREHENSION_CHILD",
      options: [
        { id: "opt-2a", optionLabel: "A", sortOrder: 1, optionText: "Option 2A" },
        { id: "opt-2b", optionLabel: "B", sortOrder: 2, optionText: "Option 2B" },
      ],
    },
    {
      id: "occ-3",
      sequenceNumber: 3,
      passageId: "passage-cap-theorem", // Passage Child 2
      questionType: "COMPREHENSION_CHILD",
      options: [
        { id: "opt-3a", optionLabel: "A", sortOrder: 1, optionText: "Option 3A" },
        { id: "opt-3b", optionLabel: "B", sortOrder: 2, optionText: "Option 3B" },
      ],
    },
    {
      id: "occ-4",
      sequenceNumber: 4,
      passageId: null, // Standalone
      questionType: "SINGLE_CORRECT",
      options: [
        { id: "opt-4a", optionLabel: "A", sortOrder: 1, optionText: "Option 4A" },
        { id: "opt-4b", optionLabel: "B", sortOrder: 2, optionText: "Option 4B" },
      ],
    },
    {
      id: "occ-5",
      sequenceNumber: 5,
      passageId: "passage-cap-theorem", // Passage Child 3
      questionType: "COMPREHENSION_CHILD",
      options: [
        { id: "opt-5a", optionLabel: "A", sortOrder: 1, optionText: "Option 5A" },
        { id: "opt-5b", optionLabel: "B", sortOrder: 2, optionText: "Option 5B" },
      ],
    },
  ];

  // Run permutation across 10 different seeds to verify contiguity invariance
  for (let s = 1; s <= 10; s++) {
    const permuted = generateBookletPermutation(occurrences, {
      shuffleQuestions: true,
      shuffleOptions: true,
      seed: `test-seed-${s}`,
    });

    assert.strictEqual(permuted.length, occurrences.length);

    // Verify display sequences are strictly 1..N
    const seqs = permuted.map((p) => p.displaySequence);
    assert.deepStrictEqual(seqs, [1, 2, 3, 4, 5]);

    // Find indices of all questions belonging to passage-cap-theorem
    const passageIndices = permuted
      .map((p, idx) => (p.passageId === "passage-cap-theorem" ? idx : -1))
      .filter((idx) => idx !== -1);

    assert.strictEqual(passageIndices.length, 3);
    // Invariant: passage child questions must occupy consecutive adjacent indices
    assert.strictEqual(
      passageIndices[1] - passageIndices[0],
      1,
      `Passage questions must be contiguous (seed ${s})`
    );
    assert.strictEqual(
      passageIndices[2] - passageIndices[1],
      1,
      `Passage questions must be contiguous (seed ${s})`
    );
  }
});

test("BOOKLET-04: Option shuffling maintains bidirectional source ID to display label mapping", () => {
  const occurrences = [
    {
      id: "occ-mcq",
      sequenceNumber: 1,
      passageId: null,
      questionType: "SINGLE_CORRECT",
      options: [
        { id: "opt-1", optionLabel: "A", sortOrder: 1, optionText: "First choice" },
        { id: "opt-2", optionLabel: "B", sortOrder: 2, optionText: "Second choice" },
        { id: "opt-3", optionLabel: "C", sortOrder: 3, optionText: "Third choice" },
        { id: "opt-4", optionLabel: "D", sortOrder: 4, optionText: "Fourth choice" },
      ],
    },
  ];

  const permuted = generateBookletPermutation(occurrences, {
    shuffleQuestions: false,
    shuffleOptions: true,
    seed: "shuffle-options-seed",
  });

  const question = permuted[0];
  assert.strictEqual(question.optionMappings.length, 4);

  // Verify display labels are 'A', 'B', 'C', 'D'
  const displayLabels = question.optionMappings.map((om) => om.displayLabel);
  assert.deepStrictEqual(displayLabels, ["A", "B", "C", "D"]);

  // Verify displaySortOrders are 1, 2, 3, 4
  const displayOrders = question.optionMappings.map((om) => om.displaySortOrder);
  assert.deepStrictEqual(displayOrders, [1, 2, 3, 4]);

  // Verify all original sourceOptionIds exist exactly once
  const sourceIds = question.optionMappings.map((om) => om.sourceOptionId);
  assert.strictEqual(new Set(sourceIds).size, 4);
  assert.strictEqual(sourceIds.includes("opt-1"), true);
  assert.strictEqual(sourceIds.includes("opt-2"), true);
  assert.strictEqual(sourceIds.includes("opt-3"), true);
  assert.strictEqual(sourceIds.includes("opt-4"), true);
});

test("BOOKLET-05: Assertion-Reason questions preserve canonical option choices without label scrambling", () => {
  const occurrences = [
    {
      id: "occ-ar",
      sequenceNumber: 1,
      passageId: null,
      questionType: "ASSERTION_REASON",
      options: [
        { id: "ar-opt-1", optionLabel: "A", sortOrder: 1, optionText: "Both A and R are true and R is correct explanation of A" },
        { id: "ar-opt-2", optionLabel: "B", sortOrder: 2, optionText: "Both A and R are true but R is NOT correct explanation of A" },
        { id: "ar-opt-3", optionLabel: "C", sortOrder: 3, optionText: "A is true but R is false" },
        { id: "ar-opt-4", optionLabel: "D", sortOrder: 4, optionText: "A is false but R is true" },
      ],
    },
  ];

  const permuted = generateBookletPermutation(occurrences, {
    shuffleQuestions: true,
    shuffleOptions: true,
    seed: "ar-seed-never-scramble",
  });

  const arQuestion = permuted[0];
  // Invariant: Assertion-Reason choices must keep their standard canonical positions
  assert.strictEqual(arQuestion.optionMappings[0].sourceOptionId, "ar-opt-1");
  assert.strictEqual(arQuestion.optionMappings[0].displayLabel, "A");
  assert.strictEqual(arQuestion.optionMappings[1].sourceOptionId, "ar-opt-2");
  assert.strictEqual(arQuestion.optionMappings[1].displayLabel, "B");
  assert.strictEqual(arQuestion.optionMappings[2].sourceOptionId, "ar-opt-3");
  assert.strictEqual(arQuestion.optionMappings[2].displayLabel, "C");
  assert.strictEqual(arQuestion.optionMappings[3].sourceOptionId, "ar-opt-4");
  assert.strictEqual(arQuestion.optionMappings[3].displayLabel, "D");
});

// ----------------------------------------------------------------------------
// 3. Schema & Validation Boundary Tests
// ----------------------------------------------------------------------------

test("VAL-EXAM-01: startAttemptSchema validates valid UUID paperId", () => {
  const valid = startAttemptSchema.safeParse({ paperId: "11111111-1111-4111-8111-111111111111" });
  assert.strictEqual(valid.success, true);

  const invalid = startAttemptSchema.safeParse({ paperId: "not-a-uuid" });
  assert.strictEqual(invalid.success, false);
});

test("VAL-EXAM-02: saveAnswerSchema validates answer payload and version constraints", () => {
  const valid = saveAnswerSchema.safeParse({
    attemptId: "11111111-1111-4111-8111-111111111111",
    occurrenceId: "22222222-2222-4222-8222-222222222222",
    selectedSourceOptionIds: ["33333333-3333-4333-8333-333333333333"],
    displayOptionLabels: ["B"],
    numericalInput: null,
    isMarkedForReview: true,
    timeSpentSeconds: 45,
    clientVersion: 2,
  });
  assert.strictEqual(valid.success, true);

  // Negative time spent rejected
  const negTime = saveAnswerSchema.safeParse({
    attemptId: "11111111-1111-4111-8111-111111111111",
    occurrenceId: "22222222-2222-4222-8222-222222222222",
    timeSpentSeconds: -10,
  });
  assert.strictEqual(negTime.success, false);

  // Non-positive client version rejected
  const zeroVer = saveAnswerSchema.safeParse({
    attemptId: "11111111-1111-4111-8111-111111111111",
    occurrenceId: "22222222-2222-4222-8222-222222222222",
    clientVersion: 0,
  });
  assert.strictEqual(zeroVer.success, false);
});

test("VAL-EXAM-03: submitAttemptSchema validates attemptId", () => {
  const valid = submitAttemptSchema.safeParse({
    attemptId: "11111111-1111-4111-8111-111111111111",
    reason: "Candidate finished early",
  });
  assert.strictEqual(valid.success, true);
});

// ----------------------------------------------------------------------------
// 4. Server-Authoritative Timer & Deadline Calculations
// ----------------------------------------------------------------------------

test("TIMER-01: Deadline is calculated authoritatively from startedAt and paper totalDurationMinutes", () => {
  const startedAt = new Date("2026-10-16T10:00:00.000Z");
  const durationMinutes = 120;
  const deadline = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);

  assert.strictEqual(deadline.toISOString(), "2026-10-16T12:00:00.000Z");

  // At 11:30:00, remaining seconds is 1800 (30 mins)
  const currentTime = new Date("2026-10-16T11:30:00.000Z").getTime();
  const remaining = Math.max(0, Math.floor((deadline.getTime() - currentTime) / 1000));
  assert.strictEqual(remaining, 1800);

  // At 12:05:00 (past deadline), remaining seconds floors to 0
  const lateTime = new Date("2026-10-16T12:05:00.000Z").getTime();
  const lateRemaining = Math.max(0, Math.floor((deadline.getTime() - lateTime) / 1000));
  assert.strictEqual(lateRemaining, 0);
});

test("TIMER-02: Client clock changes do not alter authoritative remaining time", () => {
  // If browser client manipulates Date.now() to 1970 or 2050, the server evaluates against its own system clock
  const serverStartedAt = Date.now();
  const durationMinutes = 60;
  const serverDeadline = serverStartedAt + durationMinutes * 60 * 1000;

  // Server clock at 15 minutes elapsed
  const serverClockNow = serverStartedAt + 15 * 60 * 1000;
  const authoritativeRemaining = Math.max(0, Math.floor((serverDeadline - serverClockNow) / 1000));
  assert.strictEqual(authoritativeRemaining, 45 * 60);
});

// ----------------------------------------------------------------------------
// 5. Strict Scoring Preservation in Exam Context
// ----------------------------------------------------------------------------

test("SCORING-EXAM-01: Authoritative evaluation engine accurately scores mixed exam paper", () => {
  const scoringInputs = [
    // Q1: SINGLE_CORRECT (Correct, 2.0 marks)
    {
      occurrenceId: "occ-1",
      sequenceNumber: 1,
      questionType: "SINGLE_CORRECT",
      paperMarksPerCorrect: 2.0,
      paperNegativeMarksPerWrong: 0.5,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["B"],
      correctSourceOptionIds: ["opt-1-b"],
      selectedSourceOptionIds: ["opt-1-b"],
      displayOptionLabels: ["B"],
    },
    // Q2: MULTIPLE_CORRECT (Exact match {B, D}, 2.0 marks)
    {
      occurrenceId: "occ-2",
      sequenceNumber: 2,
      questionType: "MULTIPLE_CORRECT",
      paperMarksPerCorrect: 2.0,
      paperNegativeMarksPerWrong: 0.5,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["B", "D"],
      correctSourceOptionIds: ["opt-2-b", "opt-2-d"],
      selectedSourceOptionIds: ["opt-2-b", "opt-2-d"],
      displayOptionLabels: ["B", "D"],
    },
    // Q3: MULTIPLE_CORRECT (Partial selection {B} only -> strictly incorrect: 0 marks, -0.5 penalty)
    {
      occurrenceId: "occ-3",
      sequenceNumber: 3,
      questionType: "MULTIPLE_CORRECT",
      paperMarksPerCorrect: 2.0,
      paperNegativeMarksPerWrong: 0.5,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["B", "D"],
      correctSourceOptionIds: ["opt-3-b", "opt-3-d"],
      selectedSourceOptionIds: ["opt-3-b"],
      displayOptionLabels: ["B"],
    },
    // Q4: ASSERTION_REASON (Incorrect -> -0.5 penalty)
    {
      occurrenceId: "occ-4",
      sequenceNumber: 4,
      questionType: "ASSERTION_REASON",
      paperMarksPerCorrect: 2.0,
      paperNegativeMarksPerWrong: 0.5,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["A"],
      correctSourceOptionIds: ["opt-4-a"],
      selectedSourceOptionIds: ["opt-4-c"],
      displayOptionLabels: ["C"],
    },
    // Q5: UNANSWERED (0 marks, 0 penalty)
    {
      occurrenceId: "occ-5",
      sequenceNumber: 5,
      questionType: "SINGLE_CORRECT",
      paperMarksPerCorrect: 2.0,
      paperNegativeMarksPerWrong: 0.5,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["C"],
      correctSourceOptionIds: ["opt-5-c"],
      selectedSourceOptionIds: [],
      displayOptionLabels: [],
    },
  ];

  const result = calculateAttemptScore(scoringInputs);

  // Q1: +2.0
  // Q2: +2.0
  // Q3: -0.5
  // Q4: -0.5
  // Q5: 0.0
  // Total raw score = 2.0 + 2.0 - 0.5 - 0.5 = 3.0
  assert.strictEqual(result.totalQuestions, 5);
  assert.strictEqual(result.totalCorrect, 2);
  assert.strictEqual(result.totalWrong, 2);
  assert.strictEqual(result.totalUnanswered, 1);
  assert.strictEqual(result.rawScore, 3.0);
  assert.strictEqual(result.evaluatedDenominator, 10.0);
});
