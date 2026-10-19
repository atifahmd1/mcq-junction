// ============================================================================
// MCQ Junction — Real PostgreSQL 16 Examination Engine Integration Tests
// File: tests/exam-database.test.mjs
// ============================================================================

import test from "node:test";
import assert from "node:assert";
import pg from "pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  startExamAttempt,
  getExamAttempt,
  saveAttemptAnswer,
  submitExamAttempt,
  finalizeOverdueAttempts,
  ExamServiceError,
} from "../src/lib/exam/service.ts";
import { AttemptStatus } from "../src/generated/prisma/enums.ts";

const { Client, Pool } = pg;

const testDbUrl = process.env.TEST_DATABASE_URL;
if (!testDbUrl) {
  throw new Error("TEST_DATABASE_URL must be defined targeting local disposable PostgreSQL (127.0.0.1:5433).");
}

const pool = new Pool({ connectionString: testDbUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Helper to seed a published exam paper with questions, booklet, and answer key
export async function seedPublishedExamPaper(client, suffix = "01") {
  const runId = `${suffix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  // 1. Conducting Body
  const cbRes = await client.query(`
    INSERT INTO conducting_bodies (code, full_name, region_code)
    VALUES ($1, $2, $3)
    RETURNING id;
  `, [`CB_EXAM_${runId}`, `Exam Commission ${runId}`, "BR"]);
  const cbId = cbRes.rows[0].id;

  // 2. Exam
  const examRes = await client.query(`
    INSERT INTO exams (conducting_body_id, code, title, tier)
    VALUES ($1, $2, $3, 'STATE_LEVEL')
    RETURNING id;
  `, [cbId, `EXAM_CODE_${runId}`, `State Civil Exam ${runId}`]);
  const examId = examRes.rows[0].id;

  // 3. Exam Session
  const sessionRes = await client.query(`
    INSERT INTO exam_sessions (exam_id, session_year, cycle_code)
    VALUES ($1, 2026, $2)
    RETURNING id;
  `, [examId, `CYCLE_${runId}`]);
  const sessionId = sessionRes.rows[0].id;

  // 4. Exam Paper (Created as VERIFIED, published after children are seeded)
  const paperRes = await client.query(`
    INSERT INTO exam_papers (
      session_id, paper_code, title, publish_status,
      published_at, total_duration_minutes, total_questions, max_score
    )
    VALUES ($1, $2, $3, 'VERIFIED', NULL, 60, 3, 6.000)
    RETURNING id;
  `, [sessionId, `PAPER_EXAM_${runId}`, `Realtime Delivery Paper ${runId}`]);
  const paperId = paperRes.rows[0].id;

  // 5. Section
  const secRes = await client.query(`
    INSERT INTO paper_sections (paper_id, section_order, title, total_questions)
    VALUES ($1, 1, 'General Studies', 3)
    RETURNING id;
  `, [paperId]);
  const sectionId = secRes.rows[0].id;

  // 6. Marking Scheme (2 marks correct, 0.5 penalty)
  await client.query(`
    INSERT INTO paper_marking_schemes (paper_id, marks_per_correct, negative_marks_per_wrong)
    VALUES ($1, 2.000, 0.500);
  `, [paperId]);

  // 7. Passage for Question 2 & 3
  const passageRes = await client.query(`
    INSERT INTO comprehension_passages (passage_ref_code, title, body_text, language_code)
    VALUES ($1, 'Distributed Consistency', 'In distributed systems, the CAP theorem states...', 'EN')
    RETURNING id;
  `, [`PASS_EXAM_${runId}`]);
  const passageId = passageRes.rows[0].id;

  // 8. Conceptual Questions
  const cq1 = (await client.query(`
    INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic, question_type)
    VALUES ($1, 'Computer Science', 'DBMS', 'SINGLE_CORRECT') RETURNING id;
  `, [`CQ_EXAM_${runId}_1`])).rows[0].id;

  const cq2 = (await client.query(`
    INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic, question_type)
    VALUES ($1, 'Computer Science', 'Distributed Systems', 'MULTIPLE_CORRECT') RETURNING id;
  `, [`CQ_EXAM_${runId}_2`])).rows[0].id;

  const cq3 = (await client.query(`
    INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic, question_type)
    VALUES ($1, 'Computer Science', 'Distributed Systems', 'COMPREHENSION_CHILD') RETURNING id;
  `, [`CQ_EXAM_${runId}_3`])).rows[0].id;

  // 9. Occurrences
  const occ1 = (await client.query(`
    INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
    VALUES ($1, $2, $3, 1, 'SINGLE_CORRECT') RETURNING id;
  `, [paperId, sectionId, cq1])).rows[0].id;

  const occ2 = (await client.query(`
    INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, passage_id, sequence_number, question_type)
    VALUES ($1, $2, $3, $4, 2, 'MULTIPLE_CORRECT') RETURNING id;
  `, [paperId, sectionId, cq2, passageId])).rows[0].id;

  const occ3 = (await client.query(`
    INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, passage_id, sequence_number, question_type)
    VALUES ($1, $2, $3, $4, 3, 'COMPREHENSION_CHILD') RETURNING id;
  `, [paperId, sectionId, cq3, passageId])).rows[0].id;

  // 10. Representations & Options
  // Q1: Options A, B, C, D (Correct: B)
  const rep1 = (await client.query(`
    INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
    VALUES ($1, 'EN', 'What does ACID stand for?', TRUE) RETURNING id;
  `, [occ1])).rows[0].id;

  const opt1A = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'A', 1, 'Wrong') RETURNING id;`, [rep1])).rows[0].id;
  const opt1B = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'B', 2, 'Atomicity, Consistency, Isolation, Durability') RETURNING id;`, [rep1])).rows[0].id;
  const opt1C = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'C', 3, 'Wrong') RETURNING id;`, [rep1])).rows[0].id;
  const opt1D = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'D', 4, 'Wrong') RETURNING id;`, [rep1])).rows[0].id;

  // Q2: Options A, B, C, D (Correct: B and D)
  const rep2 = (await client.query(`
    INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
    VALUES ($1, 'EN', 'Which guarantees are mutually exclusive in a network partition?', TRUE) RETURNING id;
  `, [occ2])).rows[0].id;

  const opt2A = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'A', 1, 'Wrong') RETURNING id;`, [rep2])).rows[0].id;
  const opt2B = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'B', 2, 'Availability') RETURNING id;`, [rep2])).rows[0].id;
  const opt2C = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'C', 3, 'Wrong') RETURNING id;`, [rep2])).rows[0].id;
  const opt2D = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'D', 4, 'Consistency') RETURNING id;`, [rep2])).rows[0].id;

  // Q3: Options A, B, C, D (Correct: A)
  const rep3 = (await client.query(`
    INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
    VALUES ($1, 'EN', 'According to the passage, partition tolerance is mandatory.', TRUE) RETURNING id;
  `, [occ3])).rows[0].id;

  const opt3A = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'A', 1, 'True') RETURNING id;`, [rep3])).rows[0].id;
  const opt3B = (await client.query(`INSERT INTO question_options (representation_id, option_label, sort_order, option_text) VALUES ($1, 'B', 2, 'False') RETURNING id;`, [rep3])).rows[0].id;

  // 11. Booklet Series Master "A"
  const bookletRes = await client.query(`
    INSERT INTO booklet_series (paper_id, series_code, is_master_series)
    VALUES ($1, 'A', TRUE) RETURNING id;
  `, [paperId]);
  const bookletId = bookletRes.rows[0].id;

  // Booklet mappings for Q1
  const bqm1 = (await client.query(`
    INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
    VALUES ($1, $2, $3, 1) RETURNING id;
  `, [paperId, bookletId, occ1])).rows[0].id;
  await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'A', 1);`, [bqm1, opt1A]);
  await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'B', 2);`, [bqm1, opt1B]);
  await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'C', 3);`, [bqm1, opt1C]);
  await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'D', 4);`, [bqm1, opt1D]);

  // Booklet mappings for Q2
  const bqm2 = (await client.query(`
    INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
    VALUES ($1, $2, $3, 2) RETURNING id;
  `, [paperId, bookletId, occ2])).rows[0].id;
  await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'A', 1);`, [bqm2, opt2A]);
  await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'B', 2);`, [bqm2, opt2B]);
  await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'C', 3);`, [bqm2, opt2C]);
  await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'D', 4);`, [bqm2, opt2D]);

  // Booklet mappings for Q3
  const bqm3 = (await client.query(`
    INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
    VALUES ($1, $2, $3, 3) RETURNING id;
  `, [paperId, bookletId, occ3])).rows[0].id;
  await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'A', 1);`, [bqm3, opt3A]);
  await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'B', 2);`, [bqm3, opt3B]);

  // 12. Answer Key Version 1 (Official Active)
  const keyVerRes = await client.query(`
    INSERT INTO answer_key_versions (paper_id, version_number, version_tag, is_official)
    VALUES ($1, 1, 'OFFICIAL_FINAL_V1', TRUE) RETURNING id;
  `, [paperId]);
  const keyVerId = keyVerRes.rows[0].id;

  // Answer Key Items: Q1 -> B, Q2 -> B and D, Q3 -> A
  await client.query(`
    INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
    VALUES ($1, $2, $3, 'ACTIVE', ARRAY['B']);
  `, [paperId, keyVerId, occ1]);

  await client.query(`
    INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
    VALUES ($1, $2, $3, 'ACTIVE', ARRAY['B', 'D']);
  `, [paperId, keyVerId, occ2]);

  await client.query(`
    INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
    VALUES ($1, $2, $3, 'ACTIVE', ARRAY['A']);
  `, [paperId, keyVerId, occ3]);

  // 13. Publish the paper now that all child entities are in place
  await client.query(`
    UPDATE exam_papers
    SET publish_status = 'PUBLISHED', published_at = NOW()
    WHERE id = $1;
  `, [paperId]);

  return {
    paperId,
    bookletId,
    keyVerId,
    occ1,
    occ2,
    occ3,
    opt1A,
    opt1B,
    opt1C,
    opt1D,
    opt2A,
    opt2B,
    opt2C,
    opt2D,
    opt3A,
    opt3B,
  };
}

// Helper to seed a test candidate user
export async function seedCandidateUser(client, email, name = "Candidate User") {
  const uniqueEmail = `${Date.now()}_${Math.floor(Math.random() * 100000)}_${email}`;
  const authUserRes = await client.query(`
    INSERT INTO auth.users (email)
    VALUES ($1)
    RETURNING id;
  `, [uniqueEmail]);
  const authUserId = authUserRes.rows[0].id;

  await client.query(`
    INSERT INTO users (id, email, name, role, updated_at)
    VALUES ($1, $2, $3, 'STUDENT', NOW())
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW();
  `, [authUserId, uniqueEmail, name]);

  return {
    id: authUserId,
    email: uniqueEmail,
    name,
    role: "STUDENT",
    bannedUntil: null,
  };
}

// ----------------------------------------------------------------------------
// DB Integration Tests
// ----------------------------------------------------------------------------

test("DB-EXAM-01: Candidate starts published exam -> durable attempt with server expires_at", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db01");
    const candidate = await seedCandidateUser(client, "candidate.db01@mcq.test");

    const startRes = await startExamAttempt(
      { paperId: seed.paperId },
      candidate,
      { ipAddress: "127.0.0.1", userAgent: "AutomatedTestRunner" },
      { prismaClient: prisma }
    );

    assert.strictEqual(startRes.isResumed, false);
    assert.strictEqual(startRes.status, AttemptStatus.IN_PROGRESS);

    // Verify row in PostgreSQL database directly
    const attemptRow = (await client.query(`
      SELECT * FROM test_attempts WHERE id = $1;
    `, [startRes.attemptId])).rows[0];

    assert.ok(attemptRow);
    assert.strictEqual(attemptRow.user_id, candidate.id);
    assert.strictEqual(attemptRow.paper_id, seed.paperId);
    assert.strictEqual(attemptRow.attempt_status, "IN_PROGRESS");
    assert.ok(attemptRow.started_at);
    assert.ok(attemptRow.expires_at);

    // Verify duration: expires_at must equal started_at + 60 minutes
    const diffMinutes = (new Date(attemptRow.expires_at).getTime() - new Date(attemptRow.started_at).getTime()) / (60 * 1000);
    assert.strictEqual(diffMinutes, 60);
  } finally {
    client.release();
  }
});

test("DB-EXAM-02: Safe resumption: repeated start returns existing active attempt", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db02");
    const candidate = await seedCandidateUser(client, "candidate.db02@mcq.test");

    // Start attempt 1
    const res1 = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });
    assert.strictEqual(res1.isResumed, false);

    // Start attempt 2 (e.g. page refresh / reconnection)
    const res2 = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });
    assert.strictEqual(res2.isResumed, true);
    assert.strictEqual(res2.attemptId, res1.attemptId);

    // Verify only ONE attempt exists in database
    const countRes = await client.query(`
      SELECT COUNT(*) FROM test_attempts WHERE user_id = $1 AND paper_id = $2;
    `, [candidate.id, seed.paperId]);
    assert.strictEqual(Number(countRes.rows[0].count), 1);
  } finally {
    client.release();
  }
});

test("DB-EXAM-03: Partial unique index uk_attempt_user_paper_active blocks duplicate active attempts", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db03");
    const candidate = await seedCandidateUser(client, "candidate.db03@mcq.test");

    // Insert first active attempt
    await client.query(`
      INSERT INTO test_attempts (paper_id, booklet_series_id, user_id, attempt_status)
      VALUES ($1, $2, $3, 'IN_PROGRESS');
    `, [seed.paperId, seed.bookletId, candidate.id]);

    // Attempt direct concurrent SQL insertion for same candidate and paper
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO test_attempts (paper_id, booklet_series_id, user_id, attempt_status)
          VALUES ($1, $2, $3, 'IN_PROGRESS');
        `, [seed.paperId, seed.bookletId, candidate.id]);
      },
      /uk_attempt_user_paper_active/
    );
  } finally {
    client.release();
  }
});

test("DB-EXAM-04: Candidate ownership enforcement blocks cross-candidate reads and writes", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db04");
    const candidateA = await seedCandidateUser(client, "candA.db04@mcq.test");
    const candidateB = await seedCandidateUser(client, "candB.db04@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidateA, {}, { prismaClient: prisma });

    // Candidate B tries to read Candidate A's attempt
    await assert.rejects(
      async () => {
        await getExamAttempt({ attemptId: startRes.attemptId }, candidateB, { prismaClient: prisma });
      },
      (err) => err instanceof ExamServiceError && err.code === "MCQJ-ERR-6005" && err.statusCode === 403
    );

    // Candidate B tries to save an answer to Candidate A's attempt
    await assert.rejects(
      async () => {
        await saveAttemptAnswer(
          {
            attemptId: startRes.attemptId,
            occurrenceId: seed.occ1,
            selectedSourceOptionIds: [seed.opt1B],
            displayOptionLabels: ["B"],
            isMarkedForReview: false,
            timeSpentSeconds: 10,
            clientVersion: 1,
          },
          candidateB,
          { prismaClient: prisma }
        );
      },
      (err) => err instanceof ExamServiceError && err.code === "MCQJ-ERR-6005" && err.statusCode === 403
    );
  } finally {
    client.release();
  }
});

test("DB-EXAM-05: Durable answer ledger saves responses with version increments and stale protection", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db05");
    const candidate = await seedCandidateUser(client, "candidate.db05@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });

    // Save 1: Initial response
    const save1 = await saveAttemptAnswer(
      {
        attemptId: startRes.attemptId,
        occurrenceId: seed.occ1,
        selectedSourceOptionIds: [seed.opt1B],
        displayOptionLabels: ["B"],
        isMarkedForReview: false,
        timeSpentSeconds: 15,
        clientVersion: 1,
      },
      candidate,
      { prismaClient: prisma }
    );

    assert.strictEqual(save1.status, "SAVED");
    assert.strictEqual(save1.version, 1);

    // Save 2: Update response (marks for review)
    const save2 = await saveAttemptAnswer(
      {
        attemptId: startRes.attemptId,
        occurrenceId: seed.occ1,
        selectedSourceOptionIds: [seed.opt1B],
        displayOptionLabels: ["B"],
        isMarkedForReview: true,
        timeSpentSeconds: 30,
        clientVersion: 1,
      },
      candidate,
      { prismaClient: prisma }
    );

    assert.strictEqual(save2.status, "SAVED");
    assert.strictEqual(save2.version, 2);

    // Save 3: Stale out-of-order write (clientVersion = 1 < existing version 2)
    const save3 = await saveAttemptAnswer(
      {
        attemptId: startRes.attemptId,
        occurrenceId: seed.occ1,
        selectedSourceOptionIds: [],
        displayOptionLabels: [],
        isMarkedForReview: false,
        timeSpentSeconds: 5,
        clientVersion: 1,
      },
      candidate,
      { prismaClient: prisma }
    );

    assert.strictEqual(save3.status, "STALE_REJECTED");
    assert.strictEqual(save3.success, false);
    assert.strictEqual(save3.version, 2);

    // Verify row in DB kept the updated version 2
    const respRow = (await client.query(`
      SELECT * FROM attempt_responses WHERE attempt_id = $1 AND occurrence_id = $2;
    `, [startRes.attemptId, seed.occ1])).rows[0];

    assert.strictEqual(respRow.version, 2);
    assert.strictEqual(respRow.is_marked_for_review, true);
    assert.deepStrictEqual(respRow.selected_source_option_ids, [seed.opt1B]);
  } finally {
    client.release();
  }
});

test("DB-EXAM-06: Database trigger trg_attempt_responses_mutation_guard rejects mutations on SUBMITTED attempts", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db06");
    const candidate = await seedCandidateUser(client, "candidate.db06@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });

    // Transition attempt to SUBMITTED
    await client.query(`
      UPDATE test_attempts SET attempt_status = 'SUBMITTED', submitted_at = NOW() WHERE id = $1;
    `, [startRes.attemptId]);

    // Direct SQL attempt to modify attempt_responses must be blocked by the trigger
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO attempt_responses (paper_id, attempt_id, occurrence_id, selected_source_option_ids)
          VALUES ($1, $2, $3, ARRAY[$4]::uuid[]);
        `, [seed.paperId, startRes.attemptId, seed.occ1, seed.opt1B]);
      },
      /MCQJ-ERR-6002/
    );
  } finally {
    client.release();
  }
});

test("DB-EXAM-07: Database trigger trg_test_attempts_status_guard rejects illegal status regression", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db07");
    const candidate = await seedCandidateUser(client, "candidate.db07@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });

    // Advance to EVALUATED
    await client.query(`
      UPDATE test_attempts SET attempt_status = 'EVALUATED' WHERE id = $1;
    `, [startRes.attemptId]);

    // Regression back to IN_PROGRESS must fail closed
    await assert.rejects(
      async () => {
        await client.query(`
          UPDATE test_attempts SET attempt_status = 'IN_PROGRESS' WHERE id = $1;
        `, [startRes.attemptId]);
      },
      /MCQJ-ERR-6004/
    );
  } finally {
    client.release();
  }
});

test("DB-EXAM-08: Authoritative submission executes atomic scoring and records evaluation v1", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db08");
    const candidate = await seedCandidateUser(client, "candidate.db08@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });

    // Answer Q1 correctly: opt1B (2.0 marks)
    await saveAttemptAnswer(
      {
        attemptId: startRes.attemptId,
        occurrenceId: seed.occ1,
        selectedSourceOptionIds: [seed.opt1B],
        displayOptionLabels: ["B"],
        isMarkedForReview: false,
        timeSpentSeconds: 20,
        clientVersion: 1,
      },
      candidate,
      { prismaClient: prisma }
    );

    // Answer Q2 (Multiple Correct): exact match {opt2B, opt2D} (2.0 marks)
    await saveAttemptAnswer(
      {
        attemptId: startRes.attemptId,
        occurrenceId: seed.occ2,
        selectedSourceOptionIds: [seed.opt2B, seed.opt2D],
        displayOptionLabels: ["B", "D"],
        isMarkedForReview: false,
        timeSpentSeconds: 30,
        clientVersion: 1,
      },
      candidate,
      { prismaClient: prisma }
    );

    // Q3 left unanswered (0 marks, 0 penalty)

    // Candidate submits exam
    const submitRes = await submitExamAttempt(
      { attemptId: startRes.attemptId },
      candidate,
      { prismaClient: prisma }
    );

    assert.strictEqual(submitRes.success, true);
    assert.strictEqual(submitRes.attemptStatus, AttemptStatus.EVALUATED);
    assert.strictEqual(submitRes.totalCorrect, 2);
    assert.strictEqual(submitRes.totalWrong, 0);
    assert.strictEqual(submitRes.totalUnanswered, 1);
    assert.strictEqual(submitRes.rawScore, 4.0); // 2.0 + 2.0 = 4.0
    assert.strictEqual(submitRes.evaluatedDenominator, 6.0); // 3 questions * 2.0 = 6.0

    // Verify evaluation record in DB
    const evalRow = (await client.query(`
      SELECT * FROM attempt_evaluations WHERE attempt_id = $1 AND is_current_active = TRUE;
    `, [startRes.attemptId])).rows[0];

    assert.ok(evalRow);
    assert.strictEqual(Number(evalRow.raw_score), 4.0);
    assert.strictEqual(evalRow.total_correct, 2);
    assert.strictEqual(evalRow.is_original_attempt, true);

    // Idempotent repeated submission
    const repeatRes = await submitExamAttempt(
      { attemptId: startRes.attemptId },
      candidate,
      { prismaClient: prisma }
    );
    assert.strictEqual(repeatRes.rawScore, 4.0);
    assert.strictEqual(repeatRes.attemptStatus, AttemptStatus.EVALUATED);
  } finally {
    client.release();
  }
});

test("DB-EXAM-09: Multiple-correct partial selection earns zero positive marks and incurs penalty", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db09");
    const candidate = await seedCandidateUser(client, "candidate.db09@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });

    // Q1: Unanswered
    // Q2: MULTIPLE_CORRECT correct set is {B, D}. Candidate selects only {B} (partial subset)
    await saveAttemptAnswer(
      {
        attemptId: startRes.attemptId,
        occurrenceId: seed.occ2,
        selectedSourceOptionIds: [seed.opt2B], // Missing opt2D
        displayOptionLabels: ["B"],
        isMarkedForReview: false,
        timeSpentSeconds: 15,
        clientVersion: 1,
      },
      candidate,
      { prismaClient: prisma }
    );
    // Q3: Unanswered

    const submitRes = await submitExamAttempt(
      { attemptId: startRes.attemptId },
      candidate,
      { prismaClient: prisma }
    );

    assert.strictEqual(submitRes.totalCorrect, 0);
    assert.strictEqual(submitRes.totalWrong, 1);
    assert.strictEqual(submitRes.totalUnanswered, 2);
    // Partial selection must earn 0 positive marks and incur configured negative penalty (-0.500)
    assert.strictEqual(submitRes.rawScore, -0.5);
  } finally {
    client.release();
  }
});

test("DB-EXAM-10: Deadline expiry strictly blocks answer saves (MCQJ-ERR-6003)", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db10");
    const candidate = await seedCandidateUser(client, "candidate.db10@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });

    // Artificially simulate that deadline passed 10 minutes ago
    await client.query(`
      UPDATE test_attempts
      SET expires_at = NOW() - INTERVAL '10 minutes',
          started_at = NOW() - INTERVAL '70 minutes'
      WHERE id = $1;
    `, [startRes.attemptId]);

    // Answer save must be rejected with 403 / MCQJ-ERR-6003
    await assert.rejects(
      async () => {
        await saveAttemptAnswer(
          {
            attemptId: startRes.attemptId,
            occurrenceId: seed.occ1,
            selectedSourceOptionIds: [seed.opt1B],
            displayOptionLabels: ["B"],
            isMarkedForReview: false,
            timeSpentSeconds: 10,
            clientVersion: 1,
          },
          candidate,
          { prismaClient: prisma }
        );
      },
      (err) => err instanceof ExamServiceError && err.code === "MCQJ-ERR-6003" && err.statusCode === 403
    );
  } finally {
    client.release();
  }
});

test("DB-EXAM-11: Genuine concurrent answer saves enforce optimistic concurrency and reject stale updates", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db11");
    const candidate = await seedCandidateUser(client, "candidate.db11@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });

    // Initial save -> Version 1
    const initSave = await saveAttemptAnswer(
      {
        attemptId: startRes.attemptId,
        occurrenceId: seed.occ1,
        selectedSourceOptionIds: [seed.opt1A],
        displayOptionLabels: ["A"],
        isMarkedForReview: false,
        timeSpentSeconds: 10,
        clientVersion: 1,
      },
      candidate,
      { prismaClient: prisma }
    );
    assert.strictEqual(initSave.status, "SAVED");
    assert.strictEqual(initSave.version, 1);

    // Launch two genuinely concurrent saves, both offering clientVersion: 1
    const [resA, resB] = await Promise.all([
      saveAttemptAnswer(
        {
          attemptId: startRes.attemptId,
          occurrenceId: seed.occ1,
          selectedSourceOptionIds: [seed.opt1B],
          displayOptionLabels: ["B"],
          isMarkedForReview: false,
          timeSpentSeconds: 15,
          clientVersion: 1,
        },
        candidate,
        { prismaClient: prisma }
      ),
      saveAttemptAnswer(
        {
          attemptId: startRes.attemptId,
          occurrenceId: seed.occ1,
          selectedSourceOptionIds: [seed.opt1A, seed.opt1B],
          displayOptionLabels: ["A", "B"],
          isMarkedForReview: true,
          timeSpentSeconds: 20,
          clientVersion: 1,
        },
        candidate,
        { prismaClient: prisma }
      ),
    ]);

    // Exactly one must succeed with version 2, and the other must be rejected with VERSION_CONFLICT
    const succeeded = [resA, resB].filter((r) => r.success && r.status === "SAVED");
    const rejected = [resA, resB].filter((r) => !r.success && r.status === "STALE_REJECTED");

    assert.strictEqual(succeeded.length, 1, "Exactly one concurrent save must succeed");
    assert.strictEqual(rejected.length, 1, "Exactly one concurrent save must be rejected as stale");
    assert.strictEqual(succeeded[0].version, 2, "Successful save must increment monotonically to version 2");
    assert.strictEqual(rejected[0].code, "VERSION_CONFLICT");

    // Database row must have version 2
    const row = (await client.query(`
      SELECT version FROM attempt_responses WHERE attempt_id = $1 AND occurrence_id = $2;
    `, [startRes.attemptId, seed.occ1])).rows[0];
    assert.strictEqual(row.version, 2);
  } finally {
    client.release();
  }
});

test("DB-EXAM-12: Genuine concurrent first-time inserts do not create duplicate ledger rows", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db12");
    const candidate = await seedCandidateUser(client, "candidate.db12@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });

    // Concurrently insert answers for occ2 which currently has zero responses
    const results = await Promise.all([
      saveAttemptAnswer(
        {
          attemptId: startRes.attemptId,
          occurrenceId: seed.occ2,
          selectedSourceOptionIds: [seed.opt2B],
          displayOptionLabels: ["B"],
          isMarkedForReview: false,
          timeSpentSeconds: 12,
          clientVersion: 1,
        },
        candidate,
        { prismaClient: prisma }
      ),
      saveAttemptAnswer(
        {
          attemptId: startRes.attemptId,
          occurrenceId: seed.occ2,
          selectedSourceOptionIds: [seed.opt2D],
          displayOptionLabels: ["D"],
          isMarkedForReview: true,
          timeSpentSeconds: 14,
          clientVersion: 1,
        },
        candidate,
        { prismaClient: prisma }
      ),
    ]);

    // Verify row count in database for (attemptId, occ2) is strictly 1
    const countRes = await client.query(`
      SELECT COUNT(*)::int AS count FROM attempt_responses WHERE attempt_id = $1 AND occurrence_id = $2;
    `, [startRes.attemptId, seed.occ2]);
    assert.strictEqual(countRes.rows[0].count, 1, "There must be exactly one response row created");

    // Check that at least one operation succeeded
    const anySaved = results.some((r) => r.status === "SAVED");
    assert.ok(anySaved, "At least one initial save must be saved");
  } finally {
    client.release();
  }
});

test("DB-EXAM-13: Genuine concurrent final submissions resolve idempotently to a single authoritative evaluation", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db13");
    const candidate = await seedCandidateUser(client, "candidate.db13@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });

    // Answer Q1 correctly: opt1A (+3.0)
    await saveAttemptAnswer(
      {
        attemptId: startRes.attemptId,
        occurrenceId: seed.occ1,
        selectedSourceOptionIds: [seed.opt1A],
        displayOptionLabels: ["A"],
        isMarkedForReview: false,
        timeSpentSeconds: 15,
        clientVersion: 1,
      },
      candidate,
      { prismaClient: prisma }
    );

    // Launch two genuinely concurrent final submissions
    const [subA, subB] = await Promise.all([
      submitExamAttempt({ attemptId: startRes.attemptId, reason: "Candidate Final Click" }, candidate, { prismaClient: prisma }),
      submitExamAttempt({ attemptId: startRes.attemptId, reason: "Auto-Submit Expire" }, candidate, { prismaClient: prisma }),
    ]);

    // Both must succeed and return identical score
    assert.strictEqual(subA.success, true);
    assert.strictEqual(subB.success, true);
    assert.strictEqual(subA.rawScore, subB.rawScore);
    assert.strictEqual(subA.totalCorrect, subB.totalCorrect);

    // Database must contain exactly 1 evaluation record for this attempt
    const evalCount = await client.query(`
      SELECT COUNT(*)::int AS count FROM attempt_evaluations WHERE attempt_id = $1;
    `, [startRes.attemptId]);
    assert.strictEqual(evalCount.rows[0].count, 1, "Exactly one evaluation record must exist");

    // Attempt status must be EVALUATED
    const attRow = (await client.query(`SELECT attempt_status FROM test_attempts WHERE id = $1;`, [startRes.attemptId])).rows[0];
    assert.strictEqual(attRow.attempt_status, "EVALUATED");
  } finally {
    client.release();
  }
});

test("DB-EXAM-14: Autonomous server sweep finalizeOverdueAttempts finalizes abandoned overdue attempts", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db14");
    const candidate = await seedCandidateUser(client, "candidate.db14@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });

    // Set expires_at in the past
    await client.query(`
      UPDATE test_attempts
      SET expires_at = NOW() - INTERVAL '15 minutes'
      WHERE id = $1;
    `, [startRes.attemptId]);

    // Execute autonomous sweep
    const sweepRes = await finalizeOverdueAttempts(seed.paperId, { prismaClient: prisma });
    assert.ok(sweepRes.finalizedCount >= 1, "Sweep must finalize at least 1 overdue attempt");
    assert.ok(sweepRes.attemptIds.includes(startRes.attemptId), "Our test attempt must be in finalized list");

    // Verify attempt is now EVALUATED
    const attRow = (await client.query(`SELECT attempt_status FROM test_attempts WHERE id = $1;`, [startRes.attemptId])).rows[0];
    assert.strictEqual(attRow.attempt_status, "EVALUATED");

    // Verify evaluation record exists
    const evalRow = (await client.query(`SELECT COUNT(*)::int AS count FROM attempt_evaluations WHERE attempt_id = $1;`, [startRes.attemptId])).rows[0];
    assert.strictEqual(evalRow.count, 1);
  } finally {
    client.release();
  }
});

test("DB-EXAM-15: Late answer save on expired attempt auto-finalizes attempt and rejects late write with MCQJ-ERR-6003", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db15");
    const candidate = await seedCandidateUser(client, "candidate.db15@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });

    // Set expires_at in the past
    await client.query(`
      UPDATE test_attempts
      SET expires_at = NOW() - INTERVAL '5 minutes'
      WHERE id = $1;
    `, [startRes.attemptId]);

    // Late answer save must fail closed with MCQJ-ERR-6003
    await assert.rejects(
      async () => {
        await saveAttemptAnswer(
          {
            attemptId: startRes.attemptId,
            occurrenceId: seed.occ1,
            selectedSourceOptionIds: [seed.opt1B],
            displayOptionLabels: ["B"],
            isMarkedForReview: false,
            timeSpentSeconds: 5,
            clientVersion: 1,
          },
          candidate,
          { prismaClient: prisma }
        );
      },
      (err) => err instanceof ExamServiceError && err.code === "MCQJ-ERR-6003" && err.statusCode === 403
    );

    // Verify attempt in DB was auto-finalized to EVALUATED
    const attRow = (await client.query(`SELECT attempt_status FROM test_attempts WHERE id = $1;`, [startRes.attemptId])).rows[0];
    assert.strictEqual(attRow.attempt_status, "EVALUATED");

    // Verify evaluation was created
    const evalCount = (await client.query(`SELECT COUNT(*)::int AS count FROM attempt_evaluations WHERE attempt_id = $1;`, [startRes.attemptId])).rows[0];
    assert.strictEqual(evalCount.count, 1);
  } finally {
    client.release();
  }
});

test("DB-EXAM-16: Overdue attempt when the sweep runs repeatedly (Sweep Idempotency)", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db16");
    const candidate = await seedCandidateUser(client, "candidate.db16@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });

    // Set expires_at in the past
    await client.query(`
      UPDATE test_attempts
      SET expires_at = NOW() - INTERVAL '30 minutes'
      WHERE id = $1;
    `, [startRes.attemptId]);

    // First sweep run: must find and finalize our attempt
    const sweep1 = await finalizeOverdueAttempts(seed.paperId, { prismaClient: prisma });
    assert.ok(sweep1.finalizedCount >= 1, "First sweep must finalize overdue attempt");
    assert.ok(sweep1.attemptIds.includes(startRes.attemptId));

    // Second sweep run: attempt is already EVALUATED; must find 0 overdue attempts
    const sweep2 = await finalizeOverdueAttempts(seed.paperId, { prismaClient: prisma });
    assert.strictEqual(sweep2.finalizedCount, 0, "Repeated sweep must find zero overdue attempts");

    // Total evaluation records in database for this attempt must remain strictly 1
    const evalCount = (await client.query(`
      SELECT COUNT(*)::int AS count FROM attempt_evaluations WHERE attempt_id = $1;
    `, [startRes.attemptId])).rows[0].count;
    assert.strictEqual(evalCount, 1, "Exactly one evaluation record must exist despite repeated sweeps");
  } finally {
    client.release();
  }
});

test("DB-EXAM-17: Overdue attempt when manual candidate submission and the sweep overlap concurrently", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db17");
    const candidate = await seedCandidateUser(client, "candidate.db17@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });

    // Answer Q1 before deadline
    await saveAttemptAnswer(
      {
        attemptId: startRes.attemptId,
        occurrenceId: seed.occ1,
        selectedSourceOptionIds: [seed.opt1A],
        displayOptionLabels: ["A"],
        isMarkedForReview: false,
        timeSpentSeconds: 10,
        clientVersion: 1,
      },
      candidate,
      { prismaClient: prisma }
    );

    // Set expires_at in the past
    await client.query(`
      UPDATE test_attempts
      SET expires_at = NOW() - INTERVAL '10 seconds'
      WHERE id = $1;
    `, [startRes.attemptId]);

    // Concurrently trigger candidate manual submit AND system sweep
    const [manualRes, sweepRes] = await Promise.allSettled([
      submitExamAttempt({ attemptId: startRes.attemptId, reason: "Manual Overdue Submit" }, candidate, { prismaClient: prisma }),
      finalizeOverdueAttempts(seed.paperId, { prismaClient: prisma }),
    ]);

    // At least one must succeed; neither should corrupt state
    assert.ok(manualRes.status === "fulfilled" || sweepRes.status === "fulfilled");

    // Verify attempt is EVALUATED
    const attRow = (await client.query(`SELECT attempt_status FROM test_attempts WHERE id = $1;`, [startRes.attemptId])).rows[0];
    assert.strictEqual(attRow.attempt_status, "EVALUATED");

    // Verify evaluation record count is strictly 1
    const evalCount = (await client.query(`
      SELECT COUNT(*)::int AS count FROM attempt_evaluations WHERE attempt_id = $1;
    `, [startRes.attemptId])).rows[0].count;
    assert.strictEqual(evalCount, 1, "Concurrent manual submission and sweep must produce exactly one evaluation record");
  } finally {
    client.release();
  }
});

test("DB-EXAM-18: Overdue attempt recovery under delayed sweep execution", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db18");
    const candidate = await seedCandidateUser(client, "candidate.db18@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });

    // Sweep runs late (2 hours after deadline)
    await client.query(`
      UPDATE test_attempts
      SET expires_at = NOW() - INTERVAL '2 hours'
      WHERE id = $1;
    `, [startRes.attemptId]);

    // Late sweep finalizes the overdue attempt
    const sweepRes = await finalizeOverdueAttempts(seed.paperId, { prismaClient: prisma });
    assert.ok(sweepRes.attemptIds.includes(startRes.attemptId));

    // Subsequent candidate submit returns existing evaluation idempotently
    const subRes = await submitExamAttempt({ attemptId: startRes.attemptId }, candidate, { prismaClient: prisma });
    assert.strictEqual(subRes.success, true);
    assert.strictEqual(subRes.attemptStatus, "EVALUATED");

    const countRes = (await client.query(`SELECT COUNT(*)::int AS count FROM attempt_evaluations WHERE attempt_id = $1;`, [startRes.attemptId])).rows[0];
    assert.strictEqual(countRes.count, 1);
  } finally {
    client.release();
  }
});

test("DB-EXAM-19: Candidate view privacy gate (zero leakage of correct answers or answer keys)", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db19");
    const candidate = await seedCandidateUser(client, "candidate.db19@mcq.test");

    const startRes = await startExamAttempt({ paperId: seed.paperId }, candidate, {}, { prismaClient: prisma });
    const attemptView = await getExamAttempt({ attemptId: startRes.attemptId }, candidate, { prismaClient: prisma });

    assert.ok(attemptView.questions.length > 0, "Attempt view must contain questions");

    for (const q of attemptView.questions) {
      // Must not leak answer keys or correctness flags
      assert.strictEqual("isCorrect" in q, false, "Question view must not contain isCorrect");
      assert.strictEqual("correctOptionLabels" in q, false, "Question view must not contain correctOptionLabels");
      assert.strictEqual("correctSourceOptionIds" in q, false, "Question view must not contain correctSourceOptionIds");
      assert.strictEqual("answerKey" in q, false, "Question view must not contain answerKey");
      assert.strictEqual("detailedConcept" in q, false, "Question view must not contain detailedConcept");
      assert.strictEqual("explanation" in q, false, "Question view must not contain explanation");

      for (const opt of q.options) {
        assert.strictEqual("isCorrect" in opt, false, "Option view must not contain isCorrect");
        assert.strictEqual("explanation" in opt, false, "Option view must not contain explanation");
        assert.ok(opt.sourceOptionId, "Option must have sourceOptionId");
        assert.ok(opt.displayLabel, "Option must have displayLabel");
        assert.ok(opt.optionText, "Option must have optionText");
      }
    }
  } finally {
    client.release();
  }
});

test("DB-EXAM-20: Cross-candidate read and write isolation enforcement (MCQJ-ERR-6005)", async () => {
  const client = await pool.connect();
  try {
    const seed = await seedPublishedExamPaper(client, "db20");
    const candidate1 = await seedCandidateUser(client, "cand1.db20@mcq.test");
    const candidate2 = await seedCandidateUser(client, "cand2.db20@mcq.test");

    const startRes1 = await startExamAttempt({ paperId: seed.paperId }, candidate1, {}, { prismaClient: prisma });

    // Candidate 2 attempts to read Candidate 1's attempt -> 403 Forbidden
    await assert.rejects(
      async () => {
        await getExamAttempt({ attemptId: startRes1.attemptId }, candidate2, { prismaClient: prisma });
      },
      (err) => err instanceof ExamServiceError && err.code === "MCQJ-ERR-6005" && err.statusCode === 403
    );

    // Candidate 2 attempts to save answer to Candidate 1's attempt -> 403 Forbidden
    await assert.rejects(
      async () => {
        await saveAttemptAnswer(
          {
            attemptId: startRes1.attemptId,
            occurrenceId: seed.occ1,
            selectedSourceOptionIds: [seed.opt1A],
            displayOptionLabels: ["A"],
            clientVersion: 1,
          },
          candidate2,
          { prismaClient: prisma }
        );
      },
      (err) => err instanceof ExamServiceError && err.code === "MCQJ-ERR-6005" && err.statusCode === 403
    );

    // Candidate 2 attempts to submit Candidate 1's attempt -> 403 Forbidden
    await assert.rejects(
      async () => {
        await submitExamAttempt(
          { attemptId: startRes1.attemptId },
          candidate2,
          { prismaClient: prisma }
        );
      },
      (err) => err instanceof ExamServiceError && err.code === "MCQJ-ERR-6005" && err.statusCode === 403
    );
  } finally {
    client.release();
  }
});

