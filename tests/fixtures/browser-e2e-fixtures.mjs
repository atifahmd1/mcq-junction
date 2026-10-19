// ============================================================================
// MCQ Junction — Browser E2E Test Relational Fixtures
// File: tests/fixtures/browser-e2e-fixtures.mjs
// ============================================================================

import pg from "pg";

export async function seedBrowserFixtures(testDbUrl) {
  const client = new pg.Client({ connectionString: testDbUrl });
  await client.connect();

  const suffix = "b" + Date.now().toString(36);

  try {
    // 1. Fixed Deterministic UUIDs for Auth & Users
    const adminId = "e1000000-0000-0000-0000-000000000001";
    const studentId = "e2000000-0000-0000-0000-000000000002";
    const adminEmail = "dev-admin@mcq.test";
    const studentEmail = "student@mcq.test";

    // Insert into auth.users (simulate Supabase auth identity)
    await client.query(`
      INSERT INTO auth.users (id, email)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET email = $2;
    `, [adminId, adminEmail]);

    await client.query(`
      INSERT INTO auth.users (id, email)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET email = $2;
    `, [studentId, studentEmail]);

    // Insert into public.users
    await client.query(`
      INSERT INTO public.users (id, email, name, role, created_at, updated_at)
      VALUES ($1, $2, 'Development Admin', 'ADMIN'::"Role", clock_timestamp(), clock_timestamp())
      ON CONFLICT (id) DO UPDATE SET role = 'ADMIN'::"Role", updated_at = clock_timestamp();
    `, [adminId, adminEmail]);

    await client.query(`
      INSERT INTO public.users (id, email, name, role, created_at, updated_at)
      VALUES ($1, $2, 'Student Candidate', 'STUDENT'::"Role", clock_timestamp(), clock_timestamp())
      ON CONFLICT (id) DO UPDATE SET role = 'STUDENT'::"Role", updated_at = clock_timestamp();
    `, [studentId, studentEmail]);

    // 2. Conducting Body, Exam, Exam Session
    const cb = (await client.query(`
      INSERT INTO conducting_bodies (code, full_name, region_code)
      VALUES ('BPSC-${suffix}', 'Bihar Public Service Commission', 'BR')
      RETURNING id;
    `)).rows[0].id;

    const exam = (await client.query(`
      INSERT INTO exams (conducting_body_id, code, title, tier)
      VALUES ($1, 'BPSC-CS-${suffix}', 'BPSC Computer Science', 'STATE_LEVEL')
      RETURNING id;
    `, [cb])).rows[0].id;

    const session = (await client.query(`
      INSERT INTO exam_sessions (exam_id, session_year, cycle_code)
      VALUES ($1, 2026, 'CYCLE-${suffix}')
      RETURNING id;
    `, [exam])).rows[0].id;

    // 3. Draft Paper (for Sequence Editor Reordering)
    const draftPaperId = (await client.query(`
      INSERT INTO exam_papers (session_id, paper_code, title, publish_status, total_duration_minutes, total_questions, max_score)
      VALUES ($1, 'DRAFT-PAPER-${suffix}', 'Draft Computer Science Exam', 'DRAFT', 120, 2, 2.0)
      RETURNING id;
    `, [session])).rows[0].id;

    await client.query(`
      INSERT INTO paper_marking_schemes (paper_id, marks_per_correct, negative_marks_per_wrong)
      VALUES ($1, 1.000, 0.250);
    `, [draftPaperId]);

    const draftSectionId = (await client.query(`
      INSERT INTO paper_sections (paper_id, section_order, title, total_questions)
      VALUES ($1, 1, 'Core CS Section', 2)
      RETURNING id;
    `, [draftPaperId])).rows[0].id;

    const draftBookletId = (await client.query(`
      INSERT INTO booklet_series (paper_id, series_code, is_master_series)
      VALUES ($1, 'A', TRUE)
      RETURNING id;
    `, [draftPaperId])).rows[0].id;

    // 2 Questions for Draft Paper (sequence 1 and 2)
    const cq1 = (await client.query(`
      INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic)
      VALUES ('CQ-1-${suffix}', 'Data Structures', 'Binary Trees')
      RETURNING id;
    `)).rows[0].id;

    const occ1 = (await client.query(`
      INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
      VALUES ($1, $2, $3, 1, 'SINGLE_CHOICE')
      RETURNING id;
    `, [draftPaperId, draftSectionId, cq1])).rows[0].id;

    const rep1 = (await client.query(`
      INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
      VALUES ($1, 'EN', 'What is the maximum number of nodes at depth d in a binary tree?', TRUE)
      RETURNING id;
    `, [occ1])).rows[0].id;

    const optA1 = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'A', '2^d', 1) RETURNING id;
    `, [rep1])).rows[0].id;

    const optB1 = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'B', '2^(d+1)', 2) RETURNING id;
    `, [rep1])).rows[0].id;

    const bqm1 = (await client.query(`
      INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
      VALUES ($1, $2, $3, 1) RETURNING id;
    `, [draftPaperId, draftBookletId, occ1])).rows[0].id;

    await client.query(`
      INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order)
      VALUES ($1, $2, 'A', 1), ($1, $3, 'B', 2);
    `, [bqm1, optA1, optB1]);

    const cq2 = (await client.query(`
      INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic)
      VALUES ('CQ-2-${suffix}', 'Algorithms', 'Sorting')
      RETURNING id;
    `)).rows[0].id;

    const occ2 = (await client.query(`
      INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
      VALUES ($1, $2, $3, 2, 'SINGLE_CHOICE')
      RETURNING id;
    `, [draftPaperId, draftSectionId, cq2])).rows[0].id;

    const rep2 = (await client.query(`
      INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
      VALUES ($1, 'EN', 'What is the worst-case time complexity of QuickSort?', TRUE)
      RETURNING id;
    `, [occ2])).rows[0].id;

    const optA2 = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'A', 'O(n^2)', 1) RETURNING id;
    `, [rep2])).rows[0].id;

    const optB2 = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'B', 'O(n log n)', 2) RETURNING id;
    `, [rep2])).rows[0].id;

    const bqm2 = (await client.query(`
      INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
      VALUES ($1, $2, $3, 2) RETURNING id;
    `, [draftPaperId, draftBookletId, occ2])).rows[0].id;

    await client.query(`
      INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order)
      VALUES ($1, $2, 'A', 1), ($1, $3, 'B', 2);
    `, [bqm2, optA2, optB2]);

    // 4. Incomplete Paper (Sequence Gap: seq 1 and seq 3) to test Publication Review Gates failure
    const incompletePaperId = (await client.query(`
      INSERT INTO exam_papers (session_id, paper_code, title, publish_status, total_duration_minutes, total_questions, max_score)
      VALUES ($1, 'INCOMPLETE-PAPER-${suffix}', 'Incomplete Review Paper', 'DRAFT', 120, 2, 2.0)
      RETURNING id;
    `, [session])).rows[0].id;

    await client.query(`
      INSERT INTO paper_marking_schemes (paper_id, marks_per_correct, negative_marks_per_wrong)
      VALUES ($1, 1.000, 0.250);
    `, [incompletePaperId]);

    const incompleteSectionId = (await client.query(`
      INSERT INTO paper_sections (paper_id, section_order, title, total_questions)
      VALUES ($1, 1, 'Incomplete Section', 2)
      RETURNING id;
    `, [incompletePaperId])).rows[0].id;

    const occInc1 = (await client.query(`
      INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
      VALUES ($1, $2, $3, 1, 'SINGLE_CHOICE')
      RETURNING id;
    `, [incompletePaperId, incompleteSectionId, cq1])).rows[0].id;

    await client.query(`
      INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
      VALUES ($1, 'EN', 'Question 1 with sequence gap test', TRUE);
    `, [occInc1]);

    const occInc2 = (await client.query(`
      INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
      VALUES ($1, $2, $3, 3, 'SINGLE_CHOICE')
      RETURNING id;
    `, [incompletePaperId, incompleteSectionId, cq2])).rows[0].id;

    await client.query(`
      INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
      VALUES ($1, 'EN', 'Question 3 with sequence gap test', FALSE);
    `, [occInc2]);

    // 5. Published Exam Paper (with Answer Key Versions & Test Attempts for Adjudication)
    const pubPaperId = (await client.query(`
      INSERT INTO exam_papers (session_id, paper_code, title, publish_status, total_duration_minutes, total_questions, max_score)
      VALUES ($1, 'PUB-PAPER-${suffix}', 'Published Final CS Paper', 'VERIFIED', 120, 1, 1.0)
      RETURNING id;
    `, [session])).rows[0].id;

    await client.query(`
      INSERT INTO paper_marking_schemes (paper_id, marks_per_correct, negative_marks_per_wrong)
      VALUES ($1, 1.000, 0.250);
    `, [pubPaperId]);

    const pubSectionId = (await client.query(`
      INSERT INTO paper_sections (paper_id, section_order, title, total_questions)
      VALUES ($1, 1, 'Final Section', 1)
      RETURNING id;
    `, [pubPaperId])).rows[0].id;

    const pubBookletId = (await client.query(`
      INSERT INTO booklet_series (paper_id, series_code, is_master_series)
      VALUES ($1, 'A', TRUE)
      RETURNING id;
    `, [pubPaperId])).rows[0].id;

    const pubOcc = (await client.query(`
      INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
      VALUES ($1, $2, $3, 1, 'SINGLE_CHOICE')
      RETURNING id;
    `, [pubPaperId, pubSectionId, cq1])).rows[0].id;

    const pubRep = (await client.query(`
      INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
      VALUES ($1, 'EN', 'Published Question: Definition of P vs NP?', TRUE)
      RETURNING id;
    `, [pubOcc])).rows[0].id;

    const pubOptA = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'A', 'P is subset of NP', 1) RETURNING id;
    `, [pubRep])).rows[0].id;

    const pubOptB = (await client.query(`
      INSERT INTO question_options (representation_id, option_label, option_text, sort_order)
      VALUES ($1, 'B', 'NP is subset of P', 2) RETURNING id;
    `, [pubRep])).rows[0].id;

    const pubBqm = (await client.query(`
      INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
      VALUES ($1, $2, $3, 1) RETURNING id;
    `, [pubPaperId, pubBookletId, pubOcc])).rows[0].id;

    await client.query(`
      INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order)
      VALUES ($1, $2, 'A', 1), ($1, $3, 'B', 2);
    `, [pubBqm, pubOptA, pubOptB]);

    // Answer Key Version 1
    const keyV1 = (await client.query(`
      INSERT INTO answer_key_versions (paper_id, version_number, version_tag, is_official)
      VALUES ($1, 1, 'OFFICIAL_PROVISIONAL', TRUE)
      RETURNING id;
    `, [pubPaperId])).rows[0].id;

    await client.query(`
      INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
      VALUES ($1, $2, $3, 'ACTIVE', ARRAY['A']);
    `, [pubPaperId, keyV1, pubOcc]);

    // Answer Key Version 2 (Revised Official for Adjudication testing)
    const keyV2 = (await client.query(`
      INSERT INTO answer_key_versions (paper_id, version_number, version_tag, is_official)
      VALUES ($1, 2, 'OFFICIAL_FINAL', TRUE)
      RETURNING id;
    `, [pubPaperId])).rows[0].id;

    await client.query(`
      INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
      VALUES ($1, $2, $3, 'ACTIVE', ARRAY['B']);
    `, [pubPaperId, keyV2, pubOcc]);

    // Transition paper to PUBLISHED
    await client.query(`
      UPDATE exam_papers
      SET publish_status = 'PUBLISHED', published_at = clock_timestamp()
      WHERE id = $1;
    `, [pubPaperId]);

    // Create Candidate Test Attempt
    const attempt = (await client.query(`
      INSERT INTO test_attempts (paper_id, booklet_series_id, user_id, attempt_status, submitted_at)
      VALUES ($1, $2, $3, 'SUBMITTED', clock_timestamp())
      RETURNING id;
    `, [pubPaperId, pubBookletId, studentId])).rows[0].id;

    // Evaluation v1: Candidate received 1.0 mark under Key v1
    await client.query(`
      INSERT INTO attempt_evaluations (
        attempt_id, key_version_id, evaluation_version, is_original_attempt, is_current_active,
        raw_score, evaluated_denominator, total_correct, total_wrong, total_unanswered, per_question_score_json
      )
      VALUES ($1, $2, 1, TRUE, TRUE, 1.0, 1.0, 1, 0, 0, '[]'::jsonb);
    `, [attempt, keyV1]);

    return {
      adminId,
      adminEmail,
      studentId,
      studentEmail,
      draftPaperId,
      draftOcc1: occ1,
      draftOcc2: occ2,
      incompletePaperId,
      pubPaperId,
      keyV1,
      keyV2,
      attemptId: attempt,
    };
  } finally {
    await client.end();
  }
}
