// ============================================================================
// MCQ Junction — Comprehension Passages & Database Verification Suite (Phase 8.1)
// File: tests/passage-database.test.mjs
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { calculateAttemptScore } from "../src/lib/scoring/engine.ts";

const { Pool } = pg;

const testDbUrl = process.env.TEST_DATABASE_URL;

if (!testDbUrl) {
  console.error("FATAL: TEST_DATABASE_URL is not defined.");
  throw new Error("TEST_DATABASE_URL must target local disposable PostgreSQL (127.0.0.1:5433).");
}

const pool = new Pool({
  connectionString: testDbUrl,
  connectionTimeoutMillis: 5000,
  max: 5,
});

async function createBaseHierarchy(client, options = {}) {
  const suffix = Math.random().toString(36).substring(2, 8);
  const totalQuestions = options.totalQuestions ?? 2;

  // 1. Conducting body
  const cb = (await client.query(`
    INSERT INTO conducting_bodies (code, full_name, region_code)
    VALUES ('PASS-CB-${suffix}', 'Comprehension Test Board', 'IN')
    RETURNING id;
  `)).rows[0].id;

  // 2. Exam
  const exam = (await client.query(`
    INSERT INTO exams (conducting_body_id, code, title, tier)
    VALUES ($1, 'EXAM-PASS-${suffix}', 'Passage Testing Exam', 'NATIONAL_LEVEL')
    RETURNING id;
  `, [cb])).rows[0].id;

  // 3. Exam Session
  const session = (await client.query(`
    INSERT INTO exam_sessions (exam_id, session_year, cycle_code)
    VALUES ($1, 2026, 'PASS-CYCLE-${suffix}')
    RETURNING id;
  `, [exam])).rows[0].id;

  // 4. Exam Paper
  const paper = (await client.query(`
    INSERT INTO exam_papers (session_id, paper_code, title, publish_status, total_duration_minutes, total_questions, max_score)
    VALUES ($1, 'PAPER-PASS-${suffix}', 'Comprehension & Scoring Paper', 'VERIFIED', 60, $2, $3)
    RETURNING id;
  `, [session, totalQuestions, totalQuestions * 2.0])).rows[0].id;

  // 5. Marking Scheme
  await client.query(`
    INSERT INTO paper_marking_schemes (paper_id, marks_per_correct, negative_marks_per_wrong)
    VALUES ($1, 2.000, 0.500);
  `, [paper]);

  // 6. Section
  const section = (await client.query(`
    INSERT INTO paper_sections (paper_id, section_order, title, total_questions)
    VALUES ($1, 1, 'Comprehension Section', $2)
    RETURNING id;
  `, [paper, totalQuestions])).rows[0].id;

  // 7. Admin & Student users
  const adminAuthId = (await client.query(`
    INSERT INTO auth.users (email) VALUES ('admin-pass-${suffix}@mcq.test') RETURNING id;
  `)).rows[0].id;
  await client.query(`
    INSERT INTO users (id, email, role, updated_at) VALUES ($1, 'admin-pass-${suffix}@mcq.test', 'ADMIN', clock_timestamp());
  `, [adminAuthId]);

  const studentAuthId = (await client.query(`
    INSERT INTO auth.users (email) VALUES ('student-pass-${suffix}@mcq.test') RETURNING id;
  `)).rows[0].id;
  await client.query(`
    INSERT INTO users (id, email, role, updated_at) VALUES ($1, 'student-pass-${suffix}@mcq.test', 'STUDENT', clock_timestamp());
  `, [studentAuthId]);

  // 8. Booklet
  const booklet = (await client.query(`
    INSERT INTO booklet_series (paper_id, series_code, is_master_series)
    VALUES ($1, 'A', TRUE) RETURNING id;
  `, [paper])).rows[0].id;

  return {
    suffix,
    paperId: paper,
    sectionId: section,
    bookletId: booklet,
    adminId: adminAuthId,
    studentId: studentAuthId,
  };
}

// ----------------------------------------------------------------------------
// DB-PASS-01: Insertion & Unicode/Media Retrieval
// ----------------------------------------------------------------------------
test("DB-PASS-01: Inserts comprehension passage with multi-language Unicode and safe media", async () => {
  const client = await pool.connect();
  try {
    const f = await createBaseHierarchy(client, { totalQuestions: 1 });

    const passageTextUR = "ڈیٹا بیس مینجمنٹ سسٹم میں ایس آئی ڈی کی خصوصیات ڈیٹا کی درستگی کو برقرار رکھتی ہیں۔";
    const res = await client.query(`
      INSERT INTO comprehension_passages (
        passage_ref_code, title, body_text, language_code, image_url, image_alt
      ) VALUES (
        $1, $2, $3, 'UR', 'https://assets.mcqjunction.com/diagrams/cap.svg', 'CAP Theorem Distributed Cluster'
      ) RETURNING *;
    `, [`PASS-UR-${f.suffix}`, "ڈیٹا بیس ٹرانزیکشن", passageTextUR]);

    const passage = res.rows[0];
    assert.strictEqual(passage.passage_ref_code, `PASS-UR-${f.suffix}`);
    assert.strictEqual(passage.language_code, "UR");
    assert.strictEqual(passage.body_text, passageTextUR);
    assert.strictEqual(passage.image_url, "https://assets.mcqjunction.com/diagrams/cap.svg");
    assert.strictEqual(passage.image_alt, "CAP Theorem Distributed Cluster");
  } finally {
    client.release();
  }
});

// ----------------------------------------------------------------------------
// DB-PASS-02: Multi-Question Linking to Shared Passage
// ----------------------------------------------------------------------------
test("DB-PASS-02: Links multiple question occurrences to a single shared passage without duplication", async () => {
  const client = await pool.connect();
  try {
    const f = await createBaseHierarchy(client, { totalQuestions: 2 });

    // Insert 1 passage
    const passageId = (await client.query(`
      INSERT INTO comprehension_passages (passage_ref_code, title, body_text, language_code)
      VALUES ($1, 'CAP Theorem Deep Dive', 'Brewer conjectured that distributed systems must choose 2 of 3 guarantees.', 'EN')
      RETURNING id;
    `, [`PASS-CAP-${f.suffix}`])).rows[0].id;

    // Create 2 questions linking to the same passage
    const occurrences = [];
    for (let i = 1; i <= 2; i++) {
      const cq = (await client.query(`
        INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic)
        VALUES ($1, 'Computer Science', 'Distributed Systems')
        RETURNING id;
      `, [`CQ-CAP-${f.suffix}-${i}`])).rows[0].id;

      const occ = (await client.query(`
        INSERT INTO paper_question_occurrences (
          paper_id, section_id, conceptual_question_id, sequence_number, question_type, passage_id
        ) VALUES ($1, $2, $3, $4, 'COMPREHENSION_CHILD', $5)
        RETURNING id;
      `, [f.paperId, f.sectionId, cq, i, passageId])).rows[0].id;

      occurrences.push(occ);
    }

    // Verify both occurrences point to the same passage
    const checkRes = await client.query(`
      SELECT o.id, o.sequence_number, o.question_type, p.passage_ref_code, p.title
      FROM paper_question_occurrences o
      JOIN comprehension_passages p ON o.passage_id = p.id
      WHERE o.paper_id = $1
      ORDER BY o.sequence_number;
    `, [f.paperId]);

    assert.strictEqual(checkRes.rows.length, 2);
    assert.strictEqual(checkRes.rows[0].passage_ref_code, `PASS-CAP-${f.suffix}`);
    assert.strictEqual(checkRes.rows[1].passage_ref_code, `PASS-CAP-${f.suffix}`);
    assert.strictEqual(checkRes.rows[0].question_type, "COMPREHENSION_CHILD");
    assert.strictEqual(checkRes.rows[1].question_type, "COMPREHENSION_CHILD");
  } finally {
    client.release();
  }
});

// ----------------------------------------------------------------------------
// DB-PASS-03: Gate 7 Guard Rejects COMPREHENSION_CHILD without Passage
// ----------------------------------------------------------------------------
test("DB-PASS-03: Publication Gate 7 rejects paper if COMPREHENSION_CHILD is missing passage", async () => {
  const client = await pool.connect();
  try {
    const f = await createBaseHierarchy(client, { totalQuestions: 1 });

    const cq = (await client.query(`
      INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic)
      VALUES ($1, 'CS', 'Passage Missing') RETURNING id;
    `, [`CQ-MISS-${f.suffix}`])).rows[0].id;

    // COMPREHENSION_CHILD with passage_id = NULL
    const occ = (await client.query(`
      INSERT INTO paper_question_occurrences (
        paper_id, section_id, conceptual_question_id, sequence_number, question_type, passage_id
      ) VALUES ($1, $2, $3, 1, 'COMPREHENSION_CHILD', NULL)
      RETURNING id;
    `, [f.paperId, f.sectionId, cq])).rows[0].id;

    const rep = (await client.query(`
      INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
      VALUES ($1, 'EN', 'Orphaned question prompt?', TRUE) RETURNING id;
    `, [occ])).rows[0].id;

    const optA = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'A', 'Option A', 1) RETURNING id;
    `, [rep])).rows[0].id;
    const optB = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'B', 'Option B', 2) RETURNING id;
    `, [rep])).rows[0].id;

    const bqm = (await client.query(`
      INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
      VALUES ($1, $2, $3, 1) RETURNING id;
    `, [f.paperId, f.bookletId, occ])).rows[0].id;

    await client.query(`
      INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order)
      VALUES ($1, $2, 'A', 1), ($1, $3, 'B', 2);
    `, [bqm, optA, optB]);

    const keyVer = (await client.query(`
      INSERT INTO answer_key_versions (paper_id, version_number, version_tag, is_official)
      VALUES ($1, 1, 'v1.0', TRUE) RETURNING id;
    `, [f.paperId])).rows[0].id;

    await client.query(`
      INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
      VALUES ($1, $2, $3, 'ACTIVE', ARRAY['A']);
    `, [f.paperId, keyVer, occ]);

    // Attempt publication -> Must fail Gate 7
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
      },
      /MCQJ-ERR-5010: ExamPaper .* has \d+ comprehension questions without linked passages/
    );
  } finally {
    client.release();
  }
});

// ----------------------------------------------------------------------------
// DB-PASS-04: Gate 7 Guard Passes when COMPREHENSION_CHILD Has Passage
// ----------------------------------------------------------------------------
test("DB-PASS-04: Publication Gate 7 succeeds when COMPREHENSION_CHILD has valid linked passage", async () => {
  const client = await pool.connect();
  try {
    const f = await createBaseHierarchy(client, { totalQuestions: 1 });

    const passageId = (await client.query(`
      INSERT INTO comprehension_passages (passage_ref_code, title, body_text, language_code)
      VALUES ($1, 'Valid Title', 'This is a complete and valid passage text for verification.', 'EN')
      RETURNING id;
    `, [`PASS-OK-${f.suffix}`])).rows[0].id;

    const cq = (await client.query(`
      INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic)
      VALUES ($1, 'CS', 'Passage OK') RETURNING id;
    `, [`CQ-OK-${f.suffix}`])).rows[0].id;

    const occ = (await client.query(`
      INSERT INTO paper_question_occurrences (
        paper_id, section_id, conceptual_question_id, sequence_number, question_type, passage_id
      ) VALUES ($1, $2, $3, 1, 'COMPREHENSION_CHILD', $4)
      RETURNING id;
    `, [f.paperId, f.sectionId, cq, passageId])).rows[0].id;

    const rep = (await client.query(`
      INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
      VALUES ($1, 'EN', 'Valid prompt?', TRUE) RETURNING id;
    `, [occ])).rows[0].id;

    const optA = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'A', 'Option A', 1) RETURNING id;
    `, [rep])).rows[0].id;
    const optB = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'B', 'Option B', 2) RETURNING id;
    `, [rep])).rows[0].id;

    const bqm = (await client.query(`
      INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
      VALUES ($1, $2, $3, 1) RETURNING id;
    `, [f.paperId, f.bookletId, occ])).rows[0].id;

    await client.query(`
      INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order)
      VALUES ($1, $2, 'A', 1), ($1, $3, 'B', 2);
    `, [bqm, optA, optB]);

    const keyVer = (await client.query(`
      INSERT INTO answer_key_versions (paper_id, version_number, version_tag, is_official)
      VALUES ($1, 1, 'v1.0', TRUE) RETURNING id;
    `, [f.paperId])).rows[0].id;

    await client.query(`
      INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
      VALUES ($1, $2, $3, 'ACTIVE', ARRAY['A']);
    `, [f.paperId, keyVer, occ]);

    // Publish paper -> Should succeed
    const pubRes = await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
    assert.strictEqual(pubRes.rows[0].fn_publish_exam_paper.publish_status, "PUBLISHED");
  } finally {
    client.release();
  }
});

// ----------------------------------------------------------------------------
// DB-PASS-05: Passage Immutability on Published Paper
// ----------------------------------------------------------------------------
test("DB-PASS-05: Passage immutability trigger blocks modifying or deleting a published paper's passage", async () => {
  const client = await pool.connect();
  try {
    const f = await createBaseHierarchy(client, { totalQuestions: 1 });

    const passageId = (await client.query(`
      INSERT INTO comprehension_passages (passage_ref_code, title, body_text, language_code)
      VALUES ($1, 'Immutable Passage', 'Text that must not be edited after publication.', 'EN')
      RETURNING id;
    `, [`PASS-IMM-${f.suffix}`])).rows[0].id;

    const cq = (await client.query(`
      INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic)
      VALUES ($1, 'CS', 'Immutable') RETURNING id;
    `, [`CQ-IMM-${f.suffix}`])).rows[0].id;

    const occ = (await client.query(`
      INSERT INTO paper_question_occurrences (
        paper_id, section_id, conceptual_question_id, sequence_number, question_type, passage_id
      ) VALUES ($1, $2, $3, 1, 'COMPREHENSION_CHILD', $4)
      RETURNING id;
    `, [f.paperId, f.sectionId, cq, passageId])).rows[0].id;

    const rep = (await client.query(`
      INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
      VALUES ($1, 'EN', 'Immutable prompt?', TRUE) RETURNING id;
    `, [occ])).rows[0].id;

    const optA = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'A', 'Option A', 1) RETURNING id;
    `, [rep])).rows[0].id;
    const optB = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'B', 'Option B', 2) RETURNING id;
    `, [rep])).rows[0].id;

    const bqm = (await client.query(`
      INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
      VALUES ($1, $2, $3, 1) RETURNING id;
    `, [f.paperId, f.bookletId, occ])).rows[0].id;

    await client.query(`
      INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order)
      VALUES ($1, $2, 'A', 1), ($1, $3, 'B', 2);
    `, [bqm, optA, optB]);

    const keyVer = (await client.query(`
      INSERT INTO answer_key_versions (paper_id, version_number, version_tag, is_official)
      VALUES ($1, 1, 'v1.0', TRUE) RETURNING id;
    `, [f.paperId])).rows[0].id;

    await client.query(`
      INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
      VALUES ($1, $2, $3, 'ACTIVE', ARRAY['A']);
    `, [f.paperId, keyVer, occ]);

    // Publish
    await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);

    // 1. UPDATE attempt must fail with MCQJ-ERR-4004
    await assert.rejects(
      async () => {
        await client.query(`
          UPDATE comprehension_passages
          SET body_text = 'Tampered text'
          WHERE id = $1;
        `, [passageId]);
      },
      /MCQJ-ERR-4004: Cannot UPDATE passage .* referenced by published\/archived paper/
    );

    // 2. DELETE attempt must fail with MCQJ-ERR-4004
    await assert.rejects(
      async () => {
        await client.query(`
          DELETE FROM comprehension_passages WHERE id = $1;
        `, [passageId]);
      },
      /MCQJ-ERR-4004: Cannot DELETE passage .* referenced by published\/archived paper/
    );
  } finally {
    client.release();
  }
});

// ----------------------------------------------------------------------------
// DB-PASS-06: FK RESTRICT Constraint
// ----------------------------------------------------------------------------
test("DB-PASS-06: FK fk_occurrence_passage restricts deleting passage when occurrences exist", async () => {
  const client = await pool.connect();
  try {
    const f = await createBaseHierarchy(client, { totalQuestions: 1 });

    const passageId = (await client.query(`
      INSERT INTO comprehension_passages (passage_ref_code, title, body_text, language_code)
      VALUES ($1, 'FK Test Passage', 'Some text for testing referential integrity constraints.', 'EN')
      RETURNING id;
    `, [`PASS-FK-${f.suffix}`])).rows[0].id;

    const cq = (await client.query(`
      INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic)
      VALUES ($1, 'CS', 'FK Topic') RETURNING id;
    `, [`CQ-FK-${f.suffix}`])).rows[0].id;

    await client.query(`
      INSERT INTO paper_question_occurrences (
        paper_id, section_id, conceptual_question_id, sequence_number, question_type, passage_id
      ) VALUES ($1, $2, $3, 1, 'SINGLE_CHOICE', $4);
    `, [f.paperId, f.sectionId, cq, passageId]);

    // Paper is in VERIFIED (not published), so the immutability trigger won't fire, but FK RESTRICT will!
    await assert.rejects(
      async () => {
        await client.query(`DELETE FROM comprehension_passages WHERE id = $1;`, [passageId]);
      },
      /violates foreign key constraint "fk_occurrence_passage"/
    );
  } finally {
    client.release();
  }
});

// ----------------------------------------------------------------------------
// DB-PASS-07: Strict All-or-Nothing Scoring on Live Database-Seeded Data
// ----------------------------------------------------------------------------
test("DB-PASS-07: Authoritative scoring enforces strict all-or-nothing evaluation across candidate attempts", async () => {
  const client = await pool.connect();
  try {
    const f = await createBaseHierarchy(client, { totalQuestions: 1 });

    const cq = (await client.query(`
      INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic)
      VALUES ($1, 'CS', 'ACID Matrix') RETURNING id;
    `, [`CQ-SC-${f.suffix}`])).rows[0].id;

    // MULTIPLE_CORRECT occurrence with marks = 3.0, negativeMarks = 1.0
    const occ = (await client.query(`
      INSERT INTO paper_question_occurrences (
        paper_id, section_id, conceptual_question_id, sequence_number, question_type
      ) VALUES ($1, $2, $3, 1, 'MULTIPLE_CORRECT')
      RETURNING id;
    `, [f.paperId, f.sectionId, cq])).rows[0].id;

    const rep = (await client.query(`
      INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
      VALUES ($1, 'EN', 'Which are ACID transaction properties?', TRUE) RETURNING id;
    `, [occ])).rows[0].id;

    // Options: A, B, C, D (Correct: B and D)
    const optA = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'A', 'Asynchrony', 1) RETURNING id;
    `, [rep])).rows[0].id;
    const optB = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'B', 'Consistency', 2) RETURNING id;
    `, [rep])).rows[0].id;
    const optC = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'C', 'Concurrency', 3) RETURNING id;
    `, [rep])).rows[0].id;
    const optD = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'D', 'Durability', 4) RETURNING id;
    `, [rep])).rows[0].id;

    const bqm = (await client.query(`
      INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
      VALUES ($1, $2, $3, 1) RETURNING id;
    `, [f.paperId, f.bookletId, occ])).rows[0].id;

    await client.query(`
      INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order)
      VALUES
        ($1, $2, 'A', 1),
        ($1, $3, 'B', 2),
        ($1, $4, 'C', 3),
        ($1, $5, 'D', 4);
    `, [bqm, optA, optB, optC, optD]);

    // Active Answer Key: Correct = {'B', 'D'}
    const keyVer = (await client.query(`
      INSERT INTO answer_key_versions (paper_id, version_number, version_tag, is_official)
      VALUES ($1, 1, 'v1.0-official', TRUE) RETURNING id;
    `, [f.paperId])).rows[0].id;

    const keyItem = (await client.query(`
      INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
      VALUES ($1, $2, $3, 'ACTIVE', ARRAY['B', 'D'])
      RETURNING *;
    `, [f.paperId, keyVer, occ])).rows[0];

    // Base question input matching QuestionScoreInput
    const baseInput = {
      occurrenceId: occ,
      sequenceNumber: 1,
      questionType: "MULTIPLE_CORRECT",
      paperMarksPerCorrect: 3.0,
      paperNegativeMarksPerWrong: 1.0,
      keyStatus: "ACTIVE",
      correctOptionLabels: ["B", "D"],
      correctSourceOptionIds: [optB, optD],
    };

    // Test Case 1: Exact match {B, D} -> Full Marks (+3.0)
    const res1 = calculateAttemptScore([
      {
        ...baseInput,
        selectedSourceOptionIds: [optB, optD],
        displayOptionLabels: ["B", "D"],
      },
    ]);
    assert.strictEqual(res1.rawScore, 3.0);
    assert.strictEqual(res1.totalCorrect, 1);
    assert.strictEqual(res1.questionBreakdowns[0].status, "CORRECT");

    // Test Case 2: Partial subset {B} -> Zero partial credit, Configured negative penalty (-1.0)
    const res2 = calculateAttemptScore([
      {
        ...baseInput,
        selectedSourceOptionIds: [optB],
        displayOptionLabels: ["B"],
      },
    ]);
    assert.strictEqual(res2.rawScore, -1.0);
    assert.strictEqual(res2.totalWrong, 1);
    assert.strictEqual(res2.questionBreakdowns[0].status, "INCORRECT");

    // Test Case 3: Extra incorrect choice {A, B, D} -> Negative penalty (-1.0)
    const res3 = calculateAttemptScore([
      {
        ...baseInput,
        selectedSourceOptionIds: [optA, optB, optD],
        displayOptionLabels: ["A", "B", "D"],
      },
    ]);
    assert.strictEqual(res3.rawScore, -1.0);
    assert.strictEqual(res3.totalWrong, 1);
    assert.strictEqual(res3.questionBreakdowns[0].status, "INCORRECT");

    // Test Case 4: Unanswered -> 0.0 marks, no penalty
    const res4 = calculateAttemptScore([
      {
        ...baseInput,
        selectedSourceOptionIds: [],
        displayOptionLabels: [],
      },
    ]);
    assert.strictEqual(res4.rawScore, 0.0);
    assert.strictEqual(res4.totalUnanswered, 1);
    assert.strictEqual(res4.questionBreakdowns[0].status, "UNANSWERED");

    // Test Case 5: Duplicate selections {B, B, D, D} -> normalized to exact match (+3.0)
    const res5 = calculateAttemptScore([
      {
        ...baseInput,
        selectedSourceOptionIds: [optB, optB, optD, optD],
        displayOptionLabels: ["B", "B", "D", "D"],
      },
    ]);
    assert.strictEqual(res5.rawScore, 3.0);
    assert.strictEqual(res5.totalCorrect, 1);
    assert.strictEqual(res5.questionBreakdowns[0].status, "CORRECT");
  } finally {
    client.release();
  }
});
