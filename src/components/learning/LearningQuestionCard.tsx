"use client";

// ============================================================================
// MCQ Junction — Learning Mode Question Card (Swiss Editorial × Neo-Tech)
// File: src/components/learning/LearningQuestionCard.tsx
// ============================================================================

import React, { useState, useRef } from "react";
import { LearningQuestionData, LearningOptionData, DetailedConceptData } from "@/types/concept";
import { DetailedConceptModal } from "@/components/concept/DetailedConceptModal";
import { isSafeImageUrl } from "@/lib/concept/url-validator";
import {
  handleOptionClick,
  getInitialEvaluationState,
  resetQuestionAttempt,
  normalizeQuestionType,
  OptionEvaluationMeta,
  QuestionEvaluationState,
} from "@/lib/learning/evaluation";

export interface LearningQuestionCardProps {
  question: LearningQuestionData;
  initialSelectedOptionId?: string | null;
  initialSelectedOptionIds?: string[];
  onOptionSelect?: (optionId: string) => void;
  onEvaluationComplete?: (result: {
    isCorrect: boolean;
    selectedOptionIds: string[];
  }) => void;
  className?: string;
  allowRetry?: boolean;
}

export function LearningQuestionCard({
  question,
  initialSelectedOptionId = null,
  initialSelectedOptionIds,
  onOptionSelect,
  onEvaluationComplete,
  className = "",
  allowRetry = true,
}: LearningQuestionCardProps) {
  // Convert question options to evaluation format
  const evaluationOptions: OptionEvaluationMeta[] = question.options.map((opt) => ({
    id: opt.id,
    optionLabel: opt.optionLabel,
    optionText: opt.optionText,
    isCorrect: Boolean(opt.isCorrect),
    explanationText: opt.explanationText,
    conceptId: opt.conceptId,
  }));

  const resolvedInitialSelections = initialSelectedOptionIds
    ? initialSelectedOptionIds
    : initialSelectedOptionId
    ? [initialSelectedOptionId]
    : [];

  const rawQuestionType = question.questionType ?? "SINGLE_CORRECT";
  const normalizedType = normalizeQuestionType(rawQuestionType);

  // Core Evaluation State
  const [prevOccurrenceId, setPrevOccurrenceId] = useState(question.occurrenceId);
  const [evalState, setEvalState] = useState<QuestionEvaluationState>(() =>
    getInitialEvaluationState(rawQuestionType, evaluationOptions, resolvedInitialSelections)
  );

  // Synchronize state when question occurrence changes (e.g. navigation in a passage)
  if (question.occurrenceId !== prevOccurrenceId) {
    setPrevOccurrenceId(question.occurrenceId);
    setEvalState(
      getInitialEvaluationState(rawQuestionType, evaluationOptions, resolvedInitialSelections)
    );
  }

  // Mobile passage expand/collapse toggle
  const [passageExpanded, setPassageExpanded] = useState<boolean>(true);

  // Modal State
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [activeConcept, setActiveConcept] = useState<DetailedConceptData | null>(null);
  const [activeOptionLabel, setActiveOptionLabel] = useState<string>("");
  const [activeOptionIsCorrect, setActiveOptionIsCorrect] = useState<boolean | null>(null);
  const [activeTriggerRef, setActiveTriggerRef] = useState<React.RefObject<HTMLElement | null> | undefined>(undefined);
  const currentTriggerRef = useRef<HTMLElement | null>(null);
  const triggerButtonRefs = useRef<Map<string, HTMLElement>>(new Map());

  const handleSelect = (option: LearningOptionData) => {
    // Prevent state corruption on already finalized attempts
    if (evalState.isFinalized) {
      return;
    }

    const nextState = handleOptionClick(evalState, evaluationOptions, option.id);
    setEvalState(nextState);

    if (onOptionSelect) {
      onOptionSelect(option.id);
    }

    if (nextState.isFinalized && nextState.isOverallCorrect !== null && onEvaluationComplete) {
      onEvaluationComplete({
        isCorrect: nextState.isOverallCorrect,
        selectedOptionIds: nextState.selectedOptionIds,
      });
    }
  };

  const handleReset = () => {
    const fresh = resetQuestionAttempt(rawQuestionType, evaluationOptions);
    setEvalState(fresh);
  };

  const handleOpenConcept = (option: LearningOptionData, triggerEl: HTMLElement | null) => {
    if (!option.concept) return;

    currentTriggerRef.current = triggerEl;
    setActiveTriggerRef({ current: triggerEl });
    setActiveConcept(option.concept);
    setActiveOptionLabel(option.optionLabel);
    setActiveOptionIsCorrect(option.isCorrect ?? null);
    setModalOpen(true);
  };

  // Human-readable type badge
  const typePill =
    normalizedType === "MULTIPLE_CORRECT"
      ? { label: "Multiple Correct", color: "bg-purple-500/10 text-purple-300 border border-purple-500/30" }
      : normalizedType === "ASSERTION_REASON"
      ? { label: "Assertion & Reason", color: "bg-amber-500/10 text-amber-300 border border-amber-500/30" }
      : { label: "Single Choice", color: "bg-[#D6B36A]/10 text-[#D6B36A] border border-[#D6B36A]/30" };

  const isMultiple = normalizedType === "MULTIPLE_CORRECT";
  const isUrduPassage = question.passage?.languageCode === "UR";
  const isUrduQuestion = question.languageCode === "UR";

  // Comprehension Passage Card Component
  const passageElement = question.passage ? (
    <div className="rounded-2xl sm:rounded-3xl border border-[#2A2F34] bg-[#14171A] p-5 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#2A2F34]">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-lg bg-[#D6B36A]/15 px-2.5 py-1 text-xs font-bold text-[#D6B36A] border border-[#D6B36A]/30">
            Passage {question.passage.passageRefCode}
          </span>
          <span className="text-xs font-semibold text-[#717780] uppercase tracking-wider">
            {question.passage.languageCode}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setPassageExpanded(!passageExpanded)}
          className="lg:hidden text-xs font-semibold text-[#D6B36A] hover:text-[#E4C582] focus:outline-hidden"
          aria-expanded={passageExpanded}
        >
          {passageExpanded ? "Hide Passage" : "Show Passage"}
        </button>
      </div>

      {passageExpanded && (
        <div className="mt-4 space-y-3">
          {question.passage.title && (
            <h3
              dir={isUrduPassage ? "rtl" : "ltr"}
              className={`font-bold text-[#F1F2F3] ${
                isUrduPassage ? "text-xl font-serif text-right leading-loose" : "text-base sm:text-lg"
              }`}
            >
              {question.passage.title}
            </h3>
          )}

          {question.passage.imageUrl && isSafeImageUrl(question.passage.imageUrl) && (
            <div className="my-3 overflow-hidden rounded-xl border border-[#2A2F34]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={question.passage.imageUrl}
                alt={question.passage.imageAlt || "Comprehension passage illustration"}
                className="max-h-72 w-full object-contain bg-[#0B0D0F]"
              />
            </div>
          )}

          <div
            dir={isUrduPassage ? "rtl" : "ltr"}
            className={`whitespace-pre-wrap leading-relaxed text-[#A1A1AA] ${
              isUrduPassage
                ? "font-serif text-right text-lg sm:text-xl leading-loose text-[#F1F2F3]"
                : "text-sm sm:text-base"
            }`}
          >
            {question.passage.bodyText}
          </div>
        </div>
      )}
    </div>
  ) : null;

  // Question & Options Core Component (Matching Screens 4 & 5)
  const questionCardContent = (
    <div
      className={`rounded-2xl sm:rounded-3xl border border-[#2A2F34] bg-[#171A1D] p-6 sm:p-8 shadow-sm ${
        question.passage ? "" : className
      }`}
    >
      {/* Header Meta: Sequence, Type, Subject, Topic, Difficulty */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2A2F34] pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-lg bg-[#111416] border border-[#2A2F34] px-2.5 py-1 text-xs font-bold text-[#D6B36A]">
            Q. {question.sequenceNumber}
          </span>
          <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${typePill.color}`}>
            {typePill.label}
          </span>
          {question.passage && (
            <span className="inline-flex items-center rounded-lg bg-[#D6B36A]/10 px-2.5 py-1 text-xs font-semibold text-[#D6B36A]">
              Passage Linked
            </span>
          )}
          <span className="text-xs font-medium text-[#717780]">
            {question.primarySubject} &bull; {question.defaultTopic}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#D6B36A]/15 border border-[#D6B36A]/30 px-2.5 py-0.5 text-[10px] font-bold text-[#D6B36A] uppercase tracking-wider">
            Medium
          </span>
          <span className="text-xs font-mono text-[#717780] hidden sm:inline">
            {question.paperTitle}
          </span>
        </div>
      </div>

      {/* ASSERTION & REASON Statements Display */}
      {normalizedType === "ASSERTION_REASON" && (question.assertionText || question.reasonText) && (
        <div className="mt-5 space-y-3">
          {question.assertionText && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <span className="inline-block rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                Assertion (A)
              </span>
              <p className="mt-2 text-sm sm:text-base font-medium text-[#F1F2F3] leading-relaxed">
                {question.assertionText}
              </p>
            </div>
          )}

          {question.reasonText && (
            <div className="rounded-xl border border-[#D6B36A]/30 bg-[#D6B36A]/10 p-4">
              <span className="inline-block rounded-md bg-[#D6B36A]/20 px-2 py-0.5 text-xs font-bold text-[#E4C582]">
                Reason (R)
              </span>
              <p className="mt-2 text-sm sm:text-base font-medium text-[#F1F2F3] leading-relaxed">
                {question.reasonText}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Question Prompt (High contrast, editorial typography, RTL support for Urdu) */}
      <div
        dir={isUrduQuestion ? "rtl" : "ltr"}
        className={`mt-5 font-semibold text-[#F1F2F3] leading-relaxed ${
          isUrduQuestion
            ? "text-right font-serif text-lg sm:text-2xl leading-loose"
            : "text-base sm:text-xl"
        }`}
      >
        {question.questionText}
      </div>

      {/* Interactive Helper Text for Multiple Correct */}
      {isMultiple && !evalState.isFinalized && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#14171A] border border-[#2A2F34] px-3.5 py-2 text-xs font-medium text-[#A1A1AA]">
          <svg className="h-4 w-4 text-purple-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Select all correct options. Feedback triggers immediately upon completing the correct set, or on any incorrect choice.
          </span>
        </div>
      )}

      {/* Options List (Screens 4 & 5 Option Cards) */}
      <div
        className="mt-6 space-y-3"
        role={isMultiple ? "group" : "radiogroup"}
        aria-label={isMultiple ? "Multiple choice question options" : "Question options"}
      >
        {question.options.map((option) => {
          const optState = evalState.optionStates[option.id] || "DEFAULT";
          const isSelected = evalState.selectedOptionIds.includes(option.id);
          const hasDetailedConcept = Boolean(option.concept);
          const hasShortExplanation = Boolean(option.explanationText && option.explanationText.trim());

          // Visual styles driven deterministically by OptionVisualState
          let optionBorder = "border-[#2A2F34] hover:border-[#3E444B]";
          let optionBg = "bg-[#14171A] hover:bg-[#1D2125]";
          let labelBadge = "bg-[#1D2125] text-[#A1A1AA] border border-[#2A2F34]";
          let statusBadge: React.ReactNode = null;

          if (optState === "SELECTED_PENDING") {
            // Selected in multiple-choice, pending further selection
            optionBorder = "border-[#D6B36A] ring-2 ring-[#D6B36A]/20";
            optionBg = "bg-[#231E14]/40";
            labelBadge = "bg-[#D6B36A] text-[#0B0D0F] font-bold";
          } else if (optState === "CORRECT_SELECTED") {
            // Correct option selected by learner (Green)
            optionBorder = "border-[#22C55E] ring-2 ring-[#22C55E]/20";
            optionBg = "bg-[#14281D]";
            labelBadge = "bg-[#22C55E] text-white font-bold";
            statusBadge = (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#22C55E]/15 px-2.5 py-0.5 text-xs font-bold text-[#22C55E] border border-[#22C55E]/30">
                <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Correct Answer
              </span>
            );
          } else if (optState === "CORRECT_UNSELECTED") {
            // Correct option that learner missed (Green reveal)
            optionBorder = "border-[#22C55E] border-dashed ring-2 ring-[#22C55E]/10";
            optionBg = "bg-[#14281D]/60";
            labelBadge = "bg-[#22C55E] text-white font-bold";
            statusBadge = (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#22C55E]/15 px-2.5 py-0.5 text-xs font-semibold text-[#22C55E] border border-[#22C55E]/30">
                Correct Answer
              </span>
            );
          } else if (optState === "INCORRECT_SELECTED") {
            // Selected wrong option (Red)
            optionBorder = "border-[#F87171] ring-2 ring-[#F87171]/20";
            optionBg = "bg-[#281415]";
            labelBadge = "bg-[#F87171] text-white font-bold";
            statusBadge = (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#F87171]/15 px-2.5 py-0.5 text-xs font-bold text-[#F87171] border border-[#F87171]/30">
                <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Incorrect
              </span>
            );
          } else if (optState === "INCORRECT_UNSELECTED") {
            // Unselected incorrect remains neutral
            optionBorder = "border-[#2A2F34] opacity-50";
            optionBg = "bg-[#111416]/50";
          }

          return (
            <div
              key={option.id}
              className={`rounded-2xl border transition-all duration-150 ${optionBorder} ${optionBg}`}
            >
              <div
                role={isMultiple ? "checkbox" : "radio"}
                aria-checked={isSelected}
                tabIndex={evalState.isFinalized ? -1 : 0}
                onClick={() => handleSelect(option)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    handleSelect(option);
                  }
                }}
                className={`flex items-start gap-3.5 p-4 sm:p-5 select-none ${
                  evalState.isFinalized ? "cursor-default" : "cursor-pointer"
                }`}
              >
                {/* Option Label Badge with dir="ltr" to guarantee correct letter order */}
                <span
                  dir="ltr"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold transition-colors ${labelBadge}`}
                >
                  {option.optionLabel}
                </span>

                {/* Option Text */}
                <div className="flex-1 text-sm sm:text-base font-normal text-[#F1F2F3] pt-1 leading-relaxed">
                  {option.optionText}
                </div>

                {/* Correct/Incorrect Badge */}
                {statusBadge && <div className="shrink-0">{statusBadge}</div>}
              </div>

              {/* Explanations & Concept Modal Entry Points (Screen 5) */}
              {evalState.isFeedbackTriggered && (hasShortExplanation || hasDetailedConcept) && (
                <div className="border-t border-[#2A2F34] bg-[#111416]/80 p-4 rounded-b-2xl space-y-3">
                  {hasShortExplanation && (
                    <div className="text-xs sm:text-sm text-[#A1A1AA] leading-relaxed">
                      <strong className="text-[#F1F2F3] font-semibold">Explanation: </strong>
                      {option.explanationText}
                    </div>
                  )}

                  {hasDetailedConcept && (
                    <div className="pt-1 flex flex-wrap items-center justify-between gap-3 border-t border-[#2A2F34]/60">
                      <span className="text-xs text-[#717780]">
                        Concept: <strong className="text-[#F1F2F3]">{option.concept?.title}</strong>
                      </span>
                      <button
                        ref={(el) => {
                          if (el) triggerButtonRefs.current.set(option.id, el);
                          else triggerButtonRefs.current.delete(option.id);
                        }}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenConcept(option, triggerButtonRefs.current.get(option.id) || null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#D6B36A]/15 border border-[#D6B36A]/30 px-3 py-1.5 text-xs font-semibold text-[#D6B36A] hover:bg-[#D6B36A]/25 transition focus:outline-hidden focus:ring-2 focus:ring-[#D6B36A]"
                        aria-haspopup="dialog"
                        aria-label={`Open detailed concept: ${option.concept?.title}`}
                      >
                        <svg className="h-3.5 w-3.5 fill-none stroke-current" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        <span>Deep Dive Concept &rarr;</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Overall Evaluation Feedback Banner & Key Concept (Screen 5) */}
      {evalState.isFeedbackTriggered && (
        <div className="mt-6 space-y-4">
          <div
            className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4 sm:p-5 transition-all ${
              evalState.isOverallCorrect
                ? "bg-[#14281D] text-[#22C55E] border border-[#22C55E]/40"
                : "bg-[#281415] text-[#F87171] border border-[#F87171]/40"
            }`}
          >
            <div className="flex items-center gap-3">
              {evalState.isOverallCorrect ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#22C55E] text-white">
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F87171] text-white">
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
              <div>
                <p className="text-sm font-bold">{evalState.overallStatusText}</p>
                {question.overallExplanation && (
                  <p className="mt-1 text-xs text-[#A1A1AA]">{question.overallExplanation}</p>
                )}
              </div>
            </div>

            {allowRetry && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-xl border border-current px-3.5 py-1.5 text-xs font-semibold hover:bg-white/10 transition focus:outline-hidden focus:ring-2 focus:ring-current"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Try Again</span>
              </button>
            )}
          </div>

          {/* Key Concept Callout Box (Screen 5) */}
          <div className="rounded-2xl border border-[#D6B36A]/30 bg-[#231E14]/70 p-4">
            <div className="flex items-center gap-2 mb-1.5 text-[#D6B36A] font-bold text-xs uppercase tracking-wider">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.516 0c.85.493 1.509 1.333 1.509 2.316V18" />
              </svg>
              <span>Key Concept</span>
            </div>
            <p className="text-xs text-[#F1F2F3] leading-relaxed">
              BFS explores vertices level by level using a FIFO Queue. Depth-First Search (DFS) backtracks along deep paths using a LIFO Stack.
            </p>
          </div>
        </div>
      )}

      {/* Floating / Bottom Action Bar (Screen 4: < Previous, Next →) */}
      <div className="mt-8 flex items-center justify-between border-t border-[#2A2F34] pt-5">
        <button
          type="button"
          onClick={() => {
            if (question.sequenceNumber > 1) {
              const prevOcc = `demo-occ-${question.sequenceNumber - 1}`;
              const el = document.getElementById(prevOcc);
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#2A2F34] bg-[#14171A] px-4 py-2 text-xs font-semibold text-[#A1A1AA] hover:text-[#F1F2F3] hover:border-[#3E444B] transition"
        >
          <span>&larr;</span>
          <span>Previous</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const nextOcc = `demo-occ-${question.sequenceNumber + 1}`;
            const el = document.getElementById(nextOcc);
            if (el) el.scrollIntoView({ behavior: "smooth" });
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#D6B36A] px-6 py-2.5 text-xs font-bold text-[#0B0D0F] shadow-sm hover:bg-[#E4C582] transition"
        >
          <span>Next</span>
          <span>&rarr;</span>
        </button>
      </div>
    </div>
  );

  return (
    <div id={`demo-occ-${question.sequenceNumber}`}>
      {question.passage ? (
        <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 items-start ${className}`}>
          <div className="lg:col-span-5 lg:sticky lg:top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto">
            {passageElement}
          </div>
          <div className="lg:col-span-7">
            {questionCardContent}
          </div>
        </div>
      ) : (
        questionCardContent
      )}

      {/* Detailed Concept Modal */}
      <DetailedConceptModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        concept={activeConcept}
        optionLabel={activeOptionLabel}
        isCorrect={activeOptionIsCorrect}
        triggerRef={activeTriggerRef}
      />
    </div>
  );
}
