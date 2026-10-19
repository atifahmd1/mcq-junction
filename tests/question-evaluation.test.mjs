// ============================================================================
// MCQ Junction — Question Evaluation Engine Verification Test Suite (Phase 8)
// File: tests/question-evaluation.test.mjs
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import {
  handleOptionClick,
  getInitialEvaluationState,
  resetQuestionAttempt,
  normalizeQuestionType,
  evaluateSelectionTransition,
} from "../src/lib/learning/evaluation.ts";

// Standard Test Options: A (wrong), B (correct), C (wrong), D (correct)
const standardFourOptions = [
  { id: "opt-a", optionLabel: "A", optionText: "Option A text", isCorrect: false, explanationText: "Exp A" },
  { id: "opt-b", optionLabel: "B", optionText: "Option B text", isCorrect: true, explanationText: "Exp B" },
  { id: "opt-c", optionLabel: "C", optionText: "Option C text", isCorrect: false, explanationText: "Exp C" },
  { id: "opt-d", optionLabel: "D", optionText: "Option D text", isCorrect: true, explanationText: "Exp D" },
];

// Single-choice test options: A (wrong), B (correct), C (wrong), D (wrong)
const singleCorrectOptions = [
  { id: "sc-a", optionLabel: "A", optionText: "SC Option A", isCorrect: false },
  { id: "sc-b", optionLabel: "B", optionText: "SC Option B", isCorrect: true },
  { id: "sc-c", optionLabel: "C", optionText: "SC Option C", isCorrect: false },
  { id: "sc-d", optionLabel: "D", optionText: "SC Option D", isCorrect: false },
];

// ============================================================================
// 1. Single-Correct Behavior Tests (Requirement 3)
// ============================================================================

test("EVAL-01: Single-correct selecting correct option immediately triggers feedback and marks green", () => {
  const initial = getInitialEvaluationState("SINGLE_CORRECT", singleCorrectOptions);
  assert.strictEqual(initial.isFeedbackTriggered, false);
  assert.strictEqual(initial.isFinalized, false);

  // Click Option B (correct)
  const evaluated = handleOptionClick(initial, singleCorrectOptions, "sc-b");

  assert.strictEqual(evaluated.isFeedbackTriggered, true);
  assert.strictEqual(evaluated.isFinalized, true);
  assert.strictEqual(evaluated.isOverallCorrect, true);
  assert.strictEqual(evaluated.optionStates["sc-b"], "CORRECT_SELECTED");
  assert.strictEqual(evaluated.optionStates["sc-a"], "INCORRECT_UNSELECTED");
  assert.strictEqual(evaluated.optionStates["sc-c"], "INCORRECT_UNSELECTED");
  assert.strictEqual(evaluated.optionStates["sc-d"], "INCORRECT_UNSELECTED");
  assert.strictEqual(evaluated.explanationRevealed, true);
});

test("EVAL-02: Single-correct selecting wrong option marks selected red and reveals correct in green", () => {
  const initial = getInitialEvaluationState("SINGLE_CORRECT", singleCorrectOptions);

  // Click Option A (wrong)
  const evaluated = handleOptionClick(initial, singleCorrectOptions, "sc-a");

  assert.strictEqual(evaluated.isFeedbackTriggered, true);
  assert.strictEqual(evaluated.isFinalized, true);
  assert.strictEqual(evaluated.isOverallCorrect, false);
  assert.strictEqual(evaluated.optionStates["sc-a"], "INCORRECT_SELECTED"); // Selected wrong -> RED
  assert.strictEqual(evaluated.optionStates["sc-b"], "CORRECT_UNSELECTED"); // Correct answer -> GREEN
  assert.strictEqual(evaluated.optionStates["sc-c"], "INCORRECT_UNSELECTED"); // Unselected wrong -> NEUTRAL
  assert.strictEqual(evaluated.optionStates["sc-d"], "INCORRECT_UNSELECTED"); // Unselected wrong -> NEUTRAL
  assert.strictEqual(evaluated.explanationRevealed, true);
});

test("EVAL-03: Single-correct repeated clicks cannot alter finalized state (Immutability)", () => {
  const initial = getInitialEvaluationState("SINGLE_CORRECT", singleCorrectOptions);
  const evaluated = handleOptionClick(initial, singleCorrectOptions, "sc-a");

  // Subsequent click on correct option B or option C must be ignored
  const secondClick = handleOptionClick(evaluated, singleCorrectOptions, "sc-b");
  assert.strictEqual(secondClick.isOverallCorrect, false);
  assert.deepStrictEqual(secondClick.selectedOptionIds, ["sc-a"]);
  assert.strictEqual(secondClick.optionStates["sc-a"], "INCORRECT_SELECTED");
  assert.strictEqual(secondClick.optionStates["sc-b"], "CORRECT_UNSELECTED");
});

// ============================================================================
// 2. Multiple-Correct Specification Examples Matrix (Requirement 4)
// Target correct answer set: { B, D }
// ============================================================================

test("EVAL-04: Multiple-correct: Select B only -> No feedback yet, selection remains editable", () => {
  const initial = getInitialEvaluationState("MULTIPLE_CORRECT", standardFourOptions);

  // Learner selects B
  const s1 = handleOptionClick(initial, standardFourOptions, "opt-b");

  assert.strictEqual(s1.isFeedbackTriggered, false, "Feedback must NOT trigger on partial correct subset");
  assert.strictEqual(s1.isFinalized, false, "Must remain editable");
  assert.strictEqual(s1.isOverallCorrect, null, "Correctness must not be determined yet");
  assert.deepStrictEqual(s1.selectedOptionIds, ["opt-b"]);
  assert.strictEqual(s1.optionStates["opt-b"], "SELECTED_PENDING");
  assert.strictEqual(s1.optionStates["opt-a"], "DEFAULT");
  assert.strictEqual(s1.optionStates["opt-c"], "DEFAULT");
  assert.strictEqual(s1.optionStates["opt-d"], "DEFAULT");
  assert.strictEqual(s1.explanationRevealed, false, "Explanations must NOT be revealed during selection phase");
});

test("EVAL-05: Multiple-correct: Select B then D -> Exact set matches; triggers correct feedback, B and D green", () => {
  const initial = getInitialEvaluationState("MULTIPLE_CORRECT", standardFourOptions);

  // Step 1: Select B
  const s1 = handleOptionClick(initial, standardFourOptions, "opt-b");
  assert.strictEqual(s1.isFeedbackTriggered, false);

  // Step 2: Select D
  const s2 = handleOptionClick(s1, standardFourOptions, "opt-d");

  assert.strictEqual(s2.isFeedbackTriggered, true, "Feedback must trigger when exact correct set matches");
  assert.strictEqual(s2.isFinalized, true);
  assert.strictEqual(s2.isOverallCorrect, true, "Overall status must be CORRECT");
  assert.deepStrictEqual(s2.selectedOptionIds, ["opt-b", "opt-d"]);
  assert.strictEqual(s2.optionStates["opt-b"], "CORRECT_SELECTED"); // Green
  assert.strictEqual(s2.optionStates["opt-d"], "CORRECT_SELECTED"); // Green
  assert.strictEqual(s2.optionStates["opt-a"], "INCORRECT_UNSELECTED"); // Neutral
  assert.strictEqual(s2.optionStates["opt-c"], "INCORRECT_UNSELECTED"); // Neutral
  assert.strictEqual(s2.explanationRevealed, true);
});

test("EVAL-06: Multiple-correct: Select A first -> Immediate incorrect feedback; A red, B and D green", () => {
  const initial = getInitialEvaluationState("MULTIPLE_CORRECT", standardFourOptions);

  // Select A (incorrect option)
  const s1 = handleOptionClick(initial, standardFourOptions, "opt-a");

  assert.strictEqual(s1.isFeedbackTriggered, true, "Feedback must trigger immediately upon selecting any wrong option");
  assert.strictEqual(s1.isFinalized, true);
  assert.strictEqual(s1.isOverallCorrect, false, "Overall status must be INCORRECT");
  assert.strictEqual(s1.optionStates["opt-a"], "INCORRECT_SELECTED", "Selected wrong option A must be RED");
  assert.strictEqual(s1.optionStates["opt-b"], "CORRECT_UNSELECTED", "Correct option B must be GREEN");
  assert.strictEqual(s1.optionStates["opt-d"], "CORRECT_UNSELECTED", "Correct option D must be GREEN");
  assert.strictEqual(s1.optionStates["opt-c"], "INCORRECT_UNSELECTED", "Unselected wrong option C must remain NEUTRAL");
  assert.strictEqual(s1.explanationRevealed, true);
});

test("EVAL-07: Multiple-correct: Select B then A -> Immediate incorrect feedback; A red, B and D green", () => {
  const initial = getInitialEvaluationState("MULTIPLE_CORRECT", standardFourOptions);

  // Step 1: Select B (correct)
  const s1 = handleOptionClick(initial, standardFourOptions, "opt-b");
  assert.strictEqual(s1.isFeedbackTriggered, false);

  // Step 2: Select A (incorrect)
  const s2 = handleOptionClick(s1, standardFourOptions, "opt-a");

  assert.strictEqual(s2.isFeedbackTriggered, true, "Selecting wrong option after correct option must trigger failure immediately");
  assert.strictEqual(s2.isFinalized, true);
  assert.strictEqual(s2.isOverallCorrect, false);
  assert.strictEqual(s2.optionStates["opt-b"], "CORRECT_SELECTED", "Selected correct option B must be GREEN");
  assert.strictEqual(s2.optionStates["opt-a"], "INCORRECT_SELECTED", "Selected incorrect option A must be RED");
  assert.strictEqual(s2.optionStates["opt-d"], "CORRECT_UNSELECTED", "Unselected correct option D must be GREEN");
  assert.strictEqual(s2.optionStates["opt-c"], "INCORRECT_UNSELECTED", "Unselected incorrect option C must remain NEUTRAL");
});

test("EVAL-08: Multiple-correct: Select B then C -> Immediate incorrect feedback; C red, B and D green", () => {
  const initial = getInitialEvaluationState("MULTIPLE_CORRECT", standardFourOptions);

  // Step 1: Select B
  const s1 = handleOptionClick(initial, standardFourOptions, "opt-b");
  assert.strictEqual(s1.isFeedbackTriggered, false);

  // Step 2: Select C (incorrect)
  const s2 = handleOptionClick(s1, standardFourOptions, "opt-c");

  assert.strictEqual(s2.isFeedbackTriggered, true);
  assert.strictEqual(s2.isFinalized, true);
  assert.strictEqual(s2.isOverallCorrect, false);
  assert.strictEqual(s2.optionStates["opt-c"], "INCORRECT_SELECTED", "Selected incorrect C must be RED");
  assert.strictEqual(s2.optionStates["opt-b"], "CORRECT_SELECTED", "Selected correct B must be GREEN");
  assert.strictEqual(s2.optionStates["opt-d"], "CORRECT_UNSELECTED", "Unselected correct D must be GREEN");
  assert.strictEqual(s2.optionStates["opt-a"], "INCORRECT_UNSELECTED", "Unselected incorrect A must remain NEUTRAL");
});

test("EVAL-09: Multiple-correct: Select B then deselect B before any incorrect selection -> No feedback, remains editable", () => {
  const initial = getInitialEvaluationState("MULTIPLE_CORRECT", standardFourOptions);

  // Step 1: Select B
  const s1 = handleOptionClick(initial, standardFourOptions, "opt-b");
  assert.strictEqual(s1.selectedOptionIds.length, 1);
  assert.strictEqual(s1.isFeedbackTriggered, false);

  // Step 2: Deselect B
  const s2 = handleOptionClick(s1, standardFourOptions, "opt-b");
  assert.strictEqual(s2.selectedOptionIds.length, 0);
  assert.strictEqual(s2.isFeedbackTriggered, false);
  assert.strictEqual(s2.isFinalized, false);
  assert.strictEqual(s2.optionStates["opt-b"], "DEFAULT");

  // Step 3: Now select D
  const s3 = handleOptionClick(s2, standardFourOptions, "opt-d");
  assert.strictEqual(s3.isFeedbackTriggered, false, "Selecting only D is still a subset, no feedback yet");

  // Step 4: Now select B -> Exact set {B, D} completed!
  const s4 = handleOptionClick(s3, standardFourOptions, "opt-b");
  assert.strictEqual(s4.isFeedbackTriggered, true, "Exact set completed -> feedback triggered");
  assert.strictEqual(s4.isOverallCorrect, true);
});

test("EVAL-10: Multiple-correct: Select B, D, and additional click after finalization -> Ignored, remains correct", () => {
  const initial = getInitialEvaluationState("MULTIPLE_CORRECT", standardFourOptions);

  // Select B then D -> Finalized as correct
  const s1 = handleOptionClick(initial, standardFourOptions, "opt-b");
  const s2 = handleOptionClick(s1, standardFourOptions, "opt-d");
  assert.strictEqual(s2.isFinalized, true);
  assert.strictEqual(s2.isOverallCorrect, true);

  // Subsequent click on A must NOT alter finalized correct state
  const s3 = handleOptionClick(s2, standardFourOptions, "opt-a");
  assert.strictEqual(s3.isOverallCorrect, true, "Finalized correct attempt must remain immutable");
  assert.deepStrictEqual(s3.selectedOptionIds, ["opt-b", "opt-d"]);
  assert.strictEqual(s3.optionStates["opt-a"], "INCORRECT_UNSELECTED");
});

test("EVAL-11: Multiple-correct: Deliberate resetQuestionAttempt returns fresh editable state", () => {
  const initial = getInitialEvaluationState("MULTIPLE_CORRECT", standardFourOptions);
  const finalized = handleOptionClick(initial, standardFourOptions, "opt-a"); // failed attempt
  assert.strictEqual(finalized.isFinalized, true);

  const resetState = resetQuestionAttempt("MULTIPLE_CORRECT", standardFourOptions);
  assert.strictEqual(resetState.isFinalized, false);
  assert.strictEqual(resetState.isFeedbackTriggered, false);
  assert.strictEqual(resetState.selectedOptionIds.length, 0);
  assert.strictEqual(resetState.isOverallCorrect, null);
});

// ============================================================================
// 3. Assertion-Reason Behavior Tests (Requirement 5)
// ============================================================================

test("EVAL-12: Assertion-reason evaluates against explicitly stored answer key without inferring from text", () => {
  const arOptions = [
    { id: "ar-a", optionLabel: "A", optionText: "Both A and R are true and R explains A", isCorrect: true },
    { id: "ar-b", optionLabel: "B", optionText: "Both A and R are true but R does not explain A", isCorrect: false },
    { id: "ar-c", optionLabel: "C", optionText: "A is true but R is false", isCorrect: false },
    { id: "ar-d", optionLabel: "D", optionText: "A is false but R is true", isCorrect: false },
  ];

  const initial = getInitialEvaluationState("ASSERTION_REASON", arOptions);
  assert.strictEqual(initial.isFeedbackTriggered, false);

  // Selecting correct option A
  const evalCorrect = handleOptionClick(initial, arOptions, "ar-a");
  assert.strictEqual(evalCorrect.isFeedbackTriggered, true);
  assert.strictEqual(evalCorrect.isOverallCorrect, true);
  assert.strictEqual(evalCorrect.optionStates["ar-a"], "CORRECT_SELECTED");

  // Selecting wrong option B
  const evalWrong = handleOptionClick(initial, arOptions, "ar-b");
  assert.strictEqual(evalWrong.isFeedbackTriggered, true);
  assert.strictEqual(evalWrong.isOverallCorrect, false);
  assert.strictEqual(evalWrong.optionStates["ar-b"], "INCORRECT_SELECTED");
  assert.strictEqual(evalWrong.optionStates["ar-a"], "CORRECT_UNSELECTED"); // Reveals key A
});

// ============================================================================
// 4. Question Type Normalization & Backward Compatibility
// ============================================================================

test("EVAL-13: normalizeQuestionType correctly normalizes canonical and legacy aliases", () => {
  assert.strictEqual(normalizeQuestionType("SINGLE_CORRECT"), "SINGLE_CORRECT");
  assert.strictEqual(normalizeQuestionType("SINGLE_CHOICE"), "SINGLE_CORRECT");
  assert.strictEqual(normalizeQuestionType("MULTIPLE_CORRECT"), "MULTIPLE_CORRECT");
  assert.strictEqual(normalizeQuestionType("MULTIPLE_CHOICE"), "MULTIPLE_CORRECT");
  assert.strictEqual(normalizeQuestionType("ASSERTION_REASON"), "ASSERTION_REASON");
  assert.strictEqual(normalizeQuestionType(null), "SINGLE_CORRECT");
  assert.strictEqual(normalizeQuestionType(undefined), "SINGLE_CORRECT");
});
