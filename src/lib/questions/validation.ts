// ============================================================================
// MCQ Junction — Server-Side Question Validation
// File: src/lib/questions/validation.ts
// ============================================================================

import { z } from "zod";
import type { QuestionAuthoringPayload } from "./types.ts";

/**
 * Validation schema for a single question option.
 */
export const questionOptionSchema = z.object({
  id: z.string().uuid().optional(),
  optionLabel: z
    .string()
    .trim()
    .min(1, { message: "Option label cannot be empty" })
    .max(10, { message: "Option label cannot exceed 10 characters" }),
  optionText: z
    .string()
    .trim()
    .min(1, { message: "Option text cannot be empty" })
    .max(5000, { message: "Option text cannot exceed 5000 characters" }),
  isCorrect: z.boolean(),
  sortOrder: z.number().int().min(1).optional(),
  explanationText: z.string().trim().max(2000).nullable().optional(),
  conceptId: z.string().uuid({ message: "Invalid concept ID" }).nullable().optional(),
});

/**
 * Common question authoring schema fields.
 */
const baseQuestionSchema = z.object({
  occurrenceId: z.string().uuid().optional(),
  paperId: z.string().uuid({ message: "Invalid paper ID: must be a UUID" }),
  sectionId: z.string().uuid().optional(),
  sequenceNumber: z.number().int().min(1).optional(),
  canonicalRefCode: z.string().trim().max(100).optional(),
  primarySubject: z
    .string()
    .trim()
    .min(2, { message: "Subject must be at least 2 characters" })
    .max(100),
  defaultTopic: z
    .string()
    .trim()
    .min(2, { message: "Topic must be at least 2 characters" })
    .max(150),
  questionText: z
    .string()
    .trim()
    .min(5, { message: "Question text must be at least 5 characters" })
    .max(10000),
  assertionText: z.string().trim().max(5000).nullable().optional(),
  reasonText: z.string().trim().max(5000).nullable().optional(),
  passageId: z.string().uuid().nullable().optional(),
  passageRefCode: z.string().trim().max(100).nullable().optional(),
  passageTitle: z.string().trim().max(255).nullable().optional(),
  passageBodyText: z.string().trim().max(50000).nullable().optional(),
  passageLanguage: z.enum(["EN", "HI", "UR", "BN", "TA", "TE"]).nullable().optional(),
  passageImageUrl: z.string().trim().max(1000).nullable().optional(),
  passageImageAlt: z.string().trim().max(255).nullable().optional(),
  options: z
    .array(questionOptionSchema)
    .min(2, { message: "Question must have at least 2 options" })
    .max(10, { message: "Question cannot exceed 10 options" }),
  overallExplanation: z.string().trim().max(5000).nullable().optional(),
  marksOverride: z.number().positive().max(100).nullable().optional(),
  negativeMarksOverride: z.number().min(0).max(100).nullable().optional(),
});

/**
 * Server-authoritative validation for SINGLE_CORRECT question type.
 */
export const singleCorrectQuestionSchema = baseQuestionSchema
  .extend({
    questionType: z.enum(["SINGLE_CORRECT", "SINGLE_CHOICE"]),
  })
  .superRefine((data, ctx) => {
    // 1. Validate option labels are unique
    const labels = new Set<string>();
    for (let i = 0; i < data.options.length; i++) {
      const label = data.options[i].optionLabel.toUpperCase();
      if (labels.has(label)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate option label "${label}" detected`,
          path: ["options", i, "optionLabel"],
        });
      }
      labels.add(label);
    }

    // 2. Single-correct must have EXACTLY ONE correct option
    const correctOptions = data.options.filter((opt) => opt.isCorrect);
    if (correctOptions.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SINGLE_CORRECT requires exactly 1 correct option, but found ${correctOptions.length}`,
        path: ["options"],
      });
    }
  });

/**
 * Server-authoritative validation for MULTIPLE_CORRECT question type.
 */
export const multipleCorrectQuestionSchema = baseQuestionSchema
  .extend({
    questionType: z.enum(["MULTIPLE_CORRECT", "MULTIPLE_CHOICE"]),
  })
  .superRefine((data, ctx) => {
    // 1. Validate option labels are unique
    const labels = new Set<string>();
    for (let i = 0; i < data.options.length; i++) {
      const label = data.options[i].optionLabel.toUpperCase();
      if (labels.has(label)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate option label "${label}" detected`,
          path: ["options", i, "optionLabel"],
        });
      }
      labels.add(label);
    }

    // 2. Multiple-correct must have AT LEAST ONE correct option
    const correctOptions = data.options.filter((opt) => opt.isCorrect);
    if (correctOptions.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MULTIPLE_CORRECT requires at least 1 correct option",
        path: ["options"],
      });
    }
  });

/**
 * Server-authoritative validation for ASSERTION_REASON question type.
 */
export const assertionReasonQuestionSchema = baseQuestionSchema
  .extend({
    questionType: z.literal("ASSERTION_REASON"),
  })
  .superRefine((data, ctx) => {
    // 1. Assertion and Reason text are mandatory
    if (!data.assertionText || data.assertionText.trim().length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Assertion (A) statement must be at least 5 characters",
        path: ["assertionText"],
      });
    }

    if (!data.reasonText || data.reasonText.trim().length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reason (R) statement must be at least 5 characters",
        path: ["reasonText"],
      });
    }

    // 2. Validate option labels are unique
    const labels = new Set<string>();
    for (let i = 0; i < data.options.length; i++) {
      const label = data.options[i].optionLabel.toUpperCase();
      if (labels.has(label)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate option label "${label}" detected`,
          path: ["options", i, "optionLabel"],
        });
      }
      labels.add(label);
    }

    // 3. Assertion-Reason requires EXACTLY ONE correct option
    const correctOptions = data.options.filter((opt) => opt.isCorrect);
    if (correctOptions.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `ASSERTION_REASON requires exactly 1 correct option, but found ${correctOptions.length}`,
        path: ["options"],
      });
    }
  });

/**
 * Universal question authoring validation schema covering all supported types.
 */
export const questionAuthoringSchema = baseQuestionSchema
  .extend({
    questionType: z.enum([
      "SINGLE_CORRECT",
      "MULTIPLE_CORRECT",
      "ASSERTION_REASON",
      "SINGLE_CHOICE",
      "MULTIPLE_CHOICE",
      "COMPREHENSION_CHILD",
      "NUMERICAL_DISCRETE",
    ]),
  })
  .superRefine((data, ctx) => {
    const qType = data.questionType;

    // Delegate to specific validation rules
    if (qType === "SINGLE_CORRECT" || qType === "SINGLE_CHOICE") {
      const result = singleCorrectQuestionSchema.safeParse(data);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            code: "custom",
            message: issue.message,
            path: issue.path as (string | number)[],
          });
        }
      }
    } else if (qType === "MULTIPLE_CORRECT" || qType === "MULTIPLE_CHOICE") {
      const result = multipleCorrectQuestionSchema.safeParse(data);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            code: "custom",
            message: issue.message,
            path: issue.path as (string | number)[],
          });
        }
      }
    } else if (qType === "ASSERTION_REASON") {
      const result = assertionReasonQuestionSchema.safeParse(data);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            code: "custom",
            message: issue.message,
            path: issue.path as (string | number)[],
          });
        }
      }
    }

    // Passage-based question validations
    if (data.passageRefCode) {
      if (!data.passageId && (!data.passageBodyText || data.passageBodyText.trim().length < 10)) {
        ctx.addIssue({
          code: "custom",
          message: "Passage definition requires body text of at least 10 characters",
          path: ["passageBodyText"],
        });
      }
    }

    if (qType === "COMPREHENSION_CHILD") {
      if (!data.passageId && !data.passageRefCode) {
        ctx.addIssue({
          code: "custom",
          message: "COMPREHENSION_CHILD question requires a linked passage (passageId or passageRefCode)",
          path: ["passageRefCode"],
        });
      }
      const correctCount = data.options.filter((o) => o.isCorrect).length;
      if (correctCount === 0) {
        ctx.addIssue({
          code: "custom",
          message: "Comprehension question must have at least 1 correct option",
          path: ["options"],
        });
      }
    }
  });

export type QuestionAuthoringInput = z.infer<typeof questionAuthoringSchema>;

/**
 * Validates a question configuration server-side.
 * Returns structured error messages or valid=true.
 */
export function validateQuestionConfiguration(
  input: unknown
): { valid: boolean; errors: string[]; data?: QuestionAuthoringPayload } {
  const result = questionAuthoringSchema.safeParse(input);
  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "root"}: ${issue.message}`
    );
    return { valid: false, errors };
  }
  return { valid: true, errors: [], data: result.data as QuestionAuthoringPayload };
}
