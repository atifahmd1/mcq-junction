import { connection } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await connection();
  const startTime = Date.now();

  try {
    // Real-time database connectivity probe for uptime monitors and readiness checks.
    const rowCount = await prisma.databaseTest.count();
    const latencyMs = Date.now() - startTime;

    return Response.json(
      {
        status: "healthy",
        database: "connected",
        latencyMs,
        testRowCount: rowCount,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const isProd = process.env.NODE_ENV === "production";
    const errorMessage =
      error instanceof Error ? error.message : "Database connection probe failed";

    return Response.json(
      {
        status: "unhealthy",
        database: "disconnected",
        latencyMs,
        error: isProd ? "Database probe failed" : errorMessage,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}

