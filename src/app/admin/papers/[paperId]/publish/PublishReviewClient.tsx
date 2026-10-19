"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { publishExamPaperAction } from "@/app/admin/actions";
import { type PublicationResult } from "@/lib/admin/service";

export interface GateCheck {
  id: string;
  title: string;
  description: string;
  passed: boolean;
  actual: string;
  expected: string;
}

interface PublishReviewClientProps {
  paperId: string;
  paperCode: string;
  paperTitle: string;
  currentStatus: string;
  allGatesPassed: boolean;
  gates: GateCheck[];
}

export default function PublishReviewClient({
  paperId,
  paperCode,
  paperTitle,
  currentStatus,
  allGatesPassed,
  gates,
}: PublishReviewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [publishedResult, setPublishedResult] = useState<PublicationResult | null>(null);

  const isAlreadyPublished = currentStatus === "PUBLISHED";

  const handleExecutePublication = () => {
    setErrorMsg(null);
    setShowConfirmModal(false);

    startTransition(async () => {
      const res = await publishExamPaperAction({ paperId });

      if (!res.success) {
        setErrorMsg(res.error ?? "Publication procedure failed.");
      } else if (res.data) {
        setPublishedResult(res.data);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Already Published State */}
      {isAlreadyPublished && (
        <div className="rounded-2xl border border-[#22C55E]/40 bg-[#22C55E]/10 p-6 text-[#22C55E] shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#22C55E]/20 text-[#22C55E]">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#F1F2F3]">Exam Paper is Live & Published</h2>
              <p className="text-xs text-[#A1A1AA] mt-0.5">
                This paper has successfully cleared all publication gates. Its question content, options, and sequence
                numbers are locked under PostgreSQL immutability triggers.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Success Celebration Card */}
      {publishedResult && (
        <div className="rounded-2xl border border-[#22C55E]/40 bg-[#111416] p-6 text-[#F1F2F3] shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-[#22C55E] text-base">●</span>
            <h2 className="text-base sm:text-lg font-bold text-[#22C55E]">Publication Successfully Executed!</h2>
          </div>
          <p className="mt-1 text-xs text-[#A1A1AA]">
            Exam paper has been transitioned to PUBLISHED status via master stored procedure fn_publish_exam_paper.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl border border-[#2A2F34] bg-[#171A1D] p-4 text-xs">
            <div>
              <span className="text-[#717780]">Paper ID:</span>
              <div className="font-mono text-[#F1F2F3] break-all">{publishedResult.paper_id}</div>
            </div>
            <div>
              <span className="text-[#717780]">Published Status:</span>
              <div className="font-bold text-[#22C55E]">{publishedResult.publish_status}</div>
            </div>
            <div>
              <span className="text-[#717780]">Published At:</span>
              <div className="text-[#F1F2F3]">{publishedResult.published_at}</div>
            </div>
            <div>
              <span className="text-[#717780]">Authoritative Publisher:</span>
              <div className="font-mono text-[#F1F2F3] break-all">{publishedResult.published_by}</div>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <Link
              href="/admin/papers"
              className="rounded-xl bg-[#D6B36A] px-4 py-2 text-xs font-semibold text-[#0B0D0F] transition hover:bg-[#E4C582]"
            >
              Back to Exam Papers Table
            </Link>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div className="rounded-2xl border border-[#F87171]/40 bg-[#F87171]/10 p-4 text-xs sm:text-sm text-[#F87171]">
          <div className="font-semibold">Publication Failed:</div>
          <div className="mt-0.5">{errorMsg}</div>
        </div>
      )}

      {/* Publication Gate Checklist */}
      <div className="overflow-hidden rounded-2xl border border-[#2A2F34] bg-[#111416] shadow-sm">
        <div className="border-b border-[#2A2F34] px-6 py-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-[#F1F2F3]">
                Master Publication Gate Verification
              </h2>
              <p className="text-xs text-[#717780]">
                All 5 relational and editorial requirements must be satisfied before publication can execute.
              </p>
            </div>
            <div>
              {allGatesPassed ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#22C55E]/10 border border-[#22C55E]/30 px-2.5 py-1 text-xs font-mono font-semibold text-[#22C55E]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                  All Gates Clear
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FBBF24]/10 border border-[#FBBF24]/30 px-2.5 py-1 text-xs font-mono font-semibold text-[#FBBF24]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FBBF24]" />
                  Action Required
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="divide-y divide-[#2A2F34]">
          {gates.map((gate) => (
            <div key={gate.id} className="flex items-start justify-between p-6 hover:bg-[#171A1D]/30 transition">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    gate.passed
                      ? "bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E]"
                      : "bg-[#F87171]/10 border border-[#F87171]/30 text-[#F87171]"
                  }`}
                >
                  {gate.passed ? "✓" : "✗"}
                </span>

                <div className="space-y-0.5">
                  <div className="text-xs sm:text-sm font-semibold text-[#F1F2F3]">{gate.title}</div>
                  <p className="text-xs text-[#717780]">{gate.description}</p>
                </div>
              </div>

              <div className="text-right text-xs">
                <div className="font-semibold text-[#F1F2F3]">
                  Actual: <span className={gate.passed ? "text-[#22C55E]" : "text-[#F87171]"}>{gate.actual}</span>
                </div>
                <div className="text-[#717780]">Expected: {gate.expected}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Action Footer */}
        <div className="flex flex-col gap-3 border-t border-[#2A2F34] bg-[#171A1D] p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-[#A1A1AA]">
            {allGatesPassed && !isAlreadyPublished
              ? "All requirements are verified. Administrator authorization required to trigger procedure."
              : isAlreadyPublished
              ? "Exam paper is currently active and immutable."
              : "Resolve all unmet checklist items before publication can proceed."}
          </div>

          {!isAlreadyPublished && (
            <button
              type="button"
              disabled={!allGatesPassed || isPending}
              onClick={() => setShowConfirmModal(true)}
              className="rounded-xl bg-[#D6B36A] px-5 py-2.5 text-xs font-bold text-[#0B0D0F] shadow-sm transition hover:bg-[#E4C582] disabled:pointer-events-none disabled:opacity-40"
            >
              {isPending ? "Executing Stored Procedure..." : "Review & Publish Paper"}
            </button>
          )}
        </div>
      </div>

      {/* Explicit Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#2A2F34] bg-[#1D2125] p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#D6B36A]/10 border border-[#D6B36A]/30 text-[#D6B36A]">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>

            <h3 className="mt-4 text-base sm:text-lg font-bold text-[#F1F2F3]">
              Confirm Final Examination Paper Publication
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[#A1A1AA]">
              You are about to publish <strong className="text-[#F1F2F3]">{paperTitle} ({paperCode})</strong>.
              This will execute <code className="rounded bg-[#171A1D] px-1 py-0.5 text-[#D6B36A] font-mono">fn_publish_exam_paper</code> within
              an atomic transaction under PostgreSQL advisory locks.
            </p>
            <div className="mt-4 rounded-xl border border-[#FBBF24]/30 bg-[#FBBF24]/10 p-3 text-[11px] text-[#FBBF24]">
              <strong>Irreversible Immutability Guarantee:</strong> Once published, question text, representations, option order, and sequence
              numbering become strictly immutable.
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setShowConfirmModal(false)}
                className="rounded-xl border border-[#2A2F34] bg-[#171A1D] px-4 py-2 text-xs font-semibold text-[#A1A1AA] transition hover:bg-[#111416] hover:text-[#F1F2F3]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleExecutePublication}
                className="rounded-xl bg-[#D6B36A] px-4 py-2 text-xs font-bold text-[#0B0D0F] shadow-sm transition hover:bg-[#E4C582]"
              >
                {isPending ? "Publishing..." : "Yes, Execute Publication"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
