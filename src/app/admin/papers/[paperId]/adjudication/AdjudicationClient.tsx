"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reevaluatePaperAttemptsAction } from "@/app/admin/actions";
import { type ReevaluationResult } from "@/lib/admin/service";

interface KeyVersionOption {
  id: string;
  versionNumber: number;
  versionTag: string;
  isOfficial: boolean;
  itemCount: number;
  releaseNotes: string | null;
}

interface AdjudicationClientProps {
  paperId: string;
  isPublished: boolean;
  totalAttemptsCount: number;
  keyVersions: KeyVersionOption[];
}

export default function AdjudicationClient({
  paperId,
  isPublished,
  totalAttemptsCount,
  keyVersions,
}: AdjudicationClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedKeyId, setSelectedKeyId] = useState<string>(keyVersions[0]?.id || "");
  const [reason, setReason] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ReevaluationResult | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPublished || !selectedKeyId || !isConfirmed || reason.trim().length < 5) {
      return;
    }

    setErrorMsg(null);
    setResult(null);

    startTransition(async () => {
      const res = await reevaluatePaperAttemptsAction({
        paperId,
        newKeyVersionId: selectedKeyId,
        adjudicationReason: reason.trim(),
      });

      if (!res.success) {
        setErrorMsg(res.error ?? "Failed to re-evaluate paper attempts.");
      } else if (res.data) {
        setResult(res.data);
        setReason("");
        setIsConfirmed(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Unpublished Notice */}
      {!isPublished && (
        <div className="rounded-2xl border border-[#FBBF24]/30 bg-[#FBBF24]/10 p-6 text-[#FBBF24] shadow-sm">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 shrink-0 text-[#FBBF24]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-xs sm:text-sm">
              <strong className="font-semibold text-[#F1F2F3]">Re-evaluation Gate (MCQJ-ERR-5016):</strong> Only published exam papers can undergo attempt re-evaluation.
              This paper must be published before candidate attempts can be recorded and adjudicated.
            </div>
          </div>
        </div>
      )}

      {/* Result Celebration / Ledger Summary Card */}
      {result && (
        <div className="rounded-2xl border border-[#22C55E]/40 bg-[#111416] p-6 text-[#F1F2F3] shadow-md">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E]">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#22C55E]">Two-Tier Ledger Re-evaluation Complete</h2>
              <p className="text-xs text-[#A1A1AA]">
                Candidate scores have been recalculated. Original evaluation records (v1) remain permanently immutable.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl border border-[#2A2F34] bg-[#171A1D] p-4 text-xs sm:grid-cols-4">
            <div>
              <span className="text-[#717780]">Attempts Re-evaluated:</span>
              <div className="text-base font-bold text-[#22C55E]">{result.attempts_reevaluated}</div>
            </div>
            <div>
              <span className="text-[#717780]">Key Version ID:</span>
              <div className="truncate font-mono text-[#F1F2F3]">{result.key_version_id}</div>
            </div>
            <div>
              <span className="text-[#717780]">Adjudicated By:</span>
              <div className="truncate font-mono text-[#F1F2F3]">{result.adjudicated_by}</div>
            </div>
            <div>
              <span className="text-[#717780]">Ledger Status:</span>
              <div className="font-bold text-[#22C55E]">ACTIVE VERSION UPDATED</div>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div className="rounded-2xl border border-[#F87171]/40 bg-[#F87171]/10 p-4 text-xs sm:text-sm text-[#F87171]">
          <div className="font-semibold">Adjudication Error:</div>
          <div className="mt-0.5">{errorMsg}</div>
        </div>
      )}

      {/* Re-evaluation Form */}
      <div className="rounded-2xl border border-[#2A2F34] bg-[#111416] p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#F1F2F3]">
          Execute Candidate Attempt Re-evaluation
        </h2>
        <p className="mt-1 text-xs text-[#717780]">
          Recalculates raw scores for all candidate attempts against a revised official answer key version.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="keyVersionSelect" className="block text-xs font-semibold text-[#A1A1AA]">
              Select Revised Official Answer Key Version
            </label>
            <select
              id="keyVersionSelect"
              value={selectedKeyId}
              onChange={(e) => setSelectedKeyId(e.target.value)}
              disabled={!isPublished || isPending || keyVersions.length === 0}
              className="mt-1.5 w-full rounded-xl border border-[#2A2F34] bg-[#171A1D] px-4 py-2 text-xs sm:text-sm text-[#F1F2F3] focus:border-[#D6B36A] focus:outline-none"
            >
              {keyVersions.map((kv) => (
                <option key={kv.id} value={kv.id} className="bg-[#171A1D] text-[#F1F2F3]">
                  Version {kv.versionNumber} ({kv.versionTag}) — {kv.itemCount} items {kv.isOfficial ? "[Official]" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="adjudicationReasonInput" className="block text-xs font-semibold text-[#A1A1AA]">
              Official Adjudication Rationale / Reason (min 5 characters)
            </label>
            <textarea
              id="adjudicationReasonInput"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Conducted expert committee review; revised answer for Question 42 from Option B to Option C."
              disabled={!isPublished || isPending}
              className="mt-1.5 w-full rounded-xl border border-[#2A2F34] bg-[#171A1D] px-4 py-2.5 text-xs sm:text-sm text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none"
            />
          </div>

          <div className="flex items-start gap-2.5 pt-2">
            <input
              id="confirmAdjudication"
              type="checkbox"
              checked={isConfirmed}
              onChange={(e) => setIsConfirmed(e.target.checked)}
              disabled={!isPublished || isPending}
              className="mt-1 h-4 w-4 rounded accent-[#D6B36A]"
            />
            <label htmlFor="confirmAdjudication" className="text-xs text-[#A1A1AA]">
              I certify that this official answer key revision has been authorized by the conducting authority.
              I understand that <strong className="text-[#F1F2F3]">{totalAttemptsCount} candidate attempts</strong> will
              be recalculated under the two-tier evaluation ledger.
            </label>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={
                !isPublished ||
                isPending ||
                !isConfirmed ||
                reason.trim().length < 5 ||
                !selectedKeyId
              }
              className="rounded-xl bg-[#D6B36A] px-5 py-2.5 text-xs font-bold text-[#0B0D0F] shadow-sm transition hover:bg-[#E4C582] disabled:pointer-events-none disabled:opacity-40"
            >
              {isPending ? "Executing Two-Tier Re-evaluation..." : "Run Official Re-evaluation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
