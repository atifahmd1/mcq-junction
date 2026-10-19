"use client";

import { useState } from "react";
import Link from "next/link";
import CircularProgress from "@/components/ui/CircularProgress";
import ProgressBar from "@/components/ui/ProgressBar";
import AdSlot from "@/components/ads/AdSlot";

type TabType = "overview" | "subjects" | "tests" | "notes";

interface SubjectMetric {
  name: string;
  code: string;
  progress: number;
  questionsTotal: number;
  questionsDone: number;
  accuracy: number;
  color?: string;
}

const SUBJECTS_DATA: SubjectMetric[] = [
  {
    name: "Operating Systems",
    code: "CS-301",
    progress: 68,
    questionsTotal: 450,
    questionsDone: 306,
    accuracy: 74,
  },
  {
    name: "Computer Networks",
    code: "CS-302",
    progress: 55,
    questionsTotal: 380,
    questionsDone: 209,
    accuracy: 62,
  },
  {
    name: "Database Management System",
    code: "CS-303",
    progress: 42,
    questionsTotal: 520,
    questionsDone: 218,
    accuracy: 69,
  },
  {
    name: "Data Structures & Algorithms",
    code: "CS-201",
    progress: 78,
    questionsTotal: 600,
    questionsDone: 468,
    accuracy: 81,
  },
  {
    name: "General Studies & Reasoning",
    code: "GS-101",
    progress: 60,
    questionsTotal: 400,
    questionsDone: 240,
    accuracy: 70,
  },
];

interface TestHistoryItem {
  id: string;
  title: string;
  exam: string;
  date: string;
  score: number;
  maxScore: number;
  accuracy: number;
  duration: string;
}

const RECENT_TESTS: TestHistoryItem[] = [
  {
    id: "att-1",
    title: "Bihar TRE 4.0 Computer Science Full Mock #03",
    exam: "Bihar TRE 4.0",
    date: "Yesterday",
    score: 84.5,
    maxScore: 120,
    accuracy: 78,
    duration: "1h 48m",
  },
  {
    id: "att-2",
    title: "BPSC General Studies Preliminary Paper I",
    exam: "BPSC 71st CCE",
    date: "3 days ago",
    score: 102.0,
    maxScore: 150,
    accuracy: 71,
    duration: "1h 55m",
  },
  {
    id: "att-3",
    title: "CTET Paper II (Maths & Science) Diagnostic",
    exam: "CTET 2026",
    date: "Last week",
    score: 118.0,
    maxScore: 150,
    accuracy: 82,
    duration: "2h 10m",
  },
];

interface ChapterNote {
  id: string;
  chapterNumber: string;
  title: string;
  subject: string;
  readTime: string;
  pages: number;
  isBookmarked: boolean;
  status: "read" | "in-progress" | "unread";
}

const CHAPTER_NOTES: ChapterNote[] = [
  {
    id: "note-1",
    chapterNumber: "01",
    title: "Introduction to Operating Systems & Kernels",
    subject: "Operating Systems",
    readTime: "12 mins",
    pages: 8,
    isBookmarked: true,
    status: "read",
  },
  {
    id: "note-2",
    chapterNumber: "02",
    title: "Process Management, Threads & Concurrency",
    subject: "Operating Systems",
    readTime: "25 mins",
    pages: 18,
    isBookmarked: true,
    status: "read",
  },
  {
    id: "note-3",
    chapterNumber: "03",
    title: "CPU Scheduling Algorithms & Real-Time Dispatch",
    subject: "Operating Systems",
    readTime: "18 mins",
    pages: 14,
    isBookmarked: false,
    status: "read",
  },
  {
    id: "note-4",
    chapterNumber: "04",
    title: "Deadlocks: Detection, Prevention & Avoidance",
    subject: "Operating Systems",
    readTime: "15 mins",
    pages: 11,
    isBookmarked: true,
    status: "in-progress",
  },
  {
    id: "note-5",
    chapterNumber: "05",
    title: "Memory Management, Virtual Memory & Paging",
    subject: "Operating Systems",
    readTime: "22 mins",
    pages: 16,
    isBookmarked: false,
    status: "unread",
  },
  {
    id: "note-6",
    chapterNumber: "06",
    title: "File Systems, I/O Subsystems & Disk Scheduling",
    subject: "Operating Systems",
    readTime: "14 mins",
    pages: 10,
    isBookmarked: false,
    status: "unread",
  },
];

const WEEK_DAYS = [
  { day: "M", date: "Mon", active: true },
  { day: "T", date: "Tue", active: true },
  { day: "W", date: "Wed", active: true },
  { day: "T", date: "Thu", active: true },
  { day: "F", date: "Fri", active: true },
  { day: "S", date: "Sat", active: true },
  { day: "S", date: "Sun", active: true },
];

export default function ProgressPage() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [notesFilter, setNotesFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredNotes = CHAPTER_NOTES.filter((note) => {
    const matchesSearch =
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.subject.toLowerCase().includes(searchQuery.toLowerCase());
    if (notesFilter === "bookmarked") return matchesSearch && note.isBookmarked;
    if (notesFilter === "read") return matchesSearch && note.status === "read";
    return matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#0B0D0F] text-[#F1F2F3] pb-24 md:pb-16 pt-6">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#2A2F34]">
          <div>
            <span className="text-[11px] font-mono tracking-widest uppercase text-[#D6B36A]">
              Performance & Diagnostics
            </span>
            <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-[#F1F2F3]">
              My Progress
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#A1A1AA]">
              Track your exam readiness, study streaks, and subject mastery.
            </p>
          </div>

          {/* Quick Action */}
          <div className="flex items-center gap-3">
            <Link
              href="/exams"
              className="inline-flex items-center gap-2 rounded-lg bg-[#D6B36A] px-4 py-2 text-xs font-semibold text-[#0B0D0F] shadow-sm transition hover:bg-[#E4C582]"
            >
              Take a Mock Test →
            </Link>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 flex border-b border-[#2A2F34] gap-2 overflow-x-auto no-scrollbar">
          {(
            [
              { id: "overview", label: "Overview" },
              { id: "subjects", label: "Subject Mastery" },
              { id: "tests", label: "Mock Test History" },
              { id: "notes", label: "Subject Notes" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 px-3 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap relative ${
                activeTab === tab.id
                  ? "text-[#F1F2F3] font-semibold"
                  : "text-[#717780] hover:text-[#A1A1AA]"
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#D6B36A]" />
              )}
            </button>
          ))}
        </div>

        {/* Tab 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="mt-8 space-y-8">
            {/* Top Stats Hero Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Circular Gauge Card (Screen 10 primary visual) */}
              <div className="md:col-span-5 rounded-2xl border border-[#2A2F34] bg-[#111416] p-6 flex flex-col items-center justify-center text-center relative overflow-hidden">
                <div className="absolute top-4 left-4">
                  <span className="text-[10px] font-mono tracking-wider uppercase text-[#717780]">
                    Overall Readiness
                  </span>
                </div>
                <div className="my-4">
                  <CircularProgress
                    value={68}
                    size={170}
                    strokeWidth={14}
                    label="Mastery"
                    sublabel="Exam Ready"
                  />
                </div>
                <div className="w-full mt-2 pt-4 border-t border-[#2A2F34]/60 grid grid-cols-2 gap-3 text-center">
                  <div>
                    <span className="text-[10px] text-[#717780] block">Target Score</span>
                    <span className="text-sm font-bold text-[#F1F2F3]">85%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#717780] block">Confidence Level</span>
                    <span className="text-sm font-bold text-[#22C55E]">High</span>
                  </div>
                </div>
              </div>

              {/* Study Streak & Key Quantities */}
              <div className="md:col-span-7 flex flex-col justify-between gap-6">
                {/* Streak Card */}
                <div className="rounded-2xl border border-[#2A2F34] bg-[#111416] p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-[#D6B36A]/10 border border-[#D6B36A]/30 flex items-center justify-center text-[#D6B36A]">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                          <path d="M12 23c6.075 0 8-4.5 8-8.5 0-4.667-3.667-7.667-5-10.5-.333 1.333-.667 2.333-1.667 3-1-3-3-5.5-3.333-7C8.667 1.667 6 4.5 5 7.5 4 10.5 4 13.5 4 14.5 4 18.5 5.925 23 12 23z" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold text-[#F1F2F3]">
                          7-Day Study Streak
                        </h2>
                        <p className="text-xs text-[#A1A1AA]">
                          You&apos;ve met your daily target 7 days in a row!
                        </p>
                      </div>
                    </div>
                    <span className="text-xl font-bold font-mono text-[#D6B36A]">
                      7 <span className="text-xs text-[#717780]">days</span>
                    </span>
                  </div>

                  {/* Day circles */}
                  <div className="mt-5 flex items-center justify-between gap-2 pt-4 border-t border-[#2A2F34]/60">
                    {WEEK_DAYS.map((w, idx) => (
                      <div key={idx} className="flex flex-col items-center gap-1.5">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-mono transition-all ${
                            w.active
                              ? "bg-[#D6B36A] text-[#0B0D0F] font-bold shadow-[0_0_10px_rgba(214,179,106,0.3)]"
                              : "bg-[#171A1D] border border-[#2A2F34] text-[#717780]"
                          }`}
                        >
                          {w.day}
                        </div>
                        <span className="text-[10px] text-[#717780]">{w.date}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stat Counters */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-[#2A2F34] bg-[#111416] p-5">
                    <span className="text-[10px] font-mono tracking-wider uppercase text-[#717780]">
                      Total Solved
                    </span>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-bold font-mono text-[#F1F2F3]">
                        1,248
                      </span>
                      <span className="text-xs text-[#22C55E]">↑ +64 this wk</span>
                    </div>
                    <span className="text-xs text-[#A1A1AA] mt-1 block">
                      Across 5 subjects
                    </span>
                  </div>

                  <div className="rounded-xl border border-[#2A2F34] bg-[#111416] p-5">
                    <span className="text-[10px] font-mono tracking-wider uppercase text-[#717780]">
                      Mock Tests Taken
                    </span>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-bold font-mono text-[#F1F2F3]">
                        42
                      </span>
                      <span className="text-xs text-[#D6B36A]">avg 76%</span>
                    </div>
                    <span className="text-xs text-[#A1A1AA] mt-1 block">
                      3 full-length exams
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Subject Mastery Snapshot */}
            <div className="rounded-2xl border border-[#2A2F34] bg-[#111416] p-6">
              <div className="flex items-center justify-between pb-4 border-b border-[#2A2F34]">
                <div>
                  <h2 className="text-base font-semibold text-[#F1F2F3]">
                    Subject Performance
                  </h2>
                  <p className="text-xs text-[#A1A1AA]">
                    Accuracy and syllabus coverage by subject
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab("subjects")}
                  className="text-xs font-semibold text-[#D6B36A] hover:underline"
                >
                  View All Subjects →
                </button>
              </div>

              <div className="mt-6 space-y-5">
                {SUBJECTS_DATA.map((sub) => (
                  <div key={sub.code} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[#F1F2F3]">
                          {sub.name}
                        </span>
                        <span className="font-mono text-[10px] text-[#717780]">
                          ({sub.code})
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-[#717780]">
                          {sub.questionsDone}/{sub.questionsTotal} MCQs
                        </span>
                        <span className="font-mono font-semibold text-[#D6B36A]">
                          {sub.progress}%
                        </span>
                      </div>
                    </div>
                    <ProgressBar
                      value={sub.progress}
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Mock Test Activity */}
            <div className="rounded-2xl border border-[#2A2F34] bg-[#111416] p-6">
              <div className="flex items-center justify-between pb-4 border-b border-[#2A2F34]">
                <div>
                  <h2 className="text-base font-semibold text-[#F1F2F3]">
                    Recent Mock Tests
                  </h2>
                  <p className="text-xs text-[#A1A1AA]">
                    Performance records from your latest test attempts
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab("tests")}
                  className="text-xs font-semibold text-[#D6B36A] hover:underline"
                >
                  Full History →
                </button>
              </div>

              <div className="mt-4 divide-y divide-[#2A2F34]">
                {RECENT_TESTS.map((test) => (
                  <div
                    key={test.id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-[#171A1D]/50 px-2 rounded-lg transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono uppercase bg-[#171A1D] border border-[#2A2F34] px-2 py-0.5 rounded text-[#D6B36A]">
                          {test.exam}
                        </span>
                        <span className="text-[11px] text-[#717780]">
                          {test.date}
                        </span>
                      </div>
                      <h4 className="mt-1 text-sm font-medium text-[#F1F2F3]">
                        {test.title}
                      </h4>
                      <p className="text-xs text-[#717780] mt-0.5">
                        Duration: {test.duration}
                      </p>
                    </div>

                    <div className="flex items-center gap-6 sm:self-center">
                      <div className="text-right">
                        <span className="text-xs text-[#717780] block">Score</span>
                        <span className="text-sm font-mono font-bold text-[#F1F2F3]">
                          {test.score} / {test.maxScore}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-[#717780] block">Accuracy</span>
                        <span className="text-sm font-mono font-bold text-[#22C55E]">
                          {test.accuracy}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sponsored / Ad Slot */}
            <AdSlot placement="dashboard_feed" slotId="progress-overview-bottom" />
          </div>
        )}

        {/* Tab 2: SUBJECT MASTERY */}
        {activeTab === "subjects" && (
          <div className="mt-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {SUBJECTS_DATA.map((sub) => (
                <div
                  key={sub.code}
                  className="rounded-2xl border border-[#2A2F34] bg-[#111416] p-6 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-[#D6B36A] uppercase bg-[#171A1D] px-2 py-0.5 rounded border border-[#2A2F34]">
                        {sub.code}
                      </span>
                      <span className="text-xs font-mono text-[#22C55E]">
                        {sub.accuracy}% Accuracy
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-[#F1F2F3]">
                      {sub.name}
                    </h3>
                    <p className="mt-1 text-xs text-[#A1A1AA]">
                      {sub.questionsDone} of {sub.questionsTotal} practice questions completed
                    </p>

                    <div className="mt-5 space-y-1">
                      <div className="flex justify-between text-xs text-[#717780]">
                        <span>Syllabus Coverage</span>
                        <span className="font-mono text-[#F1F2F3]">{sub.progress}%</span>
                      </div>
                      <ProgressBar value={sub.progress} size="md" />
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-[#2A2F34] flex items-center justify-between">
                    <Link
                      href="/learn"
                      className="text-xs font-semibold text-[#D6B36A] hover:underline"
                    >
                      Practice MCQs →
                    </Link>
                    <button
                      onClick={() => setActiveTab("notes")}
                      className="text-xs text-[#717780] hover:text-[#A1A1AA]"
                    >
                      Read Notes
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <AdSlot placement="dashboard_feed" slotId="progress-subjects-bottom" />
          </div>
        )}

        {/* Tab 3: MOCK TEST HISTORY */}
        {activeTab === "tests" && (
          <div className="mt-8 space-y-6">
            <div className="rounded-2xl border border-[#2A2F34] bg-[#111416] overflow-hidden">
              <div className="p-6 border-b border-[#2A2F34]">
                <h3 className="text-base font-semibold text-[#F1F2F3]">
                  All Completed Examinations
                </h3>
                <p className="text-xs text-[#A1A1AA]">
                  Chronological record of mock test performance, negative marks, and speed
                </p>
              </div>

              <div className="divide-y divide-[#2A2F34]">
                {RECENT_TESTS.map((test) => (
                  <div
                    key={test.id}
                    className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#171A1D]/40 transition"
                  >
                    <div>
                      <span className="text-[10px] font-mono text-[#D6B36A] uppercase bg-[#171A1D] border border-[#2A2F34] px-2 py-0.5 rounded">
                        {test.exam}
                      </span>
                      <h4 className="mt-2 text-base font-medium text-[#F1F2F3]">
                        {test.title}
                      </h4>
                      <div className="mt-1 flex items-center gap-4 text-xs text-[#717780]">
                        <span>Attempted: {test.date}</span>
                        <span>•</span>
                        <span>Time Taken: {test.duration}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-center px-3 py-2 rounded-lg bg-[#171A1D] border border-[#2A2F34]">
                        <span className="text-[10px] text-[#717780] block uppercase">Score</span>
                        <span className="text-sm font-mono font-bold text-[#F1F2F3]">
                          {test.score} / {test.maxScore}
                        </span>
                      </div>

                      <div className="text-center px-3 py-2 rounded-lg bg-[#171A1D] border border-[#2A2F34]">
                        <span className="text-[10px] text-[#717780] block uppercase">Accuracy</span>
                        <span className="text-sm font-mono font-bold text-[#22C55E]">
                          {test.accuracy}%
                        </span>
                      </div>

                      <Link
                        href="/exams"
                        className="rounded-lg border border-[#2A2F34] bg-[#171A1D] px-3 py-2 text-xs font-semibold text-[#D6B36A] hover:bg-[#1D2125] transition"
                      >
                        Retake Test
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <AdSlot placement="test_results" slotId="progress-tests-bottom" />
          </div>
        )}

        {/* Tab 4: SUBJECT NOTES (Screen 9) */}
        {activeTab === "notes" && (
          <div className="mt-8 space-y-6">
            {/* Subject Selector & Search Bar */}
            <div className="rounded-2xl border border-[#2A2F34] bg-[#111416] p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-mono text-[#D6B36A] uppercase tracking-wider">
                    Chapter Revision & Summary
                  </span>
                  <h3 className="mt-1 text-lg font-semibold text-[#F1F2F3]">
                    Operating Systems Notes
                  </h3>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-2">
                  {(
                    [
                      { id: "all", label: "All Chapters" },
                      { id: "bookmarked", label: "Bookmarked" },
                      { id: "read", label: "Completed" },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setNotesFilter(f.id)}
                      className={`px-3 py-1.5 text-xs rounded-full border transition ${
                        notesFilter === f.id
                          ? "border-[#D6B36A] bg-[#D6B36A]/10 text-[#D6B36A] font-semibold"
                          : "border-[#2A2F34] bg-[#171A1D] text-[#717780] hover:text-[#A1A1AA]"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search input */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search chapters, concepts, keywords..."
                  className="w-full rounded-xl border border-[#2A2F34] bg-[#171A1D] py-2.5 pl-10 pr-4 text-xs text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
                />
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#717780]">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Chapter Notes List (Screen 9) */}
            <div className="space-y-3">
              {filteredNotes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-xl border border-[#2A2F34] bg-[#111416] p-5 flex items-center justify-between hover:border-[#D6B36A]/50 transition group"
                >
                  <div className="flex items-center gap-4">
                    {/* Chapter Number Badge */}
                    <div className="h-10 w-10 rounded-xl bg-[#171A1D] border border-[#2A2F34] flex items-center justify-center font-mono text-xs font-bold text-[#D6B36A] shrink-0">
                      {note.chapterNumber}
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-[#F1F2F3] group-hover:text-[#D6B36A] transition">
                        {note.title}
                      </h4>
                      <div className="mt-1 flex items-center gap-3 text-xs text-[#717780]">
                        <span>{note.subject}</span>
                        <span>•</span>
                        <span>{note.readTime}</span>
                        <span>•</span>
                        <span>{note.pages} pages</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {note.status === "read" && (
                      <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2 py-0.5 rounded">
                        Read
                      </span>
                    )}
                    {note.isBookmarked && (
                      <span className="text-[#D6B36A]" title="Bookmarked">
                        ★
                      </span>
                    )}
                    <button className="h-8 w-8 rounded-lg bg-[#171A1D] border border-[#2A2F34] flex items-center justify-center text-[#717780] hover:text-[#F1F2F3] transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <AdSlot placement="topic_feed" slotId="progress-notes-bottom" />
          </div>
        )}
      </div>
    </div>
  );
}
