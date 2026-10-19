import test from "node:test";
import assert from "node:assert/strict";
import { calculateAttemptScore } from "../src/lib/scoring/engine.ts";

test("Scoring Engine: Standard clean exam scoring (BPSC baseline)", () => {
  const questions = [];
  // 70 Correct (1.000 marks each)
  for (let i = 1; i <= 70; i++) {
    questions.push({
      occurrenceId: `occ-${i}`,
      sequenceNumber: i,
      questionType: "SINGLE_CHOICE",
      paperMarksPerCorrect: 1.0,
      paperNegativeMarksPerWrong: 0.25,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["A"],
      correctSourceOptionIds: [`opt-${i}-a`],
      selectedSourceOptionIds: [`opt-${i}-a`],
      displayOptionLabels: ["A"],
    });
  }
  // 20 Wrong (0.250 penalty each)
  for (let i = 71; i <= 90; i++) {
    questions.push({
      occurrenceId: `occ-${i}`,
      sequenceNumber: i,
      questionType: "SINGLE_CHOICE",
      paperMarksPerCorrect: 1.0,
      paperNegativeMarksPerWrong: 0.25,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["A"],
      correctSourceOptionIds: [`opt-${i}-a`],
      selectedSourceOptionIds: [`opt-${i}-b`],
      displayOptionLabels: ["B"],
    });
  }
  // 10 Unanswered
  for (let i = 91; i <= 100; i++) {
    questions.push({
      occurrenceId: `occ-${i}`,
      sequenceNumber: i,
      questionType: "SINGLE_CHOICE",
      paperMarksPerCorrect: 1.0,
      paperNegativeMarksPerWrong: 0.25,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["A"],
      correctSourceOptionIds: [`opt-${i}-a`],
      selectedSourceOptionIds: [],
      displayOptionLabels: [],
    });
  }

  const result = calculateAttemptScore(questions);

  assert.equal(result.totalQuestions, 100);
  assert.equal(result.totalCorrect, 70);
  assert.equal(result.totalWrong, 20);
  assert.equal(result.totalUnanswered, 10);
  // 70 * 1.0 - 20 * 0.25 = 70.0 - 5.0 = 65.0
  assert.equal(result.rawScore, 65.0);
  assert.equal(result.evaluatedDenominator, 100.0);
});

test("Scoring Engine: Strict hierarchical precedence (Occurrence > Section > Baseline)", () => {
  const questions = [
    // Baseline only
    {
      occurrenceId: "occ-1",
      sequenceNumber: 1,
      questionType: "SINGLE_CHOICE",
      paperMarksPerCorrect: 1.0,
      paperNegativeMarksPerWrong: 0.25,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["A"],
      correctSourceOptionIds: ["opt-1-a"],
      selectedSourceOptionIds: ["opt-1-a"],
      displayOptionLabels: ["A"],
    },
    // Section override
    {
      occurrenceId: "occ-2",
      sequenceNumber: 2,
      questionType: "SINGLE_CHOICE",
      paperMarksPerCorrect: 1.0,
      paperNegativeMarksPerWrong: 0.25,
      sectionMarksOverride: 2.0,
      sectionNegativeMarksOverride: 0.5,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["B"],
      correctSourceOptionIds: ["opt-2-b"],
      selectedSourceOptionIds: ["opt-2-b"],
      displayOptionLabels: ["B"],
    },
    // Occurrence override (trumps section and paper)
    {
      occurrenceId: "occ-3",
      sequenceNumber: 3,
      questionType: "SINGLE_CHOICE",
      paperMarksPerCorrect: 1.0,
      paperNegativeMarksPerWrong: 0.25,
      sectionMarksOverride: 2.0,
      sectionNegativeMarksOverride: 0.5,
      occurrenceMarksOverride: 4.0,
      occurrenceNegativeMarksOverride: 1.0,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["C"],
      correctSourceOptionIds: ["opt-3-c"],
      selectedSourceOptionIds: ["opt-3-d"], // wrong
      displayOptionLabels: ["D"],
    },
  ];

  const result = calculateAttemptScore(questions);
  assert.equal(result.totalCorrect, 2);
  assert.equal(result.totalWrong, 1);
  // Q1: +1.0, Q2: +2.0, Q3: -1.0 => Net = 2.0
  assert.equal(result.rawScore, 2.0);
  // Denominator: 1.0 + 2.0 + 4.0 = 7.0
  assert.equal(result.evaluatedDenominator, 7.0);
});

test("Scoring Engine: Withdrawn questions handling (DEC-03)", () => {
  const questions = [
    // Standard correct
    {
      occurrenceId: "occ-1",
      sequenceNumber: 1,
      questionType: "SINGLE_CHOICE",
      paperMarksPerCorrect: 1.0,
      paperNegativeMarksPerWrong: 0.25,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["A"],
      correctSourceOptionIds: ["opt-1-a"],
      selectedSourceOptionIds: ["opt-1-a"],
      displayOptionLabels: ["A"],
    },
    // Withdrawn: EXCLUDED_FROM_TOTAL
    {
      occurrenceId: "occ-2",
      sequenceNumber: 2,
      questionType: "SINGLE_CHOICE",
      paperMarksPerCorrect: 1.0,
      paperNegativeMarksPerWrong: 0.25,
      keyStatus: "WITHDRAWN",
      withdrawalPolicy: "EXCLUDED_FROM_TOTAL",
      correctOptionLabels: [],
      correctSourceOptionIds: [],
      selectedSourceOptionIds: ["opt-2-b"],
      displayOptionLabels: ["B"],
    },
    // Withdrawn: FULL_MARKS_AWARDED
    {
      occurrenceId: "occ-3",
      sequenceNumber: 3,
      questionType: "SINGLE_CHOICE",
      paperMarksPerCorrect: 1.0,
      paperNegativeMarksPerWrong: 0.25,
      keyStatus: "WITHDRAWN",
      withdrawalPolicy: "FULL_MARKS_AWARDED",
      correctOptionLabels: [],
      correctSourceOptionIds: [],
      selectedSourceOptionIds: [], // candidate skipped
      displayOptionLabels: [],
    },
  ];

  const result = calculateAttemptScore(questions);
  assert.equal(result.totalWithdrawnExcluded, 1);
  assert.equal(result.totalWithdrawnAwarded, 1);
  // Q1: +1.0, Q2: 0.0, Q3: +1.0 => Net = 2.0
  assert.equal(result.rawScore, 2.0);
  // Denominator: Q1 (1.0) + Q2 (0.0) + Q3 (1.0) = 2.0
  assert.equal(result.evaluatedDenominator, 2.0);
});

test("Scoring Engine: Negative score preservation (DEC-02)", () => {
  const questions = [
    // 0 correct, 10 wrong (0.25 penalty each)
    ...Array.from({ length: 10 }, (_, i) => ({
      occurrenceId: `occ-${i}`,
      sequenceNumber: i + 1,
      questionType: "SINGLE_CHOICE",
      paperMarksPerCorrect: 1.0,
      paperNegativeMarksPerWrong: 0.25,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["A"],
      correctSourceOptionIds: [`opt-${i}-a`],
      selectedSourceOptionIds: [`opt-${i}-b`],
      displayOptionLabels: ["B"],
    })),
  ];

  const result = calculateAttemptScore(questions);
  assert.equal(result.totalCorrect, 0);
  assert.equal(result.totalWrong, 10);
  // 10 * -0.25 = -2.5 (true negative score preserved)
  assert.equal(result.rawScore, -2.5);
  assert.equal(result.evaluatedDenominator, 10.0);
});

test("Scoring Engine: SINGLE_CORRECT and ASSERTION_REASON scoring evaluation", () => {
  const questions = [
    {
      occurrenceId: "occ-sc-1",
      sequenceNumber: 1,
      questionType: "SINGLE_CORRECT",
      paperMarksPerCorrect: 2.0,
      paperNegativeMarksPerWrong: 0.5,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["B"],
      correctSourceOptionIds: ["opt-b"],
      selectedSourceOptionIds: ["opt-b"],
      displayOptionLabels: ["B"],
    },
    {
      occurrenceId: "occ-ar-2",
      sequenceNumber: 2,
      questionType: "ASSERTION_REASON",
      paperMarksPerCorrect: 2.0,
      paperNegativeMarksPerWrong: 0.5,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["A"],
      correctSourceOptionIds: ["opt-a"],
      selectedSourceOptionIds: ["opt-c"], // Wrong choice
      displayOptionLabels: ["C"],
    },
  ];

  const result = calculateAttemptScore(questions);
  assert.equal(result.totalQuestions, 2);
  assert.equal(result.totalCorrect, 1);
  assert.equal(result.totalWrong, 1);
  // Q1: +2.0, Q2: -0.5 => Net: 1.5
  assert.equal(result.rawScore, 1.5);
  assert.equal(result.evaluatedDenominator, 4.0);
});

test("Scoring Engine: MULTIPLE_CORRECT scoring evaluation", () => {
  const questions = [
    // Full match: correct answers B and D
    {
      occurrenceId: "occ-mc-1",
      sequenceNumber: 1,
      questionType: "MULTIPLE_CORRECT",
      paperMarksPerCorrect: 3.0,
      paperNegativeMarksPerWrong: 1.0,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["B", "D"],
      correctSourceOptionIds: ["opt-b", "opt-d"],
      selectedSourceOptionIds: ["opt-b", "opt-d"],
      displayOptionLabels: ["B", "D"],
    },
    // Partial match: only B selected (must be scored INCORRECT)
    {
      occurrenceId: "occ-mc-2",
      sequenceNumber: 2,
      questionType: "MULTIPLE_CORRECT",
      paperMarksPerCorrect: 3.0,
      paperNegativeMarksPerWrong: 1.0,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["B", "D"],
      correctSourceOptionIds: ["opt-b", "opt-d"],
      selectedSourceOptionIds: ["opt-b"],
      displayOptionLabels: ["B"],
    },
    // Incorrect option included: B, D, and C
    {
      occurrenceId: "occ-mc-3",
      sequenceNumber: 3,
      questionType: "MULTIPLE_CORRECT",
      paperMarksPerCorrect: 3.0,
      paperNegativeMarksPerWrong: 1.0,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["B", "D"],
      correctSourceOptionIds: ["opt-b", "opt-d"],
      selectedSourceOptionIds: ["opt-b", "opt-c", "opt-d"],
      displayOptionLabels: ["B", "C", "D"],
    },
  ];

  const result = calculateAttemptScore(questions);
  assert.equal(result.totalQuestions, 3);
  assert.equal(result.totalCorrect, 1);
  assert.equal(result.totalWrong, 2);
  // Q1: +3.0, Q2: -1.0, Q3: -1.0 => Net: 1.0
  assert.equal(result.rawScore, 1.0);
  assert.equal(result.evaluatedDenominator, 9.0);
});

test("Scoring Engine: Strict All-or-Nothing Multiple-Correct Matrix ({B, D})", () => {
  const baseQuestion = {
    paperMarksPerCorrect: 4.0,
    paperNegativeMarksPerWrong: 1.0,
    keyStatus: "ACTIVE",
    correctOptionLabels: ["B", "D"],
    correctSourceOptionIds: ["opt-b", "opt-d"],
    selectedSourceOptionIds: [],
    displayOptionLabels: [],
  };

  // Case 1: Exact set {B, D} -> Full positive marks, 0 penalty
  const q1 = {
    ...baseQuestion,
    occurrenceId: "q1",
    sequenceNumber: 1,
    questionType: "MULTIPLE_CORRECT",
    selectedSourceOptionIds: ["opt-b", "opt-d"],
    displayOptionLabels: ["B", "D"],
  };
  const res1 = calculateAttemptScore([q1]);
  assert.equal(res1.totalCorrect, 1);
  assert.equal(res1.totalWrong, 0);
  assert.equal(res1.rawScore, 4.0);
  assert.equal(res1.questionBreakdowns[0].status, "CORRECT");
  assert.equal(res1.questionBreakdowns[0].marksEarned, 4.0);
  assert.equal(res1.questionBreakdowns[0].penaltyDeducted, 0);

  // Case 2: Partial selection {B} -> Incorrect, 0 positive marks, penalty deducted
  const q2 = {
    ...baseQuestion,
    occurrenceId: "q2",
    sequenceNumber: 2,
    questionType: "MULTIPLE_CORRECT",
    selectedSourceOptionIds: ["opt-b"],
    displayOptionLabels: ["B"],
  };
  const res2 = calculateAttemptScore([q2]);
  assert.equal(res2.totalCorrect, 0);
  assert.equal(res2.totalWrong, 1);
  assert.equal(res2.rawScore, -1.0);
  assert.equal(res2.questionBreakdowns[0].status, "INCORRECT");
  assert.equal(res2.questionBreakdowns[0].marksEarned, 0);
  assert.equal(res2.questionBreakdowns[0].penaltyDeducted, 1.0);

  // Case 3: Partial selection {D} -> Incorrect, 0 positive marks, penalty deducted
  const q3 = {
    ...baseQuestion,
    occurrenceId: "q3",
    sequenceNumber: 3,
    questionType: "MULTIPLE_CORRECT",
    selectedSourceOptionIds: ["opt-d"],
    displayOptionLabels: ["D"],
  };
  const res3 = calculateAttemptScore([q3]);
  assert.equal(res3.totalCorrect, 0);
  assert.equal(res3.totalWrong, 1);
  assert.equal(res3.rawScore, -1.0);
  assert.equal(res3.questionBreakdowns[0].status, "INCORRECT");

  // Case 4: Extra incorrect option {A, B, D} -> Incorrect, 0 positive marks, penalty deducted
  const q4 = {
    ...baseQuestion,
    occurrenceId: "q4",
    sequenceNumber: 4,
    questionType: "MULTIPLE_CORRECT",
    selectedSourceOptionIds: ["opt-a", "opt-b", "opt-d"],
    displayOptionLabels: ["A", "B", "D"],
  };
  const res4 = calculateAttemptScore([q4]);
  assert.equal(res4.totalCorrect, 0);
  assert.equal(res4.totalWrong, 1);
  assert.equal(res4.rawScore, -1.0);
  assert.equal(res4.questionBreakdowns[0].status, "INCORRECT");

  // Case 5: Single incorrect option {A} -> Incorrect, 0 positive marks, penalty deducted
  const q5 = {
    ...baseQuestion,
    occurrenceId: "q5",
    sequenceNumber: 5,
    questionType: "MULTIPLE_CORRECT",
    selectedSourceOptionIds: ["opt-a"],
    displayOptionLabels: ["A"],
  };
  const res5 = calculateAttemptScore([q5]);
  assert.equal(res5.totalCorrect, 0);
  assert.equal(res5.totalWrong, 1);
  assert.equal(res5.rawScore, -1.0);
  assert.equal(res5.questionBreakdowns[0].status, "INCORRECT");

  // Case 6: Empty/unanswered -> UNANSWERED, 0 marks, 0 penalty
  const q6 = {
    ...baseQuestion,
    occurrenceId: "q6",
    sequenceNumber: 6,
    questionType: "MULTIPLE_CORRECT",
    selectedSourceOptionIds: [],
    displayOptionLabels: [],
  };
  const res6 = calculateAttemptScore([q6]);
  assert.equal(res6.totalUnanswered, 1);
  assert.equal(res6.totalWrong, 0);
  assert.equal(res6.rawScore, 0.0);
  assert.equal(res6.questionBreakdowns[0].status, "UNANSWERED");
  assert.equal(res6.questionBreakdowns[0].penaltyDeducted, 0);

  // Case 7: Deduplication {B, B, D, D} -> Correct exact match
  const q7 = {
    ...baseQuestion,
    occurrenceId: "q7",
    sequenceNumber: 7,
    questionType: "MULTIPLE_CORRECT",
    selectedSourceOptionIds: ["opt-b", "opt-b", "opt-d"],
    displayOptionLabels: ["B", "B", "D", "D"],
  };
  const res7 = calculateAttemptScore([q7]);
  assert.equal(res7.totalCorrect, 1);
  assert.equal(res7.rawScore, 4.0);

  // Case 8: Zero penalty configuration (penalty = 0.0) -> Incorrect receives 0, not negative
  const q8 = {
    ...baseQuestion,
    occurrenceId: "q8",
    sequenceNumber: 8,
    paperNegativeMarksPerWrong: 0.0,
    questionType: "MULTIPLE_CORRECT",
    selectedSourceOptionIds: ["opt-b"], // partial
    displayOptionLabels: ["B"],
  };
  const res8 = calculateAttemptScore([q8]);
  assert.equal(res8.totalWrong, 1);
  assert.equal(res8.rawScore, 0.0);
  assert.equal(res8.questionBreakdowns[0].penaltyDeducted, 0);

  // Case 9: Comprehension child with multiple correct answers
  const q9 = {
    ...baseQuestion,
    occurrenceId: "q9",
    sequenceNumber: 9,
    questionType: "COMPREHENSION_CHILD",
    selectedSourceOptionIds: ["opt-b", "opt-d"],
    displayOptionLabels: ["B", "D"],
  };
  const res9 = calculateAttemptScore([q9]);
  assert.equal(res9.totalCorrect, 1);
  assert.equal(res9.rawScore, 4.0);
});

