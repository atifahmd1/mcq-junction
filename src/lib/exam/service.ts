// ============================================================================
// MCQ Junction — Realtime Candidate Examination Engine Service
// File: src/lib/exam/service.ts
// ============================================================================

import {
  type CandidateSessionUser,
  type SessionOptions,
  UnauthorizedError,
  ForbiddenError,
} from "../auth/session.ts";
import {
  type StartAttemptInput,
  type SaveAnswerInput,
  type SubmitAttemptInput,
  type GetAttemptInput,
} from "./schemas.ts";
import { calculateAttemptScore, type QuestionScoreInput } from "../scoring/engine.ts";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { AttemptStatus } from "../../generated/prisma/enums.ts";

export class ExamServiceError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code = "MCQJ_EXAM_ERROR", statusCode = 400) {
    super(message);
    this.name = "ExamServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Maps database and domain exceptions to user-safe errors.
 */
export function mapDatabaseExamError(err: unknown): ExamServiceError {
  const errorObj = typeof err === "object" && err !== null ? (err as { name?: unknown; message?: unknown }) : null;
  if (err instanceof ExamServiceError || errorObj?.name === "ExamServiceError") {
    return err as ExamServiceError;
  }
  if (err instanceof UnauthorizedError || errorObj?.name === "UnauthorizedError") {
    return new ExamServiceError(typeof errorObj?.message === "string" ? errorObj.message : "Unauthorized", "MCQJ-ERR-4001", 401);
  }
  if (err instanceof ForbiddenError || errorObj?.name === "ForbiddenError") {
    return new ExamServiceError(typeof errorObj?.message === "string" ? errorObj.message : "Forbidden", "MCQJ-ERR-4003", 403);
  }

  const rawMessage = err instanceof Error ? err.message : String(err);

  // Match known MCQ Junction PostgreSQL error codes
  const match = rawMessage.match(/MCQJ-ERR-(\d{4}):\s*(.*)/);
  if (match) {
    const code = `MCQJ-ERR-${match[1]}`;
    switch (match[1]) {
      case "6001":
        return new ExamServiceError("You have already completed this examination. Retakes are not permitted.", code, 409);
      case "6002":
        return new ExamServiceError("Cannot modify answers for an attempt that is no longer in progress.", code, 409);
      case "6003":
        return new ExamServiceError("The examination deadline has expired. Submissions can no longer be accepted.", code, 403);
      case "6004":
        return new ExamServiceError("Invalid examination attempt status transition.", code, 409);
      case "6005":
        return new ExamServiceError("You are not authorized to access or modify this examination attempt.", code, 403);
      default:
        return new ExamServiceError(match[2].trim() || "An examination system error occurred.", code, 400);
    }
  }

  // Catch PostgreSQL unique constraint on active attempt
  if (rawMessage.includes("uk_attempt_user_paper_active")) {
    return new ExamServiceError("An active examination session is already in progress for this paper.", "MCQJ-ERR-6001", 409);
  }

  return new ExamServiceError("An unexpected examination error occurred. Please try again.", "MCQJ_EXAM_INTERNAL", 500);
}

export interface CandidateQuestionView {
  occurrenceId: string;
  sequenceNumber: number;
  questionType: string;
  questionText: string;
  languageCode: string;
  marks: number;
  negativeMarks: number;
  passage?: {
    id: string;
    passageRefCode: string;
    title: string | null;
    bodyText: string;
    languageCode: string;
    imageUrl: string | null;
    imageAlt: string | null;
  } | null;
  options: Array<{
    sourceOptionId: string;
    displayLabel: string;
    displaySortOrder: number;
    optionText: string;
  }>;
}

export interface AttemptView {
  attemptId: string;
  paperId: string;
  paperCode: string;
  paperTitle: string;
  totalDurationMinutes: number;
  totalQuestions: number;
  maxScore: number;
  attemptStatus: AttemptStatus;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  remainingSeconds: number;
  bookletSeriesCode: string;
  questions: CandidateQuestionView[];
  savedResponses: Record<
    string,
    {
      selectedSourceOptionIds: string[];
      displayOptionLabels: string[];
      numericalInput: number | null;
      isMarkedForReview: boolean;
      version: number;
      answeredAt: string | null;
    }
  >;
}

export interface SaveAnswerResult {
  success: boolean;
  occurrenceId: string;
  savedAt: string;
  version: number;
  status: "SAVED" | "STALE_IGNORED" | "STALE_REJECTED" | "CONFLICT";
  error?: string;
  code?: string;
}

export interface SubmitAttemptResult {
  success: boolean;
  attemptId: string;
  attemptStatus: AttemptStatus;
  submittedAt: string;
  rawScore?: number;
  evaluatedDenominator?: number;
  totalQuestions?: number;
  totalCorrect?: number;
  totalWrong?: number;
  totalUnanswered?: number;
  message: string;
}


export interface ExamServiceContext {
  sessionOptions?: SessionOptions;
  prismaClient?: PrismaClient;
}

async function getDb(ctx?: ExamServiceContext): Promise<PrismaClient> {
  if (ctx?.prismaClient) {
    return ctx.prismaClient;
  }
  return (await import("../prisma.ts")).prisma as PrismaClient;
}

/**
 * 1. Start a durable, resumable examination attempt.
 */
export async function startExamAttempt(
  input: StartAttemptInput,
  candidateUser: CandidateSessionUser,
  clientMeta?: { ipAddress?: string; userAgent?: string },
  ctx?: ExamServiceContext
): Promise<{ attemptId: string; status: AttemptStatus; isResumed: boolean }> {
  const db = await getDb(ctx);

  // 1. Verify paper eligibility
  const paper = await db.examPaper.findUnique({
    where: { id: input.paperId },
    include: {
      bookletSeries: true,
    },
  });

  if (!paper) {
    throw new ExamServiceError("The requested examination paper does not exist.", "PAPER_NOT_FOUND", 404);
  }

  if (paper.publishStatus !== "PUBLISHED") {
    throw new ExamServiceError("This examination paper is not published and cannot be taken.", "PAPER_NOT_PUBLISHED", 403);
  }

  if (paper.bookletSeries.length === 0) {
    throw new ExamServiceError("Examination configuration error: paper lacks booklet series.", "BOOKLET_SERIES_MISSING", 500);
  }

  // 2. Check existing attempts for candidate
  const existingAttempts = await db.testAttempt.findMany({
    where: {
      paperId: input.paperId,
      userId: candidateUser.id,
    },
    orderBy: { createdAt: "desc" },
  });

  const activeAttempt = existingAttempts.find((a) => a.attemptStatus === AttemptStatus.IN_PROGRESS);
  if (activeAttempt) {
    const now = Date.now();
    const expiresAt = activeAttempt.expiresAt
      ? activeAttempt.expiresAt.getTime()
      : activeAttempt.startedAt.getTime() + paper.totalDurationMinutes * 60 * 1000;

    // Check if expired while away
    if (now >= expiresAt) {
      // Auto-submit expired attempt idempotently
      await submitExamAttempt(
        { attemptId: activeAttempt.id, reason: "AUTO_EXPIRED_ON_RESUMPTION" },
        candidateUser,
        ctx
      );
      throw new ExamServiceError(
        "Your examination session has expired and was automatically submitted.",
        "MCQJ-ERR-6003",
        410
      );
    }

    // Safe resumption: return existing attempt
    return {
      attemptId: activeAttempt.id,
      status: activeAttempt.attemptStatus,
      isResumed: true,
    };
  }

  // Check if candidate already completed this exam (retake policy: single attempt)
  const completedAttempt = existingAttempts.find(
    (a) => a.attemptStatus === AttemptStatus.SUBMITTED || a.attemptStatus === AttemptStatus.EVALUATED
  );
  if (completedAttempt) {
    throw new ExamServiceError(
      "You have already completed this examination. Retakes are not permitted.",
      "MCQJ-ERR-6001",
      409
    );
  }

  // 3. Assign Booklet Series (Master series preferred, or deterministic hash based on candidate ID)
  let assignedSeries = paper.bookletSeries.find((s) => s.isMasterSeries);
  if (!assignedSeries || paper.bookletSeries.length > 1) {
    // Deterministic selection across available series
    const hash = candidateUser.id
      .split("")
      .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 0);
    assignedSeries = paper.bookletSeries[hash % paper.bookletSeries.length]!;
  }

  // 4. Calculate authoritative timestamps
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + paper.totalDurationMinutes * 60 * 1000);

  try {
    const createdAttempt = await db.testAttempt.create({
      data: {
        paperId: paper.id,
        bookletSeriesId: assignedSeries.id,
        userId: candidateUser.id,
        attemptStatus: AttemptStatus.IN_PROGRESS,
        startedAt,
        expiresAt,
        ipAddress: clientMeta?.ipAddress ?? null,
        userAgent: clientMeta?.userAgent ?? null,
      },
    });

    return {
      attemptId: createdAttempt.id,
      status: createdAttempt.attemptStatus,
      isResumed: false,
    };
  } catch (createErr) {
    // Handle concurrent insertion caught by unique constraint uk_attempt_user_paper_active
    const mapped = mapDatabaseExamError(createErr);
    if (mapped.code === "MCQJ-ERR-6001") {
      const raceAttempt = await db.testAttempt.findFirst({
        where: {
          paperId: paper.id,
          userId: candidateUser.id,
          attemptStatus: AttemptStatus.IN_PROGRESS,
        },
      });
      if (raceAttempt) {
        return {
          attemptId: raceAttempt.id,
          status: raceAttempt.attemptStatus,
          isResumed: true,
        };
      }
    }
    throw mapped;
  }
}

/**
 * 2. Retrieve candidate-facing attempt view with questions in booklet order.
 * Strictly sanitizes correct answers and explanations before submission.
 */
export async function getExamAttempt(
  input: GetAttemptInput,
  candidateUser: CandidateSessionUser,
  ctx?: ExamServiceContext
): Promise<AttemptView> {
  const db = await getDb(ctx);

  const attempt = await db.testAttempt.findUnique({
    where: { id: input.attemptId },
    include: {
      paper: {
        include: {
          markingScheme: true,
          sections: {
            include: {
              scoringOverride: true,
            },
          },
        },
      },
      bookletSeries: true,
      responses: true,
    },
  });

  if (!attempt) {
    throw new ExamServiceError("The specified examination attempt does not exist.", "ATTEMPT_NOT_FOUND", 404);
  }

  // Candidate ownership enforcement
  if (attempt.userId !== candidateUser.id) {
    throw new ExamServiceError("Unauthorized: You do not own this examination attempt.", "MCQJ-ERR-6005", 403);
  }

  // Authoritative server-side remaining time calculation
  const now = Date.now();
  const deadline = attempt.expiresAt
    ? attempt.expiresAt.getTime()
    : attempt.startedAt.getTime() + attempt.paper.totalDurationMinutes * 60 * 1000;
  const remainingSeconds = Math.max(0, Math.floor((deadline - now) / 1000));

  // Auto-expire and submit if time ran out
  if (attempt.attemptStatus === AttemptStatus.IN_PROGRESS && now >= deadline) {
    await submitExamAttempt(
      { attemptId: attempt.id, reason: "AUTO_EXPIRED_ON_READ" },
      candidateUser,
      ctx
    );
    attempt.attemptStatus = AttemptStatus.EVALUATED;
  }

  // Fetch booklet questions in sequence order
  const questionMappings = await db.bookletQuestionMapping.findMany({
    where: { bookletSeriesId: attempt.bookletSeriesId },
    orderBy: { displaySequence: "asc" },
    include: {
      occurrence: {
        include: {
          passage: true,
          representations: {
            include: {
              options: true,
            },
          },
        },
      },
      optionMappings: {
        orderBy: { displaySortOrder: "asc" },
        include: {
          sourceOption: true,
        },
      },
    },
  });

  const baselineMarks = Number(attempt.paper.markingScheme?.marksPerCorrect ?? 1);
  const baselinePenalty = Number(attempt.paper.markingScheme?.negativeMarksPerWrong ?? 0);

  const questions: CandidateQuestionView[] = questionMappings.map((bm) => {
    const occ = bm.occurrence;
    // Resolve question representation (prefer verified or original)
    const rep = occ.representations.find((r) => r.isOriginalLanguage) ?? occ.representations[0];

    // Compute effective marks and penalties for candidate display
    const effectiveMarks = occ.marksOverride !== null ? Number(occ.marksOverride) : baselineMarks;
    const effectivePenalty = occ.negativeMarksOverride !== null ? Number(occ.negativeMarksOverride) : baselinePenalty;

    const options = bm.optionMappings.map((om) => ({
      sourceOptionId: om.sourceOptionId,
      displayLabel: om.displayLabel,
      displaySortOrder: om.displaySortOrder,
      optionText: om.sourceOption.optionText,
    }));

    return {
      occurrenceId: occ.id,
      sequenceNumber: bm.displaySequence,
      questionType: occ.questionType,
      questionText: rep?.questionText ?? "",
      languageCode: rep?.languageCode ?? "EN",
      marks: effectiveMarks,
      negativeMarks: effectivePenalty,
      passage: occ.passage
        ? {
            id: occ.passage.id,
            passageRefCode: occ.passage.passageRefCode,
            title: occ.passage.title,
            bodyText: occ.passage.bodyText,
            languageCode: occ.passage.languageCode,
            imageUrl: occ.passage.imageUrl,
            imageAlt: occ.passage.imageAlt,
          }
        : null,
      options,
    };
  });

  const savedResponses: AttemptView["savedResponses"] = {};
  for (const resp of attempt.responses) {
    savedResponses[resp.occurrenceId] = {
      selectedSourceOptionIds: resp.selectedSourceOptionIds,
      displayOptionLabels: resp.displayOptionLabels,
      numericalInput: resp.numericalInput !== null ? Number(resp.numericalInput) : null,
      isMarkedForReview: resp.isMarkedForReview,
      version: resp.version,
      answeredAt: resp.answeredAt ? resp.answeredAt.toISOString() : null,
    };
  }

  return {
    attemptId: attempt.id,
    paperId: attempt.paperId,
    paperCode: attempt.paper.paperCode,
    paperTitle: attempt.paper.title,
    totalDurationMinutes: attempt.paper.totalDurationMinutes,
    totalQuestions: attempt.paper.totalQuestions,
    maxScore: Number(attempt.paper.maxScore),
    attemptStatus: attempt.attemptStatus,
    startedAt: attempt.startedAt.toISOString(),
    expiresAt: (attempt.expiresAt ?? new Date(deadline)).toISOString(),
    submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : null,
    remainingSeconds,
    bookletSeriesCode: attempt.bookletSeries.seriesCode,
    questions,
    savedResponses,
  };
}

/**
 * 3. Save an answer response with strict validation, deadline check, and optimistic concurrency.
 */
export async function saveAttemptAnswer(
  input: SaveAnswerInput,
  candidateUser: CandidateSessionUser,
  ctx?: ExamServiceContext
): Promise<SaveAnswerResult> {
  const db = await getDb(ctx);

  // 1. Authoritative attempt verification
  const attempt = await db.testAttempt.findUnique({
    where: { id: input.attemptId },
    select: {
      id: true,
      paperId: true,
      userId: true,
      attemptStatus: true,
      startedAt: true,
      expiresAt: true,
      paper: {
        select: { totalDurationMinutes: true },
      },
    },
  });

  if (!attempt) {
    throw new ExamServiceError("Examination attempt not found.", "ATTEMPT_NOT_FOUND", 404);
  }

  // Candidate ownership enforcement
  if (attempt.userId !== candidateUser.id) {
    throw new ExamServiceError("Unauthorized: Cannot save answers for another candidate's attempt.", "MCQJ-ERR-6005", 403);
  }

  // Status check: only IN_PROGRESS attempts accept answers
  if (attempt.attemptStatus !== AttemptStatus.IN_PROGRESS) {
    throw new ExamServiceError(
      `Cannot save answers. Examination attempt is currently in ${attempt.attemptStatus} status.`,
      "MCQJ-ERR-6002",
      409
    );
  }

  // Authoritative deadline check
  const now = Date.now();
  const deadline = attempt.expiresAt
    ? attempt.expiresAt.getTime()
    : attempt.startedAt.getTime() + attempt.paper.totalDurationMinutes * 60 * 1000;

  if (now > deadline) {
    // Auto-finalize overdue attempt on server-side path
    if (attempt.attemptStatus === AttemptStatus.IN_PROGRESS) {
      await submitExamAttempt(
        { attemptId: attempt.id, reason: "AUTO_EXPIRED_ON_LATE_SAVE" },
        candidateUser,
        ctx
      ).catch(() => {});
    }
    throw new ExamServiceError(
      "The examination deadline has expired. Answers can no longer be accepted.",
      "MCQJ-ERR-6003",
      403
    );
  }

  // 2. Validate occurrence belongs to this exam paper
  const occurrence = await db.paperQuestionOccurrence.findUnique({
    where: { id: input.occurrenceId },
    select: { id: true, paperId: true },
  });

  if (!occurrence || occurrence.paperId !== attempt.paperId) {
    throw new ExamServiceError("Question occurrence does not belong to this examination paper.", "INVALID_OCCURRENCE", 400);
  }

  // 3. Atomic optimistic concurrency & answer durability write path
  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.attemptResponse.findUnique({
        where: {
          uk_response_attempt_occurrence: {
            attemptId: input.attemptId,
            occurrenceId: input.occurrenceId,
          },
        },
      });

      if (!existing) {
        // First-time response insert
        const created = await tx.attemptResponse.create({
          data: {
            paperId: attempt.paperId,
            attemptId: input.attemptId,
            occurrenceId: input.occurrenceId,
            selectedSourceOptionIds: input.selectedSourceOptionIds,
            displayOptionLabels: input.displayOptionLabels,
            numericalInput: input.numericalInput !== null && input.numericalInput !== undefined ? input.numericalInput : null,
            isMarkedForReview: Boolean(input.isMarkedForReview),
            timeSpentSeconds: input.timeSpentSeconds ?? 0,
            version: 1,
            answeredAt: new Date(),
          },
        });

        return {
          success: true,
          occurrenceId: input.occurrenceId,
          savedAt: created.answeredAt ? created.answeredAt.toISOString() : new Date().toISOString(),
          version: created.version,
          status: "SAVED" as const,
        };
      }

      // Optimistic concurrency comparison: reject stale out-of-order writes
      if (input.clientVersion !== existing.version) {
        return {
          success: false,
          occurrenceId: input.occurrenceId,
          savedAt: (existing.answeredAt ?? new Date()).toISOString(),
          version: existing.version,
          status: "STALE_REJECTED" as const,
          error: `MCQJ-ERR-6001: Stale write rejected. Client version (${input.clientVersion}) does not match server version (${existing.version}).`,
          code: "VERSION_CONFLICT",
        };
      }

      // Monotonically increment version: existing.version + 1 with atomic version predicate
      const nextVersion = existing.version + 1;
      const answeredAt = new Date();
      const updated = await tx.attemptResponse.updateMany({
        where: {
          id: existing.id,
          version: input.clientVersion,
        },
        data: {
          selectedSourceOptionIds: input.selectedSourceOptionIds,
          displayOptionLabels: input.displayOptionLabels,
          numericalInput: input.numericalInput !== null && input.numericalInput !== undefined ? input.numericalInput : null,
          isMarkedForReview: Boolean(input.isMarkedForReview),
          timeSpentSeconds: input.timeSpentSeconds ?? 0,
          version: nextVersion,
          answeredAt,
        },
      });

      if (updated.count === 0) {
        // Another concurrent transaction modified this row between our read and write!
        const current = await tx.attemptResponse.findUnique({ where: { id: existing.id } });
        return {
          success: false,
          occurrenceId: input.occurrenceId,
          savedAt: (current?.answeredAt ?? new Date()).toISOString(),
          version: current?.version ?? existing.version + 1,
          status: "STALE_REJECTED" as const,
          error: `MCQJ-ERR-6001: Concurrent modification conflict. Stored version (${current?.version}) differs from client version (${input.clientVersion}).`,
          code: "VERSION_CONFLICT",
        };
      }

      return {
        success: true,
        occurrenceId: input.occurrenceId,
        savedAt: answeredAt.toISOString(),
        version: nextVersion,
        status: "SAVED" as const,
      };
    });

    return result;
  } catch (saveErr: unknown) {
    const errorWithCode = saveErr as { code?: string } | null;
    if (errorWithCode?.code === "P2002") {
      // Concurrent first-time insert collision caught by unique constraint uk_response_attempt_occurrence
      const existing = await db.attemptResponse.findUnique({
        where: {
          uk_response_attempt_occurrence: {
            attemptId: input.attemptId,
            occurrenceId: input.occurrenceId,
          },
        },
      });
      return {
        success: false,
        occurrenceId: input.occurrenceId,
        savedAt: (existing?.answeredAt ?? new Date()).toISOString(),
        version: existing?.version ?? 1,
        status: "CONFLICT" as const,
        error: "MCQJ-ERR-6001: Concurrent first-time insert collision detected.",
        code: "VERSION_CONFLICT",
      };
    }
    throw mapDatabaseExamError(saveErr);
  }
}

/**
 * 4. Submit and evaluate examination attempt.
 * Strict all-or-nothing scoring, idempotent execution, and two-tier ledger integration.
 */
export async function submitExamAttempt(
  input: SubmitAttemptInput,
  candidateUser: CandidateSessionUser,
  ctx?: ExamServiceContext
): Promise<SubmitAttemptResult> {
  const db = await getDb(ctx);

  // 1. Authoritative attempt lookup
  const attempt = await db.testAttempt.findUnique({
    where: { id: input.attemptId },
    include: {
      paper: {
        include: {
          markingScheme: true,
          sections: {
            include: { scoringOverride: true },
          },
          occurrences: {
            include: {
              representations: {
                include: { options: true },
              },
            },
          },
        },
      },
      evaluations: {
        where: { isCurrentActive: true },
      },
      responses: true,
    },
  });

  if (!attempt) {
    throw new ExamServiceError("Examination attempt not found.", "ATTEMPT_NOT_FOUND", 404);
  }

  // Candidate ownership enforcement
  if (attempt.userId !== candidateUser.id) {
    throw new ExamServiceError("Unauthorized: You do not own this examination attempt.", "MCQJ-ERR-6005", 403);
  }

  // Idempotency: if already evaluated, return existing active evaluation
  if (attempt.attemptStatus === AttemptStatus.EVALUATED && attempt.evaluations.length > 0) {
    const activeEval = attempt.evaluations[0]!;
    return {
      success: true,
      attemptId: attempt.id,
      attemptStatus: AttemptStatus.EVALUATED,
      submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : new Date().toISOString(),
      rawScore: Number(activeEval.rawScore),
      evaluatedDenominator: Number(activeEval.evaluatedDenominator),
      totalQuestions: attempt.paper.totalQuestions,
      totalCorrect: activeEval.totalCorrect,
      totalWrong: activeEval.totalWrong,
      totalUnanswered: activeEval.totalUnanswered,
      message: "Examination was previously submitted and evaluated.",
    };
  }

  // Must be IN_PROGRESS or EXPIRED
  if (
    attempt.attemptStatus !== AttemptStatus.IN_PROGRESS &&
    attempt.attemptStatus !== AttemptStatus.EXPIRED &&
    attempt.attemptStatus !== AttemptStatus.SUBMITTED
  ) {
    throw new ExamServiceError(
      `Cannot submit examination in ${attempt.attemptStatus} status.`,
      "MCQJ-ERR-6004",
      409
    );
  }

  // 2. Fetch authoritative active official answer key
  const officialKeyVersion = await db.answerKeyVersion.findFirst({
    where: {
      paperId: attempt.paperId,
      isOfficial: true,
    },
    orderBy: { versionNumber: "desc" },
    include: {
      items: true,
    },
  });

  if (!officialKeyVersion) {
    throw new ExamServiceError(
      "Official answer key version is not available for scoring.",
      "ANSWER_KEY_NOT_FOUND",
      500
    );
  }

  // 3. Assemble inputs for authoritative scoring engine
  const keyItemMap = new Map(officialKeyVersion.items.map((item) => [item.occurrenceId, item]));
  const responseMap = new Map(attempt.responses.map((resp) => [resp.occurrenceId, resp]));
  const sectionMap = new Map(attempt.paper.sections.map((sec) => [sec.id, sec]));

  const baselineMarks = Number(attempt.paper.markingScheme?.marksPerCorrect ?? 1);
  const baselinePenalty = Number(attempt.paper.markingScheme?.negativeMarksPerWrong ?? 0);

  const scoringInputs: QuestionScoreInput[] = attempt.paper.occurrences.map((occ) => {
    const keyItem = keyItemMap.get(occ.id);
    const resp = responseMap.get(occ.id);
    const section = sectionMap.get(occ.sectionId);

    // Resolve source option IDs matching correct option labels for this occurrence
    const rep = occ.representations.find((r) => r.isOriginalLanguage) ?? occ.representations[0];
    const correctLabelsSet = new Set((keyItem?.correctOptionLabels ?? []).map((l) => l.trim().toUpperCase()));
    const correctSourceOptionIds = (rep?.options ?? [])
      .filter((opt) => correctLabelsSet.has(opt.optionLabel.trim().toUpperCase()))
      .map((opt) => opt.id);

    return {
      occurrenceId: occ.id,
      sequenceNumber: occ.sequenceNumber,
      questionType: occ.questionType as QuestionScoreInput["questionType"],
      paperMarksPerCorrect: baselineMarks,
      paperNegativeMarksPerWrong: baselinePenalty,
      sectionMarksOverride: section?.scoringOverride ? Number(section.scoringOverride.marksPerCorrect) : null,
      sectionNegativeMarksOverride: section?.scoringOverride ? Number(section.scoringOverride.negativeMarksPerWrong) : null,
      occurrenceMarksOverride: occ.marksOverride !== null ? Number(occ.marksOverride) : null,
      occurrenceNegativeMarksOverride: occ.negativeMarksOverride !== null ? Number(occ.negativeMarksOverride) : null,
      keyStatus: (keyItem?.keyStatus ?? "ACTIVE") as QuestionScoreInput["keyStatus"],
      withdrawalPolicy: keyItem?.withdrawalPolicy ?? null,
      correctOptionLabels: keyItem?.correctOptionLabels ?? [],
      correctSourceOptionIds,
      numericalTargetValue: keyItem?.numericalTargetValue !== null && keyItem?.numericalTargetValue !== undefined ? Number(keyItem.numericalTargetValue) : null,
      numericalTolerance: keyItem?.numericalTolerance !== null && keyItem?.numericalTolerance !== undefined ? Number(keyItem.numericalTolerance) : null,
      selectedSourceOptionIds: resp?.selectedSourceOptionIds ?? [],
      displayOptionLabels: resp?.displayOptionLabels ?? [],
      numericalInput: resp?.numericalInput !== null && resp?.numericalInput !== undefined ? Number(resp.numericalInput) : null,
    };
  });

  // Strict all-or-nothing scoring evaluation
  const scoreSummary = calculateAttemptScore(scoringInputs);

  const submittedAt = new Date();

  // 4. Atomic transaction: freeze attempt, record score, transition to EVALUATED
  try {
    const result = await db.$transaction(async (tx) => {
      // Step A: Update attempt status conditionally to guard against concurrent submission races
      const updateRes = await tx.testAttempt.updateMany({
        where: {
          id: attempt.id,
          attemptStatus: { in: [AttemptStatus.IN_PROGRESS, AttemptStatus.EXPIRED] },
        },
        data: {
          attemptStatus: AttemptStatus.SUBMITTED,
          submittedAt,
        },
      });

      if (updateRes.count === 0) {
        // Another concurrent submission or auto-expiration won the race: return existing evaluation
        const existingEval = await tx.attemptEvaluationRecord.findFirst({
          where: { attemptId: attempt.id, isCurrentActive: true },
        });
        const currentAtt = await tx.testAttempt.findUnique({
          where: { id: attempt.id },
        });
        if (existingEval && currentAtt) {
          return { evaluation: existingEval, finalizedAttempt: currentAtt };
        }
      }

      // Step B: Insert Two-Tier Evaluation Record (v1 original) - idempotent check
      let evaluation = await tx.attemptEvaluationRecord.findFirst({
        where: { attemptId: attempt.id, evaluationVersion: 1 },
      });

      if (!evaluation) {
        evaluation = await tx.attemptEvaluationRecord.create({
          data: {
            attemptId: attempt.id,
            keyVersionId: officialKeyVersion.id,
            evaluationVersion: 1,
            isCurrentActive: true,
            isOriginalAttempt: true,
            rawScore: scoreSummary.rawScore,
            evaluatedDenominator: scoreSummary.evaluatedDenominator,
            totalCorrect: scoreSummary.totalCorrect,
            totalWrong: scoreSummary.totalWrong,
            totalUnanswered: scoreSummary.totalUnanswered,
            perQuestionScoreJson: scoreSummary.questionBreakdowns,
            adjudicationReason: input.reason ?? "Authoritative candidate final submission",
            evaluatedAt: submittedAt,
          },
        });
      }

      // Step C: Transition to terminal EVALUATED status
      const finalizedAttempt = await tx.testAttempt.update({
        where: { id: attempt.id },
        data: {
          attemptStatus: AttemptStatus.EVALUATED,
        },
      });

      return { evaluation, finalizedAttempt };
    });

    return {
      success: true,
      attemptId: result.finalizedAttempt.id,
      attemptStatus: result.finalizedAttempt.attemptStatus,
      submittedAt: submittedAt.toISOString(),
      rawScore: scoreSummary.rawScore,
      evaluatedDenominator: scoreSummary.evaluatedDenominator,
      totalQuestions: attempt.paper.totalQuestions,
      totalCorrect: scoreSummary.totalCorrect,
      totalWrong: scoreSummary.totalWrong,
      totalUnanswered: scoreSummary.totalUnanswered,
      message: "Examination submitted and evaluated successfully.",
    };
  } catch (evalErr) {
    throw mapDatabaseExamError(evalErr);
  }
}

/**
 * 5. Autonomous server-side recovery: finalize all overdue examination attempts.
 * Queries attempts in IN_PROGRESS status whose expires_at has passed,
 * and finalizes them idempotently through submitExamAttempt.
 */
export async function finalizeOverdueAttempts(
  paperId?: string,
  ctx?: ExamServiceContext
): Promise<{ finalizedCount: number; attemptIds: string[] }> {
  const db = await getDb(ctx);
  const now = new Date();

  const overdueAttempts = await db.testAttempt.findMany({
    where: {
      attemptStatus: AttemptStatus.IN_PROGRESS,
      expiresAt: { lte: now },
      ...(paperId ? { paperId } : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      },
    },
  });

  const finalizedIds: string[] = [];

  for (const att of overdueAttempts) {
    if (!att.user) continue;
    try {
      const candidateUser: CandidateSessionUser = {
        id: att.user.id,
        email: att.user.email,
        name: att.user.name,
        role: att.user.role,
        bannedUntil: null,
      };

      await submitExamAttempt(
        { attemptId: att.id, reason: "SYSTEM_SWEEP_EXPIRED" },
        candidateUser,
        ctx
      );
      finalizedIds.push(att.id);
    } catch {
      // If already finalized or race occurred, skip gracefully
    }
  }

  return {
    finalizedCount: finalizedIds.length,
    attemptIds: finalizedIds,
  };
}

