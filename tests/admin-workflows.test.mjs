// ============================================================================
// MCQ Junction — Admin UI Workflows, Sequence Swapping & Gate Logic Tests
// File: tests/admin-workflows.test.mjs
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";

import { swapQuestionSequenceSchema } from "../src/lib/admin/schemas.ts";
import {
  swapQuestionSequence,
  AdminServiceError,
} from "../src/lib/admin/service.ts";
import {
  swapQuestionSequenceAction,
  publishExamPaperAction,
  reevaluatePaperAttemptsAction,
} from "../src/app/admin/actions.ts";
import { Role } from "../src/generated/prisma/enums.ts";

const VALID_PAPER_ID = "a0000000-0000-4000-8000-000000000001";
const VALID_OCC_A = "b0000000-0000-4000-8000-000000000002";
const VALID_OCC_B = "c0000000-0000-4000-8000-000000000003";
const VALID_ADMIN_ID = "d0000000-0000-4000-8000-000000000004";
const VALID_KEY_VER_ID = "e0000000-0000-4000-8000-000000000005";

const ADMIN_SESSION = {
  id: VALID_ADMIN_ID,
  email: "admin@mcq.test",
  name: "Verified Administrator",
  role: Role.ADMIN,
  bannedUntil: null,
};

// ----------------------------------------------------------------------------
// 1. Zod Schema Validation Tests for Sequence Swapping
// ----------------------------------------------------------------------------

test("swapQuestionSequenceSchema: Rejects malformed or non-UUID identifiers", () => {
  assert.throws(() => swapQuestionSequenceSchema.parse({}), ZodError);
  assert.throws(
    () =>
      swapQuestionSequenceSchema.parse({
        paperId: "not-a-uuid",
        occurrenceIdA: VALID_OCC_A,
        occurrenceIdB: VALID_OCC_B,
      }),
    ZodError
  );
  assert.throws(
    () =>
      swapQuestionSequenceSchema.parse({
        paperId: VALID_PAPER_ID,
        occurrenceIdA: "12345",
        occurrenceIdB: VALID_OCC_B,
      }),
    ZodError
  );
});

test("swapQuestionSequenceSchema: Accepts valid RFC 4122 v4 UUID identifiers", () => {
  const valid = swapQuestionSequenceSchema.parse({
    paperId: VALID_PAPER_ID,
    occurrenceIdA: VALID_OCC_A,
    occurrenceIdB: VALID_OCC_B,
  });
  assert.equal(valid.paperId, VALID_PAPER_ID);
  assert.equal(valid.occurrenceIdA, VALID_OCC_A);
  assert.equal(valid.occurrenceIdB, VALID_OCC_B);
});

// ----------------------------------------------------------------------------
// 2. Service Layer: swapQuestionSequence() Invariant Tests
// ----------------------------------------------------------------------------

test("swapQuestionSequence: Rejects swapping an occurrence with itself", async () => {
  await assert.rejects(
    async () => {
      await swapQuestionSequence(
        {
          paperId: VALID_PAPER_ID,
          occurrenceIdA: VALID_OCC_A,
          occurrenceIdB: VALID_OCC_A, // identical
        },
        { sessionOverride: ADMIN_SESSION }
      );
    },
    (err) => {
      assert(err instanceof AdminServiceError);
      assert.equal(err.code, "MCQJ_IDENTICAL_OCCURRENCES");
      assert.equal(err.statusCode, 422);
      assert.match(err.message, /Cannot swap a question with itself/);
      return true;
    }
  );
});

test("swapQuestionSequence: Rejects reordering questions on a PUBLISHED paper (immutability)", async () => {
  const mockPrisma = {
    $queryRaw: async (strings) => {
      const sql = strings.join("?");
      if (sql.includes("FROM exam_papers")) {
        return [{ id: VALID_PAPER_ID, publish_status: "PUBLISHED" }];
      }
      return [];
    },
  };

  await assert.rejects(
    async () => {
      await swapQuestionSequence(
        {
          paperId: VALID_PAPER_ID,
          occurrenceIdA: VALID_OCC_A,
          occurrenceIdB: VALID_OCC_B,
        },
        { prismaClient: mockPrisma, sessionOverride: ADMIN_SESSION }
      );
    },
    (err) => {
      assert(err instanceof AdminServiceError);
      assert.equal(err.code, "MCQJ_IMMUTABLE_ERROR");
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /Published content is immutable/);
      return true;
    }
  );
});

test("swapQuestionSequence: Rejects when paper does not exist", async () => {
  const mockPrisma = {
    $queryRaw: async (strings) => {
      const sql = strings.join("?");
      if (sql.includes("FROM exam_papers")) {
        return []; // Not found
      }
      return [];
    },
  };

  await assert.rejects(
    async () => {
      await swapQuestionSequence(
        {
          paperId: VALID_PAPER_ID,
          occurrenceIdA: VALID_OCC_A,
          occurrenceIdB: VALID_OCC_B,
        },
        { prismaClient: mockPrisma, sessionOverride: ADMIN_SESSION }
      );
    },
    (err) => {
      assert(err instanceof AdminServiceError);
      assert.equal(err.code, "MCQJ-ERR-5001");
      assert.equal(err.statusCode, 404);
      return true;
    }
  );
});

test("swapQuestionSequence: Rejects when one or both occurrences are not found in paper", async () => {
  const mockPrisma = {
    $queryRaw: async (strings) => {
      const sql = strings.join("?");
      if (sql.includes("FROM exam_papers")) {
        return [{ id: VALID_PAPER_ID, publish_status: "DRAFT" }];
      }
      if (sql.includes("FROM paper_question_occurrences")) {
        // Only returns 1 occurrence instead of 2
        return [{ id: VALID_OCC_A, paper_id: VALID_PAPER_ID, sequence_number: 1 }];
      }
      return [];
    },
  };

  await assert.rejects(
    async () => {
      await swapQuestionSequence(
        {
          paperId: VALID_PAPER_ID,
          occurrenceIdA: VALID_OCC_A,
          occurrenceIdB: VALID_OCC_B,
        },
        { prismaClient: mockPrisma, sessionOverride: ADMIN_SESSION }
      );
    },
    (err) => {
      assert(err instanceof AdminServiceError);
      assert.equal(err.code, "MCQJ_OCCURRENCE_NOT_FOUND");
      assert.equal(err.statusCode, 404);
      return true;
    }
  );
});

test("swapQuestionSequence: Successfully swaps sequence numbers atomically on DRAFT paper", async () => {
  let executedUpdate = null;

  const mockPrisma = {
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join("?");
      if (sql.includes("FROM exam_papers")) {
        return [{ id: VALID_PAPER_ID, publish_status: "DRAFT" }];
      }
      if (sql.includes("FROM paper_question_occurrences")) {
        return [
          { id: VALID_OCC_A, paper_id: VALID_PAPER_ID, sequence_number: 5 },
          { id: VALID_OCC_B, paper_id: VALID_PAPER_ID, sequence_number: 6 },
        ];
      }
      if (sql.includes("UPDATE paper_question_occurrences")) {
        executedUpdate = { strings, values };
        return [{ id: VALID_OCC_A }];
      }
      return [];
    },
  };

  const result = await swapQuestionSequence(
    {
      paperId: VALID_PAPER_ID,
      occurrenceIdA: VALID_OCC_A,
      occurrenceIdB: VALID_OCC_B,
    },
    { prismaClient: mockPrisma, sessionOverride: ADMIN_SESSION }
  );

  assert.equal(result.success, true);
  assert.equal(result.paperId, VALID_PAPER_ID);
  assert.equal(result.occurrenceA.id, VALID_OCC_A);
  assert.equal(result.occurrenceA.newSequence, 6);
  assert.equal(result.occurrenceB.id, VALID_OCC_B);
  assert.equal(result.occurrenceB.newSequence, 5);

  assert.notEqual(executedUpdate, null);
});

test("swapQuestionSequence: Rejects non-adjacent sequence numbers", async () => {
  const mockPrisma = {
    $queryRaw: async (strings) => {
      const sql = strings.join("?");
      if (sql.includes("FROM exam_papers")) {
        return [{ id: VALID_PAPER_ID, publish_status: "DRAFT" }];
      }
      if (sql.includes("FROM paper_question_occurrences")) {
        // Non-adjacent: sequence 2 and sequence 7 (diff = 5 !== 1)
        return [
          { id: VALID_OCC_A, paper_id: VALID_PAPER_ID, sequence_number: 2 },
          { id: VALID_OCC_B, paper_id: VALID_PAPER_ID, sequence_number: 7 },
        ];
      }
      return [];
    },
  };

  await assert.rejects(
    async () => {
      await swapQuestionSequence(
        {
          paperId: VALID_PAPER_ID,
          occurrenceIdA: VALID_OCC_A,
          occurrenceIdB: VALID_OCC_B,
        },
        { prismaClient: mockPrisma, sessionOverride: ADMIN_SESSION }
      );
    },
    (err) => {
      assert(err instanceof AdminServiceError);
      assert.equal(err.code, "MCQJ_NONADJACENT_OCCURRENCES");
      assert.equal(err.statusCode, 422);
      assert.match(err.message, /Only adjacent question occurrences can be swapped/);
      return true;
    }
  );
});

test("swapQuestionSequence: Rejects when concurrent modification causes conflict", async () => {
  const mockPrisma = {
    $queryRaw: async (strings) => {
      const sql = strings.join("?");
      if (sql.includes("FROM exam_papers")) {
        return [{ id: VALID_PAPER_ID, publish_status: "DRAFT" }];
      }
      if (sql.includes("FROM paper_question_occurrences")) {
        return [
          { id: VALID_OCC_A, paper_id: VALID_PAPER_ID, sequence_number: 3 },
          { id: VALID_OCC_B, paper_id: VALID_PAPER_ID, sequence_number: 4 },
        ];
      }
      if (sql.includes("UPDATE paper_question_occurrences")) {
        // Simulates concurrent transaction having already updated or locked one row
        return []; // 0 rows updated instead of 2
      }
      return [];
    },
  };

  await assert.rejects(
    async () => {
      await swapQuestionSequence(
        {
          paperId: VALID_PAPER_ID,
          occurrenceIdA: VALID_OCC_A,
          occurrenceIdB: VALID_OCC_B,
        },
        { prismaClient: mockPrisma, sessionOverride: ADMIN_SESSION }
      );
    },
    (err) => {
      assert(err instanceof AdminServiceError);
      assert.equal(err.code, "MCQJ_CONCURRENT_SWAP_CONFLICT");
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /concurrent modification or stale state/);
      return true;
    }
  );
});

// ----------------------------------------------------------------------------
// 3. Server Actions Boundary & Error Mapping Tests
// ----------------------------------------------------------------------------

test("swapQuestionSequenceAction: Returns structured validation error on bad input", async () => {
  const res = await swapQuestionSequenceAction({
    paperId: "invalid",
    occurrenceIdA: "bad",
    occurrenceIdB: "worse",
  });

  assert.equal(res.success, false);
  assert.equal(res.code, "VALIDATION_ERROR");
  assert.match(res.error, /Invalid/);
});

test("publishExamPaperAction: Returns structured validation error on bad paperId", async () => {
  const res = await publishExamPaperAction({
    paperId: "not-a-uuid",
  });

  assert.equal(res.success, false);
  assert.equal(res.code, "VALIDATION_ERROR");
  assert.match(res.error, /Invalid paper ID/);
});

test("reevaluatePaperAttemptsAction: Returns structured validation error on short reason", async () => {
  const res = await reevaluatePaperAttemptsAction({
    paperId: VALID_PAPER_ID,
    newKeyVersionId: VALID_KEY_VER_ID,
    adjudicationReason: "bad", // < 5 chars
  });

  assert.equal(res.success, false);
  assert.equal(res.code, "VALIDATION_ERROR");
  assert.match(res.error, /at least 5 characters/);
});

// ----------------------------------------------------------------------------
// 4. Publication Gate Verification Logic Tests
// ----------------------------------------------------------------------------

test("Publication Gate Logic: Identifies contiguity and gap correctly", () => {
  const contiguousSeq = [1, 2, 3, 4, 5];
  const hasGap = contiguousSeq.some((num, idx) => num !== idx + 1);
  assert.equal(hasGap, false);

  const gappedSeq = [1, 2, 4, 5]; // missing 3
  const hasDiscontinuity = gappedSeq.some((num, idx) => num !== idx + 1);
  assert.equal(hasDiscontinuity, true);
});

test("Publication Gate Logic: Strict editorial verification check", () => {
  const occurrences = [
    { id: "1", representations: [{ editorialVerified: true }] },
    { id: "2", representations: [{ editorialVerified: false }] },
  ];

  const allVerified = occurrences.every((occ) =>
    occ.representations.some((rep) => rep.editorialVerified)
  );
  assert.equal(allVerified, false);

  occurrences[1].representations[0].editorialVerified = true;
  const nowAllVerified = occurrences.every((occ) =>
    occ.representations.some((rep) => rep.editorialVerified)
  );
  assert.equal(nowAllVerified, true);
});
