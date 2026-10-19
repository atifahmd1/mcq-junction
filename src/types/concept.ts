// ============================================================================
// MCQ Junction — Detailed Concept & Learning Mode Types
// File: src/types/concept.ts
// ============================================================================

export interface ConceptReference {
  title: string;
  url: string;
  type?: "DOCUMENTATION" | "BOOK" | "ARTICLE" | "SPECIFICATION" | "EXTERNAL";
}

export interface DetailedConceptData {
  id: string;
  title: string;
  content: string;
  keyPoints?: string[];
  imageUrl?: string | null;
  imageAlt?: string | null;
  imageCaption?: string | null;
  videoUrl?: string | null;
  videoTitle?: string | null;
  references?: ConceptReference[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface LearningOptionData {
  id: string;
  optionLabel: string;
  optionText: string;
  sortOrder: number;
  isCorrect?: boolean;
  explanationText?: string | null;
  conceptId?: string | null;
  concept?: DetailedConceptData | null;
}

export interface ComprehensionPassageData {
  id: string;
  passageRefCode: string;
  title?: string | null;
  bodyText: string;
  languageCode: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
}

export type LearningQuestionType =
  | "SINGLE_CORRECT"
  | "MULTIPLE_CORRECT"
  | "ASSERTION_REASON"
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "COMPREHENSION_CHILD";

export interface LearningQuestionData {
  occurrenceId: string;
  sequenceNumber: number;
  paperId: string;
  paperTitle: string;
  paperStatus: "DRAFT" | "EDITORIAL_REVIEW" | "VERIFIED" | "PUBLISHED" | "ARCHIVED";
  primarySubject: string;
  defaultTopic: string;
  questionType?: LearningQuestionType;
  passage?: ComprehensionPassageData | null;
  questionText: string;
  assertionText?: string | null;
  reasonText?: string | null;
  languageCode: string;
  options: LearningOptionData[];
  overallExplanation?: string | null;
}

