"use client";

// ============================================================================
// MCQ Junction — Exam Start Client Component with Candidate Declaration
// File: src/app/exam/[paperId]/ExamStartClient.tsx
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startExamAction } from "../actions";

interface ExamStartClientProps {
  paperId: string;
  paperTitle: string;
}

export function ExamStartClient({ paperId, paperTitle }: ExamStartClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = () => {
    if (!agreed) {
      setError("You must acknowledge the examination instructions to proceed.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const res = await startExamAction(paperId);
      if (!res.success || !res.data) {
        setError(res.error ?? "Failed to initialize examination session.");
        return;
      }
      router.push(`/exam/${paperId}/attempt/${res.data.attemptId}`);
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-[#F87171]/40 bg-[#281415] p-4 text-xs sm:text-sm text-[#F87171]">
          {error}
        </div>
      )}

      <div className="flex items-start gap-3 rounded-2xl border border-[#2A2F34] bg-[#14171A] p-4">
        <input
          id="declaration"
          type="checkbox"
          checked={agreed}
          onChange={(e) => {
            setAgreed(e.target.checked);
            if (error) setError(null);
          }}
          className="mt-0.5 h-4 w-4 rounded border-[#2A2F34] bg-[#0B0D0F] accent-[#D6B36A] focus:ring-2 focus:ring-[#D6B36A]"
        />
        <label
          htmlFor="declaration"
          className="cursor-pointer text-xs sm:text-sm text-[#A1A1AA] leading-relaxed select-none"
        >
          I have read and understood all instructions for <strong className="text-[#F1F2F3]">{paperTitle}</strong>. I declare that I will adhere to all examination integrity guidelines and understand that my answers are server-monitored.
        </label>
      </div>

      <div className="flex flex-col items-start sm:items-center justify-between gap-4 sm:flex-row">
        <p className="text-xs text-[#717780]">
          Clicking &quot;Begin Examination&quot; creates your attempt ledger and starts the official timer.
        </p>

        <button
          type="button"
          onClick={handleStart}
          disabled={isPending || !agreed}
          className={`inline-flex items-center justify-center rounded-xl px-6 py-3 text-xs sm:text-sm font-bold shadow-sm transition ${
            isPending || !agreed
              ? "cursor-not-allowed bg-[#1D2125] text-[#717780] border border-[#2A2F34]"
              : "bg-[#D6B36A] text-[#0B0D0F] hover:bg-[#E4C582] shadow-[0_0_15px_rgba(214,179,106,0.3)]"
          }`}
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin text-[#0B0D0F]"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              Initializing Session...
            </span>
          ) : (
            "Begin Examination →"
          )}
        </button>
      </div>
    </div>
  );
}
