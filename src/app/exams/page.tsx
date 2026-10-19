import React from "react";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { AdSlot } from "@/components/ads/AdSlot";

export const instant = false;

interface ExamsPageProps {
  searchParams: Promise<{
    category?: string;
    search?: string;
  }>;
}

export default async function ExamsPage({ searchParams }: ExamsPageProps) {
  await connection();
  const { category = "All", search = "" } = await searchParams;

  // Query published papers from the database
  let dbPapers: Array<{
    id: string;
    paperCode: string;
    title: string;
    totalQuestions: number;
    totalDurationMinutes: number;
    maxScore: unknown;
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
    dbPapers = await prisma.examPaper.findMany({
      where: { publishStatus: "PUBLISHED" },
      select: {
        id: true,
        paperCode: true,
        title: true,
        totalQuestions: true,
        totalDurationMinutes: true,
        maxScore: true,
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
      orderBy: { publishedAt: "desc" },
    });
  } catch (err) {
    console.error("Failed to query published papers:", err);
  }

  const canonicalExams = [
    {
      id: "bpsc-tre-4",
      code: "TRE 4",
      category: "Bihar",
      title: "Bihar Teacher Recruitment Examination",
      questionsCount: "12,500+ Questions",
      years: "2018 - 2024",
      paperId: dbPapers[0]?.id || "demo-paper-bpsc-cs",
    },
    {
      id: "bpsc-cce",
      code: "BPSC",
      category: "Bihar",
      title: "Bihar Public Service Commission (CCE)",
      questionsCount: "25,000+ Questions",
      years: "2010 - 2024",
      paperId: dbPapers[0]?.id || "demo-paper-bpsc-cs",
    },
    {
      id: "ctet-national",
      code: "CTET",
      category: "Teaching",
      title: "Central Teacher Eligibility Test",
      questionsCount: "15,000+ Questions",
      years: "2011 - 2024",
      paperId: dbPapers[0]?.id || "demo-paper-bpsc-cs",
    },
    {
      id: "kvs-prt-tgt-pgt",
      code: "KVS",
      category: "Teaching",
      title: "Kendriya Vidyalaya Sangathan",
      questionsCount: "8,500+ Questions",
      years: "2015 - 2024",
      paperId: dbPapers[0]?.id || "demo-paper-bpsc-cs",
    },
    {
      id: "dsssb-recruitment",
      code: "DSSSB",
      category: "Teaching",
      title: "Delhi Subordinate Services Selection Board",
      questionsCount: "12,000+ Questions",
      years: "2016 - 2024",
      paperId: dbPapers[0]?.id || "demo-paper-bpsc-cs",
    },
    {
      id: "ssc-cgl",
      code: "SSC CGL",
      category: "SSC",
      title: "Staff Selection Commission - Combined Graduate Level",
      questionsCount: "30,000+ Questions",
      years: "2014 - 2024",
      paperId: dbPapers[0]?.id || "demo-paper-bpsc-cs",
    },
    {
      id: "ibps-po",
      code: "IBPS PO",
      category: "Banking",
      title: "Institute of Banking Personnel Selection - Probationary Officer",
      questionsCount: "20,000+ Questions",
      years: "2015 - 2024",
      paperId: dbPapers[0]?.id || "demo-paper-bpsc-cs",
    },
  ];

  const categories = ["All", "Bihar", "Teaching", "SSC", "Banking"];

  // Filter canonical list
  const filteredExams = canonicalExams.filter((exam) => {
    const matchesCategory =
      category === "All" || exam.category.toLowerCase() === category.toLowerCase();
    const matchesSearch =
      !search ||
      exam.code.toLowerCase().includes(search.toLowerCase()) ||
      exam.title.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <nav className="flex items-center gap-1.5 text-xs text-[#717780]">
            <Link href="/" className="hover:text-[#F1F2F3] transition">
              Home
            </Link>
            <span>/</span>
            <span className="font-semibold text-[#F1F2F3]">Exams</span>
          </nav>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[#F1F2F3]">
            Exams &amp; Previous Year Papers
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#A1A1AA]">
            Explore curated topic banks, official shifts, and full-length simulated mock tests.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <svg
            className="absolute left-3.5 top-3 h-4 w-4 text-[#717780]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <form method="GET">
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Search exams..."
              className="w-full rounded-xl border border-[#2A2F34] bg-[#14171A] py-2 pl-10 pr-4 text-xs text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-hidden"
            />
            {category !== "All" && (
              <input type="hidden" name="category" value={category} />
            )}
          </form>
        </div>
      </div>

      {/* Filter Category Pills (Matching Screen 2) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {categories.map((cat) => {
          const isActive = cat.toLowerCase() === category.toLowerCase();
          return (
            <Link
              key={cat}
              href={`/exams?category=${cat}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                isActive
                  ? "bg-[#D6B36A] text-[#0B0D0F] shadow-xs"
                  : "bg-[#171A1D] border border-[#2A2F34] text-[#A1A1AA] hover:text-[#F1F2F3] hover:border-[#3E444B]"
              }`}
            >
              {cat}
            </Link>
          );
        })}
      </div>

      {/* Available Live Examination Papers from Database */}
      {dbPapers.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#D6B36A]">
              Live Full-Length Examination Papers
            </h2>
            <span className="text-xs text-[#717780]">{dbPapers.length} Published Papers</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {dbPapers.map((paper) => (
              <div
                key={paper.id}
                className="flex flex-col justify-between rounded-2xl border border-[#2A2F34] bg-[#171A1D] p-4 sm:p-5 transition hover:border-[#D6B36A]/50 shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-[#111416] border border-[#2A2F34] px-2 py-0.5 text-[10px] font-mono font-semibold text-[#D6B36A]">
                      {paper.paperCode}
                    </span>
                    <span className="rounded-full bg-[#22C55E]/10 border border-[#22C55E]/20 px-2 py-0.5 text-[10px] font-semibold text-[#22C55E]">
                      Live
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm sm:text-base font-bold text-[#F1F2F3] line-clamp-2">
                    {paper.title}
                  </h3>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-[#717780]">
                    <span>{paper.totalQuestions} Questions</span>
                    <span>&bull;</span>
                    <span>{paper.totalDurationMinutes} Mins</span>
                    <span>&bull;</span>
                    <span>Max {String(paper.maxScore)} Marks</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#2A2F34]/60">
                  <Link
                    href={`/exam/${paper.id}`}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-[#D6B36A] px-4 py-2 text-xs font-bold text-[#0B0D0F] hover:bg-[#E4C582] transition shadow-xs"
                  >
                    Start Full Examination &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Exam Categories & Syllabus Catalog */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#717780]">
          Syllabus &amp; Chapter Practice
        </h2>
        {filteredExams.map((exam) => (
          <Link
            key={exam.id}
            href={`/exams/${exam.id}`}
            className="group flex items-center justify-between rounded-2xl border border-[#2A2F34] bg-[#171A1D] p-4 sm:p-5 transition hover:border-[#D6B36A]/50 hover:bg-[#1D2125] shadow-xs"
          >
            <div className="flex items-center gap-4">
              {/* Architecture Monument / Temple Icon in Champagne Gold */}
              <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-[#111416] border border-[#2A2F34] text-[#D6B36A] group-hover:border-[#D6B36A]/40 transition shadow-inner">
                <svg
                  className="h-6 w-6 sm:h-7 sm:w-7"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.5H4.5V21"
                  />
                </svg>
              </div>

              {/* Title & Metadata */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-[#F1F2F3] group-hover:text-[#D6B36A] transition">
                    {exam.code}
                  </h2>
                  <span className="rounded-md bg-[#111416] border border-[#2A2F34] px-2 py-0.5 text-[10px] font-semibold text-[#A1A1AA]">
                    {exam.years}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#A1A1AA] line-clamp-1">{exam.title}</p>
                <div className="flex items-center gap-2 text-[11px] text-[#717780]">
                  <span className="text-[#D6B36A] font-medium">{exam.questionsCount}</span>
                  <span>&bull;</span>
                  <span>Full Mock &amp; Chapter Practice</span>
                </div>
              </div>
            </div>

            {/* Right Chevron */}
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center rounded-xl bg-[#111416] border border-[#2A2F34] px-3 py-1.5 text-xs font-semibold text-[#F1F2F3] group-hover:border-[#D6B36A]/60 group-hover:text-[#D6B36A] transition">
                View Syllabus
              </span>
              <svg
                className="h-5 w-5 text-[#717780] group-hover:text-[#F1F2F3] transition"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </Link>
        ))}
      </div>

      {/* Architectural Ad Placement in Exam Feed */}
      <AdSlot placement="exams_feed" slotId="ad-exams-feed" />
    </main>
  );
}
