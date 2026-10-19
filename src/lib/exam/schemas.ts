// ============================================================================
// MCQ Junction — Candidate Examination Schemas & Validation Boundary
// File: src/lib/exam/schemas.ts
// ============================================================================

import { z } from "zod";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const startAttemptSchema = z.object({
  paperId: z
    .string()
    .regex(uuidRegex, { message: "Invalid exam paper UUID format" }),
});

export const saveAnswerSchema = z.object({
  attemptId: z
    .string()
    .regex(uuidRegex, { message: "Invalid test attempt UUID format" }),
  occurrenceId: z
    .string()
    .regex(uuidRegex, { message: "Invalid question occurrence UUID format" }),
  selectedSourceOptionIds: z
    .array(z.string().regex(uuidRegex, { message: "Invalid source option UUID" }))
    .default([]),
  displayOptionLabels: z
    .array(z.string().min(1).max(10))
    .default([]),
  numericalInput: z
    .number()
    .nullable()
    .optional(),
  isMarkedForReview: z.boolean().default(false),
  timeSpentSeconds: z.number().int().nonnegative().default(0),
  clientVersion: z.number().int().positive().default(1),
});

export const submitAttemptSchema = z.object({
  attemptId: z
    .string()
    .regex(uuidRegex, { message: "Invalid test attempt UUID format" }),
  reason: z.string().max(255).optional(),
});

export const getAttemptSchema = z.object({
  attemptId: z
    .string()
    .regex(uuidRegex, { message: "Invalid test attempt UUID format" }),
});

export type StartAttemptInput = z.infer<typeof startAttemptSchema>;
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
export type GetAttemptInput = z.infer<typeof getAttemptSchema>;
