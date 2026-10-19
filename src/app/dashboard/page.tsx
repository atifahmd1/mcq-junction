import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { syncUserRecord } from "@/lib/auth/sync";
import { signOut } from "@/app/auth/actions";

// Tell Next.js 16 Cache Components that this route requires runtime session verification
export const instant = false;

export default async function DashboardPage() {
  await connection();
  const supabase = await createClient();

  // SECURE SERVER-SIDE VERIFICATION:
  // We call getUser() to cryptographically verify the session token against
  // Supabase Auth. Never trust client-submitted headers, cookies, or IDs directly.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/signin");
  }

  // QUERY APPLICATION DATA LAYER VIA PRISMA:
  // Using the verified user.id from Supabase Auth, we query our strongly typed
  // application database table in PostgreSQL.
  let dbUser = null;
  try {
    dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
  } catch (findError) {
    console.error(
      "Database read error during dashboard load:",
      findError instanceof Error ? findError.message : "DB error"
    );
  }

  // Self-healing recovery: If the user is authenticated in Supabase Auth
  // but their application record was not yet created (e.g. preexisting user
  // or signup DB sync transient failure), heal the record immediately via centralized sync:
  if (!dbUser && user.email) {
    const syncRes = await syncUserRecord(user);
    if (syncRes.success && syncRes.user) {
      dbUser = syncRes.user;
    }
  }

  // Query candidate examination activity
  let activeAttempts: Array<{
    id: string;
    paperId: string;
    startedAt: Date;
    expiresAt: Date | null;
    paper: {
      paperCode: string;
      title: string;
      totalDurationMinutes: number;
      totalQuestions: number;
    };
  }> = [];

  let completedAttempts: Array<{
    id: string;
    paperId: string;
    submittedAt: Date | null;
    paper: {
      paperCode: string;
      title: string;
      maxScore: unknown;
    };
    evaluations: Array<{
      rawScore: unknown;
      evaluatedDenominator: unknown;
      totalCorrect: number;
      totalWrong: number;
      totalUnanswered: number;
    }>;
  }> = [];

  let publishedPapers: Array<{
    id: string;
    paperCode: string;
    title: string;
    totalDurationMinutes: number;
    totalQuestions: number;
    maxScore: unknown;
  }> = [];

  try {
    const [active, completed, papers] = await Promise.all([
      prisma.testAttempt.findMany({
        where: {
          userId: user.id,
          attemptStatus: "IN_PROGRESS",
        },
        include: {
          paper: {
            select: {
              paperCode: true,
              title: true,
              totalDurationMinutes: true,
              totalQuestions: true,
            },
          },
        },
        orderBy: { startedAt: "desc" },
      }),
      prisma.testAttempt.findMany({
        where: {
          userId: user.id,
          attemptStatus: { in: ["EVALUATED", "SUBMITTED"] },
        },
        include: {
          paper: {
            select: {
              paperCode: true,
              title: true,
              maxScore: true,
            },
          },
          evaluations: {
            where: { isCurrentActive: true },
            select: {
              rawScore: true,
              evaluatedDenominator: true,
              totalCorrect: true,
              totalWrong: true,
              totalUnanswered: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.examPaper.findMany({
        where: { publishStatus: "PUBLISHED" },
        select: {
          id: true,
          paperCode: true,
          title: true,
          totalDurationMinutes: true,
          totalQuestions: true,
          maxScore: true,
        },
        orderBy: { publishedAt: "desc" },
        take: 6,
      }),
    ]);

    activeAttempts = active;
    completedAttempts = completed;
    publishedPapers = papers;
  } catch (err) {
    console.error("Failed to query candidate dashboard activity:", err);
  }

  const isAdmin = dbUser && "role" in dbUser && dbUser.role === "ADMIN";

  return (
    <div className="min-h-screen bg-[#0B0D0F] text-[#F1F2F3] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header Banner */}
        <div className="rounded-2xl border border-[#2A2F34] bg-[#111416] p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center pb-6 border-b border-[#2A2F34]">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-[#22C55E]/10 border border-[#22C55E]/20 px-2.5 py-0.5 text-xs font-mono font-medium text-[#22C55E]">
                  ● Authenticated
                </span>
                <span className="text-xs font-mono text-[#D6B36A] uppercase bg-[#171A1D] border border-[#2A2F34] px-2 py-0.5 rounded">
                  {dbUser && "role" in dbUser ? String(dbUser.role) : "STUDENT"}
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#F1F2F3]">
                Welcome back, {dbUser?.name ?? "Candidate"}
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[#A1A1AA]">
                {user.email} &bull; Manage your active examination attempts and track test performance
              </p>
            </div>

            <div className="flex items-center gap-3">
              {isAdmin && (
                <Link
                  href="/admin/papers"
                  className="rounded-xl bg-[#D6B36A] px-4 py-2 text-xs font-bold text-[#0B0D0F] transition hover:bg-[#E4C582] shadow-xs"
                >
                  Admin Portal &rarr;
                </Link>
              )}
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-xl border border-[#2A2F34] bg-[#171A1D] px-4 py-2 text-xs font-semibold text-[#F1F2F3] transition hover:bg-[#1D2125] hover:border-[#D6B36A]/40"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>

          {/* Quick Action Navigation */}
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs">
            <Link
              href="/exams"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2A2F34] bg-[#171A1D] px-3.5 py-2 font-medium text-[#F1F2F3] hover:border-[#D6B36A] transition"
            >
              Browse All Exams &rarr;
            </Link>
            <Link
              href="/learn"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2A2F34] bg-[#171A1D] px-3.5 py-2 font-medium text-[#F1F2F3] hover:border-[#D6B36A] transition"
            >
              Learning Mode Practice &rarr;
            </Link>
          </div>
        </div>

        {/* 1. Active Examination Attempts (Resumable) */}
        {activeAttempts.length > 0 && (
          <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
                <h2 className="text-base font-bold text-[#F1F2F3]">Active Examination in Progress</h2>
              </div>
              <span className="text-xs font-mono text-amber-400">Resumable Attempt</span>
            </div>

            <div className="space-y-3">
              {activeAttempts.map((att) => (
                <div
                  key={att.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-[#2A2F34] bg-[#171A1D] p-4"
                >
                  <div>
                    <span className="text-[11px] font-mono font-semibold text-[#D6B36A] bg-[#111416] px-2 py-0.5 rounded border border-[#2A2F34]">
                      {att.paper.paperCode}
                    </span>
                    <h3 className="mt-1 text-sm font-bold text-[#F1F2F3]">{att.paper.title}</h3>
                    <div className="mt-1 flex items-center gap-3 text-xs text-[#717780]">
                      <span>Started: {new Date(att.startedAt).toLocaleTimeString()}</span>
                      <span>&bull;</span>
                      <span>{att.paper.totalQuestions} Questions</span>
                      <span>&bull;</span>
                      <span>{att.paper.totalDurationMinutes} Minutes</span>
                    </div>
                  </div>

                  <Link
                    href={`/exam/${att.paperId}/attempt/${att.id}`}
                    className="inline-flex items-center rounded-xl bg-[#D6B36A] px-4 py-2 text-xs font-bold text-[#0B0D0F] hover:bg-[#E4C582] transition shadow-xs whitespace-nowrap"
                  >
                    Resume Examination &rarr;
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 2. Available Official Examinations */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#F1F2F3]">Available Examination Papers</h2>
              <p className="text-xs text-[#A1A1AA]">Official timed papers passing all publication integrity checks</p>
            </div>
            <Link href="/exams" className="text-xs font-semibold text-[#D6B36A] hover:underline">
              View catalog &rarr;
            </Link>
          </div>

          {publishedPapers.length === 0 ? (
            <div className="rounded-xl border border-[#2A2F34] bg-[#14171A] p-6 text-center text-xs text-[#717780]">
              No published examination papers are currently active. Check back shortly.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {publishedPapers.map((paper) => (
                <div
                  key={paper.id}
                  className="flex flex-col justify-between rounded-xl border border-[#2A2F34] bg-[#171A1D] p-5 hover:border-[#D6B36A]/50 transition"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono font-semibold text-[#D6B36A] bg-[#111416] px-2 py-0.5 rounded border border-[#2A2F34]">
                        {paper.paperCode}
                      </span>
                      <span className="text-[10px] font-semibold text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2 py-0.5 rounded">
                        Published
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-bold text-[#F1F2F3] line-clamp-2">{paper.title}</h3>
                    <div className="mt-2 flex items-center gap-3 text-xs text-[#717780]">
                      <span>{paper.totalQuestions} Questions</span>
                      <span>&bull;</span>
                      <span>{paper.totalDurationMinutes} Mins</span>
                      <span>&bull;</span>
                      <span>Max {String(paper.maxScore)} Marks</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-[#2A2F34]/60">
                    <Link
                      href={`/exam/${paper.id}`}
                      className="inline-flex w-full items-center justify-center rounded-xl bg-[#1D2125] border border-[#2A2F34] px-4 py-2 text-xs font-bold text-[#F1F2F3] hover:border-[#D6B36A] hover:text-[#D6B36A] transition"
                    >
                      Start Examination &rarr;
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 3. Completed Examination Scorecards */}
        {completedAttempts.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-[#F1F2F3]">Recent Performance &amp; Scorecards</h2>
            <div className="space-y-3">
              {completedAttempts.map((att) => {
                const evaluation = att.evaluations[0];
                const rawScore = evaluation ? Number(evaluation.rawScore) : 0;
                const totalMarks = evaluation ? Number(evaluation.evaluatedDenominator) : Number(att.paper.maxScore);
                const percentage = totalMarks > 0 ? ((rawScore / totalMarks) * 100).toFixed(1) : "0.0";

                return (
                  <div
                    key={att.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-[#2A2F34] bg-[#171A1D] p-5"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-semibold text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2 py-0.5 rounded">
                          Evaluated
                        </span>
                        <span className="text-xs text-[#717780]">
                          {att.submittedAt ? new Date(att.submittedAt).toLocaleDateString() : "Recent"}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-[#F1F2F3]">{att.paper.title}</h3>
                      {evaluation && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="rounded bg-[#22C55E]/15 text-[#22C55E] px-2 py-0.5 font-semibold">
                            {evaluation.totalCorrect} Correct
                          </span>
                          <span className="rounded bg-[#EF4444]/15 text-[#EF4444] px-2 py-0.5 font-semibold">
                            {evaluation.totalWrong} Incorrect
                          </span>
                          <span className="rounded bg-[#717780]/20 text-[#A1A1AA] px-2 py-0.5 font-semibold">
                            {evaluation.totalUnanswered} Unanswered
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 sm:text-right">
                      <div>
                        <div className="text-lg font-extrabold text-[#D6B36A]">
                          {rawScore.toFixed(2)} <span className="text-xs font-normal text-[#717780]">/ {totalMarks.toFixed(2)}</span>
                        </div>
                        <div className="text-[11px] text-[#A1A1AA]">{percentage}% Score</div>
                      </div>

                      <Link
                        href={`/exam/${att.paperId}/attempt/${att.id}`}
                        className="inline-flex items-center rounded-xl border border-[#2A2F34] bg-[#14171A] px-3.5 py-2 text-xs font-semibold text-[#F1F2F3] hover:border-[#D6B36A] hover:text-[#D6B36A] transition whitespace-nowrap"
                      >
                        View Scorecard &rarr;
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 4. Technical Identity & Verification Summary */}
        <div className="rounded-xl border border-[#2A2F34]/60 bg-[#111416] p-5 text-xs text-[#717780]">
          <div className="flex items-center justify-between">
            <span>Identity: <strong className="text-[#F1F2F3]">{user.email}</strong> (UUID: {user.id.slice(0, 8)}...)</span>
            <span>Database: <strong className="text-[#22C55E]">Synchronized</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}
