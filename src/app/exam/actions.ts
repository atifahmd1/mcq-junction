"use server";

// ============================================================================
// MCQ Junction — Candidate Examination Server Actions
// File: src/app/exam/actions.ts
// ============================================================================

import { revalidatePath } from "next/cache.js";
import {
  assertCandidateSession,
  assertAdminSession,
  type SessionOptions,
} from "../../lib/auth/session.ts";
import {
  startExamAttempt,
  saveAttemptAnswer,
  submitExamAttempt,
  finalizeOverdueAttempts,
  mapDatabaseExamError,
  type SaveAnswerResult,
  type SubmitAttemptResult,
} from "../../lib/exam/service.ts";
import {
  startAttemptSchema,
  saveAnswerSchema,
  submitAttemptSchema,
} from "../../lib/exam/schemas.ts";

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Server Action: Start or resume an examination attempt.
 */
export async function startExamAction(paperId: string): Promise<ActionResult<{ attemptId: string; isResumed: boolean }>> {
  try {
    const candidateUser = await assertCandidateSession();

    const parseResult = startAttemptSchema.safeParse({ paperId });
    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid paper ID format",
        code: "VALIDATION_ERROR",
      };
    }

    const res = await startExamAttempt(
      { paperId },
      candidateUser,
      { userAgent: "NextServerAction" }
    );

    return {
      success: true,
      data: {
        attemptId: res.attemptId,
        isResumed: res.isResumed,
      },
    };
  } catch (err) {
    const mapped = mapDatabaseExamError(err);
    return {
      success: false,
      error: mapped.message,
      code: mapped.code,
    };
  }
}

/**
 * Server Action: Persist candidate answer response with optimistic concurrency.
 */
export async function saveAnswerAction(
  rawInput: unknown
): Promise<ActionResult<SaveAnswerResult>> {
  try {
    const candidateUser = await assertCandidateSession();

    const parseResult = saveAnswerSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid answer format",
        code: "VALIDATION_ERROR",
      };
    }

    const res = await saveAttemptAnswer(parseResult.data, candidateUser);
    if (!res.success) {
      return {
        success: false,
        error: res.error ?? "Failed to save answer response",
        code: res.code ?? "VERSION_CONFLICT",
        data: res,
      };
    }

    return {
      success: true,
      data: res,
    };
  } catch (err) {
    const mapped = mapDatabaseExamError(err);
    return {
      success: false,
      error: mapped.message,
      code: mapped.code,
    };
  }
}

/**
 * Server Action: Finalize and submit an examination attempt.
 */
export async function submitExamAction(
  rawInput: unknown
): Promise<ActionResult<SubmitAttemptResult>> {
  try {
    const candidateUser = await assertCandidateSession();

    const parseResult = submitAttemptSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.issues[0]?.message ?? "Invalid submission request",
        code: "VALIDATION_ERROR",
      };
    }

    const res = await submitExamAttempt(parseResult.data, candidateUser);
    revalidatePath(`/exam`);

    return {
      success: true,
      data: res,
    };
  } catch (err) {
    const mapped = mapDatabaseExamError(err);
    return {
      success: false,
      error: mapped.message,
      code: mapped.code,
    };
  }
}

/**
 * Server Action: Administrative sweep to finalize overdue attempts for an exam paper.
 * Restricted to administrator privileges to prevent candidate-triggered broad maintenance sweeps.
 */
export async function finalizeOverdueAttemptsAction(
  paperId?: string,
  sessionOptions?: SessionOptions
): Promise<ActionResult<{ finalizedCount: number; attemptIds: string[] }>> {
  try {
    await assertAdminSession(sessionOptions);
    const res = await finalizeOverdueAttempts(paperId);
    return {
      success: true,
      data: res,
    };
  } catch (err) {
    const mapped = mapDatabaseExamError(err);
    return {
      success: false,
      error: mapped.message,
      code: mapped.code,
    };
  }
}

