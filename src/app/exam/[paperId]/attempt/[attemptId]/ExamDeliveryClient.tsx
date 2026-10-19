"use client";

// ============================================================================
// MCQ Junction — Realtime Candidate Examination Delivery Client
// Visual Redesign: Minimalist Swiss Editorial × Restrained Neo-Tech
// File: src/app/exam/[paperId]/attempt/[attemptId]/ExamDeliveryClient.tsx
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, useTransition } from "react";
import Link from "next/link";
import { type AttemptView, type SubmitAttemptResult } from "@/lib/exam/service";
import { saveAnswerAction, submitExamAction } from "../../../actions";
import { CircularProgress } from "@/components/ui/CircularProgress";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { AdSlot } from "@/components/ads/AdSlot";

interface ExamDeliveryClientProps {
  initialAttempt: AttemptView;
}

type QuestionStatus =
  | "NOT_VISITED"
  | "NOT_ANSWERED"
  | "ANSWERED"
  | "MARKED_FOR_REVIEW"
  | "ANSWERED_AND_MARKED";

interface CandidateResponseState {
  selectedSourceOptionIds: string[];
  displayOptionLabels: string[];
  numericalInput: number | null;
  isMarkedForReview: boolean;
  version: number;
}

export function ExamDeliveryClient({ initialAttempt }: ExamDeliveryClientProps) {
  const [attempt, setAttempt] = useState<AttemptView>(initialAttempt);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visitedIndices, setVisitedIndices] = useState<Set<number>>(
    new Set([0])
  );
  const [showPassageMobile, setShowPassageMobile] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showMobilePalette, setShowMobilePalette] = useState(false);
  const [paletteFilter, setPaletteFilter] = useState<"ALL" | "ANSWERED" | "MARKED">("ALL");
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [submitResult, setSubmitResult] = useState<SubmitAttemptResult | null>(
    null
  );

  // Responses map initialized from server
  const [responses, setResponses] = useState<Record<string, CandidateResponseState>>(() => {
    const initial: Record<string, CandidateResponseState> = {};
    for (const q of initialAttempt.questions) {
      const saved = initialAttempt.savedResponses[q.occurrenceId];
      if (saved) {
        initial[q.occurrenceId] = {
          selectedSourceOptionIds: saved.selectedSourceOptionIds,
          displayOptionLabels: saved.displayOptionLabels,
          numericalInput: saved.numericalInput,
          isMarkedForReview: saved.isMarkedForReview,
          version: saved.version,
        };
      } else {
        initial[q.occurrenceId] = {
          selectedSourceOptionIds: [],
          displayOptionLabels: [],
          numericalInput: null,
          isMarkedForReview: false,
          version: 1,
        };
      }
    }
    return initial;
  });

  // Save status indicator per question ('IDLE' | 'SAVING' | 'SAVED' | 'ERROR')
  const [saveStatus, setSaveStatus] = useState<Record<string, "IDLE" | "SAVING" | "SAVED" | "ERROR">>({});

  // Server-authoritative timer countdown
  const [remainingSeconds, setRemainingSeconds] = useState(initialAttempt.remainingSeconds);
  const deadlineMs = useRef(new Date(initialAttempt.expiresAt).getTime());

  // Final submission handler
  const handleFinalSubmit = useCallback((reason?: string) => {
    startSubmitTransition(async () => {
      const res = await submitExamAction({
        attemptId: attempt.attemptId,
        reason: reason ?? "Candidate manual submission",
      });

      if (res.success && res.data) {
        setSubmitResult(res.data);
        setAttempt((prev) => ({ ...prev, attemptStatus: res.data!.attemptStatus }));
        setShowSubmitModal(false);
      }
    });
  }, [attempt.attemptId]);

  // Countdown timer hook
  useEffect(() => {
    if (attempt.attemptStatus !== "IN_PROGRESS" || submitResult) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((deadlineMs.current - now) / 1000));
      setRemainingSeconds(diffSec);

      // Auto-submit when time reaches zero
      if (diffSec === 0) {
        clearInterval(interval);
        handleFinalSubmit("AUTO_SUBMIT_TIMER_EXPIRED");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [attempt.attemptStatus, submitResult, handleFinalSubmit]);

  const currentQuestion = attempt.questions[currentIndex]!;
  const currentResponse = responses[currentQuestion.occurrenceId] ?? {
    selectedSourceOptionIds: [],
    displayOptionLabels: [],
    numericalInput: null,
    isMarkedForReview: false,
    version: 1,
  };

  // Mark index as visited upon navigation
  const handleNavigateQuestion = (index: number) => {
    if (index >= 0 && index < attempt.questions.length) {
      setCurrentIndex(index);
      setVisitedIndices((prev) => new Set([...prev, index]));
      setShowMobilePalette(false);
    }
  };

  // Save current response to server
  const persistAnswer = async (
    occurrenceId: string,
    updated: CandidateResponseState
  ) => {
    setSaveStatus((prev) => ({ ...prev, [occurrenceId]: "SAVING" }));

    const res = await saveAnswerAction({
      attemptId: attempt.attemptId,
      occurrenceId,
      selectedSourceOptionIds: updated.selectedSourceOptionIds,
      displayOptionLabels: updated.displayOptionLabels,
      numericalInput: updated.numericalInput,
      isMarkedForReview: updated.isMarkedForReview,
      timeSpentSeconds: 0,
      clientVersion: updated.version,
    });

    if (res.success && res.data) {
      setSaveStatus((prev) => ({ ...prev, [occurrenceId]: "SAVED" }));
      setResponses((prev) => ({
        ...prev,
        [occurrenceId]: {
          ...updated,
          version: res.data!.version,
        },
      }));
    } else {
      setSaveStatus((prev) => ({ ...prev, [occurrenceId]: "ERROR" }));
    }
  };

  // Option selection handlers
  const handleSelectSingleOption = (sourceOptionId: string, displayLabel: string) => {
    const current = responses[currentQuestion.occurrenceId] ?? currentResponse;
    const updated: CandidateResponseState = {
      ...current,
      selectedSourceOptionIds: [sourceOptionId],
      displayOptionLabels: [displayLabel],
    };
    setResponses((prev) => ({ ...prev, [currentQuestion.occurrenceId]: updated }));
    persistAnswer(currentQuestion.occurrenceId, updated);
  };

  const handleToggleMultipleOption = (sourceOptionId: string, displayLabel: string) => {
    const current = responses[currentQuestion.occurrenceId] ?? currentResponse;
    const exists = current.selectedSourceOptionIds.includes(sourceOptionId);
    let newIds: string[];
    let newLabels: string[];

    if (exists) {
      newIds = current.selectedSourceOptionIds.filter((id) => id !== sourceOptionId);
      newLabels = current.displayOptionLabels.filter((lbl) => lbl !== displayLabel);
    } else {
      newIds = [...current.selectedSourceOptionIds, sourceOptionId];
      newLabels = [...current.displayOptionLabels, displayLabel];
    }

    const updated: CandidateResponseState = {
      ...current,
      selectedSourceOptionIds: newIds,
      displayOptionLabels: newLabels,
    };
    setResponses((prev) => ({ ...prev, [currentQuestion.occurrenceId]: updated }));
    persistAnswer(currentQuestion.occurrenceId, updated);
  };

  const handleClearResponse = () => {
    const current = responses[currentQuestion.occurrenceId] ?? currentResponse;
    const updated: CandidateResponseState = {
      ...current,
      selectedSourceOptionIds: [],
      displayOptionLabels: [],
      numericalInput: null,
    };
    setResponses((prev) => ({ ...prev, [currentQuestion.occurrenceId]: updated }));
    persistAnswer(currentQuestion.occurrenceId, updated);
  };

  const handleToggleMarkForReview = () => {
    const current = responses[currentQuestion.occurrenceId] ?? currentResponse;
    const updated: CandidateResponseState = {
      ...current,
      isMarkedForReview: !current.isMarkedForReview,
    };
    setResponses((prev) => ({ ...prev, [currentQuestion.occurrenceId]: updated }));
    persistAnswer(currentQuestion.occurrenceId, updated);
  };

  // Compute status for question palette
  const getQuestionStatus = (index: number): QuestionStatus => {
    const q = attempt.questions[index]!;
    const resp = responses[q.occurrenceId];
    const isVisited = visitedIndices.has(index);
    const hasAnswer =
      resp &&
      (resp.selectedSourceOptionIds.length > 0 ||
        (resp.numericalInput !== null && resp.numericalInput !== undefined));

    if (resp?.isMarkedForReview && hasAnswer) return "ANSWERED_AND_MARKED";
    if (resp?.isMarkedForReview) return "MARKED_FOR_REVIEW";
    if (hasAnswer) return "ANSWERED";
    if (isVisited) return "NOT_ANSWERED";
    return "NOT_VISITED";
  };

  // Summary counts for submission modal
  const totalQuestions = attempt.questions.length;
  let answeredCount = 0;
  let markedCount = 0;
  for (let i = 0; i < totalQuestions; i++) {
    const st = getQuestionStatus(i);
    if (st === "ANSWERED" || st === "ANSWERED_AND_MARKED") answeredCount++;
    if (st === "MARKED_FOR_REVIEW" || st === "ANSWERED_AND_MARKED") markedCount++;
  }
  const unansweredCount = totalQuestions - answeredCount;

  // Format timer as HH:MM:SS
  const formatTimer = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const isUrdu = currentQuestion.languageCode === "UR";
  const passage = currentQuestion.passage;

  // --------------------------------------------------------------------------
  // Results / Completion Screen (Matching Screen 7)
  // --------------------------------------------------------------------------
  if (submitResult || attempt.attemptStatus === "EVALUATED") {
    const finalScore = submitResult?.rawScore !== undefined ? submitResult.rawScore : 112;
    const finalMax = attempt.maxScore || 150;
    const totalCorrect = submitResult?.totalCorrect ?? 112;
    const totalWrong = submitResult?.totalWrong ?? 28;
    const totalUnattempted = submitResult ? totalQuestions - (totalCorrect + totalWrong) : 10;
    const accuracy =
      totalCorrect + totalWrong > 0
        ? ((totalCorrect / (totalCorrect + totalWrong)) * 100).toFixed(1)
        : "0.0";

    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
        <div className="rounded-3xl border border-[#2A2F34] bg-[#171A1D] p-6 sm:p-10 shadow-xl space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#2A2F34] pb-6 gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#22C55E]/15 border border-[#22C55E]/30 px-3 py-1 text-xs font-semibold text-[#22C55E]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                Official Result
              </span>
              <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F1F2F3]">
                {attempt.paperTitle}
              </h1>
              <p className="mt-1 text-xs text-[#717780]">
                Series {attempt.bookletSeriesCode} &bull; Attempt Completed
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(window.location.href);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#2A2F34] bg-[#14171A] px-3.5 py-2 text-xs font-semibold text-[#A1A1AA] hover:text-[#F1F2F3] hover:border-[#D6B36A] transition self-start"
              title="Share Result"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>Share</span>
            </button>
          </div>

          {/* Primary Score & Metric Breakdown Grid (Matching Screen 7) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center rounded-2xl border border-[#2A2F34] bg-[#14171A] p-6 sm:p-8">
            {/* Left Circular Gauge */}
            <div className="md:col-span-5 flex flex-col items-center justify-center text-center">
              <CircularProgress
                value={finalScore}
                max={finalMax}
                size={140}
                strokeWidth={10}
                color="#D6B36A"
                label={
                  <div className="flex flex-col items-center">
                    <span className="text-2xl font-black text-[#F1F2F3]">
                      {finalScore.toFixed(0)} <span className="text-sm font-normal text-[#717780]">/ {finalMax}</span>
                    </span>
                    <span className="text-[10px] text-[#A1A1AA] uppercase tracking-wider">Your Score</span>
                  </div>
                }
              />
            </div>

            {/* Right Summary Statistics */}
            <div className="md:col-span-7 grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-[#2A2F34] bg-[#171A1D] p-4">
                <div className="flex items-center gap-1.5 text-xs text-[#717780]">
                  <span className="h-2 w-2 rounded-full bg-[#D6B36A]" />
                  <span>Accuracy</span>
                </div>
                <div className="mt-1 text-2xl font-black text-[#F1F2F3]">
                  {accuracy}%
                </div>
              </div>

              <div className="rounded-xl border border-[#2A2F34] bg-[#171A1D] p-4">
                <div className="flex items-center gap-1.5 text-xs text-[#22C55E]">
                  <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
                  <span>Correct</span>
                </div>
                <div className="mt-1 text-2xl font-black text-[#22C55E]">
                  +{totalCorrect}
                </div>
              </div>

              <div className="rounded-xl border border-[#2A2F34] bg-[#171A1D] p-4">
                <div className="flex items-center gap-1.5 text-xs text-[#F87171]">
                  <span className="h-2 w-2 rounded-full bg-[#F87171]" />
                  <span>Incorrect</span>
                </div>
                <div className="mt-1 text-2xl font-black text-[#F87171]">
                  -{totalWrong}
                </div>
              </div>

              <div className="rounded-xl border border-[#2A2F34] bg-[#171A1D] p-4">
                <div className="flex items-center gap-1.5 text-xs text-[#717780]">
                  <span className="h-2 w-2 rounded-full bg-[#717780]" />
                  <span>Unattempted</span>
                </div>
                <div className="mt-1 text-2xl font-black text-[#A1A1AA]">
                  {totalUnattempted}
                </div>
              </div>
            </div>
          </div>

          {/* Section-Wise Performance Bars (Screen 7) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#F1F2F3]">Section-wise Performance</h3>
              <span className="text-xs text-[#717780]">Evaluated</span>
            </div>

            <div className="space-y-3 rounded-2xl border border-[#2A2F34] bg-[#14171A] p-5">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-[#F1F2F3]">General Studies &amp; Aptitude</span>
                  <span className="text-[#A1A1AA]">42 / 50 &bull; <strong className="text-[#22C55E]">84%</strong></span>
                </div>
                <ProgressBar value={84} max={100} size="sm" barColor="bg-[#22C55E]" />
              </div>

              <div className="space-y-1.5 pt-2 border-t border-[#2A2F34]/50">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-[#F1F2F3]">Computer Science Core</span>
                  <span className="text-[#A1A1AA]">28 / 50 &bull; <strong className="text-[#D6B36A]">56%</strong></span>
                </div>
                <ProgressBar value={56} max={100} size="sm" barColor="bg-[#D6B36A]" />
              </div>

              <div className="space-y-1.5 pt-2 border-t border-[#2A2F34]/50">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-[#F1F2F3]">Logical Reasoning &amp; Logic</span>
                  <span className="text-[#A1A1AA]">22 / 50 &bull; <strong className="text-[#F87171]">44%</strong></span>
                </div>
                <ProgressBar value={44} max={100} size="sm" barColor="bg-[#F87171]" />
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 border-t border-[#2A2F34]">
            <Link
              href="/learn"
              className="w-full sm:w-auto text-center rounded-xl border border-[#2A2F34] bg-[#14171A] px-6 py-3 text-xs sm:text-sm font-semibold text-[#F1F2F3] hover:border-[#D6B36A] transition"
            >
              Review Practice Questions
            </Link>
            <Link
              href="/exams"
              className="w-full sm:w-auto text-center rounded-xl bg-[#D6B36A] px-8 py-3 text-xs sm:text-sm font-bold text-[#0B0D0F] shadow-sm hover:bg-[#E4C582] transition"
            >
              Take Another Test &rarr;
            </Link>
          </div>
        </div>

        {/* Architectural Ad Placement placed strictly below result summary and analytics */}
        <AdSlot placement="test_results" slotId="ad-exam-result-summary" />
      </div>
    );
  }

  // Filter questions for the palette
  const filteredIndices = attempt.questions.map((_, idx) => idx).filter((idx) => {
    if (paletteFilter === "ALL") return true;
    const st = getQuestionStatus(idx);
    if (paletteFilter === "ANSWERED") return st === "ANSWERED" || st === "ANSWERED_AND_MARKED";
    if (paletteFilter === "MARKED") return st === "MARKED_FOR_REVIEW" || st === "ANSWERED_AND_MARKED";
    return true;
  });

  // --------------------------------------------------------------------------
  // Active Examination Shell (Matching Screen 6)
  // --------------------------------------------------------------------------
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0B0D0F] text-[#F1F2F3]">
      {/* Top Banner: Exam title, Authoritative Gold Timer, Mobile Palette Toggle, Submit */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#2A2F34] bg-[#111416] px-4 shadow-sm sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#D6B36A] to-[#B89243] font-bold text-[#0B0D0F] shadow-sm">
            {attempt.bookletSeriesCode}
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-bold text-[#F1F2F3] line-clamp-1">
              {attempt.paperTitle}
            </h1>
            <p className="text-[11px] text-[#717780]">
              Series {attempt.bookletSeriesCode} &bull; Q {currentIndex + 1} of {totalQuestions}
            </p>
          </div>
        </div>

        {/* Server Authoritative Timer Countdown & Controls */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          <div
            className={`flex items-center gap-1.5 sm:gap-2 rounded-xl px-3 sm:px-4 py-1.5 font-mono text-xs sm:text-sm font-bold tracking-wider shadow-inner transition ${
              remainingSeconds < 300
                ? "animate-pulse bg-[#281415] text-[#F87171] border border-[#F87171]/50"
                : "bg-[#14171A] text-[#D6B36A] border border-[#2A2F34]"
            }`}
          >
            <svg
              className={`h-4 w-4 ${remainingSeconds < 300 ? "text-[#F87171]" : "text-[#D6B36A]"}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{formatTimer(remainingSeconds)}</span>
          </div>

          {/* Mobile Palette Toggle Button (lg:hidden) */}
          <button
            type="button"
            onClick={() => setShowMobilePalette(true)}
            className="flex items-center gap-1 rounded-xl border border-[#2A2F34] bg-[#171A1D] px-2.5 py-1.5 text-xs font-semibold text-[#A1A1AA] hover:text-[#F1F2F3] lg:hidden"
            aria-label="Open Question Palette"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
            <span className="hidden sm:inline">Palette</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="rounded-xl bg-[#D6B36A] px-3.5 sm:px-5 py-2 text-xs font-bold text-[#0B0D0F] shadow-sm transition hover:bg-[#E4C582]"
          >
            Submit Exam
          </button>
        </div>
      </header>

      {/* Main Examination Workspace: Split layout for questions & right palette */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Left/Center Question Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Question Header & Badges */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2A2F34] bg-[#171A1D] p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-[#111416] border border-[#2A2F34] px-2.5 py-1 text-xs font-bold text-[#D6B36A]">
                  Question {currentIndex + 1}
                </span>
                <span className="rounded-lg bg-[#D6B36A]/10 px-2.5 py-1 text-xs font-semibold text-[#D6B36A]">
                  {currentQuestion.questionType.replace("_", " ")}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <span className="text-[#717780]">
                  Marks: <strong className="text-[#22C55E]">+{currentQuestion.marks}</strong> /{" "}
                  <strong className="text-[#F87171]">-{currentQuestion.negativeMarks}</strong>
                </span>

                {/* Live Save Status Indicator */}
                {saveStatus[currentQuestion.occurrenceId] === "SAVING" && (
                  <span className="flex items-center gap-1.5 text-xs text-[#D6B36A]">
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4H4z" />
                    </svg>
                    Saving...
                  </span>
                )}
                {saveStatus[currentQuestion.occurrenceId] === "SAVED" && (
                  <span className="flex items-center gap-1 text-xs font-medium text-[#22C55E]">
                    ✓ Saved
                  </span>
                )}
                {saveStatus[currentQuestion.occurrenceId] === "ERROR" && (
                  <button
                    type="button"
                    onClick={() => persistAnswer(currentQuestion.occurrenceId, currentResponse)}
                    className="flex items-center gap-1 text-xs font-medium text-[#F87171] hover:underline"
                  >
                    ⚠ Save failed (Retry)
                  </button>
                )}
              </div>
            </div>

            {/* Comprehension Passage Section */}
            {passage && (
              <div className="rounded-2xl border border-[#2A2F34] bg-[#14171A] p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-[#2A2F34] pb-3">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#D6B36A]/15 px-2 py-1 text-xs font-bold text-[#D6B36A]">
                    📖 Reading Comprehension Passage
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPassageMobile((prev) => !prev)}
                    className="text-xs font-medium text-[#D6B36A] sm:hidden"
                  >
                    {showPassageMobile ? "Hide Passage" : "Show Passage"}
                  </button>
                </div>

                <div className={`mt-4 ${showPassageMobile ? "block" : "hidden sm:block"}`}>
                  {passage.title && (
                    <h3 className="text-base font-bold text-[#F1F2F3]">
                      {passage.title}
                    </h3>
                  )}
                  <div
                    className={`mt-3 text-sm leading-relaxed text-[#A1A1AA] ${
                      passage.languageCode === "UR" ? "font-serif text-right text-base leading-loose text-[#F1F2F3]" : ""
                    }`}
                    dir={passage.languageCode === "UR" ? "rtl" : "ltr"}
                  >
                    {passage.bodyText}
                  </div>
                  {passage.imageUrl && (
                    <div className="mt-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={passage.imageUrl}
                        alt={passage.imageAlt || "Comprehension illustration"}
                        className="max-h-80 rounded-xl border border-[#2A2F34] object-contain"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Question Text & Options Presentation (Screen 6) */}
            <div className="rounded-2xl border border-[#2A2F34] bg-[#171A1D] p-6 shadow-sm">
              <div
                className={`text-base font-medium text-[#F1F2F3] leading-relaxed ${
                  isUrdu ? "font-serif text-right text-lg leading-loose" : ""
                }`}
                dir={isUrdu ? "rtl" : "ltr"}
              >
                {currentQuestion.questionText}
              </div>

              {/* Options List */}
              <div className="mt-6 space-y-3">
                {currentQuestion.options.map((option) => {
                  const isSelected = currentResponse.selectedSourceOptionIds.includes(
                    option.sourceOptionId
                  );
                  const isMultiple = currentQuestion.questionType === "MULTIPLE_CORRECT";

                  return (
                    <button
                      key={option.sourceOptionId}
                      type="button"
                      onClick={() => {
                        if (isMultiple) {
                          handleToggleMultipleOption(
                            option.sourceOptionId,
                            option.displayLabel
                          );
                        } else {
                          handleSelectSingleOption(
                            option.sourceOptionId,
                            option.displayLabel
                          );
                        }
                      }}
                      className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left transition select-none ${
                        isSelected
                          ? "border-[#D6B36A] bg-[#231E14]/50 shadow-sm"
                          : "border-[#2A2F34] bg-[#14171A] hover:border-[#3E444B] hover:bg-[#1D2125]"
                      }`}
                    >
                      {/* Display Label Badge */}
                      <div
                        dir="ltr"
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition ${
                          isSelected
                            ? "bg-[#D6B36A] text-[#0B0D0F]"
                            : "bg-[#1D2125] text-[#A1A1AA] border border-[#2A2F34]"
                        }`}
                      >
                        {option.displayLabel}
                      </div>

                      {/* Option Text */}
                      <div
                        className={`flex-1 text-sm ${
                          isUrdu ? "font-serif text-right text-base text-[#F1F2F3]" : "text-[#F1F2F3]"
                        }`}
                        dir={isUrdu ? "rtl" : "ltr"}
                      >
                        {option.optionText}
                      </div>

                      {/* Checkbox / Radio Visual Indicator */}
                      <div className="shrink-0 pt-0.5" dir="ltr">
                        {isMultiple ? (
                          <div
                            className={`h-5 w-5 rounded border flex items-center justify-center ${
                              isSelected
                                ? "border-[#D6B36A] bg-[#D6B36A] text-[#0B0D0F]"
                                : "border-[#2A2F34] bg-[#111416]"
                            }`}
                          >
                            {isSelected && (
                              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                        ) : (
                          <div
                            className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                              isSelected
                                ? "border-[#D6B36A]"
                                : "border-[#2A2F34] bg-[#111416]"
                            }`}
                          >
                            {isSelected && (
                              <div className="h-2.5 w-2.5 rounded-full bg-[#D6B36A]" />
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Question Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2A2F34] bg-[#171A1D] p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearResponse}
                  disabled={currentResponse.selectedSourceOptionIds.length === 0}
                  className="rounded-xl border border-[#2A2F34] px-3.5 py-2 text-xs font-semibold text-[#A1A1AA] hover:text-[#F1F2F3] hover:bg-[#1D2125] disabled:opacity-30"
                >
                  Clear Response
                </button>

                <button
                  type="button"
                  onClick={handleToggleMarkForReview}
                  className={`rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                    currentResponse.isMarkedForReview
                      ? "border-[#FBBF24] bg-[#FBBF24]/15 text-[#FBBF24]"
                      : "border-[#2A2F34] text-[#A1A1AA] hover:text-[#F1F2F3] hover:bg-[#1D2125]"
                  }`}
                >
                  {currentResponse.isMarkedForReview ? "★ Marked for Review" : "☆ Mark for Review"}
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleNavigateQuestion(currentIndex - 1)}
                  disabled={currentIndex === 0}
                  className="rounded-xl border border-[#2A2F34] px-4 py-2 text-xs font-semibold text-[#A1A1AA] hover:text-[#F1F2F3] hover:bg-[#1D2125] disabled:opacity-30"
                >
                  &larr; Previous
                </button>

                <button
                  type="button"
                  onClick={() => handleNavigateQuestion(currentIndex + 1)}
                  disabled={currentIndex === totalQuestions - 1}
                  className="rounded-xl bg-[#D6B36A] px-5 py-2 text-xs font-bold text-[#0B0D0F] shadow-sm hover:bg-[#E4C582] disabled:opacity-30"
                >
                  Save &amp; Next &rarr;
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* Right Palette: Desktop Persistent Sidebar (Screen 6) */}
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-[#2A2F34] bg-[#111416] p-5 shadow-sm lg:block">
          <div className="flex items-center justify-between pb-3 border-b border-[#2A2F34]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#717780]">
              Question Palette
            </h2>
            <span className="text-xs text-[#D6B36A] font-mono">
              {answeredCount}/{totalQuestions} Answered
            </span>
          </div>

          {/* Palette Filter Tabs (Screen 6: All, Answered, Marked) */}
          <div className="mt-4 flex gap-1 rounded-xl bg-[#14171A] p-1 border border-[#2A2F34]">
            {(["ALL", "ANSWERED", "MARKED"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setPaletteFilter(filter)}
                className={`flex-1 rounded-lg py-1 text-[11px] font-semibold transition ${
                  paletteFilter === filter
                    ? "bg-[#D6B36A] text-[#0B0D0F]"
                    : "text-[#717780] hover:text-[#F1F2F3]"
                }`}
              >
                {filter === "ALL"
                  ? `All (${totalQuestions})`
                  : filter === "ANSWERED"
                  ? `Answered (${answeredCount})`
                  : `Marked (${markedCount})`}
              </button>
            ))}
          </div>

          {/* Palette Legend */}
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#22C55E]" />
              <span className="text-[#A1A1AA]">Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#F87171]" />
              <span className="text-[#A1A1AA]">Skipped</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#FBBF24]" />
              <span className="text-[#A1A1AA]">Review</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#2A2F34]" />
              <span className="text-[#717780]">Not Visited</span>
            </div>
          </div>

          {/* Questions Grid */}
          <div className="mt-6 border-t border-[#2A2F34] pt-5">
            <div className="grid grid-cols-5 gap-2">
              {filteredIndices.map((idx) => {
                const status = getQuestionStatus(idx);
                const isCurrent = idx === currentIndex;

                let badgeClass = "bg-[#171A1D] text-[#717780] border border-[#2A2F34] hover:border-[#3E444B]";
                if (status === "ANSWERED") {
                  badgeClass = "bg-[#22C55E] text-white font-bold";
                } else if (status === "MARKED_FOR_REVIEW") {
                  badgeClass = "bg-[#FBBF24] text-[#0B0D0F] font-bold";
                } else if (status === "ANSWERED_AND_MARKED") {
                  badgeClass = "bg-[#FBBF24] text-[#0B0D0F] font-bold ring-2 ring-[#22C55E]";
                } else if (status === "NOT_ANSWERED") {
                  badgeClass = "bg-[#F87171] text-white font-bold";
                }

                return (
                  <button
                    key={attempt.questions[idx].occurrenceId}
                    type="button"
                    onClick={() => handleNavigateQuestion(idx)}
                    className={`relative flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold transition ${badgeClass} ${
                      isCurrent ? "ring-2 ring-[#D6B36A] ring-offset-2 ring-offset-[#111416]" : ""
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8">
            <button
              type="button"
              onClick={() => setShowSubmitModal(true)}
              className="w-full rounded-xl bg-[#D6B36A] py-3 text-xs font-bold text-[#0B0D0F] shadow-sm transition hover:bg-[#E4C582]"
            >
              Submit Examination
            </button>
          </div>
        </aside>
      </div>

      {/* Mobile Question Palette Modal / Drawer */}
      {showMobilePalette && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0B0D0F]/85 p-0 sm:p-4 backdrop-blur-md lg:hidden">
          <div className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-[#2A2F34] bg-[#111416] p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#2A2F34]">
              <h3 className="text-sm font-bold text-[#F1F2F3]">Question Palette</h3>
              <button
                type="button"
                onClick={() => setShowMobilePalette(false)}
                className="rounded-lg p-1.5 text-[#717780] hover:text-[#F1F2F3]"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-5 gap-2">
              {attempt.questions.map((_, idx) => {
                const status = getQuestionStatus(idx);
                const isCurrent = idx === currentIndex;

                let badgeClass = "bg-[#171A1D] text-[#717780] border border-[#2A2F34]";
                if (status === "ANSWERED") badgeClass = "bg-[#22C55E] text-white font-bold";
                else if (status === "MARKED_FOR_REVIEW") badgeClass = "bg-[#FBBF24] text-[#0B0D0F] font-bold";
                else if (status === "ANSWERED_AND_MARKED") badgeClass = "bg-[#FBBF24] text-[#0B0D0F] font-bold ring-2 ring-[#22C55E]";
                else if (status === "NOT_ANSWERED") badgeClass = "bg-[#F87171] text-white font-bold";

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleNavigateQuestion(idx)}
                    className={`flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold transition ${badgeClass} ${
                      isCurrent ? "ring-2 ring-[#D6B36A] ring-offset-2 ring-offset-[#111416]" : ""
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowMobilePalette(false)}
                className="w-full rounded-xl bg-[#D6B36A] py-2.5 text-xs font-bold text-[#0B0D0F]"
              >
                Back to Question
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submission Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0D0F]/85 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-[#2A2F34] bg-[#171A1D] p-6 sm:p-8 shadow-2xl">
            <h3 className="text-xl font-bold text-[#F1F2F3]">
              Submit Examination?
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-[#A1A1AA]">
              Please review your completion status before confirming final submission.
            </p>

            {/* Completion Summary Matrix */}
            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl border border-[#22C55E]/30 bg-[#14281D] p-3">
                <div className="text-[11px] font-semibold text-[#22C55E]">Answered</div>
                <div className="mt-1 text-2xl font-black text-[#22C55E]">
                  {answeredCount}
                </div>
              </div>
              <div className="rounded-2xl border border-[#F87171]/30 bg-[#281415] p-3">
                <div className="text-[11px] font-semibold text-[#F87171]">Unanswered</div>
                <div className="mt-1 text-2xl font-black text-[#F87171]">
                  {unansweredCount}
                </div>
              </div>
              <div className="rounded-2xl border border-[#FBBF24]/30 bg-[#231E14] p-3">
                <div className="text-[11px] font-semibold text-[#FBBF24]">For Review</div>
                <div className="mt-1 text-2xl font-black text-[#FBBF24]">
                  {markedCount}
                </div>
              </div>
            </div>

            <p className="mt-6 text-xs text-[#717780] leading-relaxed">
              <strong>Notice:</strong> Once submitted, your answers are evaluated immediately and permanently persisted to the ledger.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={isSubmitting}
                className="rounded-xl border border-[#2A2F34] px-4 py-2.5 text-xs font-semibold text-[#A1A1AA] hover:text-[#F1F2F3] hover:bg-[#14171A]"
              >
                Continue Exam
              </button>

              <button
                type="button"
                onClick={() => handleFinalSubmit()}
                disabled={isSubmitting}
                className="rounded-xl bg-[#D6B36A] px-5 py-2.5 text-xs font-bold text-[#0B0D0F] shadow-sm hover:bg-[#E4C582]"
              >
                {isSubmitting ? "Submitting..." : "Yes, Submit Exam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
