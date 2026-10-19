// ============================================================================
// MCQ Junction — Concept & Learning Service Layer
// File: src/lib/concept/service.ts
// ============================================================================

import { Role } from "../../generated/prisma/enums.ts";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.ts";
import type {
  DetailedConceptData,
  LearningQuestionData,
  LearningOptionData,
  ConceptReference,
} from "../../types/concept.ts";
import { sanitizeExternalUrl } from "./url-validator.ts";

/**
 * Custom domain errors for Concept & Learning workflows.
 */
export class ConceptNotFoundError extends Error {
  constructor(conceptId: string) {
    super(`Detailed concept not found for ID: ${conceptId}`);
    this.name = "ConceptNotFoundError";
  }
}

export class ConceptForbiddenError extends Error {
  constructor(message = "Access to unpublished learning concept is forbidden.") {
    super(message);
    this.name = "ConceptForbiddenError";
  }
}

/**
 * Retrieves a detailed concept by ID.
 * Enforces published paper authorization: if caller is not an ADMIN,
 * the concept must be linked to at least one published paper occurrence.
 */
export async function getDetailedConceptById(
  conceptId: string,
  userRole: Role = Role.STUDENT,
  prismaClient?: PrismaClient
): Promise<DetailedConceptData> {
  const db = (prismaClient ?? (await import("../prisma.ts")).prisma) as PrismaClient;
  const concept = await db.detailedConcept.findUnique({
    where: { id: conceptId },
    include: {
      options: {
        include: {
          representation: {
            include: {
              occurrence: {
                include: {
                  paper: {
                    select: {
                      id: true,
                      publishStatus: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!concept) {
    throw new ConceptNotFoundError(conceptId);
  }

  // Authorization check for non-admin users
  if (userRole !== Role.ADMIN) {
    const isAssociatedWithPublishedPaper = concept.options.some(
      (opt) => opt.representation.occurrence.paper.publishStatus === "PUBLISHED"
    );

    // If options exist but none are published, forbid access
    if (concept.options.length > 0 && !isAssociatedWithPublishedPaper) {
      throw new ConceptForbiddenError();
    }
  }

  // Sanitize references JSON
  let safeReferences: ConceptReference[] = [];
  if (Array.isArray(concept.references)) {
    const rawRefs = concept.references as Array<Record<string, unknown>>;
    safeReferences = rawRefs
      .filter((ref) => ref && typeof ref === "object" && typeof ref.title === "string" && typeof ref.url === "string")
      .map((ref) => ({
        title: String(ref.title).trim(),
        url: sanitizeExternalUrl(String(ref.url)) || "",
        type: ref.type as ConceptReference["type"],
      }))
      .filter((ref) => Boolean(ref.url));
  }

  return {
    id: concept.id,
    title: concept.title,
    content: concept.content,
    keyPoints: concept.keyPoints,
    imageUrl: concept.imageUrl,
    imageAlt: concept.imageAlt,
    imageCaption: concept.imageCaption,
    videoUrl: concept.videoUrl,
    videoTitle: concept.videoTitle,
    references: safeReferences,
    createdAt: concept.createdAt,
    updatedAt: concept.updatedAt,
  };
}

/**
 * Retrieves published questions formatted for Learning Mode.
 */
export async function getLearningQuestions(options?: {
  paperId?: string;
  limit?: number;
  userRole?: Role;
  prismaClient?: PrismaClient;
}): Promise<LearningQuestionData[]> {
  const userRole = options?.userRole ?? Role.STUDENT;
  const limit = options?.limit ?? 10;

  const whereClause: Prisma.PaperQuestionOccurrenceWhereInput = {};
  if (options?.paperId) {
    whereClause.paperId = options.paperId;
  }

  // Non-admins can strictly only practice with PUBLISHED papers
  if (userRole !== Role.ADMIN) {
    whereClause.paper = {
      publishStatus: "PUBLISHED",
    };
  }

  const db = (options?.prismaClient ?? (await import("../prisma.ts")).prisma) as PrismaClient;
  const occurrences = await db.paperQuestionOccurrence.findMany({
    where: whereClause,
    take: limit,
    orderBy: {
      sequenceNumber: "asc",
    },
    include: {
      paper: {
        select: {
          id: true,
          title: true,
          publishStatus: true,
        },
      },
      conceptualQuestion: true,
      passage: true,
      representations: {
        where: {
          isOriginalLanguage: true,
        },
        include: {
          options: {
            orderBy: {
              sortOrder: "asc",
            },
            include: {
              concept: true,
            },
          },
        },
      },
      answerKeyItems: {
        where: {
          keyStatus: "ACTIVE",
        },
        include: {
          keyVersion: true,
        },
      },
    },
  });

  return occurrences.map((occ) => {
    const rep = occ.representations[0];
    const activeKeyItem = occ.answerKeyItems[0];
    const correctLabels = new Set(activeKeyItem?.correctOptionLabels || []);

    const learningOptions: LearningOptionData[] = (rep?.options || []).map((opt) => ({
      id: opt.id,
      optionLabel: opt.optionLabel,
      optionText: opt.optionText,
      sortOrder: opt.sortOrder,
      isCorrect: correctLabels.has(opt.optionLabel),
      explanationText: opt.explanationText,
      conceptId: opt.conceptId,
      concept: opt.concept
        ? {
            id: opt.concept.id,
            title: opt.concept.title,
            content: opt.concept.content,
            keyPoints: opt.concept.keyPoints,
            imageUrl: opt.concept.imageUrl,
            imageAlt: opt.concept.imageAlt,
            imageCaption: opt.concept.imageCaption,
            videoUrl: opt.concept.videoUrl,
            videoTitle: opt.concept.videoTitle,
            references: Array.isArray(opt.concept.references)
              ? (opt.concept.references as unknown as ConceptReference[])
              : [],
            createdAt: opt.concept.createdAt,
            updatedAt: opt.concept.updatedAt,
          }
        : null,
    }));

    return {
      occurrenceId: occ.id,
      sequenceNumber: occ.sequenceNumber,
      paperId: occ.paper.id,
      paperTitle: occ.paper.title,
      paperStatus: occ.paper.publishStatus,
      primarySubject: occ.conceptualQuestion.primarySubject,
      defaultTopic: occ.conceptualQuestion.defaultTopic,
      questionType: occ.questionType as LearningQuestionData["questionType"],
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
      questionText: rep?.questionText || "Question text unavailable",
      languageCode: rep?.languageCode || "EN",
      options: learningOptions,
      overallExplanation: rep?.explanationText,
    };
  });
}
