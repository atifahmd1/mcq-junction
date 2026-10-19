"use server";

import { ZodError } from "zod";
import {
  publishExamPaper,
  reevaluatePaperAttempts,
  swapQuestionSequence,
  createOrUpdateQuestion,
  importQuestionsFromCsv,
  exportQuestionsToCsv,
  type PublicationResult,
  type ReevaluationResult,
  type SwapSequenceResult,
  AdminServiceError,
} from "../../lib/admin/service.ts";
import {
  publishPaperSchema,
  reevaluatePaperSchema,
  swapQuestionSequenceSchema,
  type PublishPaperInput,
  type ReevaluatePaperInput,
  type SwapQuestionSequenceInput,
} from "../../lib/admin/schemas.ts";
import { assertAdminSession, UnauthorizedError, ForbiddenError } from "../../lib/auth/session.ts";

/**
 * Safe revalidation helper that dynamically imports next/cache when available.
 * In Next.js production runtime, errors during revalidation are logged rather than silently dropped.
 * In standalone Node unit test runners, cleanly falls back when next/cache cannot be imported.
 */
async function revalidateAdminPath(path: string): Promise<void> {
  let cacheMod;
  try {
    cacheMod = await import("next/cache");
  } catch {
    // Standalone Node unit test runner where next/cache is not resolvable
    return;
  }

  if (typeof cacheMod?.revalidatePath === "function") {
    try {
      cacheMod.revalidatePath(path);
    } catch (revalErr) {
      console.warn(`[AdminAction] Warning: Failed to revalidate cache for ${path}:`, revalErr);
    }
  }
}

export type ActionResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
};

/**
 * Server Action: Publishes an exam paper through the verified admin service.
 * Enforces server-side session authentication, Zod input validation,
 * parameterized database procedure invocation, and Next.js cache revalidation.
 */
export async function publishExamPaperAction(
  input: PublishPaperInput
): Promise<ActionResponse<PublicationResult>> {
  try {
    const validated = publishPaperSchema.parse(input);
    const result = await publishExamPaper(validated);

    // Revalidate relevant cache paths on successful completion
    await revalidateAdminPath("/admin/papers");
    await revalidateAdminPath(`/admin/papers/${input.paperId}`);
    await revalidateAdminPath(`/admin/papers/${input.paperId}/publish`);
    await revalidateAdminPath(`/admin/papers/${input.paperId}/sequence`);
    await revalidateAdminPath(`/admin/papers/${input.paperId}/adjudication`);
    await revalidateAdminPath("/dashboard");

    return {
      success: true,
      data: result,
    };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        success: false,
        error: err.issues[0]?.message ?? "Invalid request input",
        code: "VALIDATION_ERROR",
      };
    }

    if (err instanceof UnauthorizedError || err instanceof ForbiddenError || err instanceof AdminServiceError) {
      return {
        success: false,
        error: err.message,
        code: "code" in err ? (err as AdminServiceError).code : err.name,
      };
    }

    console.error("Unhandled exception in publishExamPaperAction:", err);
    return {
      success: false,
      error: "An unexpected error occurred while publishing the exam paper.",
      code: "INTERNAL_ERROR",
    };
  }
}

/**
 * Server Action: Re-evaluates test attempts for a published exam paper.
 */
export async function reevaluatePaperAttemptsAction(
  input: ReevaluatePaperInput
): Promise<ActionResponse<ReevaluationResult>> {
  try {
    const validated = reevaluatePaperSchema.parse(input);
    const result = await reevaluatePaperAttempts(validated);

    await revalidateAdminPath("/admin/papers");
    await revalidateAdminPath(`/admin/papers/${input.paperId}`);
    await revalidateAdminPath(`/admin/papers/${input.paperId}/adjudication`);
    await revalidateAdminPath("/dashboard");

    return {
      success: true,
      data: result,
    };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        success: false,
        error: err.issues[0]?.message ?? "Invalid request input",
        code: "VALIDATION_ERROR",
      };
    }

    if (err instanceof UnauthorizedError || err instanceof ForbiddenError || err instanceof AdminServiceError) {
      return {
        success: false,
        error: err.message,
        code: "code" in err ? (err as AdminServiceError).code : err.name,
      };
    }

    console.error("Unhandled exception in reevaluatePaperAttemptsAction:", err);
    return {
      success: false,
      error: "An unexpected error occurred while re-evaluating test attempts.",
      code: "INTERNAL_ERROR",
    };
  }
}

/**
 * Server Action: Swaps two question sequence numbers in an unpublished exam paper.
 */
export async function swapQuestionSequenceAction(
  input: SwapQuestionSequenceInput
): Promise<ActionResponse<SwapSequenceResult>> {
  try {
    const validated = swapQuestionSequenceSchema.parse(input);
    const result = await swapQuestionSequence(validated);

    await revalidateAdminPath(`/admin/papers/${input.paperId}/sequence`);
    await revalidateAdminPath(`/admin/papers/${input.paperId}/publish`);
    await revalidateAdminPath(`/admin/papers/${input.paperId}`);
    await revalidateAdminPath("/admin/papers");
    await revalidateAdminPath("/dashboard");

    return {
      success: true,
      data: result,
    };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        success: false,
        error: err.issues[0]?.message ?? "Invalid request input",
        code: "VALIDATION_ERROR",
      };
    }

    if (err instanceof UnauthorizedError || err instanceof ForbiddenError || err instanceof AdminServiceError) {
      return {
        success: false,
        error: err.message,
        code: "code" in err ? (err as AdminServiceError).code : err.name,
      };
    }

    console.error("Unhandled exception in swapQuestionSequenceAction:", err);
    return {
      success: false,
      error: "An unexpected error occurred while swapping question sequence positions.",
      code: "INTERNAL_ERROR",
    };
  }
}

/**
 * Server Action: Creates or saves a question on an exam paper with server-side validation.
 */
export async function saveQuestionAction(
  payload: unknown
): Promise<ActionResponse<{ occurrenceId: string; sequenceNumber: number }>> {
  try {
    const admin = await assertAdminSession();
    const result = await createOrUpdateQuestion(admin.id, payload);

    const paperId = (payload as Record<string, unknown>)?.paperId;
    if (paperId && typeof paperId === "string") {
      await revalidateAdminPath(`/admin/papers/${paperId}/questions`);
      await revalidateAdminPath(`/admin/papers/${paperId}/sequence`);
      await revalidateAdminPath(`/admin/papers/${paperId}/publish`);
      await revalidateAdminPath(`/admin/papers/${paperId}`);
    }
    await revalidateAdminPath("/admin/papers");

    return {
      success: true,
      data: {
        occurrenceId: result.occurrenceId,
        sequenceNumber: result.sequenceNumber,
      },
    };
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError || err instanceof AdminServiceError) {
      return {
        success: false,
        error: err.message,
        code: "code" in err ? (err as AdminServiceError).code : err.name,
      };
    }

    console.error("Unhandled exception in saveQuestionAction:", err);
    return {
      success: false,
      error: "An unexpected error occurred while saving question.",
      code: "INTERNAL_ERROR",
    };
  }
}

/**
 * Server Action: Imports questions from CSV into an exam paper.
 */
export async function importQuestionsCsvAction(
  paperId: string,
  csvContent: string
): Promise<ActionResponse<{ importedCount: number; errors: Array<{ row: number; message: string }> }>> {
  try {
    const admin = await assertAdminSession();
    const result = await importQuestionsFromCsv(admin.id, paperId, csvContent);

    if (result.success) {
      await revalidateAdminPath(`/admin/papers/${paperId}/questions`);
      await revalidateAdminPath(`/admin/papers/${paperId}/sequence`);
      await revalidateAdminPath(`/admin/papers/${paperId}/publish`);
      await revalidateAdminPath(`/admin/papers/${paperId}`);
      await revalidateAdminPath("/admin/papers");
    }

    return {
      success: result.success,
      data: {
        importedCount: result.importedCount,
        errors: result.errors,
      },
      error: result.errors.length > 0 ? `CSV has ${result.errors.length} validation errors` : undefined,
    };
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError || err instanceof AdminServiceError) {
      return {
        success: false,
        error: err.message,
        code: "code" in err ? (err as AdminServiceError).code : err.name,
      };
    }

    console.error("Unhandled exception in importQuestionsCsvAction:", err);
    return {
      success: false,
      error: "An unexpected error occurred while importing CSV questions.",
      code: "INTERNAL_ERROR",
    };
  }
}

/**
 * Server Action: Exports questions of an exam paper to CSV.
 */
export async function exportQuestionsCsvAction(
  paperId: string
): Promise<ActionResponse<{ csv: string }>> {
  try {
    await assertAdminSession();
    const csv = await exportQuestionsToCsv(paperId);

    return {
      success: true,
      data: { csv },
    };
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError || err instanceof AdminServiceError) {
      return {
        success: false,
        error: err.message,
        code: "code" in err ? (err as AdminServiceError).code : err.name,
      };
    }

    console.error("Unhandled exception in exportQuestionsCsvAction:", err);
    return {
      success: false,
      error: "An unexpected error occurred while exporting questions.",
      code: "INTERNAL_ERROR",
    };
  }
}

