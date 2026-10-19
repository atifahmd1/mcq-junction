import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { assertCandidateSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AttemptStatus } from "@/generated/prisma/enums";
import { ExamStartClient } from "./ExamStartClient";

interface ExamEntryPageProps {
  params: Promise<{
    paperId: string;
  }>;
}

// Tell Next.js 16 Cache Components that this route requires runtime session verification
export const instant = false;

export default async function ExamEntryPage({ params }: ExamEntryPageProps) {
  await connection();
  const { paperId } = await params;

  let candidateUser;
  try {
    candidateUser = await assertCandidateSession();
  } catch {
    redirect(`/auth/signin?next=/exam/${encodeURIComponent(paperId)}`);
  }

  // Fetch paper details
  const paper = await prisma.examPaper.findUnique({
    where: { id: paperId },
    include: {
      markingScheme: true,
      sections: {
        orderBy: { sectionOrder: "asc" },
      },
    },
  });

  if (!paper) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="rounded-3xl border border-[#F87171]/40 bg-[#281415] p-8">
          <h1 className="text-xl font-bold text-[#F87171]">
            Examination Paper Not Found
          </h1>
          <p className="mt-2 text-sm text-[#A1A1AA]">
            The requested examination paper could not be found or has been removed.
          </p>
          <div className="mt-6">
            <Link
              href="/exams"
              className="inline-flex items-center rounded-xl bg-[#1D2125] border border-[#2A2F34] px-4 py-2 text-sm font-semibold text-[#F1F2F3] hover:border-[#D6B36A] transition"
            >
              Return to Exams
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (paper.publishStatus !== "PUBLISHED") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-8">
          <h1 className="text-xl font-bold text-amber-300">
            Examination Not Published
          </h1>
          <p className="mt-2 text-sm text-[#A1A1AA]">
            This examination paper is currently in {paper.publishStatus} status and cannot be started.
          </p>
          <div className="mt-6">
            <Link
              href="/exams"
              className="inline-flex items-center rounded-xl bg-[#1D2125] border border-[#2A2F34] px-4 py-2 text-sm font-semibold text-[#F1F2F3] hover:border-[#D6B36A] transition"
            >
              Return to Exams
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Check candidate attempts
  const existingAttempts = await prisma.testAttempt.findMany({
    where: {
      paperId,
      userId: candidateUser.id,
    },
    include: {
      evaluations: {
        where: { isCurrentActive: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const activeAttempt = existingAttempts.find(
    (a) => a.attemptStatus === AttemptStatus.IN_PROGRESS
  );

  const completedAttempt = existingAttempts.find(
    (a) =>
      a.attemptStatus === AttemptStatus.SUBMITTED ||
      a.attemptStatus === AttemptStatus.EVALUATED
  );

  // If candidate already has an active in-progress attempt, redirect directly to attempt view
  if (activeAttempt) {
    redirect(`/exam/${paperId}/attempt/${activeAttempt.id}`);
  }

  // If candidate already completed the exam, show result summary card
  if (completedAttempt) {
    const activeEval = completedAttempt.evaluations[0];
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-[#2A2F34] bg-[#171A1D] p-8 shadow-sm">
          <div className="text-center">
            <span className="inline-flex items-center rounded-full bg-[#22C55E]/15 border border-[#22C55E]/30 px-3 py-1 text-xs font-semibold text-[#22C55E]">
              Examination Completed
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#F1F2F3]">
              {paper.title}
            </h1>
            <p className="mt-1 text-xs text-[#717780] font-mono">
              Paper Code: {paper.paperCode}
            </p>
          </div>

          <div className="mt-8 rounded-2xl border border-[#2A2F34] bg-[#14171A] p-6">
            <h2 className="text-sm font-semibold text-[#F1F2F3]">
              Candidate Performance Summary
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl bg-[#171A1D] border border-[#2A2F34] p-4 text-center">
                <dt className="text-xs text-[#717780]">Raw Score</dt>
                <dd className="mt-1 text-2xl font-black text-[#D6B36A]">
                  {activeEval ? Number(activeEval.rawScore).toFixed(2) : "0.00"}
                </dd>
              </div>
              <div className="rounded-xl bg-[#171A1D] border border-[#2A2F34] p-4 text-center">
                <dt className="text-xs text-[#717780]">Max Score</dt>
                <dd className="mt-1 text-2xl font-black text-[#F1F2F3]">
                  {Number(paper.maxScore).toFixed(2)}
                </dd>
              </div>
              <div className="rounded-xl bg-[#171A1D] border border-[#2A2F34] p-4 text-center">
                <dt className="text-xs text-[#717780]">Correct</dt>
                <dd className="mt-1 text-2xl font-black text-[#22C55E]">
                  {activeEval?.totalCorrect ?? 0}
                </dd>
              </div>
              <div className="rounded-xl bg-[#171A1D] border border-[#2A2F34] p-4 text-center">
                <dt className="text-xs text-[#717780]">Incorrect</dt>
                <dd className="mt-1 text-2xl font-black text-[#F87171]">
                  {activeEval?.totalWrong ?? 0}
                </dd>
              </div>
            </dl>
          </div>

          <p className="mt-6 text-center text-xs text-[#717780]">
            In accordance with the conducting body policy, each candidate is permitted a single official attempt.
          </p>

          <div className="mt-8 flex justify-center">
            <Link
              href="/dashboard"
              className="rounded-xl bg-[#D6B36A] px-6 py-2.5 text-xs font-bold text-[#0B0D0F] shadow-sm hover:bg-[#E4C582] transition"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Otherwise, render Paper Overview and Start Confirmation
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-6">
      <nav className="flex items-center gap-1.5 text-xs text-[#717780]">
        <Link href="/" className="hover:text-[#F1F2F3] transition">
          Home
        </Link>
        <span>/</span>
        <Link href="/exams" className="hover:text-[#F1F2F3] transition">
          Exams
        </Link>
        <span>/</span>
        <span className="font-semibold text-[#F1F2F3]">{paper.paperCode}</span>
      </nav>

      <div className="rounded-3xl border border-[#2A2F34] bg-[#171A1D] p-6 sm:p-8 shadow-sm">
        <div>
          <span className="inline-flex items-center rounded-full bg-[#D6B36A]/15 border border-[#D6B36A]/30 px-3 py-0.5 text-xs font-semibold text-[#D6B36A]">
            Live Official Examination
          </span>
          <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-[#F1F2F3]">
            {paper.title}
          </h1>
          <p className="mt-1 text-xs text-[#717780] font-mono">
            Paper Code: <span className="text-[#A1A1AA]">{paper.paperCode}</span>
          </p>
        </div>

        {/* Paper Metadata Overview */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-[#2A2F34] bg-[#14171A] p-4">
            <div className="text-xs font-medium text-[#717780]">Duration</div>
            <div className="mt-1 text-lg font-bold text-[#F1F2F3]">
              {paper.totalDurationMinutes} mins
            </div>
          </div>
          <div className="rounded-2xl border border-[#2A2F34] bg-[#14171A] p-4">
            <div className="text-xs font-medium text-[#717780]">Total Questions</div>
            <div className="mt-1 text-lg font-bold text-[#F1F2F3]">
              {paper.totalQuestions}
            </div>
          </div>
          <div className="rounded-2xl border border-[#2A2F34] bg-[#14171A] p-4">
            <div className="text-xs font-medium text-[#717780]">Total Marks</div>
            <div className="mt-1 text-lg font-bold text-[#F1F2F3]">
              {Number(paper.maxScore).toFixed(1)}
            </div>
          </div>
          <div className="rounded-2xl border border-[#2A2F34] bg-[#14171A] p-4">
            <div className="text-xs font-medium text-[#717780]">Marking Rule</div>
            <div className="mt-1 text-sm font-semibold text-[#F1F2F3]">
              +{Number(paper.markingScheme?.marksPerCorrect ?? 1)} / -
              {Number(paper.markingScheme?.negativeMarksPerWrong ?? 0)}
            </div>
          </div>
        </div>

        {/* Sections Breakdown */}
        {paper.sections.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-[#F1F2F3]">
              Paper Sections
            </h2>
            <ul className="mt-3 divide-y divide-[#2A2F34] rounded-2xl border border-[#2A2F34] bg-[#14171A]">
              {paper.sections.map((sec) => (
                <li
                  key={sec.id}
                  className="flex items-center justify-between px-4 py-3 text-xs sm:text-sm"
                >
                  <span className="font-medium text-[#F1F2F3]">
                    Section {sec.sectionOrder}: {sec.title}
                  </span>
                  <span className="text-xs text-[#717780]">
                    {sec.totalQuestions} questions
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Important Examination Instructions */}
        <div className="mt-8 rounded-2xl border border-[#D6B36A]/30 bg-[#231E14]/60 p-6 text-xs sm:text-sm">
          <h3 className="font-semibold text-[#D6B36A] uppercase tracking-wider text-xs">
            Important Candidate Instructions
          </h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[#A1A1AA] leading-relaxed">
            <li>
              <strong className="text-[#F1F2F3]">Authoritative Timing:</strong> The examination countdown timer resides on the server. Your timer starts immediately upon clicking &quot;Begin Examination&quot;.
            </li>
            <li>
              <strong className="text-[#F1F2F3]">Multiple-Correct Questions:</strong> Full marks are awarded only when the complete set of correct options is selected. Partial selections or incorrect choices receive negative penalties.
            </li>
            <li>
              <strong className="text-[#F1F2F3]">Automatic Saving:</strong> Your answers are saved durably to the server ledger as you navigate.
            </li>
            <li>
              <strong className="text-[#F1F2F3]">Safe Resumption:</strong> In case of accidental disconnection or reload, your session resumes with all saved responses intact.
            </li>
            <li>
              <strong className="text-[#F1F2F3]">Submission:</strong> The examination auto-submits when the official duration reaches zero.
            </li>
          </ul>
        </div>

        {/* Client start button with declaration */}
        <div className="mt-8 border-t border-[#2A2F34] pt-6">
          <ExamStartClient paperId={paper.id} paperTitle={paper.title} />
        </div>
      </div>
    </div>
  );
}
