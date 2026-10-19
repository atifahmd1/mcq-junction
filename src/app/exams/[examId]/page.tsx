import React from "react";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { CircularProgress } from "@/components/ui/CircularProgress";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { AdSlot } from "@/components/ads/AdSlot";

export const instant = false;

interface ExamDetailPageProps {
  params: Promise<{
    examId: string;
  }>;
  searchParams: Promise<{
    tab?: string;
  }>;
}

export default async function ExamDetailPage({
  params,
  searchParams,
}: ExamDetailPageProps) {
  await connection();
  const { examId } = await params;
  const { tab = "Syllabus" } = await searchParams;

  // Query published papers to offer real mock test link
  let livePaperId: string | null = null;
  try {
    const publishedPaper = await prisma.examPaper.findFirst({
      where: { publishStatus: "PUBLISHED" },
      select: { id: true },
    });
    if (publishedPaper) {
      livePaperId = publishedPaper.id;
    }
  } catch (err) {
    console.error("Failed to query published paper for exam detail:", err);
  }

  const examTitles: Record<string, string> = {
    "bpsc-tre-4": "TRE 4 - Computer Science (Class 11-12)",
    "bpsc-cce": "BPSC 70th CCE - General Studies",
    "ctet-national": "CTET Paper 2 - Mathematics & Science",
    "kvs-prt-tgt-pgt": "KVS PGT - Computer Science",
    "dsssb-recruitment": "DSSSB TGT - Computer Science",
    "ssc-cgl": "SSC CGL Tier 1 - Quantitative & Reasoning",
  };

  const currentTitle = examTitles[examId] || "TRE 4 - Computer Science";

  const chapters = [
    {
      id: "ch-1",
      number: 1,
      title: "Computer Fundamentals & Architecture",
      questionsCount: "320 Questions",
      status: "COMPLETED",
    },
    {
      id: "ch-2",
      number: 2,
      title: "Number Systems & Binary Logic",
      questionsCount: "180 Questions",
      status: "COMPLETED",
    },
    {
      id: "ch-3",
      number: 3,
      title: "Operating Systems & Process Management",
      questionsCount: "250 Questions",
      status: "IN_PROGRESS",
    },
    {
      id: "ch-4",
      number: 4,
      title: "Database Management Systems (RDBMS & SQL)",
      questionsCount: "420 Questions",
      status: "AVAILABLE",
    },
    {
      id: "ch-5",
      number: 5,
      title: "Data Structures & Asymptotic Analysis",
      questionsCount: "380 Questions",
      status: "LOCKED",
    },
    {
      id: "ch-6",
      number: 6,
      title: "Computer Networks & Network Security",
      questionsCount: "310 Questions",
      status: "LOCKED",
    },
  ];

  const subTabs = ["Syllabus", "PYQs", "Practice", "Notes"];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-2">
        <nav className="flex items-center gap-1.5 text-xs text-[#717780]">
          <Link href="/" className="hover:text-[#F1F2F3] transition">
            Home
          </Link>
          <span>/</span>
          <Link href="/exams" className="hover:text-[#F1F2F3] transition">
            Exams
          </Link>
          <span>/</span>
          <span className="font-semibold text-[#F1F2F3]">{examId}</span>
        </nav>

        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F1F2F3]">
            {currentTitle}
          </h1>

          {livePaperId && (
            <Link
              href={`/exam/${livePaperId}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#D6B36A] px-4 py-2 text-xs font-bold text-[#0B0D0F] shadow-xs transition hover:bg-[#E4C582]"
            >
              <span>Start Mock Test</span>
              <span>&rarr;</span>
            </Link>
          )}
        </div>
      </div>

      {/* Sub Tabs: Syllabus, PYQs, Practice, Notes (Screen 3) */}
      <div className="flex items-center gap-2 border-b border-[#2A2F34] pb-2">
        {subTabs.map((t) => {
          const isActive = t.toLowerCase() === tab.toLowerCase();
          return (
            <Link
              key={t}
              href={`/exams/${examId}?tab=${t}`}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? "bg-[#D6B36A] text-[#0B0D0F]"
                  : "bg-[#171A1D] border border-[#2A2F34] text-[#A1A1AA] hover:text-[#F1F2F3]"
              }`}
            >
              {t}
            </Link>
          );
        })}
      </div>

      {/* Your Progress Card with Radial Gauge (Matching Screen 3) */}
      <section className="rounded-2xl border border-[#2A2F34] bg-[#171A1D] p-6 shadow-sm">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#D6B36A] uppercase tracking-wider">
                Your Progress
              </span>
              <span className="text-xs text-[#717780]">12 / 24 Chapters</span>
            </div>
            <h2 className="text-xl font-bold text-[#F1F2F3]">
              50% Syllabus Completed
            </h2>
            <p className="text-xs text-[#A1A1AA] leading-relaxed max-w-md">
              You are on pace to finish the remaining modules before the upcoming Bihar TRE exam cycle.
            </p>
            <div className="pt-1">
              <ProgressBar value={50} max={100} size="sm" />
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-center">
            <CircularProgress
              value={50}
              max={100}
              size={96}
              strokeWidth={8}
              label="50%"
              sublabel="Mastery"
            />
          </div>
        </div>
      </section>

      {/* Full-Length Live Mock Test Card */}
      {livePaperId && (
        <section className="rounded-2xl border border-[#D6B36A]/50 bg-gradient-to-r from-[#171A1D] via-[#1D2125] to-[#171A1D] p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#D6B36A]/10 border border-[#D6B36A]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#D6B36A] uppercase tracking-wider">
                  Official Full Mock Test
                </span>
                <span className="text-xs text-[#22C55E] font-medium">&bull; Server-Authoritative Timing</span>
              </div>
              <h3 className="text-base sm:text-lg font-bold text-[#F1F2F3]">
                Simulate Real {currentTitle} Examination
              </h3>
              <p className="text-xs text-[#A1A1AA] max-w-xl">
                Experience realistic booklet shuffling, strict all-or-nothing scoring, negative marking, and instant detailed analysis.
              </p>
            </div>

            <Link
              href={`/exam/${livePaperId}`}
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#D6B36A] px-5 py-3 text-xs font-extrabold text-[#0B0D0F] hover:bg-[#E4C582] transition shadow-xs whitespace-nowrap"
            >
              Start Full Exam &rarr;
            </Link>
          </div>
        </section>
      )}

      {/* Chapter List with Status Indicators (Screen 3) */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#717780]">
          Chapters &amp; Topic Modules
        </h3>

        <div className="space-y-2.5">
          {chapters.map((ch) => {
            const isCompleted = ch.status === "COMPLETED";
            const isInProgress = ch.status === "IN_PROGRESS";
            const isLocked = ch.status === "LOCKED";

            return (
              <Link
                key={ch.id}
                href={isLocked ? "#" : "/learn"}
                className={`group flex items-center justify-between rounded-2xl border p-4 transition ${
                  isInProgress
                    ? "border-[#D6B36A] bg-[#1E2226] shadow-sm"
                    : "border-[#2A2F34] bg-[#171A1D] hover:border-[#3E444B] hover:bg-[#1D2125]"
                } ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center gap-3.5">
                  {/* Status Circle Pill */}
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isCompleted
                        ? "bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/40"
                        : isInProgress
                        ? "bg-[#D6B36A] text-[#0B0D0F] font-extrabold"
                        : "bg-[#111416] text-[#717780] border border-[#2A2F34]"
                    }`}
                  >
                    {isCompleted ? "✓" : ch.number}
                  </div>

                  <div>
                    <h4
                      className={`text-sm font-bold transition ${
                        isInProgress ? "text-[#F1F2F3]" : "text-[#F1F2F3] group-hover:text-[#D6B36A]"
                      }`}
                    >
                      {ch.title}
                    </h4>
                    <span className="text-xs text-[#717780]">{ch.questionsCount}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isCompleted && (
                    <span className="rounded-full bg-[#22C55E]/10 px-2 py-0.5 text-[10px] font-semibold text-[#22C55E]">
                      Completed
                    </span>
                  )}
                  {isInProgress && (
                    <span className="rounded-full bg-[#D6B36A]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#D6B36A]">
                      Resume &gt;
                    </span>
                  )}
                  {isLocked && (
                    <svg
                      className="h-4 w-4 text-[#717780]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                      />
                    </svg>
                  )}
                  {!isLocked && !isInProgress && !isCompleted && (
                    <svg
                      className="h-4 w-4 text-[#717780] group-hover:text-[#F1F2F3] transition"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Optional Ad Slot between Chapter Modules and Exam CTAs */}
      <AdSlot placement="topic_feed" slotId="ad-chapter-feed" />
    </main>
  );
}
