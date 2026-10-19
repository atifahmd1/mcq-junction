import { connection } from "next/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AdjudicationClient from "./AdjudicationClient";

export const instant = false;

interface AdjudicationPageProps {
  params: Promise<{
    paperId: string;
  }>;
}

export default async function AnswerKeyAdjudicationPage({ params }: AdjudicationPageProps) {
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
        answerKeyVersions: {
          orderBy: { versionNumber: "desc" },
          include: {
            _count: {
              select: { items: true, evaluations: true },
            },
          },
        },
        _count: {
          select: {
            attempts: true,
            occurrences: true,
          },
        },
      },
    });
  } catch (err) {
    console.error("Database failure while querying adjudication context:", err);
  }

  if (!paper) {
    notFound();
  }

  const isPublished = paper.publishStatus === "PUBLISHED";
  const keyVersionOptions = paper.answerKeyVersions.map((kv) => ({
    id: kv.id,
    versionNumber: kv.versionNumber,
    versionTag: kv.versionTag,
    isOfficial: kv.isOfficial,
    itemCount: kv._count.items,
    releaseNotes: kv.releaseNotes,
  }));

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
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
          <span className="font-semibold text-[#D6B36A]">Answer Key Adjudication</span>
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
              Answer Key Adjudication & Two-Tier Ledger
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/admin/papers/${paper.id}/sequence`}
              className="rounded-xl border border-[#2A2F34] bg-[#171A1D] px-3 py-2 text-xs font-semibold text-[#F1F2F3] shadow-sm transition hover:bg-[#1D2125] hover:border-[#D6B36A]/50"
            >
              Question Sequence
            </Link>
            <Link
              href={`/admin/papers/${paper.id}/publish`}
              className="rounded-xl border border-[#2A2F34] bg-[#171A1D] px-3 py-2 text-xs font-semibold text-[#F1F2F3] shadow-sm transition hover:bg-[#1D2125] hover:border-[#D6B36A]/50"
            >
              Publication Gate
            </Link>
          </div>
        </div>
      </div>

      {/* Answer Key Versions Table */}
      <div className="overflow-hidden rounded-2xl border border-[#2A2F34] bg-[#111416] shadow-sm">
        <div className="border-b border-[#2A2F34] px-6 py-4">
          <h2 className="text-sm sm:text-base font-semibold text-[#F1F2F3]">
            Configured Answer Key Versions ({paper.answerKeyVersions.length})
          </h2>
          <p className="text-xs text-[#717780]">
            Official Answer Key versions available for scoring and re-evaluation.
          </p>
        </div>

        {paper.answerKeyVersions.length === 0 ? (
          <div className="px-6 py-8 text-center text-xs text-[#717780]">
            No answer key versions configured for this paper.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#171A1D] text-[11px] font-mono uppercase text-[#717780]">
                <tr>
                  <th className="px-6 py-3">Version</th>
                  <th className="px-6 py-3">Tag & Type</th>
                  <th className="px-6 py-3">Items Covered</th>
                  <th className="px-6 py-3">Evaluations Bound</th>
                  <th className="px-6 py-3">Release Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2F34]">
                {paper.answerKeyVersions.map((kv) => (
                  <tr key={kv.id} className="hover:bg-[#171A1D]/40 transition">
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-xs font-bold text-[#D6B36A]">
                      v{kv.versionNumber}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="font-medium text-[#F1F2F3]">{kv.versionTag}</span>
                      {kv.isOfficial && (
                        <span className="ml-2 inline-flex items-center rounded bg-[#22C55E]/10 border border-[#22C55E]/30 px-1.5 py-0.5 text-[10px] font-mono font-bold text-[#22C55E]">
                          Official
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-xs text-[#A1A1AA]">
                      {kv._count.items} of {paper.totalQuestions} questions
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-xs font-mono font-semibold text-[#D6B36A]">
                      {kv._count.evaluations} attempts
                    </td>
                    <td className="px-6 py-4 text-xs text-[#717780]">
                      {kv.releaseNotes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Interactive Adjudication Client */}
      <AdjudicationClient
        paperId={paper.id}
        isPublished={isPublished}
        totalAttemptsCount={paper._count.attempts}
        keyVersions={keyVersionOptions}
      />
    </div>
  );
}
