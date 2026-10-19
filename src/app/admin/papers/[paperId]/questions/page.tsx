import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import QuestionAuthoringClient from "./QuestionAuthoringClient";

export const instant = false;

interface QuestionsPageProps {
  params: Promise<{
    paperId: string;
  }>;
}

export default async function PaperQuestionsPage({ params }: QuestionsPageProps) {
  await connection();
  const { paperId } = await params;

  let paper = null;

  try {
    paper = await prisma.examPaper.findUnique({
      where: { id: paperId },
      include: {
        session: {
          include: {
            exam: {
              include: {
                conductingBody: true,
              },
            },
          },
        },
        sections: {
          orderBy: { sectionOrder: "asc" },
        },
        occurrences: {
          orderBy: { sequenceNumber: "asc" },
          include: {
            section: true,
            conceptualQuestion: true,
            passage: true,
            representations: {
              take: 1,
              include: {
                options: {
                  orderBy: { sortOrder: "asc" },
                  include: {
                    concept: true,
                  },
                },
              },
            },
            answerKeyItems: {
              where: { keyStatus: "ACTIVE" },
            },
          },
        },
      },
    });
  } catch (err) {
    console.error("Database failure while fetching question authoring data:", err);
  }

  if (!paper) {
    notFound();
  }

  const isPublished = paper.publishStatus === "PUBLISHED";

  const questionItems = paper.occurrences.map((occ) => {
    const rep = occ.representations[0];
    const activeKey = occ.answerKeyItems[0];
    const correctSet = new Set(activeKey?.correctOptionLabels || []);

    return {
      id: occ.id,
      sequenceNumber: occ.sequenceNumber,
      questionType: occ.questionType,
      primarySubject: occ.conceptualQuestion.primarySubject,
      defaultTopic: occ.conceptualQuestion.defaultTopic,
      canonicalRefCode: occ.conceptualQuestion.canonicalRefCode,
      sectionTitle: occ.section.title,
      questionText: rep?.questionText || "Question text unavailable",
      overallExplanation: rep?.explanationText || null,
      passageRefCode: occ.passage?.passageRefCode || null,
      passageTitle: occ.passage?.title || null,
      passageLanguage: occ.passage?.languageCode || null,
      options: (rep?.options || []).map((opt) => ({
        id: opt.id,
        optionLabel: opt.optionLabel,
        optionText: opt.optionText,
        isCorrect: correctSet.has(opt.optionLabel),
        explanationText: opt.explanationText || null,
        conceptTitle: opt.concept?.title || null,
      })),
      correctLabels: activeKey?.correctOptionLabels || [],
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-[#717780]">
        <Link href="/admin" className="hover:text-[#F1F2F3] transition">
          Admin
        </Link>
        <span>/</span>
        <Link href="/admin/papers" className="hover:text-[#F1F2F3] transition">
          Exam Papers
        </Link>
        <span>/</span>
        <span className="font-semibold text-[#D6B36A] font-mono">{paper.paperCode}</span>
        <span>/</span>
        <span className="text-[#A1A1AA]">Questions</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#2A2F34] pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[#F1F2F3]">
              Question Authoring & Types
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-mono font-semibold ${
                isPublished
                  ? "bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E]"
                  : "bg-[#FBBF24]/10 border border-[#FBBF24]/30 text-[#FBBF24]"
              }`}
            >
              {paper.publishStatus}
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-[#717780]">
            {paper.title} &bull; {paper.session.exam.conductingBody.code}{" "}
            {paper.session.exam.code} ({paper.session.sessionYear})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/admin/papers/${paper.id}/sequence`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#2A2F34] bg-[#171A1D] px-3 py-2 text-xs font-medium text-[#F1F2F3] transition hover:bg-[#1D2125] hover:border-[#D6B36A]/50"
          >
            Sequence Editor &rarr;
          </Link>
          <Link
            href={`/admin/papers/${paper.id}/publish`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#2A2F34] bg-[#171A1D] px-3 py-2 text-xs font-medium text-[#F1F2F3] transition hover:bg-[#1D2125] hover:border-[#D6B36A]/50"
          >
            Publish Review &rarr;
          </Link>
        </div>
      </div>

      {/* Question Authoring Client Component */}
      <QuestionAuthoringClient
        paperId={paper.id}
        paperCode={paper.paperCode}
        isPublished={isPublished}
        existingQuestions={questionItems}
      />
    </div>
  );
}
