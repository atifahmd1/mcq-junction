// ============================================================================
// MCQ Junction — Live Hosted Staging Acceptance & Verification Suite
// File: tests/staging-acceptance.test.mjs
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { buildDatabaseClientConfig } from "../scripts/dev/admin-bootstrap-lib.mjs";
import {
  authenticateCronRequest,
  handleSweep,
} from "../src/app/api/cron/finalize-overdue-attempts/route.ts";
import {
  startExamAttempt,
  saveAttemptAnswer,
  submitExamAttempt,
  getExamAttempt,
  finalizeOverdueAttempts,
} from "../src/lib/exam/service.ts";
import {
  calculateAttemptScore,
} from "../src/lib/scoring/engine.ts";
import { publishExamPaper } from "../src/lib/admin/service.ts";
import { finalizeOverdueAttemptsAction } from "../src/app/exam/actions.ts";
import {
  Role,
  PaperPublishStatus,
  AttemptStatus,
  QuestionType,
} from "../src/generated/prisma/enums.ts";

dotenv.config({ path: ".env.local" });

const { Pool } = pg;

// Verify required staging environment variables
assert.ok(process.env.DIRECT_URL, "DIRECT_URL must be defined in .env.local");
assert.ok(process.env.DATABASE_URL, "DATABASE_URL must be defined in .env.local");
assert.ok(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL must be defined in .env.local");
assert.ok(process.env.CRON_SECRET, "CRON_SECRET must be defined in .env.local");

// Build secure PostgreSQL connection pool with official Supabase Root CA certificate
const poolConfig = buildDatabaseClientConfig(process.env.DATABASE_URL);
const pool = new Pool(poolConfig);
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const serviceCtx = { prismaClient: prisma };

const directConfig = buildDatabaseClientConfig(process.env.DIRECT_URL);
const directPool = new Pool(directConfig);

// Unique run identifier for disposable test fixtures
const RUN_ID = `stg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

console.log("================================================================================");
console.log("  MCQ JUNCTION — HOSTED STAGING ACCEPTANCE & DEPLOYMENT VERIFICATION");
console.log(`  Target Project: ehapldwukenlptlbnzvi (ap-northeast-1)`);
console.log(`  Run Identifier: ${RUN_ID}`);
console.log("================================================================================\n");

// Disposable IDs
const adminUserId = "a1000000-0000-0000-0000-000000000001";
const adminUserEmail = `stg_admin_${RUN_ID}@mcq.staging`;

const cand1Id = "c1000000-0000-0000-0000-000000000001";
const cand1Email = `stg_cand1_${RUN_ID}@mcq.staging`;

const cand2Id = "c2000000-0000-0000-0000-000000000002";
const cand2Email = `stg_cand2_${RUN_ID}@mcq.staging`;

let createdPaperId = null;
let createdPassageId = null;
let cand1AttemptId = null;

// ----------------------------------------------------------------------------
// Setup & Teardown Helpers
// ----------------------------------------------------------------------------
async function ensureStagingUsers() {
  const client = await directPool.connect();
  try {
    // 1. Admin User
    await client.query(`
      INSERT INTO auth.users (id, email)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET email = $2;
    `, [adminUserId, adminUserEmail]);

    await client.query(`
      INSERT INTO public.users (id, email, name, role, created_at, updated_at)
      VALUES ($1, $2, 'Staging Test Admin', 'ADMIN'::"Role", clock_timestamp(), clock_timestamp())
      ON CONFLICT (id) DO UPDATE SET role = 'ADMIN'::"Role", name = 'Staging Test Admin';
    `, [adminUserId, adminUserEmail]);

    // 2. Candidate 1
    await client.query(`
      INSERT INTO auth.users (id, email)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET email = $2;
    `, [cand1Id, cand1Email]);

    await client.query(`
      INSERT INTO public.users (id, email, name, role, created_at, updated_at)
      VALUES ($1, $2, 'Staging Candidate One', 'STUDENT'::"Role", clock_timestamp(), clock_timestamp())
      ON CONFLICT (id) DO UPDATE SET role = 'STUDENT'::"Role", name = 'Staging Candidate One';
    `, [cand1Id, cand1Email]);

    // 3. Candidate 2
    await client.query(`
      INSERT INTO auth.users (id, email)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET email = $2;
    `, [cand2Id, cand2Email]);

    await client.query(`
      INSERT INTO public.users (id, email, name, role, created_at, updated_at)
      VALUES ($1, $2, 'Staging Candidate Two', 'STUDENT'::"Role", clock_timestamp(), clock_timestamp())
      ON CONFLICT (id) DO UPDATE SET role = 'STUDENT'::"Role", name = 'Staging Candidate Two';
    `, [cand2Id, cand2Email]);
  } finally {
    client.release();
  }
}

async function cleanupStagingFixtures() {
  console.log("\n▶ Cleaning up disposable staging fixtures...");
  const client = await directPool.connect();
  try {
    if (createdPaperId) {
      await client.query(`DELETE FROM exam_papers WHERE id = $1;`, [createdPaperId]).catch(() => {});
    }
    if (createdPassageId) {
      await client.query(`DELETE FROM comprehension_passages WHERE id = $1;`, [createdPassageId]).catch(() => {});
    }
    await client.query(`DELETE FROM public.users WHERE id IN ($1, $2, $3);`, [adminUserId, cand1Id, cand2Id]).catch(() => {});
    await client.query(`DELETE FROM auth.users WHERE id IN ($1, $2, $3);`, [adminUserId, cand1Id, cand2Id]).catch(() => {});
    console.log("✔ Disposable test data purged cleanly.");
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------------------
// Test Specifications
// ----------------------------------------------------------------------------

test("STG-01: Direct & Pooled PostgreSQL Connections with Strict TLS Verification", async () => {
  const directClient = await directPool.connect();
  try {
    const res = await directClient.query("SELECT current_user, inet_server_port(), count(*) FROM _prisma_migrations;");
    assert.strictEqual(res.rows[0].current_user, "postgres");
    assert.strictEqual(parseInt(res.rows[0].count, 10), 10, "Expected all 10 migrations in _prisma_migrations");
  } finally {
    directClient.release();
  }

  const userCount = await prisma.user.count();
  assert.ok(userCount >= 1, "Prisma pooler client should read users table");
});

test("STG-02: Autonomous Sweeper Cron Endpoint Authentication & Retry Protocol", async () => {
  // 1. Missing secret
  const unauthReq = new Request("http://localhost/api/cron/finalize-overdue-attempts", {
    method: "POST",
    headers: {},
  });
  const unauthAuth = authenticateCronRequest(unauthReq);
  assert.strictEqual(unauthAuth.authorized, false);
  assert.strictEqual(unauthAuth.status, 401);

  // 2. Wrong token
  const badReq = new Request("http://localhost/api/cron/finalize-overdue-attempts", {
    method: "POST",
    headers: { authorization: "Bearer invalid_secret_123" },
  });
  const badAuth = authenticateCronRequest(badReq);
  assert.strictEqual(badAuth.authorized, false);
  assert.strictEqual(badAuth.status, 401);

  // 3. Valid Bearer Token
  const validReq = new Request("http://localhost/api/cron/finalize-overdue-attempts", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const validAuth = authenticateCronRequest(validReq);
  assert.strictEqual(validAuth.authorized, true);

  // 4. Execute sweep against live staging DB
  const sweepRes = await handleSweep(validReq, serviceCtx);
  assert.strictEqual(sweepRes.status, 200);
  const data = await sweepRes.json();
  assert.strictEqual(data.success, true);
  assert.ok(typeof data.finalizedCount === "number");
});

test("STG-03: Hosting Cron Schedule Configuration in vercel.json", () => {
  const vercelJsonPath = path.resolve(process.cwd(), "vercel.json");
  assert.ok(fs.existsSync(vercelJsonPath), "vercel.json must exist");
  const config = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8"));
  assert.ok(config.crons && config.crons.length > 0, "vercel.json must define crons array");
  const entry = config.crons.find((c) => c.path.includes("finalize-overdue-attempts"));
  assert.ok(entry, "Cron entry for finalize-overdue-attempts must exist");
  assert.strictEqual(entry.schedule, "* * * * *", "Cron schedule must be 1-minute (* * * * *)");
});

test("STG-04: User Synchronization & Role Enforcement", async () => {
  await ensureStagingUsers();

  const admin = await prisma.user.findUnique({ where: { id: adminUserId } });
  assert.strictEqual(admin.role, Role.ADMIN);

  const cand1 = await prisma.user.findUnique({ where: { id: cand1Id } });
  assert.strictEqual(cand1.role, Role.STUDENT);
});

test("STG-05: Admin Authorization Gate & Action Privilege Hardening", async () => {
  const mockStudentSupabase = {
    auth: {
      getUser: async () => ({
        data: { user: { id: cand1Id, email: cand1Email, is_anonymous: false } },
        error: null,
      }),
    },
  };

  // Candidate attempting to trigger sweep action must return error
  const actionRes = await finalizeOverdueAttemptsAction("any-paper-id", {
    supabaseClient: mockStudentSupabase,
    prismaClient: prisma,
  });
  assert.strictEqual(actionRes.success, false);
  assert.strictEqual(actionRes.code, "MCQJ-ERR-4003");
  assert.match(actionRes.error || "", /administrator privileges/i);
});

test("STG-06: Question Authoring, Passage Creation & Gate 7 Publication Pipeline", async () => {
  const client = await directPool.connect();
  try {
    // 1. Conducting Body, Exam, Exam Session
    const cbId = (
      await client.query(
        `INSERT INTO conducting_bodies (code, full_name, region_code)
         VALUES ($1, $2, 'BR') RETURNING id;`,
        [`CB-${RUN_ID}`, `BPSC Staging Body ${RUN_ID}`]
      )
    ).rows[0].id;

    const examId = (
      await client.query(
        `INSERT INTO exams (conducting_body_id, code, title, tier)
         VALUES ($1, $2, 'Staging Test Engineering Examination', 'STATE_LEVEL') RETURNING id;`,
        [cbId, `EXAM-${RUN_ID}`]
      )
    ).rows[0].id;

    const sessionId = (
      await client.query(
        `INSERT INTO exam_sessions (exam_id, session_year, cycle_code)
         VALUES ($1, 2026, $2) RETURNING id;`,
        [examId, `CYC-${RUN_ID}`]
      )
    ).rows[0].id;

    // 2. Exam Paper
    const paperId = (
      await client.query(
        `INSERT INTO exam_papers (
           session_id, paper_code, title, publish_status,
           published_at, total_duration_minutes, total_questions, max_score
         )
         VALUES ($1, $2, 'Staging Systems Engineering 2026', 'VERIFIED', NULL, 30, 4, 8.0)
         RETURNING id;`,
        [sessionId, `P-STG-${RUN_ID}`]
      )
    ).rows[0].id;
    createdPaperId = paperId;

    // 3. Marking Scheme (+2.000, -0.500)
    await client.query(
      `INSERT INTO paper_marking_schemes (paper_id, marks_per_correct, negative_marks_per_wrong)
       VALUES ($1, 2.000, 0.500);`,
      [paperId]
    );

    // 4. Section
    const sectionId = (
      await client.query(
        `INSERT INTO paper_sections (paper_id, section_order, title, total_questions)
         VALUES ($1, 1, 'Core Computer Engineering', 4) RETURNING id;`,
        [paperId]
      )
    ).rows[0].id;

    // 5. Booklet Series 'A'
    const bookletId = (
      await client.query(
        `INSERT INTO booklet_series (paper_id, series_code, is_master_series)
         VALUES ($1, 'A', TRUE) RETURNING id;`,
        [paperId]
      )
    ).rows[0].id;

    // 6. Urdu RTL Comprehension Passage
    const passageId = (
      await client.query(
        `INSERT INTO comprehension_passages (passage_ref_code, title, body_text, language_code)
         VALUES ($1, 'کمپیوٹر نیٹ ورک (Computer Networks)', 'او ایس آئی ماڈل سات تہوں پر مشتمل ہے۔', 'UR')
         RETURNING id;`,
        [`PASS-STG-${RUN_ID}`]
      )
    ).rows[0].id;
    createdPassageId = passageId;

    // 7. Seed 4 Canonical Questions:
    // Q1: SINGLE_CORRECT (Correct = B)
    const cq1 = (await client.query(`INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic, question_type) VALUES ($1, 'OS', 'Scheduling', 'SINGLE_CORRECT') RETURNING id;`, [`CQ1-${RUN_ID}`])).rows[0].id;
    const occ1 = (await client.query(`INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type) VALUES ($1, $2, $3, 1, 'SINGLE_CORRECT') RETURNING id;`, [paperId, sectionId, cq1])).rows[0].id;
    const rep1 = (await client.query(`INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified) VALUES ($1, 'EN', 'Which CPU scheduling algorithm achieves minimum average waiting time?', TRUE) RETURNING id;`, [occ1])).rows[0].id;
    const o1A = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'A', 1, 'FCFS') RETURNING id;`, [rep1])).rows[0].id;
    const o1B = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'B', 2, 'SJF') RETURNING id;`, [rep1])).rows[0].id;
    const o1C = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'C', 3, 'Priority') RETURNING id;`, [rep1])).rows[0].id;
    const o1D = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'D', 4, 'Round Robin') RETURNING id;`, [rep1])).rows[0].id;

    // Q2: MULTIPLE_CORRECT (Correct = A, C, D)
    const cq2 = (await client.query(`INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic, question_type) VALUES ($1, 'OS', 'Deadlocks', 'MULTIPLE_CORRECT') RETURNING id;`, [`CQ2-${RUN_ID}`])).rows[0].id;
    const occ2 = (await client.query(`INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type) VALUES ($1, $2, $3, 2, 'MULTIPLE_CORRECT') RETURNING id;`, [paperId, sectionId, cq2])).rows[0].id;
    const rep2 = (await client.query(`INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified) VALUES ($1, 'EN', 'Which of the following are Coffman conditions for deadlock?', TRUE) RETURNING id;`, [occ2])).rows[0].id;
    const o2A = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'A', 1, 'Mutual Exclusion') RETURNING id;`, [rep2])).rows[0].id;
    const o2B = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'B', 2, 'Preemption allowed') RETURNING id;`, [rep2])).rows[0].id;
    const o2C = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'C', 3, 'Hold and Wait') RETURNING id;`, [rep2])).rows[0].id;
    const o2D = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'D', 4, 'Circular Wait') RETURNING id;`, [rep2])).rows[0].id;

    // Q3: ASSERTION_REASON (Correct = A)
    const cq3 = (await client.query(`INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic, question_type) VALUES ($1, 'OS', 'Virtual Memory', 'ASSERTION_REASON') RETURNING id;`, [`CQ3-${RUN_ID}`])).rows[0].id;
    const occ3 = (await client.query(`INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type) VALUES ($1, $2, $3, 3, 'ASSERTION_REASON') RETURNING id;`, [paperId, sectionId, cq3])).rows[0].id;
    const rep3 = (await client.query(`INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified) VALUES ($1, 'EN', 'Assertion: Virtual memory increases degree of multiprogramming. Reason: Only active portions of processes need to reside in physical RAM.', TRUE) RETURNING id;`, [occ3])).rows[0].id;
    const o3A = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'A', 1, 'Both A and R true, R is correct explanation of A') RETURNING id;`, [rep3])).rows[0].id;
    const o3B = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'B', 2, 'Both A and R true, R is NOT correct explanation') RETURNING id;`, [rep3])).rows[0].id;
    const o3C = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'C', 3, 'A true, R false') RETURNING id;`, [rep3])).rows[0].id;
    const o3D = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'D', 4, 'A false, R true') RETURNING id;`, [rep3])).rows[0].id;

    // Q4: COMPREHENSION_CHILD (Linked to passage, Correct = B)
    const cq4 = (await client.query(`INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic, question_type) VALUES ($1, 'Networks', 'OSI', 'COMPREHENSION_CHILD') RETURNING id;`, [`CQ4-${RUN_ID}`])).rows[0].id;
    const occ4 = (await client.query(`INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type, passage_id) VALUES ($1, $2, $3, 4, 'COMPREHENSION_CHILD', $4) RETURNING id;`, [paperId, sectionId, cq4, passageId])).rows[0].id;
    const rep4 = (await client.query(`INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified) VALUES ($1, 'UR', 'او ایس آئی ماڈل میں کتنی تہیں ہوتی ہیں؟', TRUE) RETURNING id;`, [occ4])).rows[0].id;
    const o4A = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'A', 1, '5 تہیں') RETURNING id;`, [rep4])).rows[0].id;
    const o4B = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'B', 2, '7 تہیں') RETURNING id;`, [rep4])).rows[0].id;
    const o4C = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'C', 3, '4 تہیں') RETURNING id;`, [rep4])).rows[0].id;
    const o4D = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'D', 4, '6 تہیں') RETURNING id;`, [rep4])).rows[0].id;

    // Master Booklet Mappings
    const bqms = [];
    for (let i = 0; i < 4; i++) {
      const occ = [occ1, occ2, occ3, occ4][i];
      const bqm = (await client.query(`INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence) VALUES ($1, $2, $3, $4) RETURNING id;`, [paperId, bookletId, occ, i + 1])).rows[0].id;
      bqms.push(bqm);
    }

    const optPairs = [
      [bqms[0], [o1A, o1B, o1C, o1D]],
      [bqms[1], [o2A, o2B, o2C, o2D]],
      [bqms[2], [o3A, o3B, o3C, o3D]],
      [bqms[3], [o4A, o4B, o4C, o4D]],
    ];

    for (const [bqm, opts] of optPairs) {
      const labels = ["A", "B", "C", "D"];
      for (let j = 0; j < 4; j++) {
        await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, $3, $4);`, [bqm, opts[j], labels[j], j + 1]);
      }
    }

    // Answer Key v1
    const keyVerRes = await client.query(`
      INSERT INTO answer_key_versions (paper_id, version_number, version_tag, is_official)
      VALUES ($1, 1, 'OFFICIAL_V1', TRUE) RETURNING id;
    `, [paperId]);
    const keyVer = keyVerRes.rows[0].id;

    await client.query(`
      INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
      VALUES ($1, $2, $3, 'ACTIVE', ARRAY['B']);
    `, [paperId, keyVer, occ1]);
    await client.query(`
      INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
      VALUES ($1, $2, $3, 'ACTIVE', ARRAY['A', 'C', 'D']);
    `, [paperId, keyVer, occ2]);
    await client.query(`
      INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
      VALUES ($1, $2, $3, 'ACTIVE', ARRAY['A']);
    `, [paperId, keyVer, occ3]);
    await client.query(`
      INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
      VALUES ($1, $2, $3, 'ACTIVE', ARRAY['B']);
    `, [paperId, keyVer, occ4]);

    // Execute publication through admin service
    const pubResult = await publishExamPaper(
      { paperId },
      { prismaClient: prisma, sessionOverride: { id: adminUserId, email: adminUserEmail, role: Role.ADMIN } }
    );

    assert.strictEqual(pubResult.success, true);
    assert.strictEqual(pubResult.publish_status, "PUBLISHED");

    // Verify database publication status
    const verified = await client.query(`SELECT publish_status FROM exam_papers WHERE id = $1;`, [paperId]);
    assert.strictEqual(verified.rows[0].publish_status, "PUBLISHED");
  } finally {
    client.release();
  }
});

test("STG-07: Candidate Exam Attempt Lifecycle, Resumption & Privacy Projection", async () => {
  assert.ok(createdPaperId, "Test paper must be published");
  const candUser = { id: cand1Id, role: Role.STUDENT, email: cand1Email };

  // 1. Candidate starts examination
  const attempt = await startExamAttempt({ paperId: createdPaperId }, candUser, undefined, serviceCtx);
  assert.ok(attempt.attemptId);
  assert.strictEqual(attempt.status, AttemptStatus.IN_PROGRESS);
  assert.strictEqual(attempt.isResumed, false);
  cand1AttemptId = attempt.attemptId;

  // 2. Safe resumption: second call returns existing active attempt
  const resumed = await startExamAttempt({ paperId: createdPaperId }, candUser, undefined, serviceCtx);
  assert.strictEqual(resumed.attemptId, attempt.attemptId, "Resumption must return identical attempt ID");
  assert.strictEqual(resumed.isResumed, true);

  // 3. Privacy Projection: Verify zero leakage of correct options or answer keys
  const deliveryView = await getExamAttempt({ attemptId: attempt.attemptId }, candUser, serviceCtx);
  assert.strictEqual(deliveryView.attemptId, attempt.attemptId);
  for (const q of deliveryView.questions) {
    assert.strictEqual(q.isCorrect, undefined);
    assert.strictEqual(q.correctOptionLabels, undefined);
    assert.strictEqual(q.correctSourceOptionIds, undefined);
    assert.strictEqual(q.answerKey, undefined);
  }
});

test("STG-08: Durable Answer Ledger & Optimistic Concurrency (CAS)", async () => {
  const candUser = { id: cand1Id, role: Role.STUDENT, email: cand1Email };
  const deliveryView = await getExamAttempt({ attemptId: cand1AttemptId }, candUser, serviceCtx);

  const attemptId = deliveryView.attemptId;
  const q1 = deliveryView.questions[0];

  // 1. Initial answer save (Version 1)
  const save1 = await saveAttemptAnswer({
    attemptId,
    occurrenceId: q1.occurrenceId,
    clientVersion: 1,
    displayOptionLabels: ["B"], // Correct answer
    isMarkedForReview: false,
  }, candUser, serviceCtx);

  assert.strictEqual(save1.success, true);
  assert.strictEqual(save1.status, "SAVED");
  assert.strictEqual(save1.version, 1);

  // 2. Save update with current version 1 -> increments to version 2
  const save1Update = await saveAttemptAnswer({
    attemptId,
    occurrenceId: q1.occurrenceId,
    clientVersion: 1,
    displayOptionLabels: ["B"],
    isMarkedForReview: true,
  }, candUser, serviceCtx);
  assert.strictEqual(save1Update.success, true);
  assert.strictEqual(save1Update.version, 2);

  // 3. Stale write with outdated version 1 must be rejected with VERSION_CONFLICT
  const staleSave = await saveAttemptAnswer({
    attemptId,
    occurrenceId: q1.occurrenceId,
    clientVersion: 1, // Stale! Current server version is 2
    displayOptionLabels: ["A"],
    isMarkedForReview: false,
  }, candUser, serviceCtx);

  assert.strictEqual(staleSave.success, false);
  assert.strictEqual(staleSave.status, "STALE_REJECTED");
  assert.strictEqual(staleSave.code, "VERSION_CONFLICT");

  // 4. Q2: MULTIPLE_CORRECT (Save partial response {A, C} to verify all-or-nothing scoring)
  const q2 = deliveryView.questions[1];
  const save2 = await saveAttemptAnswer({
    attemptId,
    occurrenceId: q2.occurrenceId,
    clientVersion: 1,
    displayOptionLabels: ["A", "C"], // Partial! (Correct is A, C, D)
    isMarkedForReview: false,
  }, candUser, serviceCtx);
  assert.strictEqual(save2.success, true);

  // 5. Q3: ASSERTION_REASON (Save correct {A} with MARKED_FOR_REVIEW)
  const q3 = deliveryView.questions[2];
  const save3 = await saveAttemptAnswer({
    attemptId,
    occurrenceId: q3.occurrenceId,
    clientVersion: 1,
    displayOptionLabels: ["A"],
    isMarkedForReview: true,
  }, candUser, serviceCtx);
  assert.strictEqual(save3.success, true);

  // 6. Q4: COMPREHENSION_CHILD (Save correct {B})
  const q4 = deliveryView.questions[3];
  const save4 = await saveAttemptAnswer({
    attemptId,
    occurrenceId: q4.occurrenceId,
    clientVersion: 1,
    displayOptionLabels: ["B"],
    isMarkedForReview: false,
  }, candUser, serviceCtx);
  assert.strictEqual(save4.success, true);
});

test("STG-09: Authoritative Submission & Strict All-or-Nothing Scoring Verification", async () => {
  const candUser = { id: cand1Id, role: Role.STUDENT, email: cand1Email };
  const attemptId = cand1AttemptId;

  // Final submission
  const submitRes = await submitExamAttempt({
    attemptId,
    reason: "CANDIDATE_COMPLETED",
  }, candUser, serviceCtx);

  assert.strictEqual(submitRes.success, true);
  assert.strictEqual(submitRes.attemptStatus, AttemptStatus.EVALUATED);

  // Scoring Breakdown Analysis:
  // Q1: Correct (+2.000)
  // Q2: Partial {A, C} vs Correct {A, C, D} -> STRICT ALL-OR-NOTHING: 0 positive marks, -0.500 penalty!
  // Q3: Correct (+2.000)
  // Q4: Correct (+2.000)
  // Total expected raw score: 2.0 - 0.5 + 2.0 + 2.0 = 5.500 / 8.000
  assert.strictEqual(submitRes.totalCorrect, 3, "Expected exactly 3 correct questions");
  assert.strictEqual(submitRes.totalWrong, 1, "Partial multiple-correct must be counted as incorrect");
  assert.strictEqual(Number(submitRes.rawScore), 5.5, `Expected score 5.500, got ${submitRes.rawScore}`);

  // Subsequent visit: verify attempt is locked and shows finalized evaluation
  const postSubmit = await getExamAttempt({ attemptId }, candUser, serviceCtx);
  assert.strictEqual(postSubmit.attemptStatus, AttemptStatus.EVALUATED);
  
  const savedEval = await prisma.attemptEvaluationRecord.findFirst({ where: { attemptId } });
  assert.ok(savedEval, "Evaluation record must exist in DB");
  assert.strictEqual(Number(savedEval.rawScore), 5.5);
});

test("STG-10: Cross-Candidate Security Isolation Boundary (MCQJ-ERR-6005: 403 Forbidden)", async () => {
  const cand2User = { id: cand2Id, role: Role.STUDENT, email: cand2Email };
  assert.ok(cand1AttemptId, "Candidate 1 attempt must exist");

  // Candidate 2 attempts to read Candidate 1's attempt
  await assert.rejects(
    async () => {
      await getExamAttempt({ attemptId: cand1AttemptId }, cand2User, serviceCtx);
    },
    (err) => {
      return (
        err.message.includes("permission to view or modify this attempt") ||
        err.code === "MCQJ-ERR-6005" ||
        err.statusCode === 403
      );
    },
    "Candidate 2 must be strictly forbidden from reading Candidate 1's attempt"
  );

  // Candidate 2 attempts to write an answer to Candidate 1's attempt
  await assert.rejects(
    async () => {
      await saveAttemptAnswer({
        attemptId: cand1AttemptId,
        occurrenceId: "dummy-occ-id",
        clientVersion: 1,
        displayOptionLabels: ["A"],
        isMarkedForReview: false,
      }, cand2User, serviceCtx);
    },
    (err) => {
      return (
        err.message.includes("permission to view or modify this attempt") ||
        err.code === "MCQJ-ERR-6005" ||
        err.statusCode === 403
      );
    },
    "Candidate 2 must be strictly forbidden from modifying Candidate 1's attempt"
  );
});

test("STG-11: Authoritative Expiration & Autonomous Sweep Recovery on Hosted Staging", async () => {
  const client = await directPool.connect();
  const cand2User = { id: cand2Id, role: Role.STUDENT, email: cand2Email };

  let expiredAttemptId;
  try {
    // 1. Candidate 2 starts an attempt
    const attempt = await startExamAttempt({ paperId: createdPaperId }, cand2User, undefined, serviceCtx);
    expiredAttemptId = attempt.attemptId;

    // 2. Artificially backdate expires_at to 15 minutes ago
    await client.query(`
      UPDATE test_attempts
      SET expires_at = clock_timestamp() - INTERVAL '15 minutes'
      WHERE id = $1;
    `, [expiredAttemptId]);

    // 3. Trigger autonomous sweep to recover and finalize overdue attempt
    const sweepResult = await finalizeOverdueAttempts(createdPaperId, serviceCtx);
    assert.strictEqual(sweepResult.finalizedCount, 1);
    assert.ok(sweepResult.attemptIds.includes(expiredAttemptId));

    // 4. Verify attempt transitioned to EVALUATED with official scorecard
    const finalized = await getExamAttempt({ attemptId: expiredAttemptId }, cand2User, serviceCtx);
    assert.strictEqual(finalized.attemptStatus, AttemptStatus.EVALUATED);

    // 5. Subsequent late answer save on finalized attempt must FAIL CLOSED (MCQJ-ERR-6004 or MCQJ-ERR-6003)
    await assert.rejects(
      async () => {
        await saveAttemptAnswer({
          attemptId: expiredAttemptId,
          occurrenceId: "any-occ-id",
          clientVersion: 1,
          displayOptionLabels: ["A"],
          isMarkedForReview: false,
        }, cand2User, serviceCtx);
      },
      (err) => {
        return (
          err.code === "MCQJ-ERR-6004" ||
          err.code === "MCQJ-ERR-6003" ||
          err.statusCode === 409 ||
          err.statusCode === 403
        );
      },
      "Late answer save on finalized attempt must be rejected (409 Conflict or 403 Forbidden)"
    );
  } finally {
    client.release();
  }
});

// Teardown
test.after(async () => {
  await cleanupStagingFixtures();
  await prisma.$disconnect();
  await pool.end();
  await directPool.end();
});
