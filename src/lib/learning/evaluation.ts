// ============================================================================
// MCQ Junction — Interactive Question Evaluation Engine (Learning Mode)
// File: src/lib/learning/evaluation.ts
// ============================================================================

export type EvaluatedQuestionType =
  | "SINGLE_CORRECT"
  | "MULTIPLE_CORRECT"
  | "ASSERTION_REASON"
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "COMPREHENSION_CHILD";

export type OptionVisualState =
  | "DEFAULT"              // Unselected, neutral (selection phase)
  | "SELECTED_PENDING"     // Selected by learner, neutral blue/indigo (selection phase, multiple-correct)
  | "CORRECT_SELECTED"     // Correct option selected by learner -> Green + Checkmark + "Correct"
  | "CORRECT_UNSELECTED"   // Correct option missed by learner -> Green + Checkmark + "Correct"
  | "INCORRECT_SELECTED"   // Incorrect option chosen by learner -> Red + Cross + "Incorrect"
  | "INCORRECT_UNSELECTED";// Incorrect option not chosen by learner -> Neutral/Default (never falsely marked)

export interface OptionEvaluationMeta {
  id: string;
  optionLabel: string;
  optionText: string;
  isCorrect: boolean;
  explanationText?: string | null;
  conceptId?: string | null;
}

export interface QuestionEvaluationState {
  questionType: EvaluatedQuestionType;
  selectedOptionIds: string[];
  isFeedbackTriggered: boolean;
  isFinalized: boolean;
  isOverallCorrect: boolean | null;
  overallStatusText: string;
  optionStates: Record<string, OptionVisualState>;
  explanationRevealed: boolean;
}

/**
 * Normalizes question type into canonical form.
 */
export function normalizeQuestionType(
  rawType: string | undefined | null,
  options?: OptionEvaluationMeta[]
): "SINGLE_CORRECT" | "MULTIPLE_CORRECT" | "ASSERTION_REASON" {
  if (!rawType) return "SINGLE_CORRECT";
  const upper = rawType.toUpperCase().trim();
  if (upper === "MULTIPLE_CORRECT" || upper === "MULTIPLE_CHOICE") {
    return "MULTIPLE_CORRECT";
  }
  if (upper === "ASSERTION_REASON") {
    return "ASSERTION_REASON";
  }
  if (upper === "COMPREHENSION_CHILD") {
    if (options && options.filter((o) => o.isCorrect).length > 1) {
      return "MULTIPLE_CORRECT";
    }
    return "SINGLE_CORRECT";
  }
  return "SINGLE_CORRECT";
}

/**
 * Creates the initial evaluation state for a question.
 */
export function getInitialEvaluationState(
  questionType: EvaluatedQuestionType,
  options: OptionEvaluationMeta[],
  initialSelectedOptionIds: string[] = []
): QuestionEvaluationState {
  if (initialSelectedOptionIds.length === 0) {
    const optionStates: Record<string, OptionVisualState> = {};
    for (const opt of options) {
      optionStates[opt.id] = "DEFAULT";
    }

    return {
      questionType,
      selectedOptionIds: [],
      isFeedbackTriggered: false,
      isFinalized: false,
      isOverallCorrect: null,
      overallStatusText: "",
      optionStates,
      explanationRevealed: false,
    };
  }

  // If initial selections are provided (e.g. restoring state or already evaluated attempt)
  return evaluateSelectionTransition(
    questionType,
    options,
    initialSelectedOptionIds,
    false // was not already finalized
  );
}

/**
 * Pure transition function that evaluates learner interaction on clicking an option.
 *
 * Immutability Guarantee:
 * Once finalized (feedback triggered), further clicks are strictly no-op unless reset.
 */
export function handleOptionClick(
  currentState: QuestionEvaluationState,
  options: OptionEvaluationMeta[],
  clickedOptionId: string
): QuestionEvaluationState {
  // Guard 1: Immutability. Once finalized, attempt cannot be corrupted by subsequent clicks.
  if (currentState.isFinalized || currentState.isFeedbackTriggered) {
    return currentState;
  }

  const normType = normalizeQuestionType(currentState.questionType, options);

  // --------------------------------------------------------------------------
  // Case A: SINGLE_CORRECT and ASSERTION_REASON
  // Selecting any option immediately triggers feedback and finalizes the question.
  // --------------------------------------------------------------------------
  if (normType === "SINGLE_CORRECT" || normType === "ASSERTION_REASON") {
    return evaluateSingleChoice(currentState.questionType, options, clickedOptionId);
  }

  // --------------------------------------------------------------------------
  // Case B: MULTIPLE_CORRECT
  // Supports toggle (select/deselect). Evaluates trigger rules:
  // 1. Exact set match -> Trigger feedback immediately as CORRECT.
  // 2. Any incorrect option selected -> Trigger feedback immediately as INCORRECT.
  // 3. Proper subset of correct options -> Selection phase continues (no feedback yet).
  // --------------------------------------------------------------------------
  const currentlySelected = new Set(currentState.selectedOptionIds);
  const clickedOpt = options.find((o) => o.id === clickedOptionId);

  if (!clickedOpt) {
    return currentState;
  }

  // If already selected, deselect it
  if (currentlySelected.has(clickedOptionId)) {
    currentlySelected.delete(clickedOptionId);
    return evaluateSelectionTransition(
      currentState.questionType,
      options,
      Array.from(currentlySelected),
      false
    );
  }

  // If not selected, add it to selected set
  currentlySelected.add(clickedOptionId);
  return evaluateSelectionTransition(
    currentState.questionType,
    options,
    Array.from(currentlySelected),
    false
  );
}

/**
 * Evaluates a single-choice or assertion-reason selection.
 */
function evaluateSingleChoice(
  questionType: EvaluatedQuestionType,
  options: OptionEvaluationMeta[],
  selectedId: string
): QuestionEvaluationState {
  const selectedOpt = options.find((o) => o.id === selectedId);
  const isCorrect = Boolean(selectedOpt?.isCorrect);

  const optionStates: Record<string, OptionVisualState> = {};
  for (const opt of options) {
    if (opt.id === selectedId) {
      optionStates[opt.id] = isCorrect ? "CORRECT_SELECTED" : "INCORRECT_SELECTED";
    } else if (opt.isCorrect) {
      // Reveal the correct option in green if learner selected wrong
      optionStates[opt.id] = isCorrect ? "DEFAULT" : "CORRECT_UNSELECTED";
    } else {
      // Unselected incorrect options remain neutral
      optionStates[opt.id] = "INCORRECT_UNSELECTED";
    }
  }

  return {
    questionType,
    selectedOptionIds: [selectedId],
    isFeedbackTriggered: true,
    isFinalized: true,
    isOverallCorrect: isCorrect,
    overallStatusText: isCorrect
      ? "Correct! You selected the right answer."
      : "Incorrect. The correct answer has been highlighted in green.",
    optionStates,
    explanationRevealed: true,
  };
}

/**
 * Core evaluation transition for MULTIPLE_CORRECT.
 *
 * Rules:
 * Trigger condition 1: Learner selected every correct option (exact set match).
 * Trigger condition 2: Learner selected ANY incorrect option.
 * If neither is met, selection remains editable and unrevealed.
 */
export function evaluateSelectionTransition(
  questionType: EvaluatedQuestionType,
  options: OptionEvaluationMeta[],
  newSelectedIds: string[],
  wasAlreadyFinalized = false
): QuestionEvaluationState {
  const normType = normalizeQuestionType(questionType, options);

  if (normType !== "MULTIPLE_CORRECT") {
    if (newSelectedIds.length > 0) {
      return evaluateSingleChoice(questionType, options, newSelectedIds[0]);
    }
    return getInitialEvaluationState(questionType, options, []);
  }

  if (wasAlreadyFinalized) {
    // Return existing finalized state
    const optionStates: Record<string, OptionVisualState> = {};
    const selectedSet = new Set(newSelectedIds);
    const correctOptions = options.filter((o) => o.isCorrect);
    const isOverallCorrect =
      selectedSet.size === correctOptions.length &&
      correctOptions.every((o) => selectedSet.has(o.id));

    for (const opt of options) {
      if (opt.isCorrect) {
        optionStates[opt.id] = selectedSet.has(opt.id) ? "CORRECT_SELECTED" : "CORRECT_UNSELECTED";
      } else {
        optionStates[opt.id] = selectedSet.has(opt.id) ? "INCORRECT_SELECTED" : "INCORRECT_UNSELECTED";
      }
    }

    return {
      questionType,
      selectedOptionIds: newSelectedIds,
      isFeedbackTriggered: true,
      isFinalized: true,
      isOverallCorrect,
      overallStatusText: isOverallCorrect ? "Correct!" : "Incorrect.",
      optionStates,
      explanationRevealed: true,
    };
  }

  const selectedSet = new Set(newSelectedIds);
  const correctOptions = options.filter((o) => o.isCorrect);
  const correctOptionIds = new Set(correctOptions.map((o) => o.id));

  // If no options are selected, selection phase continues
  if (selectedSet.size === 0) {
    const optionStates: Record<string, OptionVisualState> = {};
    for (const opt of options) {
      optionStates[opt.id] = "DEFAULT";
    }
    return {
      questionType,
      selectedOptionIds: [],
      isFeedbackTriggered: false,
      isFinalized: false,
      isOverallCorrect: null,
      overallStatusText: "",
      optionStates,
      explanationRevealed: false,
    };
  }

  // Check Condition 2: Did the learner select ANY incorrect option?
  const hasSelectedIncorrect = Array.from(selectedSet).some((id) => !correctOptionIds.has(id));

  // Check Condition 1: Has the learner selected EVERY correct option?
  const hasSelectedAllCorrect =
    correctOptions.length > 0 &&
    correctOptions.every((o) => selectedSet.has(o.id));

  const isExactSetMatch = hasSelectedAllCorrect && selectedSet.size === correctOptions.length;

  // --------------------------------------------------------------------------
  // Trigger Feedback Condition 2: ANY incorrect option selected
  // Immediate failure feedback!
  // --------------------------------------------------------------------------
  if (hasSelectedIncorrect) {
    const optionStates: Record<string, OptionVisualState> = {};

    for (const opt of options) {
      if (opt.isCorrect) {
        // Every correct option marked GREEN (whether selected or unselected)
        optionStates[opt.id] = selectedSet.has(opt.id) ? "CORRECT_SELECTED" : "CORRECT_UNSELECTED";
      } else {
        // Selected incorrect option marked RED
        // Unselected incorrect option marked NEUTRAL (not falsely marked)
        optionStates[opt.id] = selectedSet.has(opt.id) ? "INCORRECT_SELECTED" : "INCORRECT_UNSELECTED";
      }
    }

    return {
      questionType,
      selectedOptionIds: newSelectedIds,
      isFeedbackTriggered: true,
      isFinalized: true,
      isOverallCorrect: false,
      overallStatusText:
        "Incorrect. You selected an incorrect option. All correct options are highlighted in green.",
      optionStates,
      explanationRevealed: true,
    };
  }

  // --------------------------------------------------------------------------
  // Trigger Feedback Condition 1: EXACT MATCH (Every correct option selected, zero wrong)
  // Success feedback!
  // --------------------------------------------------------------------------
  if (isExactSetMatch) {
    const optionStates: Record<string, OptionVisualState> = {};

    for (const opt of options) {
      if (opt.isCorrect) {
        // All correct options marked GREEN
        optionStates[opt.id] = "CORRECT_SELECTED";
      } else {
        // Unselected incorrect options remain NEUTRAL
        optionStates[opt.id] = "INCORRECT_UNSELECTED";
      }
    }

    return {
      questionType,
      selectedOptionIds: newSelectedIds,
      isFeedbackTriggered: true,
      isFinalized: true,
      isOverallCorrect: true,
      overallStatusText:
        "Correct! You have successfully identified all correct options.",
      optionStates,
      explanationRevealed: true,
    };
  }

  // --------------------------------------------------------------------------
  // Selection Phase (Subset of correct options selected so far, no incorrect option)
  // DO NOT reveal correctness or trigger feedback yet!
  // --------------------------------------------------------------------------
  const optionStates: Record<string, OptionVisualState> = {};
  for (const opt of options) {
    if (selectedSet.has(opt.id)) {
      optionStates[opt.id] = "SELECTED_PENDING"; // Neutral selection highlight
    } else {
      optionStates[opt.id] = "DEFAULT";
    }
  }

  return {
    questionType,
    selectedOptionIds: newSelectedIds,
    isFeedbackTriggered: false,
    isFinalized: false,
    isOverallCorrect: null,
    overallStatusText: "",
    optionStates,
    explanationRevealed: false,
  };
}

/**
 * Resets a question attempt, returning it to fresh editable state.
 */
export function resetQuestionAttempt(
  questionType: EvaluatedQuestionType,
  options: OptionEvaluationMeta[]
): QuestionEvaluationState {
  return getInitialEvaluationState(questionType, options, []);
}
