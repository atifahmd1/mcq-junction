import { connection } from "next/server";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PaperPublishStatus } from "@/generated/prisma/enums";

export const instant = false;

interface PapersPageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    page?: string;
  }>;
}

export default async function AdminPapersPage({ searchParams }: PapersPageProps) {
  await connection();

  const resolvedParams = await searchParams;
  const search = resolvedParams.search?.trim() || "";
  const statusParam = resolvedParams.status?.trim() || "ALL";
  const currentPage = Math.max(1, parseInt(resolvedParams.page || "1", 10));
  const pageSize = 10;
  const skip = (currentPage - 1) * pageSize;

  // Build type-safe where filter
  const where: {
    publishStatus?: PaperPublishStatus;
    OR?: Array<{ paperCode?: { contains: string; mode?: "insensitive" }; title?: { contains: string; mode?: "insensitive" } }>;
  } = {};

  if (
    statusParam !== "ALL" &&
    Object.values(PaperPublishStatus).includes(statusParam as PaperPublishStatus)
  ) {
    where.publishStatus = statusParam as PaperPublishStatus;
  }

  if (search) {
    where.OR = [
      { paperCode: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
    ];
  }

  let totalPapers = 0;
  let papers: Array<{
    id: string;
    paperCode: string;
    title: string;
    publishStatus: PaperPublishStatus;
    totalDurationMinutes: number;
    totalQuestions: number;
    maxScore: unknown;
    createdAt: Date;
    publishedAt: Date | null;
    session: {
      sessionYear: number;
      exam: {
        title: string;
        conductingBody: {
          code: string;
          fullName: string;
        };
      };
    };
    _count: {
      occurrences: number;
      answerKeyVersions: number;
      attempts: number;
    };
  }> = [];

  try {
    const [count, records] = await Promise.all([
      prisma.examPaper.count({ where }),
      prisma.examPaper.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
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
          _count: {
            select: {
              occurrences: true,
              answerKeyVersions: true,
              attempts: true,
            },
          },
        },
      }),
    ]);

    totalPapers = count;
    papers = records;
  } catch (err) {
    console.error("Database failure while fetching exam papers:", err);
  }

  const totalPages = Math.ceil(totalPapers / pageSize) || 1;

  return (
    <div className="space-y-6">
      {/* Page Title & Breadcrumbs */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <nav className="flex items-center gap-1.5 text-xs text-[#717780]">
            <Link href="/admin" className="hover:text-[#F1F2F3] transition">
              Admin
            </Link>
            <span>/</span>
            <span className="font-semibold text-[#D6B36A]">Exam Papers</span>
          </nav>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#F1F2F3] sm:text-3xl">
            Exam Paper Management
          </h1>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-[#2A2F34] bg-[#111416] p-4 shadow-sm">
        <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Search by paper title or code..."
              className="w-full rounded-xl border border-[#2A2F34] bg-[#171A1D] px-4 py-2 text-xs sm:text-sm text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              name="status"
              defaultValue={statusParam}
              className="rounded-xl border border-[#2A2F34] bg-[#171A1D] px-3 py-2 text-xs sm:text-sm font-medium text-[#F1F2F3] focus:border-[#D6B36A] focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="EDITORIAL_REVIEW">EDITORIAL_REVIEW</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>

            <button
              type="submit"
              className="rounded-xl bg-[#D6B36A] px-4 py-2 text-xs sm:text-sm font-semibold text-[#0B0D0F] shadow-sm transition hover:bg-[#E4C582]"
            >
              Filter
            </button>

            {(search || statusParam !== "ALL") && (
              <Link
                href="/admin/papers"
                className="rounded-xl border border-[#2A2F34] bg-[#171A1D] px-3 py-2 text-xs font-semibold text-[#A1A1AA] transition hover:bg-[#1D2125] hover:text-[#F1F2F3]"
              >
                Clear
              </Link>
            )}
          </div>
        </form>
      </div>

      {/* Main Papers Table */}
      <div className="overflow-hidden rounded-2xl border border-[#2A2F34] bg-[#111416] shadow-sm">
        <div className="border-b border-[#2A2F34] px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-xs sm:text-sm font-medium text-[#717780]">
              Showing <span className="font-semibold text-[#F1F2F3]">{papers.length}</span> of{" "}
              <span className="font-semibold text-[#F1F2F3]">{totalPapers}</span> exam papers
            </div>
            <div className="text-xs text-[#717780]">
              Page {currentPage} of {totalPages}
            </div>
          </div>
        </div>

        {papers.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <svg
              className="mx-auto h-12 w-12 text-[#717780]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-3 text-base font-semibold text-[#F1F2F3]">
              No exam papers found
            </h3>
            <p className="mt-1 text-xs text-[#717780]">
              {search || statusParam !== "ALL"
                ? "Try adjusting your search query or status filter."
                : "No papers have been created yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#171A1D] text-[11px] font-mono uppercase text-[#717780]">
                <tr>
                  <th className="px-6 py-3.5">Code & Title</th>
                  <th className="px-6 py-3.5">Exam & Year</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Questions</th>
                  <th className="px-6 py-3.5">Duration & Score</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2F34]">
                {papers.map((paper) => (
                  <tr key={paper.id} className="hover:bg-[#171A1D]/40 transition">
                    <td className="px-6 py-4">
                      <div className="font-mono text-xs font-semibold text-[#D6B36A]">
                        {paper.paperCode}
                      </div>
                      <div className="mt-0.5 font-medium text-[#F1F2F3]">
                        {paper.title}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[#F1F2F3] font-medium">
                        {paper.session.exam.title}
                      </div>
                      <div className="text-xs text-[#717780]">
                        {paper.session.exam.conductingBody.code} &bull; {paper.session.sessionYear}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <StatusBadge status={paper.publishStatus} />
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-xs font-medium text-[#F1F2F3]">
                        {paper._count.occurrences} / {paper.totalQuestions}
                      </div>
                      <div className="text-[11px] text-[#717780]">
                        occurrences ready
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-xs text-[#F1F2F3]">
                        {paper.totalDurationMinutes} mins &bull; {String(paper.maxScore)} pts
                      </div>
                      <div className="text-[11px] text-[#717780]">
                        {paper._count.answerKeyVersions} keys &bull; {paper._count.attempts} attempts
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/papers/${paper.id}/questions`}
                          className="rounded-lg border border-[#2A2F34] bg-[#171A1D] px-2.5 py-1 text-xs font-semibold text-[#A1A1AA] transition hover:bg-[#1D2125] hover:text-[#F1F2F3]"
                        >
                          Questions
                        </Link>

                        <Link
                          href={`/admin/papers/${paper.id}/sequence`}
                          className="rounded-lg border border-[#2A2F34] bg-[#171A1D] px-2.5 py-1 text-xs font-semibold text-[#A1A1AA] transition hover:bg-[#1D2125] hover:text-[#F1F2F3]"
                        >
                          Sequence
                        </Link>

                        <Link
                          href={`/admin/papers/${paper.id}/publish`}
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition shadow-sm ${
                            paper.publishStatus === "PUBLISHED"
                              ? "border border-[#2A2F34] bg-[#171A1D] text-[#A1A1AA] hover:bg-[#1D2125] hover:text-[#F1F2F3]"
                              : "bg-[#D6B36A] text-[#0B0D0F] hover:bg-[#E4C582]"
                          }`}
                        >
                          {paper.publishStatus === "PUBLISHED" ? "Published" : "Review Gate"}
                        </Link>

                        <Link
                          href={`/admin/papers/${paper.id}/adjudication`}
                          className="rounded-lg border border-[#2A2F34] bg-[#171A1D] px-2.5 py-1 text-xs font-semibold text-[#A1A1AA] transition hover:bg-[#1D2125] hover:text-[#F1F2F3]"
                        >
                          Keys
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#2A2F34] px-6 py-4">
            <Link
              href={`/admin/papers?page=${Math.max(1, currentPage - 1)}&search=${encodeURIComponent(
                search
              )}&status=${encodeURIComponent(statusParam)}`}
              className={`rounded-lg border border-[#2A2F34] bg-[#171A1D] px-3 py-1.5 text-xs font-medium text-[#A1A1AA] transition hover:bg-[#1D2125] hover:text-[#F1F2F3] ${
                currentPage <= 1 ? "pointer-events-none opacity-40" : ""
              }`}
            >
              Previous
            </Link>

            <span className="text-xs text-[#717780]">
              Page {currentPage} of {totalPages}
            </span>

            <Link
              href={`/admin/papers?page=${Math.min(totalPages, currentPage + 1)}&search=${encodeURIComponent(
                search
              )}&status=${encodeURIComponent(statusParam)}`}
              className={`rounded-lg border border-[#2A2F34] bg-[#171A1D] px-3 py-1.5 text-xs font-medium text-[#A1A1AA] transition hover:bg-[#1D2125] hover:text-[#F1F2F3] ${
                currentPage >= totalPages ? "pointer-events-none opacity-40" : ""
              }`}
            >
              Next
            </Link>
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
          Editorial Review
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
