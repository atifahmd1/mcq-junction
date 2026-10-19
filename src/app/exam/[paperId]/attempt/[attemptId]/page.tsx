import { redirect } from "next/navigation";
import { connection } from "next/server";
import { assertCandidateSession } from "@/lib/auth/session";
import { getExamAttempt } from "@/lib/exam/service";
import { ExamDeliveryClient } from "./ExamDeliveryClient";

interface ExamAttemptPageProps {
  params: Promise<{
    paperId: string;
    attemptId: string;
  }>;
}

// Tell Next.js 16 Cache Components that this route requires runtime session verification
export const instant = false;

export default async function ExamAttemptPage({ params }: ExamAttemptPageProps) {
  await connection();
  const { paperId, attemptId } = await params;

  let candidateUser;
  try {
    candidateUser = await assertCandidateSession();
  } catch {
    redirect(`/auth/signin?next=/exam/${encodeURIComponent(paperId)}/attempt/${encodeURIComponent(attemptId)}`);
  }

  let attemptView;
  try {
    attemptView = await getExamAttempt(
      { attemptId },
      candidateUser
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load examination attempt";
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 dark:border-red-900/50 dark:bg-red-950/20">
          <h1 className="text-xl font-bold text-red-800 dark:text-red-300">
            Examination Access Error
          </h1>
          <p className="mt-2 text-sm text-red-700 dark:text-red-400">
            {message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <ExamDeliveryClient initialAttempt={attemptView} />
    </div>
  );
}
