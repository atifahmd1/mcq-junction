import {
  assertAdminSession,
  type AdminSessionUser,
  type SessionPrismaClient,
  UnauthorizedError,
  ForbiddenError,
} from "../auth/session.ts";
import {
  publishPaperSchema,
  reevaluatePaperSchema,
  swapQuestionSequenceSchema,
  type PublishPaperInput,
  type ReevaluatePaperInput,
  type SwapQuestionSequenceInput,
} from "./schemas.ts";
import { validateQuestionConfiguration } from "../questions/validation.ts";
import {
  parseQuestionsFromCsv,
  serializeQuestionsToCsv,
  type QuestionExportRow,
} from "../questions/import-export.ts";
import type { QuestionType, LanguageCode } from "../../generated/prisma/enums.ts";
import type { PrismaClient } from "../../generated/prisma/client.ts";

export class AdminServiceError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code = "MCQJ_ADMIN_ERROR", statusCode = 400) {
    super(message);
    this.name = "AdminServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface PublicationResult {
  success: boolean;
  paper_id: string;
  publish_status: "PUBLISHED";
  published_at: string;
  published_by: string;
}

export interface ReevaluationResult {
  success: boolean;
  paper_id: string;
  key_version_id: string;
  attempts_reevaluated: number;
  adjudicated_by: string;
}

export interface SwapSequenceResult {
  success: boolean;
  paperId: string;
  occurrenceA: { id: string; newSequence: number };
  occurrenceB: { id: string; newSequence: number };
}

/**
 * Maps PostgreSQL domain exceptions (MCQJ-ERR-*) to user-safe error messages.
 * Sanitizes any raw database/driver details to prevent secret or schema leaks.
 */
export function mapDatabaseDomainError(err: unknown): AdminServiceError {
  if (err instanceof AdminServiceError || err instanceof UnauthorizedError || err instanceof ForbiddenError) {
    return err as AdminServiceError;
  }

  const rawMessage = err instanceof Error ? err.message : String(err);

  // Match known MCQ Junction PostgreSQL error codes
  const match = rawMessage.match(/MCQJ-ERR-(\d{4}):\s*(.*)/);
  if (match) {
    const code = `MCQJ-ERR-${match[1]}`;
    const cleanDetail = match[2].trim();

    switch (match[1]) {
      case "5001":
        return new AdminServiceError("The requested exam paper does not exist.", code, 404);
      case "5002":
        return new AdminServiceError("The exam paper is already published.", code, 409);
      case "5003":
        return new AdminServiceError("Exam paper must be in VERIFIED status before publication.", code, 422);
      case "5004":
        return new AdminServiceError("Exam paper lacks a baseline marking scheme.", code, 422);
      case "5005":
        return new AdminServiceError("Exam paper contains zero sections.", code, 422);
      case "5006":
        return new AdminServiceError("Sum of section questions does not equal paper total questions.", code, 422);
      case "5007":
        return new AdminServiceError("Actual occurrences count does not equal expected total questions.", code, 422);
      case "5008":
        return new AdminServiceError("Question sequence numbers are not contiguous.", code, 422);
      case "5009":
        return new AdminServiceError("Cannot publish paper with unverified question drafts. Editorial review required.", code, 422);
      case "5010":
        return new AdminServiceError("Paper contains comprehension questions without linked passages.", code, 422);
      case "5011":
      case "5012":
        return new AdminServiceError("Master booklet series is incomplete or missing question mappings.", code, 422);
      case "5013":
      case "5014":
        return new AdminServiceError("Answer key verification failed: official answer keys are incomplete or invalid.", code, 422);
      case "5015":
        return new AdminServiceError("Caller does not possess administrative privileges to execute this operation.", code, 403);
      case "5016":
        return new AdminServiceError("Only published exam papers can be re-evaluated.", code, 409);
      case "5017":
        return new AdminServiceError("The specified answer key version was not found for this exam paper.", code, 404);
      case "5018":
        return new AdminServiceError("The specified answer key version is not official.", code, 422);
      default:
        return new AdminServiceError(`Publication gate violation: ${cleanDetail}`, code, 422);
    }
  }

  // Handle transaction aborted or foreign key constraints
  if (rawMessage.includes("violates foreign key constraint")) {
    return new AdminServiceError("Referenced resource was not found.", "MCQJ_FK_ERROR", 404);
  }

  // Generic sanitized fallback: never expose raw SQL, passwords, or connection strings
  console.error("Internal Database Service Failure (sanitized for client):", rawMessage);
  return new AdminServiceError(
    "A database error occurred while processing the administrative operation.",
    "INTERNAL_DATABASE_ERROR",
    500
  );
}

export interface ServicePrismaClient {
  $queryRaw: <T = unknown[]>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  user?: SessionPrismaClient["user"];
}

export interface ServiceExecutionOptions {
  prismaClient?: ServicePrismaClient;
  sessionOverride?: AdminSessionUser;
}

/**
 * Publishes an exam paper through the master atomic publication gate procedure.
 *
 * Sequence:
 * 1. Validates paper UUID input with Zod.
 * 2. Authenticates and authorizes caller via assertAdminSession().
 * 3. Invokes stored procedure fn_publish_exam_paper using parameterized Prisma query.
 * 4. Passes verified administrator UUID explicitly (never trusts client-supplied user IDs).
 * 5. Maps domain errors safely without leaking internal database strings.
 */
export async function publishExamPaper(
  input: PublishPaperInput,
  options?: ServiceExecutionOptions
): Promise<PublicationResult> {
  // 1. Zod input validation
  const validated = publishPaperSchema.parse(input);

  const db = options?.prismaClient ?? (await import("../prisma.ts")).prisma;

  // 2. Server-side session & role verification
  const admin = options?.sessionOverride ?? (await assertAdminSession({ prismaClient: db }));

  // 3. Stored procedure invocation with parameterized arguments
  try {
    const rows = await db.$queryRaw<Array<{ fn_publish_exam_paper: PublicationResult }>>`
      SELECT fn_publish_exam_paper(
        ${validated.paperId}::uuid,
        ${admin.id}::uuid
      );
    `;

    if (!rows || rows.length === 0 || !rows[0]?.fn_publish_exam_paper) {
      throw new AdminServiceError("Database procedure returned empty result", "EMPTY_PROCEDURE_RESULT", 500);
    }

    const result = rows[0].fn_publish_exam_paper as PublicationResult;
    if (!result.success) {
      throw new AdminServiceError("Publication failed according to database procedure", "PUBLICATION_FAILED", 500);
    }

    return result;
  } catch (err) {
    throw mapDatabaseDomainError(err);
  }
}

/**
 * Re-evaluates all submitted attempts for a published exam paper against a new official answer key.
 *
 * Sequence:
 * 1. Validates paper UUID, key version UUID, and optional adjudication reason with Zod.
 * 2. Authenticates and authorizes caller via assertAdminSession().
 * 3. Invokes stored procedure fn_reevaluate_paper_attempts using parameterized Prisma query.
 * 4. Preserves historical evaluation v1 records immutable while recording new active evaluation version.
 * 5. Maps domain errors safely.
 */
export async function reevaluatePaperAttempts(
  input: ReevaluatePaperInput,
  options?: ServiceExecutionOptions
): Promise<ReevaluationResult> {
  // 1. Zod input validation
  const validated = reevaluatePaperSchema.parse(input);

  const db = options?.prismaClient ?? (await import("../prisma.ts")).prisma;

  // 2. Server-side session & role verification
  const admin = options?.sessionOverride ?? (await assertAdminSession({ prismaClient: db }));

  const reason = validated.adjudicationReason ?? "Official answer key update re-evaluation";

  // 3. Stored procedure invocation with parameterized arguments
  try {
    const rows = await db.$queryRaw<Array<{ fn_reevaluate_paper_attempts: ReevaluationResult }>>`
      SELECT fn_reevaluate_paper_attempts(
        ${validated.paperId}::uuid,
        ${validated.newKeyVersionId}::uuid,
        ${admin.id}::uuid,
        ${reason}::text
      );
    `;

    if (!rows || rows.length === 0 || !rows[0]?.fn_reevaluate_paper_attempts) {
      throw new AdminServiceError("Database procedure returned empty result", "EMPTY_PROCEDURE_RESULT", 500);
    }

    const result = rows[0].fn_reevaluate_paper_attempts as ReevaluationResult;
    if (!result.success) {
      throw new AdminServiceError("Re-evaluation failed according to database procedure", "REEVALUATION_FAILED", 500);
    }

    return result;
  } catch (err) {
    throw mapDatabaseDomainError(err);
  }
}

/**
 * Swaps sequence positions between two question occurrences in an unpublished paper.
 *
 * Invariants:
 * 1. Validates input UUIDs via Zod schema.
 * 2. Caller must be an authenticated administrator (assertAdminSession).
 * 3. Enforces published content immutability: rejects reordering if paper is PUBLISHED.
 * 4. Ensures both occurrences belong to the specified paper.
 * 5. Performs atomic single-statement swap to avoid unique constraint violations.
 */
export async function swapQuestionSequence(
  input: SwapQuestionSequenceInput,
  options?: ServiceExecutionOptions
): Promise<SwapSequenceResult> {
  // 1. Zod input validation
  const validated = swapQuestionSequenceSchema.parse(input);

  if (validated.occurrenceIdA === validated.occurrenceIdB) {
    throw new AdminServiceError("Cannot swap a question with itself.", "MCQJ_IDENTICAL_OCCURRENCES", 422);
  }

  const db = options?.prismaClient ?? (await import("../prisma.ts")).prisma;

  // 2. Server-side session & role verification
  await (options?.sessionOverride ? Promise.resolve(options.sessionOverride) : assertAdminSession({ prismaClient: db }));

  try {
    // 3. Verify paper status (immutability check)
    const paperRows = await db.$queryRaw<Array<{ id: string; publish_status: string }>>`
      SELECT id, publish_status
      FROM exam_papers
      WHERE id = ${validated.paperId}::uuid
    `;

    if (!paperRows || paperRows.length === 0) {
      throw new AdminServiceError("The requested exam paper does not exist.", "MCQJ-ERR-5001", 404);
    }

    if (paperRows[0].publish_status === "PUBLISHED") {
      throw new AdminServiceError(
        "Cannot reorder questions in a published exam paper. Published content is immutable.",
        "MCQJ_IMMUTABLE_ERROR",
        409
      );
    }

    // 4. Retrieve both occurrences
    const occurrences = await db.$queryRaw<Array<{ id: string; paper_id: string; sequence_number: number }>>`
      SELECT id, paper_id, sequence_number
      FROM paper_question_occurrences
      WHERE id IN (${validated.occurrenceIdA}::uuid, ${validated.occurrenceIdB}::uuid)
        AND paper_id = ${validated.paperId}::uuid
    `;

    if (!occurrences || occurrences.length !== 2) {
      throw new AdminServiceError(
        "One or both question occurrences were not found for this exam paper.",
        "MCQJ_OCCURRENCE_NOT_FOUND",
        404
      );
    }

    const occA = occurrences.find((o) => o.id === validated.occurrenceIdA);
    const occB = occurrences.find((o) => o.id === validated.occurrenceIdB);

    if (!occA || !occB) {
      throw new AdminServiceError(
        "Invalid occurrence mapping for this exam paper.",
        "MCQJ_OCCURRENCE_NOT_FOUND",
        404
      );
    }

    // 5. Adjacency validation: only adjacent questions can be swapped
    if (Math.abs(occA.sequence_number - occB.sequence_number) !== 1) {
      throw new AdminServiceError(
        `Only adjacent question occurrences can be swapped (occurrences have sequences ${occA.sequence_number} and ${occB.sequence_number}).`,
        "MCQJ_NONADJACENT_OCCURRENCES",
        422
      );
    }

    // 6. 3-step atomic sequence swap preventing unique index collisions (uk_occurrence_paper_seq)
    // In PostgreSQL, unique index evaluates row-by-row during updates.
    // Setting occA to negative sequence temporarily ensures zero uniqueness collision.
    const r1 = await db.$queryRaw<Array<{ id: string }>>`
      UPDATE paper_question_occurrences
      SET sequence_number = -${occB.sequence_number}::int
      WHERE id = ${occA.id}::uuid AND sequence_number = ${occA.sequence_number}::int AND paper_id = ${validated.paperId}::uuid
      RETURNING id;
    `;

    if (!r1 || r1.length !== 1) {
      throw new AdminServiceError(
        "Sequence swap failed due to concurrent modification or stale state. Please refresh.",
        "MCQJ_CONCURRENT_SWAP_CONFLICT",
        409
      );
    }

    const r2 = await db.$queryRaw<Array<{ id: string }>>`
      UPDATE paper_question_occurrences
      SET sequence_number = ${occA.sequence_number}::int
      WHERE id = ${occB.id}::uuid AND sequence_number = ${occB.sequence_number}::int AND paper_id = ${validated.paperId}::uuid
      RETURNING id;
    `;

    if (!r2 || r2.length !== 1) {
      // Roll back occA
      await db.$queryRaw`
        UPDATE paper_question_occurrences
        SET sequence_number = ${occA.sequence_number}::int
        WHERE id = ${occA.id}::uuid AND paper_id = ${validated.paperId}::uuid;
      `;
      throw new AdminServiceError(
        "Sequence swap failed due to concurrent modification or stale state. Please refresh.",
        "MCQJ_CONCURRENT_SWAP_CONFLICT",
        409
      );
    }

    const r3 = await db.$queryRaw<Array<{ id: string }>>`
      UPDATE paper_question_occurrences
      SET sequence_number = ${occB.sequence_number}::int,
          updated_at = clock_timestamp()
      WHERE id = ${occA.id}::uuid AND sequence_number = -${occB.sequence_number}::int AND paper_id = ${validated.paperId}::uuid
      RETURNING id;
    `;

    if (!r3 || r3.length !== 1) {
      throw new AdminServiceError(
        "Sequence swap failed due to concurrent modification or stale state. Please refresh.",
        "MCQJ_CONCURRENT_SWAP_CONFLICT",
        409
      );
    }

    return {
      success: true,
      paperId: validated.paperId,
      occurrenceA: { id: occA.id, newSequence: occB.sequence_number },
      occurrenceB: { id: occB.id, newSequence: occA.sequence_number },
    };
  } catch (err) {
    throw mapDatabaseDomainError(err);
  }
}

/**
 * Creates or updates a question on an exam paper.
 * Enforces paper immutability: published papers strictly reject modification.
 */
export async function createOrUpdateQuestion(
  p_admin_user_id: string,
  payload: unknown,
  prismaClient?: PrismaClient
): Promise<{ success: boolean; occurrenceId: string; sequenceNumber: number }> {
  const db = (prismaClient ?? (await import("../prisma.ts")).prisma) as PrismaClient;

  const validation = validateQuestionConfiguration(payload);
  if (!validation.valid || !validation.data) {
    throw new AdminServiceError(
      `Question validation failed: ${validation.errors.join("; ")}`,
      "MCQJ_VALIDATION_ERROR",
      422
    );
  }

  const data = validation.data;

  // 1. Verify paper exists and is mutable
  const paper = await db.examPaper.findUnique({
    where: { id: data.paperId },
    select: { id: true, paperCode: true, publishStatus: true, totalQuestions: true },
  });

  if (!paper) {
    throw new AdminServiceError("Exam paper not found", "MCQJ_PAPER_NOT_FOUND", 404);
  }

  if (paper.publishStatus === "PUBLISHED" || paper.publishStatus === "ARCHIVED") {
    throw new AdminServiceError(
      "Cannot add or modify questions on a PUBLISHED exam paper. Content is immutable.",
      "MCQJ_IMMUTABLE_ERROR",
      409
    );
  }

  // 2. Resolve section
  let targetSectionId = data.sectionId;
  if (!targetSectionId) {
    const existingSection = await db.paperSection.findFirst({
      where: { paperId: data.paperId },
      orderBy: { sectionOrder: "asc" },
    });
    if (existingSection) {
      targetSectionId = existingSection.id;
    } else {
      const newSec = await db.paperSection.create({
        data: {
          paperId: data.paperId,
          sectionOrder: 1,
          title: "Section A",
          totalQuestions: 1,
        },
      });
      targetSectionId = newSec.id;
    }
  }

  // 3. Resolve sequence number
  let targetSeq = data.sequenceNumber;
  if (!targetSeq) {
    const maxSeqAgg = await db.paperQuestionOccurrence.aggregate({
      where: { paperId: data.paperId },
      _max: { sequenceNumber: true },
    });
    targetSeq = (maxSeqAgg._max.sequenceNumber ?? 0) + 1;
  }

  // 4. Resolve Canonical Ref Code
  const canonicalRef =
    data.canonicalRefCode ||
    `CQ-${paper.paperCode || paper.id.slice(0, 8)}-${targetSeq}`;

  const dbQuestionType = data.questionType as unknown as QuestionType;

  // 5. Database Transaction to insert all question components atomically
  const result = await db.$transaction(async (tx) => {
    // 5a. Upsert Conceptual Question
    const cq = await tx.conceptualQuestion.upsert({
      where: { canonicalRefCode: canonicalRef },
      create: {
        canonicalRefCode: canonicalRef,
        primarySubject: data.primarySubject,
        defaultTopic: data.defaultTopic,
        questionType: dbQuestionType,
      },
      update: {
        primarySubject: data.primarySubject,
        defaultTopic: data.defaultTopic,
        questionType: dbQuestionType,
      },
    });

    // 5a.2 Resolve Comprehension Passage if configured
    let targetPassageId: string | null = data.passageId || null;
    if (data.passageRefCode && data.passageBodyText) {
      const passage = await tx.comprehensionPassage.upsert({
        where: { passageRefCode: data.passageRefCode },
        create: {
          passageRefCode: data.passageRefCode,
          title: data.passageTitle || null,
          bodyText: data.passageBodyText,
          languageCode: (data.passageLanguage as LanguageCode) || "EN",
          imageUrl: data.passageImageUrl || null,
          imageAlt: data.passageImageAlt || null,
        },
        update: {
          title: data.passageTitle || null,
          bodyText: data.passageBodyText,
          languageCode: (data.passageLanguage as LanguageCode) || "EN",
          imageUrl: data.passageImageUrl || null,
          imageAlt: data.passageImageAlt || null,
        },
      });
      targetPassageId = passage.id;
    } else if (data.passageRefCode) {
      const existingPassage = await tx.comprehensionPassage.findUnique({
        where: { passageRefCode: data.passageRefCode },
      });
      if (existingPassage) {
        targetPassageId = existingPassage.id;
      }
    }

    // 5b. Create Paper Question Occurrence
    const occ = await tx.paperQuestionOccurrence.create({
      data: {
        paperId: data.paperId,
        sectionId: targetSectionId!,
        conceptualQuestionId: cq.id,
        passageId: targetPassageId,
        sequenceNumber: targetSeq!,
        questionType: dbQuestionType,
        marksOverride:
          data.marksOverride !== undefined && data.marksOverride !== null
            ? String(data.marksOverride)
            : null,
        negativeMarksOverride:
          data.negativeMarksOverride !== undefined && data.negativeMarksOverride !== null
            ? String(data.negativeMarksOverride)
            : null,
      },
    });

    // 5c. Format Question Text for ASSERTION_REASON if applicable
    let finalQuestionText = data.questionText;
    if (data.questionType === "ASSERTION_REASON" && data.assertionText && data.reasonText) {
      if (!finalQuestionText.includes(data.assertionText)) {
        finalQuestionText = `${finalQuestionText}\n\nAssertion (A): ${data.assertionText}\nReason (R): ${data.reasonText}`;
      }
    }

    // 5d. Create Source Question Representation
    const rep = await tx.sourceQuestionRepresentation.create({
      data: {
        occurrenceId: occ.id,
        languageCode: "EN",
        questionText: finalQuestionText,
        isOriginalLanguage: true,
        editorialVerified: false,
        explanationText: data.overallExplanation || null,
      },
    });

    // 5e. Create Question Options
    for (let i = 0; i < data.options.length; i++) {
      const opt = data.options[i];
      await tx.questionOption.create({
        data: {
          representationId: rep.id,
          optionLabel: opt.optionLabel.toUpperCase(),
          optionText: opt.optionText,
          sortOrder: opt.sortOrder ?? i + 1,
          explanationText: opt.explanationText || null,
          conceptId: opt.conceptId || null,
        },
      });
    }

    // 5f. Sync with Active Answer Key Version
    let keyVersion = await tx.answerKeyVersion.findFirst({
      where: { paperId: data.paperId, isOfficial: true },
      orderBy: { versionNumber: "desc" },
    });

    if (!keyVersion) {
      keyVersion = await tx.answerKeyVersion.create({
        data: {
          paperId: data.paperId,
          versionNumber: 1,
          versionTag: "v1.0-draft",
          isOfficial: true,
        },
      });
    }

    const correctLabels = data.options
      .filter((o) => o.isCorrect)
      .map((o) => o.optionLabel.toUpperCase());

    await tx.answerKeyItem.upsert({
      where: {
        uk_key_item_version_occurrence: {
          keyVersionId: keyVersion.id,
          occurrenceId: occ.id,
        },
      },
      create: {
        paperId: data.paperId,
        keyVersionId: keyVersion.id,
        occurrenceId: occ.id,
        keyStatus: "ACTIVE",
        correctOptionLabels: correctLabels,
      },
      update: {
        correctOptionLabels: correctLabels,
      },
    });

    // 5g. Update ExamPaper total_questions count
    await tx.examPaper.update({
      where: { id: data.paperId },
      data: { totalQuestions: { increment: 1 } },
    });

    return {
      occurrenceId: occ.id,
      sequenceNumber: occ.sequenceNumber,
    };
  });

  return {
    success: true,
    occurrenceId: result.occurrenceId,
    sequenceNumber: result.sequenceNumber,
  };
}

/**
 * Imports questions from CSV into a draft exam paper.
 */
export async function importQuestionsFromCsv(
  p_admin_user_id: string,
  paperId: string,
  csvContent: string,
  prismaClient?: PrismaClient
): Promise<{ success: boolean; importedCount: number; errors: Array<{ row: number; message: string }> }> {
  const db = (prismaClient ?? (await import("../prisma.ts")).prisma) as PrismaClient;

  // 1. Verify paper is mutable
  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: { id: true, publishStatus: true },
  });

  if (!paper) {
    throw new AdminServiceError("Exam paper not found", "MCQJ_PAPER_NOT_FOUND", 404);
  }

  if (paper.publishStatus === "PUBLISHED" || paper.publishStatus === "ARCHIVED") {
    throw new AdminServiceError(
      "Cannot import questions into a PUBLISHED exam paper. Content is immutable.",
      "MCQJ_IMMUTABLE_ERROR",
      409
    );
  }

  // 2. Parse and validate CSV
  const parseResult = parseQuestionsFromCsv(csvContent, paperId);
  if (parseResult.errors.length > 0) {
    return {
      success: false,
      importedCount: 0,
      errors: parseResult.errors,
    };
  }

  // 3. Batch import validated questions
  for (const questionPayload of parseResult.validQuestions) {
    await createOrUpdateQuestion(p_admin_user_id, questionPayload, db);
  }

  return {
    success: true,
    importedCount: parseResult.validQuestions.length,
    errors: [],
  };
}

/**
 * Exports exam paper questions to CSV format.
 */
export async function exportQuestionsToCsv(
  paperId: string,
  prismaClient?: PrismaClient
): Promise<string> {
  const db = (prismaClient ?? (await import("../prisma.ts")).prisma) as PrismaClient;

  const occurrences = await db.paperQuestionOccurrence.findMany({
    where: { paperId },
    orderBy: { sequenceNumber: "asc" },
    include: {
      conceptualQuestion: true,
      passage: true,
      representations: {
        include: {
          options: {
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      answerKeyItems: {
        where: { keyStatus: "ACTIVE" },
      },
    },
  });

  const exportRows: QuestionExportRow[] = occurrences.map((occ) => {
    const rep = occ.representations[0];
    const options = rep?.options || [];
    const activeKey = occ.answerKeyItems[0];

    const getOpt = (label: string) =>
      options.find((o) => o.optionLabel.toUpperCase() === label.toUpperCase())?.optionText || "";

    return {
      sequenceNumber: occ.sequenceNumber,
      questionType: occ.questionType,
      canonicalRefCode: occ.conceptualQuestion.canonicalRefCode,
      primarySubject: occ.conceptualQuestion.primarySubject,
      defaultTopic: occ.conceptualQuestion.defaultTopic,
      passageRefCode: occ.passage?.passageRefCode || null,
      passageTitle: occ.passage?.title || null,
      passageBodyText: occ.passage?.bodyText || null,
      passageLanguage: occ.passage?.languageCode || null,
      passageImageUrl: occ.passage?.imageUrl || null,
      passageImageAlt: occ.passage?.imageAlt || null,
      questionText: rep?.questionText || "",
      assertionText: null,
      reasonText: null,
      optionA: getOpt("A"),
      optionB: getOpt("B"),
      optionC: getOpt("C"),
      optionD: getOpt("D"),
      optionE: getOpt("E"),
      correctAnswers: (activeKey?.correctOptionLabels || []).join(","),
      overallExplanation: rep?.explanationText || null,
      marksOverride: occ.marksOverride ? Number(occ.marksOverride) : null,
      negativeMarksOverride: occ.negativeMarksOverride ? Number(occ.negativeMarksOverride) : null,
    };
  });

  return serializeQuestionsToCsv(exportRows);
}

