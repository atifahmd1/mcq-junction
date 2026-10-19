// ============================================================================
// MCQ Junction — Autonomous Exam Finalization Cron Route Handler
// File: src/app/api/cron/finalize-overdue-attempts/route.ts
// ============================================================================

import { connection } from "next/server.js";
import { finalizeOverdueAttempts, type ExamServiceContext } from "../../../../lib/exam/service.ts";

/**
 * Validates the cron request against CRON_SECRET.
 * Supports standard Bearer token in Authorization header or x-cron-secret header.
 */
export function authenticateCronRequest(req: Request): { authorized: boolean; error?: string; status?: number } {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || cronSecret.trim().length === 0) {
    return {
      authorized: false,
      error: "Server misconfiguration: CRON_SECRET is not configured in environment",
      status: 500,
    };
  }

  const authHeader = req.headers.get("authorization");
  const xCronHeader = req.headers.get("x-cron-secret");

  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (bearerToken === cronSecret || xCronHeader === cronSecret) {
    return { authorized: true };
  }

  return {
    authorized: false,
    error: "Unauthorized: Missing or invalid cron secret",
    status: 401,
  };
}

export async function handleSweep(req: Request, ctx?: ExamServiceContext) {
  try {
    await connection();
  } catch {
    // connection() is a no-op in non-Next runtime/test environments
  }

  const auth = authenticateCronRequest(req);
  if (!auth.authorized) {
    return Response.json(
      { success: false, error: auth.error },
      { status: auth.status ?? 401 }
    );
  }

  const url = new URL(req.url);
  const paperId = url.searchParams.get("paperId") || undefined;

  const startTime = Date.now();

  try {
    const res = await finalizeOverdueAttempts(paperId, ctx);
    const durationMs = Date.now() - startTime;

    // Structured logging for production observability (Datadog / Axiom / Vercel Log Drains)
    console.log(
      JSON.stringify({
        event: "CRON_FINALIZE_OVERDUE_ATTEMPTS",
        timestamp: new Date().toISOString(),
        durationMs,
        paperId: paperId ?? "ALL_PAPERS",
        finalizedCount: res.finalizedCount,
        attemptIds: res.attemptIds,
      })
    );

    return Response.json({
      success: true,
      paperId: paperId ?? null,
      finalizedCount: res.finalizedCount,
      attemptIds: res.attemptIds,
      durationMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : "Unknown database sweep failure";

    console.error(
      JSON.stringify({
        event: "CRON_FINALIZE_OVERDUE_ATTEMPTS_FAILED",
        timestamp: new Date().toISOString(),
        durationMs,
        paperId: paperId ?? "ALL_PAPERS",
        error: errorMessage,
      })
    );

    return Response.json(
      {
        success: false,
        error: errorMessage,
        code: "SWEEP_FAILED",
        durationMs,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return handleSweep(req);
}

export async function POST(req: Request) {
  return handleSweep(req);
}
