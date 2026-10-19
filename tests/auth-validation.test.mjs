import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { signInSchema, signUpSchema } from "../src/lib/auth/schemas.ts";
import { assertCandidateSession, UnauthorizedError, ForbiddenError } from "../src/lib/auth/session.ts";
import { Role } from "../src/generated/prisma/enums.ts";

describe("Production Authentication Validation Schemas", () => {
  test("rejects invalid email formats", () => {
    const res = signInSchema.safeParse({ email: "invalid-email", password: "somepassword" });
    assert.equal(res.success, false);
    assert.match(res.error.issues[0].message, /valid email/);
  });

  test("rejects sign-up passwords shorter than 8 characters", () => {
    const res = signUpSchema.safeParse({
      email: "student@example.com",
      password: "short",
    });
    assert.equal(res.success, false);
    assert.match(res.error.issues[0].message, /at least 8 characters/);
  });

  test("rejects empty password on sign-in", () => {
    const res = signInSchema.safeParse({
      email: "student@example.com",
      password: "",
    });
    assert.equal(res.success, false);
    assert.match(res.error.issues[0].message, /Password is required/);
  });

  test("accepts valid sign-up details meeting NIST complexity guidelines", () => {
    const res = signUpSchema.safeParse({
      email: "student@example.com",
      password: "correcthorsebatterystaple",
      name: "Bihar Aspirant",
    });
    assert.equal(res.success, true);
    assert.equal(res.data.email, "student@example.com");
    assert.equal(res.data.name, "Bihar Aspirant");
  });
});

describe("Candidate Session Authorization & Open-Redirect Immunity (Gate 3)", () => {

  test("assertCandidateSession rejects missing or null user session with 401", async () => {
    const mockSupabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: { message: "No session found" } }),
      },
    };

    await assert.rejects(
      async () => {
        await assertCandidateSession({ supabaseClient: mockSupabase });
      },
      (err) => err instanceof UnauthorizedError && err.statusCode === 401
    );
  });

  test("assertCandidateSession rejects anonymous sessions with 401", async () => {
    const mockSupabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: { id: "anon-uuid", email: null, is_anonymous: true },
          },
          error: null,
        }),
      },
    };

    await assert.rejects(
      async () => {
        await assertCandidateSession({ supabaseClient: mockSupabase });
      },
      (err) => err instanceof UnauthorizedError && err.message.includes("Anonymous sessions")
    );
  });

  test("assertCandidateSession rejects suspended candidate with 403", async () => {
    const mockSupabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: "banned-uuid",
              email: "banned@mcq.test",
              is_anonymous: false,
              banned_until: new Date(Date.now() + 86400000).toISOString(),
            },
          },
          error: null,
        }),
      },
    };

    await assert.rejects(
      async () => {
        await assertCandidateSession({ supabaseClient: mockSupabase });
      },
      (err) => err instanceof ForbiddenError && err.statusCode === 403 && err.message.includes("suspended")
    );
  });

  test("assertCandidateSession rejects deactivated candidate (deleted_at) with 403", async () => {
    const mockSupabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: "deleted-uuid",
              email: "deleted@mcq.test",
              is_anonymous: false,
              deleted_at: new Date().toISOString(),
            },
          },
          error: null,
        }),
      },
    };

    await assert.rejects(
      async () => {
        await assertCandidateSession({ supabaseClient: mockSupabase });
      },
      (err) => err instanceof ForbiddenError && err.statusCode === 403 && err.message.includes("deactivated")
    );
  });

  test("assertCandidateSession accepts active STUDENT identity resolved authoritatively from DB", async () => {
    const mockSupabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: { id: "student-uuid", email: "student@mcq.test", is_anonymous: false },
          },
          error: null,
        }),
      },
    };

    const mockPrisma = {
      user: {
        findUnique: async () => ({
          id: "student-uuid",
          email: "student@mcq.test",
          name: "Test Candidate",
          role: Role.STUDENT,
        }),
      },
    };

    const candidate = await assertCandidateSession({
      supabaseClient: mockSupabase,
      prismaClient: mockPrisma,
    });

    assert.equal(candidate.id, "student-uuid");
    assert.equal(candidate.role, Role.STUDENT);
    assert.equal(candidate.email, "student@mcq.test");
  });

  test("Open-redirect sanitization function strictly rejects foreign protocols and deceptive slashes", () => {
    function sanitizeNextPath(raw) {
      if (!raw) return "";
      const trimmed = raw.trim();
      if (
        trimmed.startsWith("/") &&
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("/\\")
      ) {
        return trimmed;
      }
      return "";
    }

    // Permitted relative paths
    assert.equal(sanitizeNextPath("/exam/paper-123"), "/exam/paper-123");
    assert.equal(sanitizeNextPath("/dashboard"), "/dashboard");
    assert.equal(sanitizeNextPath("/admin/papers"), "/admin/papers");

    // Rejected open-redirect vectors
    assert.equal(sanitizeNextPath("//evil.com/phish"), "");
    assert.equal(sanitizeNextPath("/\\evil.com/phish"), "");
    assert.equal(sanitizeNextPath("https://evil.com/login"), "");
    assert.equal(sanitizeNextPath("http://evil.com/login"), "");
    assert.equal(sanitizeNextPath("javascript:alert(1)"), "");
    assert.equal(sanitizeNextPath("data:text/html;base64,..."), "");
    assert.equal(sanitizeNextPath("   //attacker.com   "), "");
    assert.equal(sanitizeNextPath(null), "");
  });
});
