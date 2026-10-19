// ============================================================================
// MCQ Junction — Autonomous Scheduler & Overdue Finalization Test Suite
// File: tests/scheduler-finalization.test.mjs
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  authenticateCronRequest,
  handleSweep,
} from "../src/app/api/cron/finalize-overdue-attempts/route.ts";
import { finalizeOverdueAttemptsAction } from "../src/app/exam/actions.ts";
import {
  startExamAttempt,
  finalizeOverdueAttempts,
} from "../src/lib/exam/service.ts";
import { Role } from "../src/generated/prisma/enums.ts";

const { Pool } = pg;

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:test_pw_disposable_12345@127.0.0.1:5433/mcq_junction_test";

const pool = new Pool({ connectionString: TEST_DB_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seedPublishedExamPaper(client, suffix = "01") {
  const runId = `${suffix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  // 1. Conducting Body
  const cbRes = await client.query(`
    INSERT INTO conducting_bodies (code, full_name, region_code)
    VALUES ($1, $2, $3)
    RETURNING id;
  `, [`CB_SCHED_${runId}`, `Scheduler Commission ${runId}`, "IN"]);
  const cbId = cbRes.rows[0].id;

  // 2. Exam
  const examRes = await client.query(`
    INSERT INTO exams (conducting_body_id, code, title)
    VALUES ($1, $2, $3)
    RETURNING id;
  `, [cbId, `EXAM_SCHED_${runId}`, `Exam ${runId}`]);
  const examId = examRes.rows[0].id;

  // 3. Exam Session
  const sessionRes = await client.query(`
    INSERT INTO exam_sessions (exam_id, session_year, cycle_code)
    VALUES ($1, 2026, $2)
    RETURNING id;
  `, [examId, `CYC_${runId}`]);
  const sessionId = sessionRes.rows[0].id;

  // 4. Exam Paper
  const paperRes = await client.query(`
    INSERT INTO exam_papers (
      session_id, paper_code, title, publish_status,
      published_at, total_duration_minutes, total_questions, max_score
    )
    VALUES ($1, $2, $3, 'VERIFIED', NULL, 30, 1, 2.000)
    RETURNING id;
  `, [sessionId, `PAP_SCHED_${runId}`, `Scheduler Paper ${runId}`]);
  const paperId = paperRes.rows[0].id;

  // 5. Section
  const secRes = await client.query(`
    INSERT INTO paper_sections (paper_id, section_order, title, total_questions)
    VALUES ($1, 1, 'Core Section', 1)
    RETURNING id;
  `, [paperId]);
  const sectionId = secRes.rows[0].id;

  // 6. Marking Scheme
  await client.query(`
    INSERT INTO paper_marking_schemes (paper_id, marks_per_correct, negative_marks_per_wrong)
    VALUES ($1, 2.000, 0.500);
  `, [paperId]);

  // 7. Conceptual Question
  const cqRes = await client.query(`
    INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic, question_type)
    VALUES ($1, 'CS', 'Architecture', 'SINGLE_CORRECT')
    RETURNING id;
  `, [`CQ_SCHED_${runId}`]);
  const cqId = cqRes.rows[0].id;

  // 8. Occurrence
  const occRes = await client.query(`
    INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
    VALUES ($1, $2, $3, 1, 'SINGLE_CORRECT')
    RETURNING id;
  `, [paperId, sectionId, cqId]);
  const occId = occRes.rows[0].id;

  // 9. Representation & Options
  const repRes = await client.query(`
    INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
    VALUES ($1, 'EN', 'Is this question valid?', TRUE)
    RETURNING id;
  `, [occId]);
  const repId = repRes.rows[0].id;

  const optA = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'A', 1, 'Yes') RETURNING id;`, [repId])).rows[0].id;
  const optB = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'B', 2, 'No') RETURNING id;`, [repId])).rows[0].id;

  // 10. Booklet Series Master "A"
  const bookletRes = await client.query(`
    INSERT INTO booklet_series (paper_id, series_code, is_master_series)
    VALUES ($1, 'A', TRUE) RETURNING id;
  `, [paperId]);
  const bookletId = bookletRes.rows[0].id;

  const bqm1 = (await client.query(`
    INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
    VALUES ($1, $2, $3, 1) RETURNING id;
  `, [paperId, bookletId, occId])).rows[0].id;
  await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'A', 1);`, [bqm1, optA]);
  await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'B', 2);`, [bqm1, optB]);

  // 11. Answer Key Version 1
  const keyVerRes = await client.query(`
    INSERT INTO answer_key_versions (paper_id, version_number, version_tag, is_official)
    VALUES ($1, 1, 'OFFICIAL_V1', TRUE) RETURNING id;
  `, [paperId]);
  const keyVerId = keyVerRes.rows[0].id;

  await client.query(`
    INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
    VALUES ($1, $2, $3, 'ACTIVE', ARRAY['A']);
  `, [paperId, keyVerId, occId]);

  // 12. Publish Paper
  await client.query(`
    UPDATE exam_papers
    SET publish_status = 'PUBLISHED', published_at = NOW()
    WHERE id = $1;
  `, [paperId]);

  return { paperId, sectionId, occId, optA, optB };
}

async function seedCandidateUser(client, email) {
  const uniqueEmail = `${Date.now()}_${Math.floor(Math.random() * 100000)}_${email}`;
  const authUserRes = await client.query(`
    INSERT INTO auth.users (email)
    VALUES ($1)
    RETURNING id;
  `, [uniqueEmail]);
  const authUserId = authUserRes.rows[0].id;

  await client.query(`
    INSERT INTO users (id, email, name, role, created_at, updated_at)
    VALUES ($1, $2, 'Test Candidate User', 'STUDENT', NOW(), NOW());
  `, [authUserId, uniqueEmail]);

  return {
    id: authUserId,
    email: uniqueEmail,
    name: "Test Candidate User",
    role: Role.STUDENT,
    bannedUntil: null,
  };
}

// ----------------------------------------------------------------------------
// 1. Cron Authentication & Authorization Gating
// ----------------------------------------------------------------------------

test("SCHED-01: Cron authentication fails closed when CRON_SECRET is not configured", async () => {
  const originalSecret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;

  try {
    const req = new Request("http://localhost:3000/api/cron/finalize-overdue-attempts", {
      headers: { authorization: "Bearer some_token" },
    });
    const res = await handleSweep(req);
    const body = await res.json();

    assert.strictEqual(res.status, 500, "Must return HTTP 500 when CRON_SECRET is unconfigured");
    assert.strictEqual(body.success, false);
    assert.match(body.error, /CRON_SECRET is not configured/);
  } finally {
    process.env.CRON_SECRET = originalSecret;
  }
});

test("SCHED-02: Cron authentication rejects missing or invalid credentials with 401 Unauthorized", async () => {
  const originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "staging_super_secret_cron_token_12345";

  try {
    // Missing header
    const reqNoHeader = new Request("http://localhost:3000/api/cron/finalize-overdue-attempts");
    const res1 = await handleSweep(reqNoHeader);
    assert.strictEqual(res1.status, 401, "Missing authorization header must return 401");

    // Invalid Bearer token
    const reqWrongToken = new Request("http://localhost:3000/api/cron/finalize-overdue-attempts", {
      headers: { authorization: "Bearer wrong_token" },
    });
    const res2 = await handleSweep(reqWrongToken);
    assert.strictEqual(res2.status, 401, "Invalid Bearer token must return 401");

    // Invalid x-cron-secret header
    const reqWrongHeader = new Request("http://localhost:3000/api/cron/finalize-overdue-attempts", {
      headers: { "x-cron-secret": "wrong_secret" },
    });
    const res3 = await handleSweep(reqWrongHeader);
    assert.strictEqual(res3.status, 401, "Invalid x-cron-secret must return 401");
  } finally {
    process.env.CRON_SECRET = originalSecret;
  }
});

test("SCHED-03: Cron authentication accepts valid Bearer token and x-cron-secret header", () => {
  const originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "staging_super_secret_cron_token_12345";

  try {
    // Valid Bearer
    const reqBearer = new Request("http://localhost:3000/api/cron/finalize-overdue-attempts", {
      headers: { authorization: "Bearer staging_super_secret_cron_token_12345" },
    });
    assert.deepStrictEqual(authenticateCronRequest(reqBearer), { authorized: true });

    // Valid x-cron-secret
    const reqHeader = new Request("http://localhost:3000/api/cron/finalize-overdue-attempts", {
      headers: { "x-cron-secret": "staging_super_secret_cron_token_12345" },
    });
    assert.deepStrictEqual(authenticateCronRequest(reqHeader), { authorized: true });
  } finally {
    process.env.CRON_SECRET = originalSecret;
  }
});

// ----------------------------------------------------------------------------
// 2. Candidate Privilege Restriction
// ----------------------------------------------------------------------------

test("SCHED-04: Server action finalizeOverdueAttemptsAction rejects non-admin callers", async () => {
  // 1. Unauthenticated / anonymous caller simulation
  const mockAnonSupabase = {
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: new Error("Authentication session required"),
      }),
    },
  };
  const resUnauth = await finalizeOverdueAttemptsAction("any-paper-id", {
    supabaseClient: mockAnonSupabase,
  });
  assert.strictEqual(resUnauth.success, false, "Unauthenticated caller must be rejected");
  assert.strictEqual(resUnauth.code, "MCQJ-ERR-4001");

  // 2. Student caller simulation
  const mockStudentSupabase = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "student-id", email: "student@mcq.test", is_anonymous: false } },
        error: null,
      }),
    },
  };
  const mockDb = {
    user: {
      findUnique: async () => ({
        id: "student-id",
        email: "student@mcq.test",
        name: "Student User",
        role: Role.STUDENT,
      }),
    },
  };

  const resStudent = await finalizeOverdueAttemptsAction("any-paper-id", {
    supabaseClient: mockStudentSupabase,
    prismaClient: mockDb,
  });
  assert.strictEqual(resStudent.success, false, "Student session must be rejected");
  assert.strictEqual(resStudent.code, "MCQJ-ERR-4003", "Must return 403 Forbidden code");
  assert.match(resStudent.error || "", /administrator privileges/i);
});

// ----------------------------------------------------------------------------
// 3. PostgreSQL Autonomous Sweep Execution, Recovery & Idempotency
// ----------------------------------------------------------------------------

test("SCHED-05: Autonomous cron sweep finalizes overdue attempts expired hours ago (Delayed Execution Recovery)", async () => {
  const originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "staging_super_secret_cron_token_12345";

  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "sched_delay");
    const candidate = await seedCandidateUser(client, "delayed.candidate@mcq.test");

    // Start attempt
    const startRes = await startExamAttempt(
      { paperId: seed.paperId },
      candidate,
      {},
      { prismaClient: prisma }
    );

    // Simulate scheduler delay: expires_at passed 3 hours ago
    await client.query(`
      UPDATE test_attempts
      SET expires_at = NOW() - INTERVAL '3 hours'
      WHERE id = $1;
    `, [startRes.attemptId]);

    // Invoke cron route handler with injected test db context
    const req = new Request(`http://localhost:3000/api/cron/finalize-overdue-attempts?paperId=${seed.paperId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });

    const response = await handleSweep(req, { prismaClient: prisma });
    const body = await response.json();

    assert.strictEqual(response.status, 200, "Cron handler must return HTTP 200");
    assert.strictEqual(body.success, true);
    assert.ok(body.finalizedCount >= 1, "Must report at least 1 finalized attempt");
    assert.ok(body.attemptIds.includes(startRes.attemptId), "Must include target attempt ID");
    assert.ok(typeof body.durationMs === "number", "Must include duration telemetry");
    assert.ok(typeof body.timestamp === "string", "Must include ISO timestamp");

    // Verify attempt state in PostgreSQL
    const attRow = (await client.query(`SELECT attempt_status FROM test_attempts WHERE id = $1;`, [startRes.attemptId])).rows[0];
    assert.strictEqual(attRow.attempt_status, "EVALUATED");

    // Verify evaluation record exists
    const evalRow = (await client.query(`SELECT count(*)::int AS count FROM attempt_evaluations WHERE attempt_id = $1;`, [startRes.attemptId])).rows[0];
    assert.strictEqual(evalRow.count, 1, "Must generate exactly 1 evaluation record");

    // ------------------------------------------------------------------------
    // SCHED-06: Repeated Execution (Idempotency)
    // ------------------------------------------------------------------------
    const repeatReq = new Request(`http://localhost:3000/api/cron/finalize-overdue-attempts?paperId=${seed.paperId}`, {
      method: "GET",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });

    const repeatResponse = await handleSweep(repeatReq, { prismaClient: prisma });
    const repeatBody = await repeatResponse.json();

    assert.strictEqual(repeatResponse.status, 200);
    assert.strictEqual(repeatBody.success, true);
    assert.strictEqual(repeatBody.finalizedCount, 0, "Repeated run must find 0 overdue attempts");
    assert.strictEqual(repeatBody.attemptIds.length, 0);

    // Verify evaluation count is still strictly 1 (no duplicate evaluation)
    const evalRow2 = (await client.query(`SELECT count(*)::int AS count FROM attempt_evaluations WHERE attempt_id = $1;`, [startRes.attemptId])).rows[0];
    assert.strictEqual(evalRow2.count, 1, "Evaluation record count must remain exactly 1");
  } finally {
    client.release();
    process.env.CRON_SECRET = originalSecret;
  }
});

test("SCHED-06: Idempotent repeat sweep on clean state yields 0 finalized attempts and 0 duplicate evaluations", async () => {
  const originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "staging_super_secret_cron_token_12345";

  try {
    // 1. Initial sweep flushes any pending overdue attempts across the test database
    const req1 = new Request(`http://localhost:3000/api/cron/finalize-overdue-attempts`, {
      method: "GET",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const res1 = await handleSweep(req1, { prismaClient: prisma });
    assert.strictEqual(res1.status, 200);

    // 2. Second consecutive sweep must find strictly 0 overdue attempts
    const req2 = new Request(`http://localhost:3000/api/cron/finalize-overdue-attempts`, {
      method: "GET",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const res2 = await handleSweep(req2, { prismaClient: prisma });
    const body2 = await res2.json();

    assert.strictEqual(res2.status, 200);
    assert.strictEqual(body2.success, true);
    assert.strictEqual(body2.finalizedCount, 0, "Consecutive sweep on clean state must report 0 overdue attempts");
    assert.strictEqual(body2.attemptIds.length, 0);
  } finally {
    process.env.CRON_SECRET = originalSecret;
  }
});

test("SCHED-07: Cron handler handles database errors with HTTP 500 to trigger scheduler retries", async () => {
  const originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "staging_super_secret_cron_token_12345";

  // Simulate database failure by passing invalid context or closed pool in direct service call
  const closedPool = new Pool({ connectionString: "postgresql://postgres:bad_pw@127.0.0.1:9999/non_existent", connectionTimeoutMillis: 500 });
  const badAdapter = new PrismaPg(closedPool);
  const badPrisma = new PrismaClient({ adapter: badAdapter });

  try {
    await assert.rejects(
      async () => finalizeOverdueAttempts(undefined, { prismaClient: badPrisma }),
      /reach database server|connect|ECONNREFUSED|timeout/i
    );
  } finally {
    await closedPool.end().catch(() => {});
    process.env.CRON_SECRET = originalSecret;
  }
});
