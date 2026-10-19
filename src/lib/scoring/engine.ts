export type QuestionScoreInput = {
  occurrenceId: string;
  sequenceNumber: number;
  questionType:
    | "SINGLE_CORRECT"
    | "MULTIPLE_CORRECT"
    | "SINGLE_CHOICE"
    | "MULTIPLE_CHOICE"
    | "ASSERTION_REASON"
    | "COMPREHENSION_CHILD"
    | "NUMERICAL_DISCRETE";
  paperMarksPerCorrect: number;
  paperNegativeMarksPerWrong: number;
  sectionMarksOverride?: number | null;
  sectionNegativeMarksOverride?: number | null;
  occurrenceMarksOverride?: number | null;
  occurrenceNegativeMarksOverride?: number | null;
  // Official Key Target
  keyStatus: "PROVISIONAL" | "ACTIVE" | "CONTESTED" | "SUPERSEDED" | "WITHDRAWN";
  withdrawalPolicy?: "FULL_MARKS_AWARDED" | "EXCLUDED_FROM_TOTAL" | null;
  correctOptionLabels: string[];
  correctSourceOptionIds: string[];
  numericalTargetValue?: number | null;
  numericalTolerance?: number | null;
  // Candidate Response
  selectedSourceOptionIds: string[];
  displayOptionLabels: string[];
  numericalInput?: number | null;
};

export type QuestionScoreOutcome = {
  occurrenceId: string;
  sequenceNumber: number;
  status: "CORRECT" | "INCORRECT" | "UNANSWERED" | "WITHDRAWN_AWARDED" | "WITHDRAWN_EXCLUDED";
  marksEarned: number;
  penaltyDeducted: number;
  netScoreAwarded: number;
  denominatorContribution: number;
};

export type AttemptScoreSummary = {
  rawScore: number;
  evaluatedDenominator: number;
  totalQuestions: number;
  totalCorrect: number;
  totalWrong: number;
  totalUnanswered: number;
  totalWithdrawnAwarded: number;
  totalWithdrawnExcluded: number;
  questionBreakdowns: QuestionScoreOutcome[];
};

/**
 * Evaluates candidate responses against official answer keys using the strict
 * BPSC / MCQ Junction mathematical scoring hierarchy:
 * Occurrence Override > Section Override > Paper Baseline.
 */
export function calculateAttemptScore(
  inputs: QuestionScoreInput[]
): AttemptScoreSummary {
  let rawScore = 0;
  let evaluatedDenominator = 0;
  let totalCorrect = 0;
  let totalWrong = 0;
  let totalUnanswered = 0;
  let totalWithdrawnAwarded = 0;
  let totalWithdrawnExcluded = 0;

  const questionBreakdowns: QuestionScoreOutcome[] = [];

  for (const q of inputs) {
    // 1. Resolve Effective Marks and Penalty
    const effectiveMarks =
      q.occurrenceMarksOverride ??
      q.sectionMarksOverride ??
      q.paperMarksPerCorrect;

    const effectivePenalty = Math.abs(
      q.occurrenceNegativeMarksOverride ??
      q.sectionNegativeMarksOverride ??
      q.paperNegativeMarksPerWrong
    );

    // 2. Handle Withdrawn Questions
    if (q.keyStatus === "WITHDRAWN") {
      const policy = q.withdrawalPolicy ?? "EXCLUDED_FROM_TOTAL";

      if (policy === "FULL_MARKS_AWARDED") {
        totalWithdrawnAwarded++;
        rawScore += effectiveMarks;
        evaluatedDenominator += effectiveMarks;
        questionBreakdowns.push({
          occurrenceId: q.occurrenceId,
          sequenceNumber: q.sequenceNumber,
          status: "WITHDRAWN_AWARDED",
          marksEarned: effectiveMarks,
          penaltyDeducted: 0,
          netScoreAwarded: effectiveMarks,
          denominatorContribution: effectiveMarks,
        });
      } else {
        // EXCLUDED_FROM_TOTAL: 0 score delta, 0 denominator delta
        totalWithdrawnExcluded++;
        questionBreakdowns.push({
          occurrenceId: q.occurrenceId,
          sequenceNumber: q.sequenceNumber,
          status: "WITHDRAWN_EXCLUDED",
          marksEarned: 0,
          penaltyDeducted: 0,
          netScoreAwarded: 0,
          denominatorContribution: 0,
        });
      }
      continue;
    }

    // 3. Evaluate Unanswered Questions
    const normSelectedIds = (q.selectedSourceOptionIds || [])
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter((id) => id.length > 0);
    const normDisplayLabels = (q.displayOptionLabels || [])
      .map((lbl) => (typeof lbl === "string" ? lbl.trim().toUpperCase() : ""))
      .filter((lbl) => lbl.length > 0);

    const hasAnsweredMcq = normSelectedIds.length > 0 || normDisplayLabels.length > 0;
    const hasAnsweredNum =
      q.numericalInput !== null &&
      q.numericalInput !== undefined &&
      !Number.isNaN(q.numericalInput);

    if (!hasAnsweredMcq && !hasAnsweredNum) {
      totalUnanswered++;
      evaluatedDenominator += effectiveMarks;
      questionBreakdowns.push({
        occurrenceId: q.occurrenceId,
        sequenceNumber: q.sequenceNumber,
        status: "UNANSWERED",
        marksEarned: 0,
        penaltyDeducted: 0,
        netScoreAwarded: 0,
        denominatorContribution: effectiveMarks,
      });
      continue;
    }

    // 4. Evaluate Numerical Questions
    if (q.questionType === "NUMERICAL_DISCRETE") {
      evaluatedDenominator += effectiveMarks;
      const target = q.numericalTargetValue ?? 0;
      const tol = q.numericalTolerance ?? 0;
      const candidateVal = q.numericalInput ?? NaN;
      const isCorrect = Math.abs(candidateVal - target) <= tol;

      if (isCorrect) {
        totalCorrect++;
        rawScore += effectiveMarks;
        questionBreakdowns.push({
          occurrenceId: q.occurrenceId,
          sequenceNumber: q.sequenceNumber,
          status: "CORRECT",
          marksEarned: effectiveMarks,
          penaltyDeducted: 0,
          netScoreAwarded: effectiveMarks,
          denominatorContribution: effectiveMarks,
        });
      } else {
        totalWrong++;
        rawScore -= effectivePenalty;
        questionBreakdowns.push({
          occurrenceId: q.occurrenceId,
          sequenceNumber: q.sequenceNumber,
          status: "INCORRECT",
          marksEarned: 0,
          penaltyDeducted: effectivePenalty,
          netScoreAwarded: -effectivePenalty,
          denominatorContribution: effectiveMarks,
        });
      }
      continue;
    }

    // 5. Evaluate MCQ / Assertion-Reason / Comprehension Questions
    evaluatedDenominator += effectiveMarks;
    let isCorrect = false;

    // Detect if question operates under Multiple-Correct semantics
    const isMultipleType =
      q.questionType === "MULTIPLE_CORRECT" ||
      q.questionType === "MULTIPLE_CHOICE" ||
      (q.questionType === "COMPREHENSION_CHILD" &&
        (q.correctOptionLabels.length > 1 || q.correctSourceOptionIds.length > 1));

    if (isMultipleType) {
      // Strictly All-or-Nothing Scoring:
      // Exact match between candidate selections and authoritative answer key.
      // Normalize sets (deduplicate selections, case-insensitive labels).
      if (q.correctSourceOptionIds.length > 0 && normSelectedIds.length > 0) {
        const targetSet = new Set(q.correctSourceOptionIds);
        const candidateSet = new Set(normSelectedIds);
        isCorrect =
          targetSet.size === candidateSet.size &&
          [...candidateSet].every((id) => targetSet.has(id));
      } else {
        const normCorrectLabels = q.correctOptionLabels
          .map((l) => (typeof l === "string" ? l.trim().toUpperCase() : ""))
          .filter((l) => l.length > 0);
        const targetSet = new Set(normCorrectLabels);
        const candidateSet = new Set(normDisplayLabels);
        isCorrect =
          targetSet.size === candidateSet.size &&
          [...candidateSet].every((lbl) => targetSet.has(lbl));
      }
    } else {
      // Single-Choice / Assertion-Reason / Standard Comprehension Child
      if (q.correctSourceOptionIds.length > 0 && normSelectedIds.length > 0) {
        // Must select the single correct option
        isCorrect =
          normSelectedIds.length === 1 && normSelectedIds[0] === q.correctSourceOptionIds[0];
      } else if (q.correctOptionLabels.length > 0 && normDisplayLabels.length > 0) {
        const normCorrect = q.correctOptionLabels[0].trim().toUpperCase();
        isCorrect =
          normDisplayLabels.length === 1 && normDisplayLabels[0] === normCorrect;
      }
    }

    if (isCorrect) {
      totalCorrect++;
      rawScore += effectiveMarks;
      questionBreakdowns.push({
        occurrenceId: q.occurrenceId,
        sequenceNumber: q.sequenceNumber,
        status: "CORRECT",
        marksEarned: effectiveMarks,
        penaltyDeducted: 0,
        netScoreAwarded: effectiveMarks,
        denominatorContribution: effectiveMarks,
      });
    } else {
      totalWrong++;
      rawScore -= effectivePenalty;
      questionBreakdowns.push({
        occurrenceId: q.occurrenceId,
        sequenceNumber: q.sequenceNumber,
        status: "INCORRECT",
        marksEarned: 0,
        penaltyDeducted: effectivePenalty,
        netScoreAwarded: -effectivePenalty,
        denominatorContribution: effectiveMarks,
      });
    }
  }

  // Round scores to 3 decimal places to prevent floating-point drift
  const precisionRound = (val: number) => Math.round(val * 1000) / 1000;

  return {
    rawScore: precisionRound(rawScore),
    evaluatedDenominator: precisionRound(evaluatedDenominator),
    totalQuestions: inputs.length,
    totalCorrect,
    totalWrong,
    totalUnanswered,
    totalWithdrawnAwarded,
    totalWithdrawnExcluded,
    questionBreakdowns,
  };
}
