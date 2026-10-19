import React from "react";
import Link from "next/link";
import { AdSlot } from "@/components/ads/AdSlot";
import { ProgressBar } from "@/components/ui/ProgressBar";

export default function HomePage() {
  const popularExams = [
    {
      id: "bpsc-tre-4",
      code: "TRE 4",
      region: "Bihar",
      title: "Bihar Teacher Recruitment",
      questionsCount: "12,500+",
      href: "/exams/bpsc-tre-4",
      icon: (
        <svg className="h-6 w-6 text-[#D6B36A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.5H4.5V21" />
        </svg>
      ),
    },
    {
      id: "bpsc-cce",
      code: "BPSC",
      region: "Bihar",
      title: "Public Service Commission",
      questionsCount: "25,000+",
      href: "/exams/bpsc-cce",
      icon: (
        <svg className="h-6 w-6 text-[#D6B36A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-16.5-.52c-1.01.143-2.01.317-3 .52m0 0A48.667 48.667 0 0012 7.5c2.315 0 4.59-.168 6.75-.49M3.75 5.49v10.5m16.5-10.5v10.5" />
        </svg>
      ),
    },
    {
      id: "ctet-national",
      code: "CTET",
      region: "National",
      title: "Central Teacher Eligibility",
      questionsCount: "15,000+",
      href: "/exams/ctet-national",
      icon: (
        <svg className="h-6 w-6 text-[#D6B36A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342" />
        </svg>
      ),
    },
    {
      id: "ssc-cgl",
      code: "SSC",
      region: "CGL",
      title: "Combined Graduate Level",
      questionsCount: "18,000+",
      href: "/exams/ssc-cgl",
      icon: (
        <svg className="h-6 w-6 text-[#D6B36A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      ),
    },
  ];

  const quickActions = [
    {
      label: "Practice MCQs",
      desc: "Immediate feedback & concepts",
      href: "/learn",
      icon: (
        <svg className="h-5 w-5 text-[#D6B36A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      label: "Previous Papers",
      desc: "Authentic PYQs 2018-2024",
      href: "/exams",
      icon: (
        <svg className="h-5 w-5 text-[#D6B36A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
    },
    {
      label: "Mock Tests",
      desc: "Timed exam simulation",
      href: "/exams",
      icon: (
        <svg className="h-5 w-5 text-[#D6B36A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: "AI Studio",
      desc: "Ingest papers & generate MCQs",
      href: "/ai-studio",
      icon: (
        <svg className="h-5 w-5 text-[#D6B36A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
      ),
    },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-10">
      {/* Editorial Welcome Header & Search */}
      <section className="relative overflow-hidden rounded-3xl border border-[#2A2F34] bg-gradient-to-br from-[#171A1D] via-[#111416] to-[#0B0D0F] p-6 sm:p-10 shadow-xl">
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D6B36A]/10 border border-[#D6B36A]/30 px-3 py-1 text-xs font-semibold text-[#D6B36A]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#D6B36A] animate-pulse" />
              Next-Gen Exam Prep
            </span>
            <span className="text-xs text-[#717780]">Bihar TRE &bull; BPSC &bull; CTET</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#F1F2F3] leading-[1.15]">
            Keep learning <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F1F2F3] via-[#D6B36A] to-[#E4C582]">
              every day.
            </span>
          </h1>

          <p className="text-sm sm:text-base text-[#A1A1AA] leading-relaxed">
            High-yield previous year questions, authoritative instant evaluations, multilingual explanations, and official mock tests.
          </p>

          {/* Minimalist Search Bar */}
          <div className="pt-2">
            <div className="relative flex items-center">
              <svg
                className="absolute left-4 h-5 w-5 text-[#717780]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <Link
                href="/exams"
                className="w-full flex items-center cursor-pointer rounded-2xl border border-[#2A2F34] bg-[#14171A] py-3.5 pl-12 pr-28 text-sm text-[#717780] shadow-inner transition hover:border-[#3E444B] focus:border-[#D6B36A]"
              >
                Search exams, topics, or questions...
              </Link>
              <span className="absolute right-3.5 hidden sm:inline-flex items-center rounded-lg border border-[#2A2F34] bg-[#1D2125] px-2 py-0.5 text-[11px] font-mono text-[#717780] pointer-events-none">
                ⌘K
              </span>
            </div>
          </div>
        </div>

        {/* Subtle Neo-Tech Background Graphic */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-gradient-to-br from-[#D6B36A]/10 to-transparent blur-3xl"
        />
      </section>

      {/* Popular Exam Categories (Matching Screen 1) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-[#F1F2F3]">Popular Examinations</h2>
          <Link
            href="/exams"
            className="text-xs font-semibold text-[#D6B36A] hover:text-[#E4C582] transition"
          >
            Browse all exams &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {popularExams.map((exam) => (
            <Link
              key={exam.id}
              href={exam.href}
              className="group flex flex-col justify-between rounded-2xl border border-[#2A2F34] bg-[#171A1D] p-4 transition hover:border-[#D6B36A]/50 hover:bg-[#1D2125] hover:shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#111416] border border-[#2A2F34] group-hover:border-[#D6B36A]/40 transition">
                  {exam.icon}
                </div>
                <span className="rounded-md bg-[#111416] px-2 py-0.5 text-[10px] font-bold text-[#A1A1AA] uppercase tracking-wider">
                  {exam.region}
                </span>
              </div>

              <div className="mt-4">
                <h3 className="text-base font-bold text-[#F1F2F3] group-hover:text-[#D6B36A] transition">
                  {exam.code}
                </h3>
                <p className="mt-0.5 text-xs text-[#717780] line-clamp-1">{exam.title}</p>
                <div className="mt-2 text-[11px] font-medium text-[#D6B36A]">
                  {exam.questionsCount} Questions
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Two Column Layout: Continue Learning & Quick Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Continue Learning Card (lg:col-span-7) */}
        <section className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-[#F1F2F3]">Continue Learning</h2>
            <Link
              href="/learn"
              className="text-xs font-semibold text-[#D6B36A] hover:text-[#E4C582] transition"
            >
              View all &rarr;
            </Link>
          </div>

          <div className="rounded-2xl border border-[#2A2F34] bg-[#171A1D] p-5 sm:p-6 transition hover:border-[#3E444B]">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#231E14] to-[#14171A] border border-[#D6B36A]/40 text-[#D6B36A] shadow-inner">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                </svg>
              </div>

              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#D6B36A] uppercase tracking-wider">
                    Computer Science
                  </span>
                  <span className="text-xs font-bold text-[#F1F2F3]">42%</span>
                </div>
                <h3 className="text-base font-bold text-[#F1F2F3]">
                  Data Structures &amp; Relational Architecture
                </h3>
                <p className="text-xs text-[#717780]">
                  PostgreSQL RDBMS, B+ Trees, and CAP Partitioning
                </p>
              </div>
            </div>

            {/* Linear Progress */}
            <div className="mt-5 space-y-2">
              <div className="flex justify-between text-xs text-[#717780]">
                <span>126 / 300 Questions</span>
                <span>Chapter 3 of 6</span>
              </div>
              <ProgressBar value={42} max={100} size="sm" />
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-[#2A2F34] pt-4">
              <span className="text-xs text-[#717780]">Last practiced 2 hours ago</span>
              <Link
                href="/learn"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#D6B36A] px-4 py-2 text-xs font-bold text-[#0B0D0F] shadow-xs transition hover:bg-[#E4C582]"
              >
                <span>Resume Practice</span>
                <span>&rarr;</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Quick Actions (lg:col-span-5) */}
        <section className="space-y-4 lg:col-span-5">
          <h2 className="text-lg font-bold tracking-tight text-[#F1F2F3]">Quick Actions</h2>

          <div className="grid grid-cols-2 gap-3 sm:gap-3.5">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="group flex flex-col justify-between rounded-2xl border border-[#2A2F34] bg-[#171A1D] p-4 transition hover:border-[#D6B36A]/50 hover:bg-[#1D2125]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#111416] border border-[#2A2F34] group-hover:border-[#D6B36A]/40 transition">
                  {action.icon}
                </div>
                <div className="mt-3">
                  <div className="text-xs sm:text-sm font-bold text-[#F1F2F3] group-hover:text-[#D6B36A] transition">
                    {action.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#717780] line-clamp-1">{action.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Prepared Architectural Ad Slot (Disabled by default, non-intrusive) */}
      <AdSlot placement="dashboard_feed" slotId="ad-home-primary" />

      {/* Study Streak & Weak Topics Section */}
      <section className="rounded-2xl border border-[#2A2F34] bg-[#171A1D] p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Study Streak */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D6B36A]/10 text-[#D6B36A]">
                <svg className="h-5 w-5 fill-current" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.527.82-1.124 1.93-1.636 3.125C7.94 7.375 7.42 9.07 7.27 10.5a5.5 5.5 0 001.23 4.25A5.46 5.46 0 0012 16.5c1.47 0 2.82-.57 3.82-1.52A5.48 5.48 0 0017 11c0-1.78-.85-3.37-2.19-4.73a18.2 18.2 0 00-2.415-3.717z" clipRule="evenodd" />
                </svg>
              </span>
              <div>
                <h3 className="text-sm font-bold text-[#F1F2F3]">7-Day Study Streak</h3>
                <p className="text-xs text-[#717780]">Consistency beats intensity</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              {["S", "M", "T", "W", "T", "F", "S"].map((day, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1.5">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      idx < 5
                        ? "bg-[#D6B36A] text-[#0B0D0F]"
                        : idx === 5
                        ? "bg-[#D6B36A]/20 border border-[#D6B36A] text-[#D6B36A]"
                        : "bg-[#111416] text-[#717780]"
                    }`}
                  >
                    {idx < 6 ? "✓" : ""}
                  </div>
                  <span className="text-[10px] text-[#717780]">{day}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actionable Weak Topics */}
          <div className="space-y-3 md:border-l md:border-[#2A2F34] md:pl-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#F1F2F3]">Actionable Focus Areas</h3>
                <p className="text-xs text-[#717780]">Identified from your recent attempts</p>
              </div>
              <Link
                href="/progress"
                className="text-xs font-semibold text-[#D6B36A] hover:underline"
              >
                Analytics &rarr;
              </Link>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-[#111416] border border-[#2A2F34] p-3 text-xs">
                <div>
                  <div className="font-semibold text-[#F1F2F3]">CAP Theorem &amp; Distributed Consistency</div>
                  <div className="text-[11px] text-[#717780]">Distributed Systems &bull; 40% accuracy</div>
                </div>
                <Link
                  href="/learn"
                  className="rounded-lg bg-[#1D2125] px-2.5 py-1 text-[11px] font-semibold text-[#D6B36A] hover:bg-[#2A2F34]"
                >
                  Drill MCQs
                </Link>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-[#111416] border border-[#2A2F34] p-3 text-xs">
                <div>
                  <div className="font-semibold text-[#F1F2F3]">QuickSort Partitioning &amp; Recurrence</div>
                  <div className="text-[11px] text-[#717780]">Algorithms &bull; 50% accuracy</div>
                </div>
                <Link
                  href="/learn"
                  className="rounded-lg bg-[#1D2125] px-2.5 py-1 text-[11px] font-semibold text-[#D6B36A] hover:bg-[#2A2F34]"
                >
                  Drill MCQs
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
