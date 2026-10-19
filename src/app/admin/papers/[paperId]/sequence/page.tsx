import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import SequenceEditorClient, { type QuestionOccurrenceItem } from "./SequenceEditorClient";

export const instant = false;

interface SequencePageProps {
  params: Promise<{
    paperId: string;
  }>;
}

export default async function QuestionSequencePage({ params }: SequencePageProps) {
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
        occurrences: {
          orderBy: { sequenceNumber: "asc" },
          include: {
            section: true,
            conceptualQuestion: true,
            representations: {
              take: 1,
              include: {
                options: {
                  orderBy: { sortOrder: "asc" },
                },
              },
            },
          },
        },
      },
    });
  } catch (err) {
    console.error("Database failure while fetching sequence data:", err);
  }

  if (!paper) {
    notFound();
  }

  const isPublished = paper.publishStatus === "PUBLISHED";

  return (
    <div className="space-y-6">
      {/* Breadcrumbs & Header */}
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-[#717780]">
          <Link href="/admin" className="hover:text-[#F1F2F3] transition">
            Admin
          </Link>
          <span>/</span>
          <Link href="/admin/papers" className="hover:text-[#F1F2F3] transition">
            Exam Papers
          </Link>
          <span>/</span>
          <span className="font-semibold text-[#D6B36A]">Sequence Editor</span>
        </nav>

        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-[#D6B36A]">
                {paper.paperCode}
              </span>
              <span className="text-[#717780]">&bull;</span>
              <span className="text-xs text-[#717780]">
                {paper.session.exam.conductingBody.code} &bull; {paper.session.exam.title}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#F1F2F3] sm:text-3xl">
              {paper.title} — Question Sequence
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/admin/papers/${paper.id}/publish`}
              className="rounded-xl border border-[#2A2F34] bg-[#171A1D] px-3 py-2 text-xs font-semibold text-[#F1F2F3] shadow-sm transition hover:bg-[#1D2125] hover:border-[#D6B36A]/50"
            >
              Publication Gate Review
            </Link>
            <Link
              href={`/admin/papers/${paper.id}/adjudication`}
              className="rounded-xl border border-[#2A2F34] bg-[#171A1D] px-3 py-2 text-xs font-semibold text-[#F1F2F3] shadow-sm transition hover:bg-[#1D2125] hover:border-[#D6B36A]/50"
            >
              Answer Keys & Adjudication
            </Link>
          </div>
        </div>
      </div>

      {/* Interactive Reordering Component */}
      <SequenceEditorClient
        paperId={paper.id}
        isPublished={isPublished}
        initialOccurrences={paper.occurrences as unknown as QuestionOccurrenceItem[]}
      />
    </div>
  );
}
