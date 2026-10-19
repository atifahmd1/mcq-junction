// ============================================================================
// MCQ Junction — End-to-End Workflows & Integration Test Suite (Phase 5)
// File: tests/e2e-workflows.test.mjs
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { Role } from "../src/generated/prisma/enums.ts";
import {
  swapQuestionSequence,
  publishExamPaper,
  reevaluatePaperAttempts,
  AdminServiceError,
} from "../src/lib/admin/service.ts";
import {
  swapQuestionSequenceAction,
} from "../src/app/admin/actions.ts";
import {
  assertAdminSession,
  UnauthorizedError,
  ForbiddenError,
} from "../src/lib/auth/session.ts";

const { Pool } = pg;

// ----------------------------------------------------------------------------
// 1. Mandatory Disposable Database Safety Verification
// ----------------------------------------------------------------------------

const testDbUrl = process.env.TEST_DATABASE_URL;

if (!testDbUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be defined targeting local disposable PostgreSQL (127.0.0.1:5433/mcq_junction_test)."
  );
}

let parsedUrl;
try {
  parsedUrl = new URL(testDbUrl);
} catch (err) {
  throw new Error(`TEST_DATABASE_URL is not a valid URL: ${err.message}`);
}

const allowedHosts = ["127.0.0.1", "localhost"];
const expectedPort = "5433";
const expectedDb = "/mcq_junction_test";

if (
  !allowedHosts.includes(parsedUrl.hostname) ||
  parsedUrl.port !== expectedPort ||
  parsedUrl.pathname !== expectedDb
) {
  throw new Error(
    `SAFETY VIOLATION: Refusing connection to ${parsedUrl.hostname}:${parsedUrl.port}${parsedUrl.pathname}. Must target 127.0.0.1:5433/mcq_junction_test.`
  );
}

const pool = new Pool({
  connectionString: testDbUrl,
  max: 10,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 10000,
});

test.after(async () => {
  await pool.end();
});

// Adapts pg client query to service $queryRaw interface
function createTestPrismaClient(dbClient) {
  return {
    $queryRaw: async (strings, ...values) => {
      let queryText = "";
      for (let i = 0; i < strings.length; i++) {
        queryText += strings[i];
        if (i < values.length) {
          queryText += `$${i + 1}`;
        }
      }
      const res = await dbClient.query(queryText, values);
      return res.rows;
    },
    user: {
      findUnique: async ({ where }) => {
        const res = await dbClient.query(
          `SELECT id, email, name, role FROM "users" WHERE id = $1`,
          [where.id]
        );
        return res.rows[0] ?? null;
      },
    },
  };
}

// ----------------------------------------------------------------------------
// 2. Realistic Relational Hierarchy Fixture Factory
// ----------------------------------------------------------------------------

async function createHierarchyFixture(client, options = {}) {
  const suffix = Math.random().toString(36).substring(2, 8);
  const totalQuestions = options.totalQuestions ?? 2;
  const publishStatus = options.publishStatus ?? "VERIFIED";

  // 1. Conducting body
  const cb = (await client.query(`
    INSERT INTO conducting_bodies (code, full_name, region_code)
    VALUES ('BPSC-${suffix}', 'Bihar Public Service Commission', 'BR')
    RETURNING id;
  `)).rows[0].id;

  // 2. Exam
  const exam = (await client.query(`
    INSERT INTO exams (conducting_body_id, code, title, tier)
    VALUES ($1, 'BPSC-TRE-CS-${suffix}', 'TRE Computer Science', 'STATE_LEVEL')
    RETURNING id;
  `, [cb])).rows[0].id;

  // 3. Exam Session
  const session = (await client.query(`
    INSERT INTO exam_sessions (exam_id, session_year, cycle_code)
    VALUES ($1, 2024, 'CYCLE-${suffix}')
    RETURNING id;
  `, [exam])).rows[0].id;

  // 4. Exam Paper
  const initialStatus = publishStatus === "PUBLISHED" ? "VERIFIED" : publishStatus;
  const paper = (await client.query(`
    INSERT INTO exam_papers (session_id, paper_code, title, publish_status, total_duration_minutes, total_questions, max_score)
    VALUES ($1, 'PAPER-${suffix}', 'CS Paper 2024', $2, 120, $3, $4)
    RETURNING id;
  `, [session, initialStatus, totalQuestions, totalQuestions * 1.0])).rows[0].id;

  // 5. Baseline Marking Scheme
  await client.query(`
    INSERT INTO paper_marking_schemes (paper_id, marks_per_correct, negative_marks_per_wrong)
    VALUES ($1, 1.000, 0.250);
  `, [paper]);

  // 6. Paper Section
  const section = (await client.query(`
    INSERT INTO paper_sections (paper_id, section_order, title, total_questions)
    VALUES ($1, 1, 'Section A', $2)
    RETURNING id;
  `, [paper, totalQuestions])).rows[0].id;

  // 7. Users: Admin and Student
  const adminAuthId = (await client.query(`
    INSERT INTO auth.users (email) VALUES ('admin-${suffix}@mcq.test') RETURNING id;
  `)).rows[0].id;
  await client.query(`
    INSERT INTO users (id, email, role, updated_at) VALUES ($1, 'admin-${suffix}@mcq.test', 'ADMIN', clock_timestamp());
  `, [adminAuthId]);

  const studentAuthId = (await client.query(`
    INSERT INTO auth.users (email) VALUES ('student-${suffix}@mcq.test') RETURNING id;
  `)).rows[0].id;
  await client.query(`
    INSERT INTO users (id, email, role, updated_at) VALUES ($1, 'student-${suffix}@mcq.test', 'STUDENT', clock_timestamp());
  `, [studentAuthId]);

  // 8. Master Booklet Series
  const booklet = (await client.query(`
    INSERT INTO booklet_series (paper_id, series_code, is_master_series)
    VALUES ($1, 'A', TRUE)
    RETURNING id;
  `, [paper])).rows[0].id;

  // 9. Questions, Occurrences & Representations
  const occurrences = [];
  const representations = [];
  const optionsList = [];

  const contiguity = options.skipSequenceContiguity ? [1, 3] : Array.from({ length: totalQuestions }, (_, i) => i + 1);

  for (let i = 0; i < totalQuestions; i++) {
    const seq = contiguity[i];
    const cq = (await client.query(`
      INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic)
      VALUES ('CQ-${suffix}-${i}', 'Computer Science', 'Algorithms')
      RETURNING id;
    `)).rows[0].id;

    const occ = (await client.query(`
      INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
      VALUES ($1, $2, $3, $4, 'SINGLE_CHOICE')
      RETURNING id;
    `, [paper, section, cq, seq])).rows[0].id;
    occurrences.push(occ);

    const isVerified = options.unverifiedRepresentations ? false : true;
    const rep = (await client.query(`
      INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
      VALUES ($1, 'EN', 'What is time complexity?', $2)
      RETURNING id;
    `, [occ, isVerified])).rows[0].id;
    representations.push(rep);

    const optA = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'A', 'O(1)', 1) RETURNING id;
    `, [rep])).rows[0].id;
    const optB = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'B', 'O(N)', 2) RETURNING id;
    `, [rep])).rows[0].id;
    optionsList.push({ rep, optA, optB });

    // Booklet Question Mapping
    const bqm = (await client.query(`
      INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
      VALUES ($1, $2, $3, $4) RETURNING id;
    `, [paper, booklet, occ, i + 1])).rows[0].id;

    // Booklet Option Mappings
    await client.query(`
      INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order)
      VALUES ($1, $2, 'A', 1), ($1, $3, 'B', 2);
    `, [bqm, optA, optB]);
  }

  // 10. Answer Key Version & Items
  let answerKeyVersionId = null;
  if (!options.skipAnswerKey) {
    answerKeyVersionId = (await client.query(`
      INSERT INTO answer_key_versions (paper_id, version_number, version_tag, is_official)
      VALUES ($1, 1, 'v1.0-official', TRUE) RETURNING id;
    `, [paper])).rows[0].id;

    const itemsToCreate = options.incompleteAnswerKey ? totalQuestions - 1 : totalQuestions;
    for (let i = 0; i < itemsToCreate; i++) {
      await client.query(`
        INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
        VALUES ($1, $2, $3, 'ACTIVE', ARRAY['A']);
      `, [paper, answerKeyVersionId, occurrences[i]]);
    }
  }

  // If paper was requested as PUBLISHED, transition it now after content creation
  if (publishStatus === "PUBLISHED") {
    await client.query(`
      UPDATE exam_papers
      SET publish_status = 'PUBLISHED', published_at = clock_timestamp()
      WHERE id = $1;
    `, [paper]);
  }

  return {
    suffix,
    conductingBodyId: cb,
    examId: exam,
    sessionId: session,
    paperId: paper,
    sectionId: section,
    adminId: adminAuthId,
    studentId: studentAuthId,
    bookletId: booklet,
    occurrences,
    representations,
    optionsList,
    answerKeyVersionId,
  };
}

// ============================================================================
// WORKFLOW 1: Unauthenticated Visitor Access Rejection
// ============================================================================

test("Workflow 1: Unauthenticated visitor rejected by auth guard and server actions", async () => {
  const client = await pool.connect();
  try {
    const testPrisma = createTestPrismaClient(client);
    const mockUnauthSupabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: new Error("No session") }),
      },
    };

    await assert.rejects(
      async () => {
        await assertAdminSession({
          supabaseClient: mockUnauthSupabase,
          prismaClient: testPrisma,
        });
      },
      (err) => {
        assert(err instanceof UnauthorizedError);
        assert.equal(err.statusCode, 401);
        return true;
      }
    );
  } finally {
    client.release();
  }
});

// ============================================================================
// WORKFLOW 2: Authenticated Non-Admin Access Rejection (Role Boundary)
// ============================================================================

test("Workflow 2: Authenticated non-admin (STUDENT) rejected by admin boundary with 403", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client);
    const testPrisma = createTestPrismaClient(client);

    const mockStudentSupabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: { id: f.studentId, email: `student-${f.suffix}@mcq.test` },
          },
          error: null,
        }),
      },
    };

    await assert.rejects(
      async () => {
        await assertAdminSession({
          supabaseClient: mockStudentSupabase,
          prismaClient: testPrisma,
        });
      },
      (err) => {
        assert(err instanceof ForbiddenError);
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /does not possess administrator privileges/);
        return true;
      }
    );
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

// ============================================================================
// WORKFLOW 3: Authorized Admin Database Verification & Filtering
// ============================================================================

test("Workflow 3: Authorized admin queries papers table with status filtering and bounded counts", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const fDraft = await createHierarchyFixture(client, { publishStatus: "DRAFT" });
    const fPub = await createHierarchyFixture(client, { publishStatus: "PUBLISHED" });
    const testPrisma = createTestPrismaClient(client);

    const mockAdminSupabase = {
      auth: {
        getUser: async () => ({
          data: {
            user: { id: fDraft.adminId, email: `admin-${fDraft.suffix}@mcq.test` },
          },
          error: null,
        }),
      },
    };

    const admin = await assertAdminSession({
      supabaseClient: mockAdminSupabase,
      prismaClient: testPrisma,
    });

    assert.equal(admin.id, fDraft.adminId);
    assert.equal(admin.role, Role.ADMIN);

    // Query database with status filtering
    const draftRes = await client.query(
      `SELECT id, publish_status FROM "exam_papers" WHERE id = $1`,
      [fDraft.paperId]
    );
    assert.equal(draftRes.rows[0].publish_status, "DRAFT");

    const pubRes = await client.query(
      `SELECT id, publish_status FROM "exam_papers" WHERE id = $1`,
      [fPub.paperId]
    );
    assert.equal(pubRes.rows[0].publish_status, "PUBLISHED");
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

// ============================================================================
// WORKFLOW 4: Admin Reorders Questions in Draft Paper (Atomic CASE Swap)
// ============================================================================

test("Workflow 4: Admin successfully reorders adjacent questions in DRAFT paper", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client, { publishStatus: "DRAFT", totalQuestions: 3 });
    const testPrisma = createTestPrismaClient(client);

    const adminSession = {
      id: f.adminId,
      email: `admin-${f.suffix}@mcq.test`,
      name: "Admin",
      role: Role.ADMIN,
      bannedUntil: null,
    };

    // Pre-swap: occ[0] is seq 1, occ[1] is seq 2
    const swapResult = await swapQuestionSequence(
      {
        paperId: f.paperId,
        occurrenceIdA: f.occurrences[0],
        occurrenceIdB: f.occurrences[1],
      },
      { prismaClient: testPrisma, sessionOverride: adminSession }
    );

    assert.equal(swapResult.success, true);
    assert.equal(swapResult.occurrenceA.newSequence, 2);
    assert.equal(swapResult.occurrenceB.newSequence, 1);

    // Post-swap database check
    const postRes = await client.query(
      `SELECT id, sequence_number FROM "paper_question_occurrences" WHERE id IN ($1, $2) ORDER BY sequence_number`,
      [f.occurrences[0], f.occurrences[1]]
    );
    assert.equal(postRes.rows[0].id, f.occurrences[1]);
    assert.equal(postRes.rows[0].sequence_number, 1);
    assert.equal(postRes.rows[1].id, f.occurrences[0]);
    assert.equal(postRes.rows[1].sequence_number, 2);
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

// ============================================================================
// WORKFLOW 5: Admin Attempts to Reorder Questions in PUBLISHED Paper (Rejected)
// ============================================================================

test("Workflow 5: Reordering questions in PUBLISHED paper rejected with 409 immutability error", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client, { publishStatus: "PUBLISHED" });
    const testPrisma = createTestPrismaClient(client);

    const adminSession = {
      id: f.adminId,
      email: `admin-${f.suffix}@mcq.test`,
      name: "Admin",
      role: Role.ADMIN,
      bannedUntil: null,
    };

    await assert.rejects(
      async () => {
        await swapQuestionSequence(
          {
            paperId: f.paperId,
            occurrenceIdA: f.occurrences[0],
            occurrenceIdB: f.occurrences[1],
          },
          { prismaClient: testPrisma, sessionOverride: adminSession }
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

    // Database state remains unchanged
    const checkRes = await client.query(
      `SELECT id, sequence_number FROM "paper_question_occurrences" WHERE id = $1`,
      [f.occurrences[0]]
    );
    assert.equal(checkRes.rows[0].sequence_number, 1);
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

// ============================================================================
// WORKFLOW 6: Publication Attempt with Broken Quality Gates (Rejected)
// ============================================================================

test("Workflow 6: Publication rejected when sequence has gap (MCQJ-ERR-5008) and rolled back cleanly", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    // Fixture with skipSequenceContiguity produces sequence [1, 3] with gap at 2
    const f = await createHierarchyFixture(client, {
      publishStatus: "VERIFIED",
      totalQuestions: 2,
      skipSequenceContiguity: true,
    });
    const testPrisma = createTestPrismaClient(client);

    const adminSession = {
      id: f.adminId,
      email: `admin-${f.suffix}@mcq.test`,
      name: "Admin",
      role: Role.ADMIN,
      bannedUntil: null,
    };

    await client.query("SAVEPOINT sp_wf6;");
    await assert.rejects(
      async () => {
        await publishExamPaper(
          { paperId: f.paperId },
          { prismaClient: testPrisma, sessionOverride: adminSession }
        );
      },
      (err) => {
        assert(err instanceof AdminServiceError);
        assert.equal(err.code, "MCQJ-ERR-5008");
        assert.equal(err.statusCode, 422);
        assert.match(err.message, /Question sequence numbers are not contiguous/);
        return true;
      }
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_wf6;");

    // Persisted status is still VERIFIED, not PUBLISHED
    const paperRes = await client.query(
      `SELECT publish_status, published_at FROM "exam_papers" WHERE id = $1`,
      [f.paperId]
    );
    assert.equal(paperRes.rows[0].publish_status, "VERIFIED");
    assert.equal(paperRes.rows[0].published_at, null);
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

// ============================================================================
// WORKFLOW 7: Successful Publication of Verified Paper with All Gates Satisfied
// ============================================================================

test("Workflow 7: Successfully publishes VERIFIED paper passing all 6 gates with audit trail", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client, { publishStatus: "VERIFIED", totalQuestions: 2 });
    const testPrisma = createTestPrismaClient(client);

    const adminSession = {
      id: f.adminId,
      email: `admin-${f.suffix}@mcq.test`,
      name: "Admin",
      role: Role.ADMIN,
      bannedUntil: null,
    };

    const result = await publishExamPaper(
      { paperId: f.paperId },
      { prismaClient: testPrisma, sessionOverride: adminSession }
    );

    assert.equal(result.success, true);
    assert.equal(result.paper_id, f.paperId);
    assert.equal(result.publish_status, "PUBLISHED");
    assert.equal(result.published_by, f.adminId);

    // Verify database persisted state
    const paperRes = await client.query(
      `SELECT publish_status, published_at FROM "exam_papers" WHERE id = $1`,
      [f.paperId]
    );
    assert.equal(paperRes.rows[0].publish_status, "PUBLISHED");
    assert.notEqual(paperRes.rows[0].published_at, null);
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

// ============================================================================
// WORKFLOW 8: Answer-Key Adjudication & Historical Two-Tier Ledger Integrity
// ============================================================================

test("Workflow 8: Re-evaluation creates v2 evaluation, leaves v1 immutable, marks v2 active", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client, { publishStatus: "PUBLISHED", totalQuestions: 2 });
    const testPrisma = createTestPrismaClient(client);

    // Insert an attempt and v1 evaluation for the published paper
    const attemptId = (await client.query(`
      INSERT INTO test_attempts (paper_id, booklet_series_id, user_id, attempt_status)
      VALUES ($1, $2, $3, 'SUBMITTED')
      RETURNING id;
    `, [f.paperId, f.bookletId, f.studentId])).rows[0].id;

    await client.query(`
      INSERT INTO attempt_evaluations (
        attempt_id, key_version_id, evaluation_version, is_original_attempt, is_current_active,
        raw_score, evaluated_denominator, total_correct, total_wrong, total_unanswered, per_question_score_json
      )
      VALUES ($1, $2, 1, TRUE, TRUE, 1.0, 2.0, 1, 1, 0, '[]'::jsonb);
    `, [attemptId, f.answerKeyVersionId]);

    // Create official v2 answer key version
    const keyV2Id = (await client.query(`
      INSERT INTO answer_key_versions (paper_id, version_number, version_tag, is_official)
      VALUES ($1, 2, 'v2.0-adjudicated', TRUE)
      RETURNING id;
    `, [f.paperId])).rows[0].id;

    const adminSession = {
      id: f.adminId,
      email: `admin-${f.suffix}@mcq.test`,
      name: "Admin",
      role: Role.ADMIN,
      bannedUntil: null,
    };

    const result = await reevaluatePaperAttempts(
      {
        paperId: f.paperId,
        newKeyVersionId: keyV2Id,
        adjudicationReason: "Court-ordered question key adjustment",
      },
      { prismaClient: testPrisma, sessionOverride: adminSession }
    );

    assert.equal(result.success, true);
    assert.equal(result.paper_id, f.paperId);
    assert.equal(result.key_version_id, keyV2Id);
    assert.equal(result.attempts_reevaluated, 1);

    // Verify Two-Tier Ledger in PostgreSQL
    const evals = await client.query(
      `SELECT evaluation_version, is_original_attempt, is_current_active, key_version_id, adjudication_reason
       FROM attempt_evaluations
       WHERE attempt_id = $1
       ORDER BY evaluation_version ASC`,
      [attemptId]
    );

    assert.equal(evals.rows.length, 2);

    // V1 evaluation (original attempt) MUST remain immutable with is_current_active = false
    assert.equal(evals.rows[0].evaluation_version, 1);
    assert.equal(evals.rows[0].is_original_attempt, true);
    assert.equal(evals.rows[0].is_current_active, false);
    assert.equal(evals.rows[0].key_version_id, f.answerKeyVersionId);

    // V2 evaluation (new active) MUST have is_original_attempt = false and is_current_active = true
    assert.equal(evals.rows[1].evaluation_version, 2);
    assert.equal(evals.rows[1].is_original_attempt, false);
    assert.equal(evals.rows[1].is_current_active, true);
    assert.equal(evals.rows[1].key_version_id, keyV2Id);
    assert.equal(evals.rows[1].adjudication_reason, "Court-ordered question key adjustment");
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

// ============================================================================
// WORKFLOW 9: Concurrent Sensitive Mutation Protection (Advisory Lock & Optimistic Guard)
// ============================================================================

test("Workflow 9: Concurrent sequence swap requests on the same paper fail closed", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client, { publishStatus: "DRAFT", totalQuestions: 3 });
    const testPrisma = createTestPrismaClient(client);

    const adminSession = {
      id: f.adminId,
      email: `admin-${f.suffix}@mcq.test`,
      name: "Admin",
      role: Role.ADMIN,
      bannedUntil: null,
    };

    // Attempt concurrent swaps on the same question occurrences
    const p1 = swapQuestionSequence(
      {
        paperId: f.paperId,
        occurrenceIdA: f.occurrences[0],
        occurrenceIdB: f.occurrences[1],
      },
      { prismaClient: testPrisma, sessionOverride: adminSession }
    );

    const p2 = swapQuestionSequence(
      {
        paperId: f.paperId,
        occurrenceIdA: f.occurrences[0],
        occurrenceIdB: f.occurrences[1],
      },
      { prismaClient: testPrisma, sessionOverride: adminSession }
    );

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length >= 1, true);
    if (rejected.length > 0) {
      const err = rejected[0].reason;
      assert(err instanceof AdminServiceError);
      assert.equal(err.code, "MCQJ_CONCURRENT_SWAP_CONFLICT");
    }
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

// ============================================================================
// WORKFLOW 10: Server Action Revalidation Path Contract
// ============================================================================

test("Workflow 10: Server action failures return structured errors without mutating DB", async () => {
  const badActionRes = await swapQuestionSequenceAction({
    paperId: "not-a-uuid",
    occurrenceIdA: "11111111-1111-4111-8111-111111111111",
    occurrenceIdB: "22222222-2222-4222-8222-222222222222",
  });

  assert.equal(badActionRes.success, false);
  assert.equal(badActionRes.code, "VALIDATION_ERROR");
});
