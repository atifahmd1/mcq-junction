"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { swapQuestionSequenceAction } from "@/app/admin/actions";

export interface QuestionOccurrenceItem {
  id: string;
  sequenceNumber: number;
  questionType: string;
  section: {
    title: string;
  };
  conceptualQuestion: {
    canonicalRefCode: string;
    primarySubject: string;
    defaultTopic: string;
  };
  representations: Array<{
    languageCode: string;
    questionText: string;
    editorialVerified: boolean;
    options: Array<{
      optionLabel: string;
      optionText: string;
    }>;
  }>;
}

interface SequenceEditorClientProps {
  paperId: string;
  isPublished: boolean;
  initialOccurrences: QuestionOccurrenceItem[];
}

export default function SequenceEditorClient({
  paperId,
  isPublished,
  initialOccurrences,
}: SequenceEditorClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeOccurrenceId, setActiveOccurrenceId] = useState<string | null>(null);

  const handleSwap = (indexA: number, indexB: number) => {
    if (isPublished) return;
    if (indexA < 0 || indexB < 0 || indexA >= initialOccurrences.length || indexB >= initialOccurrences.length) {
      return;
    }

    const occA = initialOccurrences[indexA];
    const occB = initialOccurrences[indexB];

    setErrorMsg(null);
    setSuccessMsg(null);
    setActiveOccurrenceId(occA.id);

    startTransition(async () => {
      const result = await swapQuestionSequenceAction({
        paperId,
        occurrenceIdA: occA.id,
        occurrenceIdB: occB.id,
      });

      if (!result.success) {
        setErrorMsg(result.error ?? "Failed to swap question sequence positions.");
        setActiveOccurrenceId(null);
      } else {
        setSuccessMsg(
          `Swapped sequence #${occA.sequenceNumber} with #${occB.sequenceNumber} successfully.`
        );
        setActiveOccurrenceId(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Immutability Banner */}
      {isPublished && (
        <div className="flex items-center gap-3 rounded-2xl border border-[#FBBF24]/30 bg-[#FBBF24]/10 p-4 text-[#FBBF24]">
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-xs sm:text-sm">
            <strong className="font-semibold text-[#F1F2F3]">Published Content Immutable:</strong> This exam paper is published.
            PostgreSQL integrity constraints strictly prohibit question sequence permutations to protect historical candidate attempt validity.
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div className="rounded-xl border border-[#F87171]/40 bg-[#F87171]/10 p-4 text-xs sm:text-sm text-[#F87171]">
          <div className="font-semibold">Sequence Update Error:</div>
          <div>{errorMsg}</div>
        </div>
      )}

      {/* Success Alert */}
      {successMsg && (
        <div className="rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/10 p-4 text-xs sm:text-sm text-[#22C55E]">
          {successMsg}
        </div>
      )}

      {/* Occurrences Sequence List */}
      <div className="overflow-hidden rounded-2xl border border-[#2A2F34] bg-[#111416] shadow-sm">
        <div className="border-b border-[#2A2F34] px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-semibold text-[#F1F2F3]">
              Question Sequence ({initialOccurrences.length} total)
            </h2>
            <span className="text-xs text-[#717780]">
              Sequential order determines booklet permutation base
            </span>
          </div>
        </div>

        {initialOccurrences.length === 0 ? (
          <div className="px-6 py-12 text-center text-xs text-[#717780]">
            No question occurrences assigned to this paper yet.
          </div>
        ) : (
          <div className="divide-y divide-[#2A2F34]">
            {initialOccurrences.map((occ, idx) => {
              const rep = occ.representations[0];
              const isFirst = idx === 0;
              const isLast = idx === initialOccurrences.length - 1;
              const isBusy = isPending && activeOccurrenceId === occ.id;

              return (
                <div
                  key={occ.id}
                  className={`flex flex-col gap-4 p-5 transition sm:flex-row sm:items-center sm:justify-between ${
                    isBusy ? "opacity-50 bg-[#171A1D]" : "hover:bg-[#171A1D]/40"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Sequence Badge */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#171A1D] border border-[#2A2F34] font-mono text-sm font-bold text-[#D6B36A]">
                      #{occ.sequenceNumber}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-[#D6B36A]">
                          {occ.conceptualQuestion.canonicalRefCode}
                        </span>
                        <span className="text-xs text-[#717780]">&bull;</span>
                        <span className="text-xs font-medium text-[#F1F2F3]">
                          {occ.section.title}
                        </span>
                        <span className="text-xs text-[#717780]">&bull;</span>
                        <span className="rounded bg-[#171A1D] border border-[#2A2F34] px-1.5 py-0.5 text-[10px] font-mono text-[#A1A1AA]">
                          {occ.questionType}
                        </span>
                        {rep?.editorialVerified ? (
                          <span className="inline-flex items-center gap-1 rounded bg-[#22C55E]/10 border border-[#22C55E]/30 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[#22C55E]">
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-[#FBBF24]/10 border border-[#FBBF24]/30 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[#FBBF24]">
                            Draft
                          </span>
                        )}
                      </div>

                      <div className="text-xs font-medium text-[#717780]">
                        {occ.conceptualQuestion.primarySubject} &bull; {occ.conceptualQuestion.defaultTopic}
                      </div>

                      {rep?.questionText && (
                        <p className="line-clamp-2 text-xs text-[#A1A1AA]">
                          {rep.questionText}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Move Controls */}
                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      disabled={isPublished || isFirst || isPending}
                      onClick={() => handleSwap(idx, idx - 1)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#2A2F34] bg-[#171A1D] px-2.5 py-1.5 text-xs font-semibold text-[#F1F2F3] shadow-sm transition hover:bg-[#1D2125] hover:border-[#D6B36A]/50 disabled:pointer-events-none disabled:opacity-30"
                      aria-label={`Move Question #${occ.sequenceNumber} Up`}
                    >
                      &uarr; Up
                    </button>

                    <button
                      type="button"
                      disabled={isPublished || isLast || isPending}
                      onClick={() => handleSwap(idx, idx + 1)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#2A2F34] bg-[#171A1D] px-2.5 py-1.5 text-xs font-semibold text-[#F1F2F3] shadow-sm transition hover:bg-[#1D2125] hover:border-[#D6B36A]/50 disabled:pointer-events-none disabled:opacity-30"
                      aria-label={`Move Question #${occ.sequenceNumber} Down`}
                    >
                      &darr; Down
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
