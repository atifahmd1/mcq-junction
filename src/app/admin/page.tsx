import { connection } from "next/server";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PaperPublishStatus } from "@/generated/prisma/enums";

export const instant = false;

export default async function AdminOverviewPage() {
  await connection();

  // Retrieve authoritative counts across core states
  let totalPapers = 0;
  let publishedPapers = 0;
  let verifiedPapers = 0;
  let inProgressPapers = 0;
  let recentPapers: Array<{
    id: string;
    paperCode: string;
    title: string;
    publishStatus: PaperPublishStatus;
    totalQuestions: number;
    updatedAt: Date;
    session: {
      sessionYear: number;
      exam: {
        title: string;
        conductingBody: {
          code: string;
        };
      };
    };
  }> = [];

  try {
    const [total, published, verified, draft, editorial, recent] = await Promise.all([
      prisma.examPaper.count(),
      prisma.examPaper.count({ where: { publishStatus: "PUBLISHED" } }),
      prisma.examPaper.count({ where: { publishStatus: "VERIFIED" } }),
      prisma.examPaper.count({ where: { publishStatus: "DRAFT" } }),
      prisma.examPaper.count({ where: { publishStatus: "EDITORIAL_REVIEW" } }),
      prisma.examPaper.findMany({
        take: 6,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          paperCode: true,
          title: true,
          publishStatus: true,
          totalQuestions: true,
          updatedAt: true,
          session: {
            select: {
              sessionYear: true,
              exam: {
                select: {
                  title: true,
                  conductingBody: {
                    select: { code: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    totalPapers = total;
    publishedPapers = published;
    verifiedPapers = verified;
    inProgressPapers = draft + editorial;
    recentPapers = recent;
  } catch (err) {
    console.error("Database query failure on admin overview:", err);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <span className="text-[11px] font-mono tracking-widest uppercase text-[#D6B36A]">
          Authoring & Publishing Operations
        </span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#F1F2F3] sm:text-3xl">
          Administrator Overview
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-[#A1A1AA]">
          Core examination paper pipeline, publication gates, and evaluation ledger monitoring.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[#2A2F34] bg-[#111416] p-6 shadow-sm">
          <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#717780]">
            Total Exam Papers
          </div>
          <div className="mt-2 text-3xl font-extrabold font-mono text-[#F1F2F3]">
            {totalPapers}
          </div>
          <div className="mt-1 text-xs text-[#717780]">
            All configured papers
          </div>
        </div>

        <div className="rounded-2xl border border-[#22C55E]/30 bg-[#111416] p-6 shadow-sm">
          <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#22C55E]">
            Published & Active
          </div>
          <div className="mt-2 text-3xl font-extrabold font-mono text-[#22C55E]">
            {publishedPapers}
          </div>
          <div className="mt-1 text-xs text-[#717780]">
            Immutable candidate live bank
          </div>
        </div>

        <div className="rounded-2xl border border-[#D6B36A]/30 bg-[#111416] p-6 shadow-sm">
          <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#D6B36A]">
            Verified for Publication
          </div>
          <div className="mt-2 text-3xl font-extrabold font-mono text-[#D6B36A]">
            {verifiedPapers}
          </div>
          <div className="mt-1 text-xs text-[#717780]">
            Awaiting final publication review
          </div>
        </div>

        <div className="rounded-2xl border border-[#2A2F34] bg-[#111416] p-6 shadow-sm">
          <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#FBBF24]">
            Draft & Review
          </div>
          <div className="mt-2 text-3xl font-extrabold font-mono text-[#FBBF24]">
            {inProgressPapers}
          </div>
          <div className="mt-1 text-xs text-[#717780]">
            Question authoring & verification
          </div>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Link
          href="/admin/papers"
          className="group rounded-2xl border border-[#2A2F34] bg-[#111416] p-6 shadow-sm transition hover:border-[#D6B36A]/50 hover:bg-[#171A1D]"
        >
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#171A1D] border border-[#2A2F34] text-[#D6B36A] group-hover:border-[#D6B36A]/40 transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#F1F2F3] group-hover:text-[#D6B36A] transition">Exam Paper Bank</h2>
              <p className="text-xs text-[#717780]">Search, filter, and inspect papers</p>
            </div>
          </div>
        </Link>

        <Link
          href="/admin/papers?status=VERIFIED"
          className="group rounded-2xl border border-[#2A2F34] bg-[#111416] p-6 shadow-sm transition hover:border-[#D6B36A]/50 hover:bg-[#171A1D]"
        >
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#171A1D] border border-[#2A2F34] text-[#D6B36A] group-hover:border-[#D6B36A]/40 transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#F1F2F3] group-hover:text-[#D6B36A] transition">Publication Reviews</h2>
              <p className="text-xs text-[#717780]">Review gates & execute publication</p>
            </div>
          </div>
        </Link>

        <Link
          href="/admin/papers?status=PUBLISHED"
          className="group rounded-2xl border border-[#2A2F34] bg-[#111416] p-6 shadow-sm transition hover:border-[#D6B36A]/50 hover:bg-[#171A1D]"
        >
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#171A1D] border border-[#2A2F34] text-[#D6B36A] group-hover:border-[#D6B36A]/40 transition">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#F1F2F3] group-hover:text-[#D6B36A] transition">Answer Key Adjudication</h2>
              <p className="text-xs text-[#717780]">Re-evaluate attempts & release v2 keys</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Recent Papers Table */}
      <div className="rounded-2xl border border-[#2A2F34] bg-[#111416] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#2A2F34] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#F1F2F3]">
              Recently Updated Exam Papers
            </h2>
            <p className="text-xs text-[#717780]">
              Latest papers processed in the pipeline
            </p>
          </div>
          <Link
            href="/admin/papers"
            className="text-xs font-semibold text-[#D6B36A] hover:underline"
          >
            View all papers &rarr;
          </Link>
        </div>

        {recentPapers.length === 0 ? (
          <div className="px-6 py-12 text-center text-xs text-[#717780]">
            No exam papers currently configured in the database.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#171A1D] text-[11px] font-mono uppercase text-[#717780]">
                <tr>
                  <th className="px-6 py-3">Paper Code</th>
                  <th className="px-6 py-3">Title & Exam</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Questions</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2F34]">
                {recentPapers.map((paper) => (
                  <tr key={paper.id} className="hover:bg-[#171A1D]/40 transition">
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-xs font-semibold text-[#D6B36A]">
                      {paper.paperCode}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-[#F1F2F3]">{paper.title}</div>
                      <div className="text-xs text-[#717780]">
                        {paper.session.exam.conductingBody.code} &bull; {paper.session.exam.title} ({paper.session.sessionYear})
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <StatusBadge status={paper.publishStatus} />
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-xs font-mono text-[#A1A1AA]">
                      {paper.totalQuestions} questions
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/papers/${paper.id}/sequence`}
                          className="rounded-lg border border-[#2A2F34] bg-[#171A1D] px-2.5 py-1 text-xs font-medium text-[#A1A1AA] transition hover:bg-[#1D2125] hover:text-[#F1F2F3]"
                        >
                          Sequence
                        </Link>
                        {paper.publishStatus === "VERIFIED" && (
                          <Link
                            href={`/admin/papers/${paper.id}/publish`}
                            className="rounded-lg bg-[#D6B36A] px-2.5 py-1 text-xs font-semibold text-[#0B0D0F] transition hover:bg-[#E4C582] shadow-sm"
                          >
                            Review Gate
                          </Link>
                        )}
                        {paper.publishStatus === "PUBLISHED" && (
                          <Link
                            href={`/admin/papers/${paper.id}/adjudication`}
                            className="rounded-lg bg-[#22C55E]/10 border border-[#22C55E]/30 px-2.5 py-1 text-xs font-semibold text-[#22C55E] transition hover:bg-[#22C55E]/20 shadow-sm"
                          >
                            Adjudicate
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: PaperPublishStatus }) {
  switch (status) {
    case "PUBLISHED":
      return (
        <span className="inline-flex items-center rounded-full bg-[#22C55E]/10 border border-[#22C55E]/20 px-2.5 py-0.5 text-xs font-mono font-medium text-[#22C55E]">
          Published
        </span>
      );
    case "VERIFIED":
      return (
        <span className="inline-flex items-center rounded-full bg-[#D6B36A]/10 border border-[#D6B36A]/30 px-2.5 py-0.5 text-xs font-mono font-medium text-[#D6B36A]">
          Verified
        </span>
      );
    case "EDITORIAL_REVIEW":
      return (
        <span className="inline-flex items-center rounded-full bg-[#FBBF24]/10 border border-[#FBBF24]/20 px-2.5 py-0.5 text-xs font-mono font-medium text-[#FBBF24]">
          In Review
        </span>
      );
    case "DRAFT":
      return (
        <span className="inline-flex items-center rounded-full bg-[#171A1D] border border-[#2A2F34] px-2.5 py-0.5 text-xs font-mono font-medium text-[#717780]">
          Draft
        </span>
      );
    case "ARCHIVED":
      return (
        <span className="inline-flex items-center rounded-full bg-[#171A1D] border border-[#2A2F34] px-2.5 py-0.5 text-xs font-mono font-medium text-[#717780]">
          Archived
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded-full bg-[#171A1D] border border-[#2A2F34] px-2.5 py-0.5 text-xs font-mono font-medium text-[#717780]">
          {status}
        </span>
      );
  }
}
