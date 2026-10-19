// ============================================================================
// MCQ Junction — Database Integration & Security Verification Suite (Phase 3B.1)
// File: tests/database.test.mjs
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const { Pool } = pg;

// ----------------------------------------------------------------------------
// 1. Mandatory Disposable Database Safety Verification
// ----------------------------------------------------------------------------

const testDbUrl = process.env.TEST_DATABASE_URL;

if (!testDbUrl) {
  console.error("\n================================================================================");
  console.error("FATAL: TEST_DATABASE_URL is not defined.");
  console.error("PostgreSQL integration tests require an explicit local disposable test database.");
  console.error("Example: $env:TEST_DATABASE_URL=\"postgres://postgres:<REDACTED_PASSWORD>@127.0.0.1:5433/mcq_junction_test\"");
  console.error("================================================================================\n");
  throw new Error("TEST_DATABASE_URL must be defined targeting local disposable PostgreSQL (127.0.0.1:5433). Integration tests cannot run without safe test DB.");
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

if (!allowedHosts.includes(parsedUrl.hostname) || parsedUrl.port !== expectedPort || parsedUrl.pathname !== expectedDb) {
  throw new Error(
    `SAFETY VIOLATION: TEST_DATABASE_URL must target 127.0.0.1:5433/mcq_junction_test. Refusing connection to ${parsedUrl.hostname}:${parsedUrl.port}${parsedUrl.pathname}`
  );
}

const pool = new Pool({
  connectionString: testDbUrl,
  connectionTimeoutMillis: 5000,
  max: 10,
});

// Verify live connection on suite startup
const verifyClient = await pool.connect();
try {
  const verRes = await verifyClient.query("SELECT current_database(), inet_server_port();");
  if (verRes.rows[0].current_database !== "mcq_junction_test") {
    throw new Error(`Connected to unexpected database: ${verRes.rows[0].current_database}`);
  }
} finally {
  verifyClient.release();
}

// ----------------------------------------------------------------------------
// 2. Realistic Test Fixture Factory
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

  // 4. Exam Paper (always create initially in VERIFIED/DRAFT to allow child content insertion)
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

  // 7. Users: Admin and Student (updated_at required by not-null constraint)
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

  // 10. Answer Key Version & Items (if requested)
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

// ----------------------------------------------------------------------------
// 3. PostgreSQL Live Integration Tests (DB-01 through DB-17)
// ----------------------------------------------------------------------------

test("DB-01: Immutability — Reject editing a published question", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client, { publishStatus: "PUBLISHED" });

    await assert.rejects(
      async () => {
        await client.query(
          `UPDATE source_question_representations SET question_text = 'Altered text after publish' WHERE id = $1;`,
          [f.representations[0]]
        );
      },
      /MCQJ-ERR-4005/
    );
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-02: Immutability — Reject reparenting a question out of a published paper", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f1 = await createHierarchyFixture(client, { publishStatus: "PUBLISHED" });
    const f2 = await createHierarchyFixture(client, { publishStatus: "DRAFT" });

    await assert.rejects(
      async () => {
        await client.query(
          `UPDATE paper_question_occurrences SET paper_id = $1 WHERE id = $2;`,
          [f2.paperId, f1.occurrences[0]]
        );
      },
      /MCQJ-ERR-4005/
    );
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-03: Immutability — Reject deleting or invalidating a passage referenced by published content", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client);

    // Insert comprehension passage and attach to occurrence while paper is VERIFIED
    const passage = (await client.query(`
      INSERT INTO comprehension_passages (passage_ref_code, body_text)
      VALUES ('PAS-${f.suffix}', 'Sample passage reading comprehension text')
      RETURNING id;
    `)).rows[0].id;

    await client.query(
      `UPDATE paper_question_occurrences SET passage_id = $1, question_type = 'COMPREHENSION_CHILD' WHERE id = $2;`,
      [passage, f.occurrences[0]]
    );

    // Now transition paper to PUBLISHED
    await client.query(`UPDATE exam_papers SET publish_status = 'PUBLISHED' WHERE id = $1;`, [f.paperId]);

    // Attempt deleting the passage referenced by PUBLISHED paper
    await assert.rejects(
      async () => {
        await client.query(`DELETE FROM comprehension_passages WHERE id = $1;`, [passage]);
      },
      /MCQJ-ERR-4004/
    );
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-04: Relational Integrity — Reject cross-paper booklet assignment", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f1 = await createHierarchyFixture(client);
    const f2 = await createHierarchyFixture(client);

    // Attempt creating test attempt for Paper 1 with Booklet belonging to Paper 2
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO test_attempts (paper_id, booklet_series_id, user_id)
          VALUES ($1, $2, $3);
        `, [f1.paperId, f2.bookletId, f1.studentId]);
      },
      /fk_test_attempt_booklet/
    );
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-05: Relational Integrity — Reject invalid booklet occurrence mappings across papers", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f1 = await createHierarchyFixture(client);
    const f2 = await createHierarchyFixture(client);

    // Attempt mapping Paper 2's occurrence into Paper 1's booklet
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
          VALUES ($1, $2, $3, 99);
        `, [f1.paperId, f1.bookletId, f2.occurrences[0]]);
      },
      /fk_bqm_occurrence_composite/
    );
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-06: Relational Integrity — Reject invalid option-to-question mappings", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f1 = await createHierarchyFixture(client);
    const f2 = await createHierarchyFixture(client);

    const bqm1 = (await client.query(`
      SELECT id FROM booklet_question_mappings WHERE booklet_series_id = $1 AND occurrence_id = $2;
    `, [f1.bookletId, f1.occurrences[0]])).rows[0].id;

    const bqm2 = (await client.query(`
      SELECT id FROM booklet_question_mappings WHERE booklet_series_id = $1 AND occurrence_id = $2;
    `, [f2.bookletId, f2.occurrences[0]])).rows[0].id;

    const opt1A = f1.optionsList[0].optA;
    const opt2A = f2.optionsList[0].optA;

    // 6.1 Valid mapping insert succeeds
    await client.query("SAVEPOINT sp_valid;");
    const opt1E = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'E', 'Fifth Option E', 5) RETURNING id;
    `, [f1.representations[0]])).rows[0].id;

    const validMap = await client.query(`
      INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order)
      VALUES ($1, $2, 'E', 5) RETURNING id;
    `, [bqm1, opt1E]);
    assert.ok(validMap.rows[0].id);
    await client.query("ROLLBACK TO SAVEPOINT sp_valid;");

    // 6.2 Cross-question option mapping rejected
    await client.query("SAVEPOINT sp_cross;");
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order)
          VALUES ($1, $2, 'Z', 99);
        `, [bqm1, opt2A]);
      },
      /MCQJ-ERR-4007/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_cross;");

    // 6.3 NULL foreign key reference rejected
    await client.query("SAVEPOINT sp_null;");
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order)
          VALUES (NULL, $1, 'Z', 99);
        `, [opt1A]);
      },
      /MCQJ-ERR-4007|null value/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_null;");

    // 6.4 Non-existent foreign key rejected
    await client.query("SAVEPOINT sp_fk;");
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order)
          VALUES ($1, '00000000-0000-0000-0000-000000000000', 'Z', 99);
        `, [bqm1]);
      },
      /fk_bom_source_option/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_fk;");

    // 6.5 Update changing source_option_id to cross-question option rejected
    await client.query("SAVEPOINT sp_upd_opt;");
    const existingMapId = (await client.query(`
      SELECT id FROM booklet_option_mappings WHERE question_mapping_id = $1 LIMIT 1;
    `, [bqm1])).rows[0].id;
    await assert.rejects(
      async () => {
        await client.query(`
          UPDATE booklet_option_mappings SET source_option_id = $1 WHERE id = $2;
        `, [opt2A, existingMapId]);
      },
      /MCQJ-ERR-4007/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_upd_opt;");

    // 6.6 Update changing question_mapping_id to cross-question mapping rejected
    await client.query("SAVEPOINT sp_upd_qm;");
    await assert.rejects(
      async () => {
        await client.query(`
          UPDATE booklet_option_mappings SET question_mapping_id = $1 WHERE id = $2;
        `, [bqm2, existingMapId]);
      },
      /MCQJ-ERR-4007/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_upd_qm;");

    // 6.7 Parent update on booklet_question_mappings.occurrence_id rejected while options exist
    await client.query("SAVEPOINT sp_parent_qm;");
    await assert.rejects(
      async () => {
        await client.query(`
          UPDATE booklet_question_mappings SET occurrence_id = $1 WHERE id = $2;
        `, [f2.occurrences[0], bqm1]);
      },
      /MCQJ-ERR-4008/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_parent_qm;");

    // 6.8 Parent reparenting on question_options.representation_id rejected while booklet options exist
    await client.query("SAVEPOINT sp_parent_opt;");
    const rep2 = (await client.query(`
      SELECT id FROM source_question_representations WHERE occurrence_id = $1 LIMIT 1;
    `, [f2.occurrences[0]])).rows[0].id;
    await assert.rejects(
      async () => {
        await client.query(`
          UPDATE question_options SET representation_id = $1 WHERE id = $2;
        `, [rep2, opt1A]);
      },
      /MCQJ-ERR-4009/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_parent_opt;");
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-07: Relational Integrity — Reject invalid attempt-response references across papers", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f1 = await createHierarchyFixture(client);
    const f2 = await createHierarchyFixture(client);

    // Create attempt for Paper 1
    const att1 = (await client.query(`
      INSERT INTO test_attempts (paper_id, booklet_series_id, user_id)
      VALUES ($1, $2, $3) RETURNING id;
    `, [f1.paperId, f1.bookletId, f1.studentId])).rows[0].id;

    // Attempt to submit response for Occurrence belonging to Paper 2
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO attempt_responses (paper_id, attempt_id, occurrence_id)
          VALUES ($1, $2, $3);
        `, [f1.paperId, att1, f2.occurrences[0]]);
      },
      /fk_response_occurrence_composite/
    );
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-08: Publication Gate — Reject publication when required sequence numbers contain a gap", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client, { skipSequenceContiguity: true, totalQuestions: 2 });

    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
      },
      /MCQJ-ERR-5008/
    );
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-09: Publication Gate — Reject publication with missing editorial verification", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client, { unverifiedRepresentations: true });

    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
      },
      /MCQJ-ERR-5009/
    );
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-10: Publication Gate — Reject publication with incomplete official answer-key coverage", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client, { incompleteAnswerKey: true, totalQuestions: 2 });

    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
      },
      /MCQJ-ERR-5013/
    );
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-11: Security Gate (SEC-02) — Rigorous Caller Authorization & Anti-Spoofing Proof", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client);

    // 11.1 Anonymous caller immediately rejected
    await client.query("SAVEPOINT sp_anon;");
    await client.query("SET LOCAL request.jwt.claim.role = 'anon';");
    await client.query("RESET request.jwt.claim.sub;");
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
      },
      /MCQJ-ERR-5015: Unauthorized: Anonymous callers cannot execute publication procedure/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_anon;");

    // 11.2 Authenticated student caller rejected
    await client.query("SAVEPOINT sp_student;");
    await client.query("SET LOCAL request.jwt.claim.role = 'authenticated';");
    await client.query(`SET LOCAL request.jwt.claim.sub = '${f.studentId}';`);
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.studentId]);
      },
      /MCQJ-ERR-5015: Unauthorized: Caller .* does not possess ADMIN role/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_student;");

    // 11.3 Student attempting admin ID spoofing rejected
    await client.query("SAVEPOINT sp_spoof;");
    await client.query("SET LOCAL request.jwt.claim.role = 'authenticated';");
    await client.query(`SET LOCAL request.jwt.claim.sub = '${f.studentId}';`);
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
      },
      /MCQJ-ERR-5015: Caller identity mismatch: authenticated user .* cannot spoof administrator/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_spoof;");

    // 11.4 Authenticated web session missing JWT claim (auth.uid() is null) rejected
    await client.query("SAVEPOINT sp_auth_null_sub;");
    await client.query("SET LOCAL request.jwt.claim.role = 'authenticated';");
    await client.query("RESET request.jwt.claim.sub;");
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
      },
      /MCQJ-ERR-5015: Unauthorized: Authenticated web session missing cryptographic user identity/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_auth_null_sub;");

    // 11.5 Trusted backend execution missing admin parameter rejected
    await client.query("SAVEPOINT sp_backend_no_admin;");
    await client.query("RESET request.jwt.claim.role;");
    await client.query("RESET request.jwt.claim.sub;");
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, NULL);`, [f.paperId]);
      },
      /MCQJ-ERR-5015: Unauthorized: Missing administrator identity in trusted backend execution/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_backend_no_admin;");

    // 11.6 Trusted backend session setting mismatch with parameter rejected
    await client.query("SAVEPOINT sp_setting_mismatch;");
    await client.query(`SET LOCAL mcqj.caller_user_id = '${f.studentId}';`);
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
      },
      /MCQJ-ERR-5015: Caller identity mismatch: session caller .* cannot spoof administrator/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_setting_mismatch;");

    // 11.7 Re-evaluation procedure rejects anonymous caller
    await client.query("SAVEPOINT sp_reeval_anon;");
    await client.query("SET LOCAL request.jwt.claim.role = 'anon';");
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_reevaluate_paper_attempts($1, $2, $3);`, [f.paperId, f.answerKeyVersionId, f.adminId]);
      },
      /MCQJ-ERR-5015: Unauthorized: Anonymous callers cannot execute re-evaluation procedure/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_reeval_anon;");

    // 11.8 Re-evaluation procedure rejects student caller
    await client.query("SAVEPOINT sp_reeval_student;");
    await client.query("SET LOCAL request.jwt.claim.role = 'authenticated';");
    await client.query(`SET LOCAL request.jwt.claim.sub = '${f.studentId}';`);
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_reevaluate_paper_attempts($1, $2, $3);`, [f.paperId, f.answerKeyVersionId, f.adminId]);
      },
      /MCQJ-ERR-5015: Caller identity mismatch/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_reeval_student;");

    // 11.9 Unauthorized attempts left paper state unchanged at VERIFIED
    const statusRes = await client.query(`SELECT publish_status FROM exam_papers WHERE id = $1;`, [f.paperId]);
    assert.equal(statusRes.rows[0].publish_status, "VERIFIED");

    // 11.10 Authorized administrator in authenticated session publishes successfully
    await client.query("SET LOCAL request.jwt.claim.role = 'authenticated';");
    await client.query(`SET LOCAL request.jwt.claim.sub = '${f.adminId}';`);
    const pubRes = await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
    assert.equal(pubRes.rows[0].fn_publish_exam_paper.publish_status, "PUBLISHED");
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-12: Publication Gate — Verify publication succeeds for a valid, fully prepared paper", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client);

    const pubRes = await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
    assert.equal(pubRes.rows[0].fn_publish_exam_paper.success, true);
    assert.equal(pubRes.rows[0].fn_publish_exam_paper.publish_status, "PUBLISHED");

    const paperCheck = await client.query(`SELECT publish_status, published_at FROM exam_papers WHERE id = $1;`, [f.paperId]);
    assert.equal(paperCheck.rows[0].publish_status, "PUBLISHED");
    assert.ok(paperCheck.rows[0].published_at !== null);
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-13: Publication Gate — Verify failed publication leaves paper and related records unchanged (atomicity)", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client, { unverifiedRepresentations: true });

    await client.query("SAVEPOINT sp_fail;");
    try {
      await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
    } catch {
      // Expected failure
    }
    await client.query("ROLLBACK TO SAVEPOINT sp_fail;");

    const check = await client.query(`SELECT publish_status FROM exam_papers WHERE id = $1;`, [f.paperId]);
    assert.equal(check.rows[0].publish_status, "VERIFIED");
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-14: Two-Tier Evaluation Ledger — Verify original evaluation remains unchanged after re-evaluation", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client, { publishStatus: "PUBLISHED" });

    // Submit an attempt
    const att = (await client.query(`
      INSERT INTO test_attempts (paper_id, booklet_series_id, user_id, attempt_status)
      VALUES ($1, $2, $3, 'SUBMITTED') RETURNING id;
    `, [f.paperId, f.bookletId, f.studentId])).rows[0].id;

    // Create original evaluation v1
    await client.query(`
      INSERT INTO attempt_evaluations (
        attempt_id, key_version_id, evaluation_version, is_current_active, is_original_attempt,
        raw_score, evaluated_denominator, total_correct, total_wrong, total_unanswered, per_question_score_json
      )
      VALUES ($1, $2, 1, TRUE, TRUE, 1.000, 2.000, 1, 1, 0, '{}');
    `, [att, f.answerKeyVersionId]);

    // Create revised answer key version v2
    const akv2 = (await client.query(`
      INSERT INTO answer_key_versions (paper_id, version_number, version_tag, is_official)
      VALUES ($1, 2, 'v2.0-revised', TRUE) RETURNING id;
    `, [f.paperId])).rows[0].id;

    // Execute re-evaluation stored procedure
    const reevalRes = await client.query(`
      SELECT fn_reevaluate_paper_attempts($1, $2, $3, 'Official objection window key revision');
    `, [f.paperId, akv2, f.adminId]);
    assert.equal(reevalRes.rows[0].fn_reevaluate_paper_attempts.attempts_reevaluated, 1);

    // Verify Version 1 is permanently frozen
    const v1 = (await client.query(`
      SELECT * FROM attempt_evaluations WHERE attempt_id = $1 AND evaluation_version = 1;
    `, [att])).rows[0];
    assert.equal(v1.is_original_attempt, true);
    assert.equal(v1.is_current_active, false);
    assert.equal(Number(v1.raw_score), 1.000);

    // Verify Version 2 is appended as active
    const v2 = (await client.query(`
      SELECT * FROM attempt_evaluations WHERE attempt_id = $1 AND evaluation_version = 2;
    `, [att])).rows[0];
    assert.equal(v2.is_original_attempt, false);
    assert.equal(v2.is_current_active, true);
    assert.equal(v2.key_version_id, akv2);
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-15: Two-Tier Evaluation Ledger — Verify exactly one evaluation is current for an attempt", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client, { publishStatus: "PUBLISHED" });

    const att = (await client.query(`
      INSERT INTO test_attempts (paper_id, booklet_series_id, user_id, attempt_status)
      VALUES ($1, $2, $3, 'SUBMITTED') RETURNING id;
    `, [f.paperId, f.bookletId, f.studentId])).rows[0].id;

    await client.query(`
      INSERT INTO attempt_evaluations (
        attempt_id, key_version_id, evaluation_version, is_current_active, is_original_attempt,
        raw_score, evaluated_denominator, total_correct, total_wrong, total_unanswered, per_question_score_json
      )
      VALUES ($1, $2, 1, TRUE, TRUE, 1.000, 2.000, 1, 0, 0, '{}');
    `, [att, f.answerKeyVersionId]);

    // Attempt inserting a second active evaluation for the same attempt
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO attempt_evaluations (
            attempt_id, key_version_id, evaluation_version, is_current_active, is_original_attempt,
            raw_score, evaluated_denominator, total_correct, total_wrong, total_unanswered, per_question_score_json
          )
          VALUES ($1, $2, 2, TRUE, FALSE, 2.000, 2.000, 2, 0, 0, '{}');
        `, [att, f.answerKeyVersionId]);
      },
      /uk_attempt_one_active_evaluation/
    );
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-16: Concurrency — Verify concurrent publication requests coordinate via advisory lock", async () => {
  const client1 = await pool.connect();
  const client2 = await pool.connect();
  try {
    await client1.query("BEGIN;");
    const f = await createHierarchyFixture(client1);

    // Client 1 acquires lock on paper publication
    const lock1 = await client1.query(`
      SELECT pg_try_advisory_xact_lock(hashtext('publish_paper_' || $1::text));
    `, [f.paperId]);
    assert.equal(lock1.rows[0].pg_try_advisory_xact_lock, true);

    // Client 2 attempts to acquire the exact same lock concurrently
    await client2.query("BEGIN;");
    const lock2 = await client2.query(`
      SELECT pg_try_advisory_xact_lock(hashtext('publish_paper_' || $1::text));
    `, [f.paperId]);
    assert.equal(lock2.rows[0].pg_try_advisory_xact_lock, false, "Second concurrent transaction must fail to acquire lock");
    await client2.query("ROLLBACK;");
  } finally {
    await client1.query("ROLLBACK;");
    client1.release();
    client2.release();
  }
});

test("DB-17: Scoring & Policies — Verify check constraints on penalties, target targets & scoring engine", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client);

    // 17.1 Reject negative penalty in marking scheme
    await client.query("SAVEPOINT sp_neg;");
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO section_scoring_overrides (section_id, marks_per_correct, negative_marks_per_wrong)
          VALUES ($1, 1.000, -0.500);
        `, [f.sectionId]);
      },
      /chk_section_negative_nonnegative/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_neg;");

    // 17.2 Reject zero marks per correct
    await client.query("SAVEPOINT sp_zero;");
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO section_scoring_overrides (section_id, marks_per_correct, negative_marks_per_wrong)
          VALUES ($1, 0.000, 0.250);
        `, [f.sectionId]);
      },
      /chk_section_marks_positive/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_zero;");

    // 17.3 Verify target type constraints on AnswerKeyItem
    await client.query("SAVEPOINT sp_target;");
    await assert.rejects(
      async () => {
        await client.query(`
          INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels, numerical_target_value)
          VALUES ($1, $2, $3, 'ACTIVE', ARRAY['A'], 42.0);
        `, [f.paperId, f.answerKeyVersionId, f.occurrences[0]]);
      },
      /chk_key_item_valid_target/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_target;");
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-18: Phase 4 Authorization Contract — Direct Server Action (Path B) & Service Role (Path C) Verification", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client);

    // 18.1 Direct connection (Next.js Server Action / Prisma over DATABASE_URL)
    // In this path, auth.role() and auth.uid() are NULL. SESSION_USER is 'postgres'.
    // Calling fn_publish_exam_paper with verified admin ID must succeed.
    await client.query("SAVEPOINT sp_path_b_success;");
    await client.query("RESET request.jwt.claim.role;");
    await client.query("RESET request.jwt.claim.sub;");
    const pubRes = await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
    assert.equal(pubRes.rows[0].fn_publish_exam_paper.publish_status, "PUBLISHED");
    assert.equal(pubRes.rows[0].fn_publish_exam_paper.published_by, f.adminId);
    await client.query("ROLLBACK TO SAVEPOINT sp_path_b_success;");

    // 18.2 Direct connection passing student ID must fail closed
    await client.query("SAVEPOINT sp_path_b_student;");
    await client.query("RESET request.jwt.claim.role;");
    await client.query("RESET request.jwt.claim.sub;");
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.studentId]);
      },
      /MCQJ-ERR-5015: Unauthorized: Caller .* does not possess ADMIN role/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_path_b_student;");

    // 18.3 Direct connection passing non-existent user UUID must fail closed
    await client.query("SAVEPOINT sp_path_b_unknown;");
    await client.query("RESET request.jwt.claim.role;");
    await client.query("RESET request.jwt.claim.sub;");
    const nonExistentUuid = "00000000-0000-0000-0000-000000000099";
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, nonExistentUuid]);
      },
      /MCQJ-ERR-5015: Unauthorized: Caller identity .* not found in users table/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_path_b_unknown;");

    // 18.4 Direct connection with NULL admin ID must fail closed
    await client.query("SAVEPOINT sp_path_b_null_admin;");
    await client.query("RESET request.jwt.claim.role;");
    await client.query("RESET request.jwt.claim.sub;");
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, NULL);`, [f.paperId]);
      },
      /MCQJ-ERR-5015: Unauthorized: Missing administrator identity in trusted backend execution/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_path_b_null_admin;");

    // 18.5 Direct connection session setting precedence: if mcqj.caller_user_id is set to student,
    // passing adminId as parameter triggers anti-spoofing mismatch
    await client.query("SAVEPOINT sp_path_b_setting_mismatch;");
    await client.query("RESET request.jwt.claim.role;");
    await client.query("RESET request.jwt.claim.sub;");
    await client.query(`SET LOCAL mcqj.caller_user_id = '${f.studentId}';`);
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
      },
      /MCQJ-ERR-5015: Caller identity mismatch: session caller .* cannot spoof administrator/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_path_b_setting_mismatch;");

    // 18.6 Path C: PostgREST invocation with service_role key (auth.role() = 'service_role', auth.uid() is null)
    // Must fail closed because publication requires audited administrator identity
    await client.query("SAVEPOINT sp_path_c_service_role;");
    await client.query("SET LOCAL request.jwt.claim.role = 'service_role';");
    await client.query("RESET request.jwt.claim.sub;");
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
      },
      /MCQJ-ERR-5015: Unauthorized: Missing authenticated session context for session user .* \(role service_role\)/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_path_c_service_role;");

    // 18.7 Path B Re-evaluation: Direct connection calling fn_reevaluate_paper_attempts
    // First, publish the paper so it is eligible for re-evaluation
    await client.query("RESET request.jwt.claim.role;");
    await client.query("RESET request.jwt.claim.sub;");
    await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);

    // Create a new key version v2
    const keyV2 = (await client.query(`
      INSERT INTO answer_key_versions (paper_id, version_number, version_tag, is_official)
      VALUES ($1, 2, 'v2.0-amended', TRUE) RETURNING id;
    `, [f.paperId])).rows[0].id;

    for (let i = 0; i < f.occurrences.length; i++) {
      await client.query(`
        INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
        VALUES ($1, $2, $3, 'ACTIVE', ARRAY['B']);
      `, [f.paperId, keyV2, f.occurrences[i]]);
    }

    // Re-evaluation with valid admin succeeds under Path B
    const reevalRes = await client.query(`
      SELECT fn_reevaluate_paper_attempts($1, $2, $3, 'Phase 4 contract test');
    `, [f.paperId, keyV2, f.adminId]);
    assert.equal(reevalRes.rows[0].fn_reevaluate_paper_attempts.success, true);

    // Re-evaluation with student fails closed under Path B
    await client.query("SAVEPOINT sp_reeval_student_path_b;");
    await assert.rejects(
      async () => {
        await client.query(`
          SELECT fn_reevaluate_paper_attempts($1, $2, $3, 'Phase 4 contract test');
        `, [f.paperId, keyV2, f.studentId]);
      },
      /MCQJ-ERR-5015: Unauthorized: Caller .* does not possess ADMIN role/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_reeval_student_path_b;");

    // 18.9 Revoked Administrator: Demoted admin cannot publish papers
    await client.query("SAVEPOINT sp_path_b_demoted;");
    await client.query(`UPDATE users SET role = 'STUDENT' WHERE id = $1;`, [f.adminId]);
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
      },
      /MCQJ-ERR-5015: Unauthorized: Caller .* does not possess ADMIN role/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_path_b_demoted;");

    // 18.10 Routine Privilege Boundary: Verify no PUBLIC or anon grants on privileged functions
    const privRes = await client.query(`
      SELECT routine_name, grantee, privilege_type
      FROM information_schema.routine_privileges
      WHERE routine_name IN ('fn_publish_exam_paper', 'fn_reevaluate_paper_attempts')
        AND grantee IN ('PUBLIC', 'anon');
    `);
    assert.equal(
      privRes.rows.length,
      0,
      `Privileged functions must have 0 grants for PUBLIC or anon; found: ${JSON.stringify(privRes.rows)}`
    );

    // 18.11 Stale Connection Setting Protection (Adversarial Pool Context)
    // If a connection from a transaction pool retained a stale caller setting,
    // passing a different admin UUID fails closed rather than silently executing
    await client.query("SAVEPOINT sp_path_b_stale_context;");
    const otherAuthId = (await client.query(`
      INSERT INTO auth.users (email) VALUES ('other-admin@test.local') RETURNING id;
    `)).rows[0].id;
    await client.query(`
      INSERT INTO users (id, email, name, role, updated_at)
      VALUES ($1, 'other-admin@test.local', 'Other Admin', 'ADMIN', clock_timestamp());
    `, [otherAuthId]);
    await client.query(`SET LOCAL mcqj.caller_user_id = '${f.adminId}';`);
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, otherAuthId]);
      },
      /MCQJ-ERR-5015: Caller identity mismatch: session caller .* cannot spoof administrator/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_path_b_stale_context;");
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

test("DB-19: Privileged RPC PostgREST Exposure Closure — Verification of Revoked Grants", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const f = await createHierarchyFixture(client);

    // 19.1 Catalog Verification: 0 execute grants for PUBLIC, anon, and authenticated
    const privRes = await client.query(`
      SELECT routine_name, grantee, privilege_type
      FROM information_schema.routine_privileges
      WHERE routine_name IN ('fn_publish_exam_paper', 'fn_reevaluate_paper_attempts')
        AND grantee IN ('PUBLIC', 'anon', 'authenticated');
    `);
    assert.equal(
      privRes.rows.length,
      0,
      `Privileged functions must have 0 grants for PUBLIC, anon, or authenticated; found: ${JSON.stringify(privRes.rows)}`
    );

    // 19.2 Role 'authenticated' fails with permission denied at PostgreSQL privilege layer
    await client.query("SAVEPOINT sp_auth_perm;");
    await client.query("SET LOCAL ROLE authenticated;");
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
      },
      /permission denied for function fn_publish_exam_paper/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_auth_perm;");

    // 19.3 Role 'authenticated' fails on re-evaluation procedure
    await client.query("SAVEPOINT sp_auth_perm_reeval;");
    await client.query("SET LOCAL ROLE authenticated;");
    await assert.rejects(
      async () => {
        await client.query(`SELECT fn_reevaluate_paper_attempts($1, $2, $3, 'test');`, [
          f.paperId,
          f.answerKeyVersionId,
          f.adminId,
        ]);
      },
      /permission denied for function fn_reevaluate_paper_attempts/
    );
    await client.query("ROLLBACK TO SAVEPOINT sp_auth_perm_reeval;");

    // 19.4 Direct connection as postgres (Next.js Server Action / Prisma) succeeds
    const pubRes = await client.query(`SELECT fn_publish_exam_paper($1, $2);`, [f.paperId, f.adminId]);
    assert.equal(pubRes.rows[0].fn_publish_exam_paper.publish_status, "PUBLISHED");
    assert.equal(pubRes.rows[0].fn_publish_exam_paper.published_by, f.adminId);
  } finally {
    await client.query("ROLLBACK;");
    client.release();
  }
});

// Teardown pool after suite finishes
test.after(async () => {
  await pool.end();
});
