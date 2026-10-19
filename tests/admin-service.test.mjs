// ============================================================================
// MCQ Junction — Administrative Service & Authorization Foundation Tests
// File: tests/admin-service.test.mjs
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";

import {
  assertAdminSession,
  UnauthorizedError,
  ForbiddenError,
} from "../src/lib/auth/session.ts";
import {
  publishPaperSchema,
  reevaluatePaperSchema,
} from "../src/lib/admin/schemas.ts";
import {
  mapDatabaseDomainError,
  publishExamPaper,
  reevaluatePaperAttempts,
  AdminServiceError,
} from "../src/lib/admin/service.ts";
import { Role } from "../src/generated/prisma/enums.ts";

// ----------------------------------------------------------------------------
// 1. Authorization Foundation: assertAdminSession() Unit Tests
// ----------------------------------------------------------------------------

test("assertAdminSession: Rejects unauthenticated caller (missing/null user)", async () => {
  const mockSupabase = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: { message: "Auth session missing" } }),
    },
  };

  await assert.rejects(
    async () => {
      await assertAdminSession({ supabaseClient: mockSupabase });
    },
    (err) => {
      assert(err instanceof UnauthorizedError);
      assert.equal(err.statusCode, 401);
      assert.match(err.message, /Auth session missing|Authentication session required/);
      return true;
    }
  );
});

test("assertAdminSession: Rejects anonymous session", async () => {
  const mockSupabase = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "11111111-1111-4111-8111-111111111111",
            email: "anon@mcq.test",
            is_anonymous: true,
          },
        },
        error: null,
      }),
    },
  };

  await assert.rejects(
    async () => {
      await assertAdminSession({ supabaseClient: mockSupabase });
    },
    (err) => {
      assert(err instanceof UnauthorizedError);
      assert.equal(err.statusCode, 401);
      assert.match(err.message, /Anonymous sessions cannot access/);
      return true;
    }
  );
});

test("assertAdminSession: Rejects actively suspended/banned user (banned_until in future)", async () => {
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  const mockSupabase = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "22222222-2222-4222-8222-222222222222",
            email: "banned@mcq.test",
            banned_until: futureDate,
          },
        },
        error: null,
      }),
    },
  };

  await assert.rejects(
    async () => {
      await assertAdminSession({ supabaseClient: mockSupabase });
    },
    (err) => {
      assert(err instanceof ForbiddenError);
      assert.equal(err.statusCode, 403);
      assert.match(err.message, /suspended until/);
      return true;
    }
  );
});

test("assertAdminSession: Rejects suspended user via app_metadata.banned_until", async () => {
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  const mockSupabase = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "22222222-2222-4222-8222-222222222223",
            email: "banned_meta@mcq.test",
            app_metadata: { banned_until: futureDate },
          },
        },
        error: null,
      }),
    },
  };

  await assert.rejects(
    async () => {
      await assertAdminSession({ supabaseClient: mockSupabase });
    },
    (err) => {
      assert(err instanceof ForbiddenError);
      assert.equal(err.statusCode, 403);
      assert.match(err.message, /suspended until/);
      return true;
    }
  );
});

test("assertAdminSession: Rejects malformed ban timestamp fail closed", async () => {
  const mockSupabase = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "22222222-2222-4222-8222-222222222224",
            email: "malformed_ban@mcq.test",
            banned_until: "not-a-valid-date-string",
          },
        },
        error: null,
      }),
    },
  };

  await assert.rejects(
    async () => {
      await assertAdminSession({ supabaseClient: mockSupabase });
    },
    (err) => {
      assert(err instanceof ForbiddenError);
      assert.equal(err.statusCode, 403);
      assert.match(err.message, /could not be verified/);
      return true;
    }
  );
});

test("assertAdminSession: Rejects deactivated user (deleted_at set)", async () => {
  const mockSupabase = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "33333333-3333-4333-8333-333333333333",
            email: "deleted@mcq.test",
            deleted_at: new Date().toISOString(),
          },
        },
        error: null,
      }),
    },
  };

  await assert.rejects(
    async () => {
      await assertAdminSession({ supabaseClient: mockSupabase });
    },
    (err) => {
      assert(err instanceof ForbiddenError);
      assert.equal(err.statusCode, 403);
      assert.match(err.message, /deactivated/);
      return true;
    }
  );
});

test("assertAdminSession: Rejects deactivated user via app_metadata.deleted_at", async () => {
  const mockSupabase = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "33333333-3333-4333-8333-333333333334",
            email: "deleted_meta@mcq.test",
            app_metadata: { deleted_at: new Date().toISOString() },
          },
        },
        error: null,
      }),
    },
  };

  await assert.rejects(
    async () => {
      await assertAdminSession({ supabaseClient: mockSupabase });
    },
    (err) => {
      assert(err instanceof ForbiddenError);
      assert.equal(err.statusCode, 403);
      assert.match(err.message, /deactivated/);
      return true;
    }
  );
});

test("assertAdminSession: Rejects caller missing application user record in database", async () => {
  const mockSupabase = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "44444444-4444-4444-8444-444444444444",
            email: "missing_db@mcq.test",
          },
        },
        error: null,
      }),
    },
  };

  const mockPrisma = {
    user: {
      findUnique: async () => null,
    },
  };

  await assert.rejects(
    async () => {
      await assertAdminSession({ supabaseClient: mockSupabase, prismaClient: mockPrisma });
    },
    (err) => {
      assert(err instanceof ForbiddenError);
      assert.equal(err.statusCode, 403);
      assert.match(err.message, /user record not found/);
      return true;
    }
  );
});

test("assertAdminSession: Rejects authenticated non-admin (role = STUDENT)", async () => {
  const userId = "55555555-5555-4555-8555-555555555555";
  const mockSupabase = {
    auth: {
      getUser: async () => ({
        data: {
          user: { id: userId, email: "student@mcq.test" },
        },
        error: null,
      }),
    },
  };

  const mockPrisma = {
    user: {
      findUnique: async () => ({
        id: userId,
        email: "student@mcq.test",
        name: "Student User",
        role: Role.STUDENT,
      }),
    },
  };

  await assert.rejects(
    async () => {
      await assertAdminSession({ supabaseClient: mockSupabase, prismaClient: mockPrisma });
    },
    (err) => {
      assert(err instanceof ForbiddenError);
      assert.equal(err.statusCode, 403);
      assert.match(err.message, /does not possess administrator privileges/);
      return true;
    }
  );
});

test("assertAdminSession: Successfully returns AdminSessionUser for active ADMIN", async () => {
  const adminId = "66666666-6666-4666-8666-666666666666";
  const pastBan = new Date(Date.now() - 86400000).toISOString(); // expired ban
  const mockSupabase = {
    auth: {
      getUser: async () => ({
        data: {
          user: { id: adminId, email: "admin@mcq.test", banned_until: pastBan },
        },
        error: null,
      }),
    },
  };

  const mockPrisma = {
    user: {
      findUnique: async () => ({
        id: adminId,
        email: "admin@mcq.test",
        name: "Verified Administrator",
        role: Role.ADMIN,
      }),
    },
  };

  const session = await assertAdminSession({ supabaseClient: mockSupabase, prismaClient: mockPrisma });
  assert.equal(session.id, adminId);
  assert.equal(session.email, "admin@mcq.test");
  assert.equal(session.role, Role.ADMIN);
  assert.equal(session.name, "Verified Administrator");
});

// ----------------------------------------------------------------------------
// 2. Input Validation Schema Tests
// ----------------------------------------------------------------------------

test("publishPaperSchema: Rejects invalid or missing paper UUID before DB execution", () => {
  assert.throws(() => publishPaperSchema.parse({}), ZodError);
  assert.throws(() => publishPaperSchema.parse({ paperId: "not-a-uuid" }), ZodError);
  assert.throws(() => publishPaperSchema.parse({ paperId: "123" }), ZodError);

  const valid = publishPaperSchema.parse({ paperId: "a0000000-0000-4000-8000-000000000001" });
  assert.equal(valid.paperId, "a0000000-0000-4000-8000-000000000001");
});

test("reevaluatePaperSchema: Rejects invalid UUIDs or too short reason", () => {
  assert.throws(() => reevaluatePaperSchema.parse({ paperId: "not-a-uuid", newKeyVersionId: "invalid" }), ZodError);
  assert.throws(
    () =>
      reevaluatePaperSchema.parse({
        paperId: "a0000000-0000-4000-8000-000000000001",
        newKeyVersionId: "b0000000-0000-4000-8000-000000000002",
        adjudicationReason: "bad", // < 5 chars
      }),
    ZodError
  );

  const valid = reevaluatePaperSchema.parse({
    paperId: "a0000000-0000-4000-8000-000000000001",
    newKeyVersionId: "b0000000-0000-4000-8000-000000000002",
    adjudicationReason: "Official revision after review",
  });
  assert.equal(valid.adjudicationReason, "Official revision after review");
});

// ----------------------------------------------------------------------------
// 3. Database Domain Error Mapping & Sanitization Tests
// ----------------------------------------------------------------------------

test("mapDatabaseDomainError: Safely maps known PostgreSQL domain error codes", () => {
  const err404 = mapDatabaseDomainError(new Error("MCQJ-ERR-5001: ExamPaper not found"));
  assert.equal(err404.statusCode, 404);
  assert.equal(err404.code, "MCQJ-ERR-5001");
  assert.equal(err404.message, "The requested exam paper does not exist.");

  const err409 = mapDatabaseDomainError(new Error("MCQJ-ERR-5002: ExamPaper is already PUBLISHED"));
  assert.equal(err409.statusCode, 409);
  assert.equal(err409.code, "MCQJ-ERR-5002");

  const err422 = mapDatabaseDomainError(new Error("MCQJ-ERR-5007: Sequence numbering gap"));
  assert.equal(err422.statusCode, 422);

  const err403 = mapDatabaseDomainError(new Error("MCQJ-ERR-5015: Unauthorized: Caller does not possess ADMIN role"));
  assert.equal(err403.statusCode, 403);
});

test("mapDatabaseDomainError: Sanitizes unexpected errors and masks raw database credentials/SQL", () => {
  const sensitiveErr = new Error(
    'FATAL: password authentication failed for user "postgres" at host 10.0.0.1:5432 with secret xyz'
  );
  const mapped = mapDatabaseDomainError(sensitiveErr);

  assert.equal(mapped.statusCode, 500);
  assert.equal(mapped.code, "INTERNAL_DATABASE_ERROR");
  assert.doesNotMatch(mapped.message, /postgres|password|10\.0\.0\.1|xyz/);
  assert.equal(mapped.message, "A database error occurred while processing the administrative operation.");
});

// ----------------------------------------------------------------------------
// 4. Application Service Execution & Parameterization Tests
// ----------------------------------------------------------------------------

test("publishExamPaper: Correctly invokes stored procedure and returns typed result", async () => {
  const paperId = "a0000000-0000-4000-8000-000000000001";
  const adminId = "b0000000-0000-4000-8000-000000000002";

  let capturedQuery = null;
  const mockPrisma = {
    $queryRaw: async (strings, ...values) => {
      capturedQuery = { strings, values };
      return [
        {
          fn_publish_exam_paper: {
            success: true,
            paper_id: paperId,
            publish_status: "PUBLISHED",
            published_at: "2026-10-12T12:00:00Z",
            published_by: adminId,
          },
        },
      ];
    },
  };

  const adminSession = {
    id: adminId,
    email: "admin@mcq.test",
    name: "Admin User",
    role: Role.ADMIN,
    bannedUntil: null,
  };

  const result = await publishExamPaper(
    { paperId },
    { prismaClient: mockPrisma, sessionOverride: adminSession }
  );

  assert.equal(result.success, true);
  assert.equal(result.paper_id, paperId);
  assert.equal(result.publish_status, "PUBLISHED");
  assert.equal(result.published_by, adminId);

  // Assert parameterized query values: values[0] is paperId, values[1] is adminId
  assert.equal(capturedQuery.values[0], paperId);
  assert.equal(capturedQuery.values[1], adminId);
});

test("publishExamPaper: Maps failure when procedure returns empty result", async () => {
  const mockPrisma = {
    $queryRaw: async () => [],
  };

  const adminSession = {
    id: "b0000000-0000-4000-8000-000000000002",
    email: "admin@mcq.test",
    name: "Admin",
    role: Role.ADMIN,
    bannedUntil: null,
  };

  await assert.rejects(
    async () => {
      await publishExamPaper(
        { paperId: "a0000000-0000-4000-8000-000000000001" },
        { prismaClient: mockPrisma, sessionOverride: adminSession }
      );
    },
    (err) => {
      assert(err instanceof AdminServiceError);
      return true;
    }
  );
});

test("reevaluatePaperAttempts: Correctly invokes stored procedure and returns typed ledger result", async () => {
  const paperId = "a0000000-0000-4000-8000-000000000001";
  const keyVersionId = "c0000000-0000-4000-8000-000000000003";
  const adminId = "b0000000-0000-4000-8000-000000000002";

  let capturedQuery = null;
  const mockPrisma = {
    $queryRaw: async (strings, ...values) => {
      capturedQuery = { strings, values };
      return [
        {
          fn_reevaluate_paper_attempts: {
            success: true,
            paper_id: paperId,
            key_version_id: keyVersionId,
            attempts_reevaluated: 42,
            adjudicated_by: adminId,
          },
        },
      ];
    },
  };

  const adminSession = {
    id: adminId,
    email: "admin@mcq.test",
    name: "Admin User",
    role: Role.ADMIN,
    bannedUntil: null,
  };

  const result = await reevaluatePaperAttempts(
    { paperId, newKeyVersionId: keyVersionId, adjudicationReason: "Official Answer Key v2" },
    { prismaClient: mockPrisma, sessionOverride: adminSession }
  );

  assert.equal(result.success, true);
  assert.equal(result.paper_id, paperId);
  assert.equal(result.attempts_reevaluated, 42);
  assert.equal(result.adjudicated_by, adminId);

  // Assert parameterized query values: values[0] = paperId, values[1] = keyVersionId, values[2] = adminId, values[3] = reason
  assert.equal(capturedQuery.values[0], paperId);
  assert.equal(capturedQuery.values[1], keyVersionId);
  assert.equal(capturedQuery.values[2], adminId);
  assert.equal(capturedQuery.values[3], "Official Answer Key v2");
});
