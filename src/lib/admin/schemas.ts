import { z } from "zod";

/**
 * Validation schema for exam paper publication.
 */
export const publishPaperSchema = z.object({
  paperId: z.string().uuid({ message: "Invalid paper ID: must be a valid UUID" }),
});

export type PublishPaperInput = z.infer<typeof publishPaperSchema>;

/**
 * Validation schema for two-tier test attempt re-evaluation.
 */
export const reevaluatePaperSchema = z.object({
  paperId: z.string().uuid({ message: "Invalid paper ID: must be a valid UUID" }),
  newKeyVersionId: z.string().uuid({ message: "Invalid answer key version ID: must be a valid UUID" }),
  adjudicationReason: z
    .string()
    .trim()
    .min(5, { message: "Adjudication reason must be at least 5 characters" })
    .max(500, { message: "Adjudication reason cannot exceed 500 characters" })
    .optional(),
});

export type ReevaluatePaperInput = z.infer<typeof reevaluatePaperSchema>;

/**
 * Validation schema for swapping two question sequence positions.
 */
export const swapQuestionSequenceSchema = z.object({
  paperId: z.string().uuid({ message: "Invalid paper ID: must be a valid UUID" }),
  occurrenceIdA: z.string().uuid({ message: "Invalid occurrence A ID: must be a valid UUID" }),
  occurrenceIdB: z.string().uuid({ message: "Invalid occurrence B ID: must be a valid UUID" }),
});

export type SwapQuestionSequenceInput = z.infer<typeof swapQuestionSequenceSchema>;

/**
 * Validation schema for concept reference links.
 */
export const conceptReferenceSchema = z.object({
  title: z.string().trim().min(1, { message: "Reference title cannot be empty" }).max(255),
  url: z.string().trim().url({ message: "Reference must be a valid URL" }).refine(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
    { message: "Reference URL must use http or https protocol" }
  ),
  type: z
    .enum(["DOCUMENTATION", "BOOK", "ARTICLE", "SPECIFICATION", "EXTERNAL"])
    .optional(),
});

export type ConceptReferenceInput = z.infer<typeof conceptReferenceSchema>;

/**
 * Validation schema for reusable detailed concepts.
 */
export const detailedConceptSchema = z.object({
  id: z.string().uuid({ message: "Invalid concept ID: must be a valid UUID" }).optional(),
  title: z
    .string()
    .trim()
    .min(3, { message: "Concept title must be at least 3 characters" })
    .max(255, { message: "Concept title cannot exceed 255 characters" }),
  content: z
    .string()
    .trim()
    .min(5, { message: "Concept content must be at least 5 characters" }),
  keyPoints: z.array(z.string().trim().min(1)).default([]),
  imageUrl: z
    .string()
    .trim()
    .url({ message: "Image URL must be valid" })
    .refine((url) => url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/"), {
      message: "Image URL must use http, https, or relative path",
    })
    .nullable()
    .optional(),
  imageAlt: z.string().trim().max(255).nullable().optional(),
  imageCaption: z.string().trim().max(500).nullable().optional(),
  videoUrl: z
    .string()
    .trim()
    .url({ message: "Video URL must be valid" })
    .refine((url) => url.startsWith("http://") || url.startsWith("https://"), {
      message: "Video URL must use http or https",
    })
    .nullable()
    .optional(),
  videoTitle: z.string().trim().max(255).nullable().optional(),
  references: z.array(conceptReferenceSchema).default([]),
});

export type DetailedConceptInput = z.infer<typeof detailedConceptSchema>;

/**
 * Validation schema for updating option explanation and concept link.
 */
export const updateOptionConceptSchema = z.object({
  optionId: z.string().uuid({ message: "Invalid option ID: must be a valid UUID" }),
  explanationText: z.string().trim().max(2000).nullable().optional(),
  conceptId: z.string().uuid({ message: "Invalid concept ID: must be a valid UUID" }).nullable().optional(),
});

export type UpdateOptionConceptInput = z.infer<typeof updateOptionConceptSchema>;

export {
  questionOptionSchema,
  singleCorrectQuestionSchema,
  multipleCorrectQuestionSchema,
  assertionReasonQuestionSchema,
  questionAuthoringSchema,
  validateQuestionConfiguration,
  type QuestionAuthoringInput,
} from "../questions/validation.ts";

