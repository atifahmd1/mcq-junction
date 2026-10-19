// ============================================================================
// MCQ Junction — Question Types & Domain Interfaces
// File: src/lib/questions/types.ts
// ============================================================================

export type CanonicalQuestionType =
  | "SINGLE_CORRECT"
  | "MULTIPLE_CORRECT"
  | "ASSERTION_REASON";

export type SupportedQuestionType =
  | CanonicalQuestionType
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "COMPREHENSION_CHILD"
  | "NUMERICAL_DISCRETE";

export interface QuestionOptionInput {
  id?: string;
  optionLabel: string;
  optionText: string;
  isCorrect: boolean;
  sortOrder?: number;
  explanationText?: string | null;
  conceptId?: string | null;
}

export interface QuestionAuthoringPayload {
  occurrenceId?: string;
  paperId: string;
  sectionId?: string;
  sequenceNumber?: number;
  canonicalRefCode?: string;
  primarySubject: string;
  defaultTopic: string;
  questionType: SupportedQuestionType;
  questionText: string;
  assertionText?: string | null;
  reasonText?: string | null;
  passageId?: string | null;
  passageRefCode?: string | null;
  passageTitle?: string | null;
  passageBodyText?: string | null;
  passageLanguage?: string | null;
  passageImageUrl?: string | null;
  passageImageAlt?: string | null;
  options: QuestionOptionInput[];
  overallExplanation?: string | null;
  marksOverride?: number | null;
  negativeMarksOverride?: number | null;
}
