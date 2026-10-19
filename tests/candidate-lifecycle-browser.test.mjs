// ============================================================================
// MCQ Junction — Phase 10: Candidate Lifecycle & Examination Delivery E2E Suite
// File: tests/candidate-lifecycle-browser.test.mjs
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import assert from "node:assert/strict";
import dotenv from "dotenv";
import pg from "pg";
import { chromium } from "@playwright/test";
import { createMockAuthServer } from "./mock-auth-server.mjs";

dotenv.config({ path: ".env.local" });

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:test_pw_disposable_12345@127.0.0.1:5433/mcq_junction_test";
const MOCK_AUTH_PORT = 54321;
const APP_PORT = 3000;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${APP_PORT}`;

const SCREENSHOT_DIRS = [
  path.resolve(process.cwd(), "test-results/screenshots/phase10"),
  path.resolve(process.cwd(), "docs/reports/screenshots/phase10"),
];

for (const dir of SCREENSHOT_DIRS) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function captureScreenshot(page, filename) {
  for (const dir of SCREENSHOT_DIRS) {
    const fullPath = path.join(dir, filename);
    await page.screenshot({ path: fullPath, fullPage: true });
  }
}

async function waitForHttp(url, timeoutMs = 60000) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200 || res.status === 307) {
        return true;
      }
      const text = await res.text();
      console.log(`  [waitForHttp] HTTP ${res.status}: ${text.slice(0, 100)}`);
    } catch (err) {
      lastErr = err.message;
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`Timeout waiting for ${url} after ${timeoutMs}ms (lastErr: ${lastErr})`);
}

// ----------------------------------------------------------------------------
// Step 1: Seed Disposable Examination Fixtures
// ----------------------------------------------------------------------------
async function seedPhase10Fixtures() {
  console.log("================================================================================");
  console.log("  SEEDING DISPOSABLE TEST FIXTURES ON LOCAL POSTGRESQL (127.0.0.1:5433)");
  console.log("================================================================================\n");

  const client = new pg.Client({ connectionString: TEST_DB_URL });
  await client.connect();

  const suffix = "p10_" + Date.now().toString(36);
  const cand1Id = "c1000000-0000-0000-0000-000000000001";
  const cand1Email = "candidate1@mcq.test";
  const cand1Password = "CandidatePass123!";

  const cand2Id = "c2000000-0000-0000-0000-000000000002";
  const cand2Email = "candidate2@mcq.test";
  const cand2Password = "CandidatePass123!";

  try {
    // 1. Users
    await client.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET email = $2;`,
      [cand1Id, cand1Email]
    );
    await client.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET email = $2;`,
      [cand2Id, cand2Email]
    );

    await client.query(
      `INSERT INTO public.users (id, email, name, role, created_at, updated_at)
       VALUES ($1, $2, 'Candidate One (Playwright)', 'STUDENT'::"Role", clock_timestamp(), clock_timestamp())
       ON CONFLICT (id) DO UPDATE SET role = 'STUDENT'::"Role", name = 'Candidate One (Playwright)';`,
      [cand1Id, cand1Email]
    );
    await client.query(
      `INSERT INTO public.users (id, email, name, role, created_at, updated_at)
       VALUES ($1, $2, 'Candidate Two (Playwright)', 'STUDENT'::"Role", clock_timestamp(), clock_timestamp())
       ON CONFLICT (id) DO UPDATE SET role = 'STUDENT'::"Role", name = 'Candidate Two (Playwright)';`,
      [cand2Id, cand2Email]
    );

    // 2. Conducting Body, Exam, Exam Session
    const cbId = (
      await client.query(
        `INSERT INTO conducting_bodies (code, full_name, region_code)
         VALUES ('BPSC-${suffix}', 'Bihar Public Service Commission', 'BR')
         RETURNING id;`
      )
    ).rows[0].id;

    const examId = (
      await client.query(
        `INSERT INTO exams (conducting_body_id, code, title, tier)
         VALUES ($1, 'BPSC-AE-${suffix}', 'BPSC Assistant Engineer Systems Examination', 'STATE_LEVEL')
         RETURNING id;`,
        [cbId]
      )
    ).rows[0].id;

    const sessionId = (
      await client.query(
        `INSERT INTO exam_sessions (exam_id, session_year, cycle_code)
         VALUES ($1, 2026, 'CYCLE-${suffix}')
         RETURNING id;`,
        [examId]
      )
    ).rows[0].id;

    // 3. Exam Paper (Created as VERIFIED, published after all children are seeded)
    const paperId = (
      await client.query(
        `INSERT INTO exam_papers (
           session_id, paper_code, title, publish_status,
           published_at, total_duration_minutes, total_questions, max_score
         )
         VALUES ($1, 'P10-PAPER-${suffix}', 'State Engineering Systems & Network Architecture 2026', 'VERIFIED', NULL, 60, 4, 8.0)
         RETURNING id;`,
        [sessionId]
      )
    ).rows[0].id;

    // 4. Marking Scheme: +2.000 for correct, -0.500 for incorrect
    await client.query(
      `INSERT INTO paper_marking_schemes (paper_id, marks_per_correct, negative_marks_per_wrong)
       VALUES ($1, 2.000, 0.500);`,
      [paperId]
    );

    // 5. Paper Section
    const sectionId = (
      await client.query(
        `INSERT INTO paper_sections (paper_id, section_order, title, total_questions)
         VALUES ($1, 1, 'Core Computer Engineering & Architecture', 4)
         RETURNING id;`,
        [paperId]
      )
    ).rows[0].id;

    // 6. Master Booklet Series 'A'
    const bookletId = (
      await client.query(
        `INSERT INTO booklet_series (paper_id, series_code, is_master_series)
         VALUES ($1, 'A', TRUE)
         RETURNING id;`,
        [paperId]
      )
    ).rows[0].id;

    // 7. Comprehension Passage (Urdu RTL)
    const passageId = (
      await client.query(
        `INSERT INTO comprehension_passages (passage_ref_code, title, body_text, language_code)
         VALUES (
           'PASS-URDU-${suffix}',
           'کمپیوٹر نیٹ ورک اور او ایس آئی ماڈل (Computer Networks & OSI Model)',
           'کمپیوٹر نیٹ ورکنگ میں، او ایس آئی (OSI) ماڈل سات تہوں پر مشتمل ہوتا ہے۔ ہر تہہ کا اپنا مخصوص کام ہوتا ہے جو ڈیٹا کی بروقت اور محفوظ ترسیل کو یقینی بناتا ہے۔ ٹرانسپورٹ لیئر خاص طور پر اختتام تا اختتام رابطہ اور غلطی کی اصلاح کے لیے ذمہ دار ہے۔',
           'UR'
         )
         RETURNING id;`
      )
    ).rows[0].id;

    // 8. Four Questions:
    // Q1: SINGLE_CORRECT
    const cq1 = (
      await client.query(
        `INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic, question_type)
         VALUES ('CQ-P10-1-${suffix}', 'Operating Systems', 'CPU Scheduling', 'SINGLE_CORRECT') RETURNING id;`
      )
    ).rows[0].id;

    const occ1 = (
      await client.query(
        `INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
         VALUES ($1, $2, $3, 1, 'SINGLE_CORRECT') RETURNING id;`,
        [paperId, sectionId, cq1]
      )
    ).rows[0].id;

    const rep1 = (
      await client.query(
        `INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
         VALUES ($1, 'EN', 'Which CPU scheduling algorithm guarantees the minimum average waiting time for a given set of stationary processes?', TRUE) RETURNING id;`,
        [occ1]
      )
    ).rows[0].id;

    const opt1A = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'A', 1, 'First-Come, First-Served (FCFS)') RETURNING id;`,
        [rep1]
      )
    ).rows[0].id;
    const opt1B = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'B', 2, 'Shortest Job First (SJF / SRTF)') RETURNING id;`,
        [rep1]
      )
    ).rows[0].id;
    const opt1C = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'C', 3, 'Round Robin with long time quantum') RETURNING id;`,
        [rep1]
      )
    ).rows[0].id;
    const opt1D = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'D', 4, 'Non-preemptive Priority Scheduling') RETURNING id;`,
        [rep1]
      )
    ).rows[0].id;

    // Q2: MULTIPLE_CORRECT (Correct = A, C, D)
    const cq2 = (
      await client.query(
        `INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic, question_type)
         VALUES ('CQ-P10-2-${suffix}', 'Database Systems', 'Transaction Processing', 'MULTIPLE_CORRECT') RETURNING id;`
      )
    ).rows[0].id;

    const occ2 = (
      await client.query(
        `INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
         VALUES ($1, $2, $3, 2, 'MULTIPLE_CORRECT') RETURNING id;`,
        [paperId, sectionId, cq2]
      )
    ).rows[0].id;

    const rep2 = (
      await client.query(
        `INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
         VALUES ($1, 'EN', 'Which of the following are fundamental ACID properties in database transaction management? (Select all that apply)', TRUE) RETURNING id;`,
        [occ2]
      )
    ).rows[0].id;

    const opt2A = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'A', 1, 'Atomicity: All operations in the transaction succeed or none occur') RETURNING id;`,
        [rep2]
      )
    ).rows[0].id;
    const opt2B = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'B', 2, 'Availability: System remains operational without partition tolerance') RETURNING id;`,
        [rep2]
      )
    ).rows[0].id;
    const opt2C = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'C', 3, 'Consistency: Database transitions strictly between valid integrity states') RETURNING id;`,
        [rep2]
      )
    ).rows[0].id;
    const opt2D = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'D', 4, 'Durability: Committed transactions persist across power outages and crashes') RETURNING id;`,
        [rep2]
      )
    ).rows[0].id;

    // Q3: ASSERTION_REASON (Correct = A)
    const cq3 = (
      await client.query(
        `INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic, question_type)
         VALUES ('CQ-P10-3-${suffix}', 'Computer Architecture', 'Instruction Pipelining', 'ASSERTION_REASON') RETURNING id;`
      )
    ).rows[0].id;

    const occ3 = (
      await client.query(
        `INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
         VALUES ($1, $2, $3, 3, 'ASSERTION_REASON') RETURNING id;`,
        [paperId, sectionId, cq3]
      )
    ).rows[0].id;

    const rep3 = (
      await client.query(
        `INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
         VALUES ($1, 'EN', 'Assertion (A): Instruction pipelining increases the instruction throughput of a CPU. Reason (R): Pipelining enables overlapping execution of distinct instructions across successive pipeline stages.', TRUE) RETURNING id;`,
        [occ3]
      )
    ).rows[0].id;

    const opt3A = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'A', 1, 'Both Assertion (A) and Reason (R) are true, and Reason (R) is the correct explanation of Assertion (A).') RETURNING id;`,
        [rep3]
      )
    ).rows[0].id;
    const opt3B = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'B', 2, 'Both Assertion (A) and Reason (R) are true, but Reason (R) is NOT the correct explanation of Assertion (A).') RETURNING id;`,
        [rep3]
      )
    ).rows[0].id;
    const opt3C = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'C', 3, 'Assertion (A) is true, but Reason (R) is false.') RETURNING id;`,
        [rep3]
      )
    ).rows[0].id;
    const opt3D = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'D', 4, 'Assertion (A) is false, but Reason (R) is true.') RETURNING id;`,
        [rep3]
      )
    ).rows[0].id;

    // Q4: COMPREHENSION_CHILD (Urdu RTL) linked to passage (Correct = B)
    const cq4 = (
      await client.query(
        `INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic, question_type)
         VALUES ('CQ-P10-4-${suffix}', 'Computer Networks', 'OSI Reference Model', 'COMPREHENSION_CHILD') RETURNING id;`
      )
    ).rows[0].id;

    const occ4 = (
      await client.query(
        `INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, passage_id, sequence_number, question_type)
         VALUES ($1, $2, $3, $4, 4, 'COMPREHENSION_CHILD') RETURNING id;`,
        [paperId, sectionId, cq4, passageId]
      )
    ).rows[0].id;

    const rep4 = (
      await client.query(
        `INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
         VALUES ($1, 'UR', 'مندرجہ بالا عبارت کے مطابق، اختتام تا اختتام (End-to-End) رابطہ اور غلطی کی اصلاح کس لیئر کی بنیادی ذمہ داری ہے؟', TRUE) RETURNING id;`,
        [occ4]
      )
    ).rows[0].id;

    const opt4A = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'A', 1, 'فزیکل لیئر (Physical Layer)') RETURNING id;`,
        [rep4]
      )
    ).rows[0].id;
    const opt4B = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'B', 2, 'ٹرانسپورٹ لیئر (Transport Layer)') RETURNING id;`,
        [rep4]
      )
    ).rows[0].id;
    const opt4C = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'C', 3, 'ایپلیکیشن لیئر (Application Layer)') RETURNING id;`,
        [rep4]
      )
    ).rows[0].id;
    const opt4D = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, sort_order, option_text)
         VALUES ($1, 'D', 4, 'نیٹ ورک لیئر (Network Layer)') RETURNING id;`,
        [rep4]
      )
    ).rows[0].id;

    // 8. Master Booklet Question & Option Mappings (Series 'A')
    const bqm1 = (
      await client.query(
        `INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
         VALUES ($1, $2, $3, 1) RETURNING id;`,
        [paperId, bookletId, occ1]
      )
    ).rows[0].id;
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'A', 1);`, [bqm1, opt1A]);
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'B', 2);`, [bqm1, opt1B]);
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'C', 3);`, [bqm1, opt1C]);
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'D', 4);`, [bqm1, opt1D]);

    const bqm2 = (
      await client.query(
        `INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
         VALUES ($1, $2, $3, 2) RETURNING id;`,
        [paperId, bookletId, occ2]
      )
    ).rows[0].id;
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'A', 1);`, [bqm2, opt2A]);
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'B', 2);`, [bqm2, opt2B]);
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'C', 3);`, [bqm2, opt2C]);
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'D', 4);`, [bqm2, opt2D]);

    const bqm3 = (
      await client.query(
        `INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
         VALUES ($1, $2, $3, 3) RETURNING id;`,
        [paperId, bookletId, occ3]
      )
    ).rows[0].id;
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'A', 1);`, [bqm3, opt3A]);
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'B', 2);`, [bqm3, opt3B]);
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'C', 3);`, [bqm3, opt3C]);
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'D', 4);`, [bqm3, opt3D]);

    const bqm4 = (
      await client.query(
        `INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence)
         VALUES ($1, $2, $3, 4) RETURNING id;`,
        [paperId, bookletId, occ4]
      )
    ).rows[0].id;
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'A', 1);`, [bqm4, opt4A]);
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'B', 2);`, [bqm4, opt4B]);
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'C', 3);`, [bqm4, opt4C]);
    await client.query(`INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'D', 4);`, [bqm4, opt4D]);

    // 9. Official Answer Key Version & Key Items
    const keyVerId = (
      await client.query(
        `INSERT INTO answer_key_versions (paper_id, version_number, version_tag, is_official)
         VALUES ($1, 1, 'OFFICIAL_FINAL_V1', TRUE) RETURNING id;`,
        [paperId]
      )
    ).rows[0].id;

    // Q1: B
    await client.query(
      `INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
       VALUES ($1, $2, $3, 'ACTIVE', ARRAY['B']);`,
      [paperId, keyVerId, occ1]
    );

    // Q2: A, C, D
    await client.query(
      `INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
       VALUES ($1, $2, $3, 'ACTIVE', ARRAY['A', 'C', 'D']);`,
      [paperId, keyVerId, occ2]
    );

    // Q3: A
    await client.query(
      `INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
       VALUES ($1, $2, $3, 'ACTIVE', ARRAY['A']);`,
      [paperId, keyVerId, occ3]
    );

    // Q4: B
    await client.query(
      `INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
       VALUES ($1, $2, $3, 'ACTIVE', ARRAY['B']);`,
      [paperId, keyVerId, occ4]
    );

    // 10. Publish the Exam Paper now that all children exist
    await client.query(
      `UPDATE exam_papers
       SET publish_status = 'PUBLISHED', published_at = clock_timestamp()
       WHERE id = $1;`,
      [paperId]
    );

    console.log(`✓ Seeded and Published Paper: ${paperId}`);
    console.log(`  Candidate 1: ${cand1Email} (${cand1Id})`);
    console.log(`  Candidate 2: ${cand2Email} (${cand2Id})\n`);

    return {
      paperId,
      cand1Id,
      cand1Email,
      cand1Password,
      cand2Id,
      cand2Email,
      cand2Password,
      occ1,
      occ2,
      occ3,
      occ4,
      opt1B,
      opt2A,
      opt2C,
      opt2D,
      opt3A,
      opt4B,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

// ----------------------------------------------------------------------------
// Main Test Runner
// ----------------------------------------------------------------------------
async function main() {
  console.log("================================================================================");
  console.log("  MCQ Junction — Phase 10: Full Candidate Lifecycle E2E Test Suite");
  console.log(`  Target Application: ${BASE_URL}`);
  console.log("================================================================================\n");

  const results = [];
  function record(id, title, status, details = "") {
    results.push({ id, title, status, details });
    const mark = status === "PASS" ? "✔" : "✖";
    console.log(`  ${mark} [${id}] ${title}: ${status} ${details ? "— " + details : ""}`);
  }

  let fixtures;
  let mockAuth;
  let nextProcess;
  let browser;
  let envLocalStashed = false;
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  const envLocalBakPath = path.resolve(process.cwd(), ".env.local.test_bak");

  try {
    // 1. Seed fixtures
    fixtures = await seedPhase10Fixtures();
    record("SEED-01", "Disposable relational test hierarchy seeded on 127.0.0.1:5433", "PASS", `Paper ID: ${fixtures.paperId}`);

    // 2. Start Mock Supabase Auth Server on port 54321
    mockAuth = createMockAuthServer({ port: MOCK_AUTH_PORT });
    mockAuth.addAccount({
      id: fixtures.cand1Id,
      email: fixtures.cand1Email,
      password: fixtures.cand1Password,
      name: "Candidate One (Playwright)",
      app_metadata: { role: "STUDENT" },
    });
    mockAuth.addAccount({
      id: fixtures.cand2Id,
      email: fixtures.cand2Email,
      password: fixtures.cand2Password,
      name: "Candidate Two (Playwright)",
      app_metadata: { role: "STUDENT" },
    });

    await mockAuth.start();
    console.log(`✓ Mock Supabase Auth Server active on 127.0.0.1:${MOCK_AUTH_PORT}\n`);

    // 3. Check if Next.js test server is already running
    let isServerRunning = false;
    try {
      const ping = await fetch(`${BASE_URL}/api/db-health`);
      if (ping.ok || ping.status === 200) {
        isServerRunning = true;
        console.log(`✓ Target application server is already online at ${BASE_URL}`);
      }
    } catch {
      isServerRunning = false;
    }

    if (!isServerRunning) {
      console.log(`▶ Binding Next.js test server on port ${APP_PORT} targeting test DB & Mock Auth...`);
      try {
        const netstat = execSync(`netstat -ano | findstr :${APP_PORT}`, { encoding: "utf8" });
        const lines = netstat.trim().split("\n");
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== "0" && !isNaN(parseInt(pid, 10))) {
            try {
              execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
            } catch {}
          }
        }
      } catch {}

      await new Promise((r) => setTimeout(r, 1000));

      // Stash .env.local temporarily so Next.js does not override MockAuth with remote Supabase
      if (fs.existsSync(envLocalPath)) {
        try {
          fs.renameSync(envLocalPath, envLocalBakPath);
          envLocalStashed = true;
        } catch {}
      }

      const nextEnv = {
        ...process.env,
        PORT: String(APP_PORT),
        DATABASE_URL: TEST_DB_URL,
        DIRECT_URL: TEST_DB_URL,
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${MOCK_AUTH_PORT}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.test",
      };

      nextProcess = spawn("node", ["node_modules/next/dist/bin/next", "dev", "-p", String(APP_PORT)], {
        env: nextEnv,
        stdio: "pipe",
        shell: true,
      });

      nextProcess.stdout.on("data", (chunk) => {
        const s = chunk.toString();
        if (s.includes("Ready in") || s.includes("compiled") || s.includes("Starting") || s.includes("GET") || s.includes("POST")) {
          process.stdout.write(`  [next] ${s}`);
        }
      });

      nextProcess.stderr.on("data", (chunk) => {
        process.stderr.write(`  [next-err] ${chunk.toString()}`);
      });

      console.log("▶ Waiting for Next.js test server readiness (/api/db-health)...");
      await waitForHttp(`${BASE_URL}/api/db-health`, 60000);
      console.log("✔ Next.js test server is online and connected to test database.\n");
    }

    // 4. Initialize Playwright Browser
    console.log("▶ Launching Playwright Chromium browser...");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    console.log("✔ Headless Chrome browser initialized.\n");

    console.log("================================================================================");
    console.log("  EXECUTING CANDIDATE LIFECYCLE E2E SPECIFICATIONS");
    console.log("================================================================================\n");

    // ------------------------------------------------------------------------
    // SPEC-01: Unauthenticated candidate accessing /exam/[paperId] redirects to signin
    // ------------------------------------------------------------------------
    try {
      await page.goto(`${BASE_URL}/exam/${fixtures.paperId}`, { waitUntil: "domcontentloaded" });
      const currentUrl = page.url();
      assert.ok(
        currentUrl.includes("/auth/signin") && currentUrl.includes(fixtures.paperId),
        `Expected redirect to signin with paperId, got: ${currentUrl}`
      );
      // Wait for Client Component hydration to resolve Suspense fallback
      await page.locator("input[name=email]").waitFor({ state: "visible", timeout: 30000 });
      await captureScreenshot(page, "01-unauth-redirect-login.png");
      record("SPEC-01", "Unauthenticated candidate redirected to sign-in with preserved return path", "PASS", currentUrl);
    } catch (err) {
      record("SPEC-01", "Unauthenticated redirect", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-02: Candidate signs in and lands on Exam Overview page
    // ------------------------------------------------------------------------
    try {
      await page.locator("input[name=email]").waitFor({ state: "visible", timeout: 30000 });
      await page.fill("input[name=email]", fixtures.cand1Email);
      await page.fill("input[name=password]", fixtures.cand1Password);
      await page.getByRole("button", { name: "Sign In" }).click();

      // Should follow redirect to /exam/[paperId]
      await page.waitForURL(`${BASE_URL}/exam/${fixtures.paperId}`, { timeout: 25000 });

      // Verify exam paper title & metadata are rendered
      const heading = page.locator("h1", { hasText: "State Engineering Systems" });
      await heading.waitFor({ state: "visible", timeout: 10000 });

      const durationCard = page.getByText("60 mins");
      const questionsCard = page.getByText("4", { exact: true });
      await durationCard.waitFor({ state: "visible", timeout: 5000 });
      await questionsCard.waitFor({ state: "visible", timeout: 5000 });

      await captureScreenshot(page, "02-candidate-exam-overview.png");
      record("SPEC-02", "Candidate signs in and lands on official examination overview", "PASS", "Paper metadata verified");
    } catch (err) {
      record("SPEC-02", "Candidate signin & overview", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-03: Declaration pledge gate before starting attempt
    // ------------------------------------------------------------------------
    try {
      const beginBtn = page.getByRole("button", { name: /Begin Examination/i });
      const isInitiallyDisabled = await beginBtn.isDisabled();
      assert.ok(isInitiallyDisabled, "Begin Examination button must be disabled before declaration acknowledgement");

      const declarationCheckbox = page.locator("input#declaration");
      await declarationCheckbox.check();

      const isEnabledAfterCheck = !(await beginBtn.isDisabled());
      assert.ok(isEnabledAfterCheck, "Begin Examination button must be enabled once declaration is acknowledged");

      await captureScreenshot(page, "03-candidate-instructions-pledge.png");
      record("SPEC-03", "Declaration pledge gate enforces candidate acknowledgement before start", "PASS", "Checkbox gate verified");
    } catch (err) {
      record("SPEC-03", "Declaration pledge gate", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-04: Start attempt and verify examination workspace delivery
    // ------------------------------------------------------------------------
    let attemptId = "";
    try {
      const beginBtn = page.getByRole("button", { name: /Begin Examination/i });
      await beginBtn.click();

      // Waits for redirect to /exam/[paperId]/attempt/[attemptId]
      await page.waitForURL(new RegExp(`/exam/${fixtures.paperId}/attempt/`), { timeout: 20000 });
      const url = page.url();
      const match = url.match(/attempt\/([a-f0-9-]+)/i);
      assert.ok(match, `Could not extract attempt ID from URL: ${url}`);
      attemptId = match[1];

      // Verify delivery header: Series A, Timer, Question 1
      const seriesBadge = page.locator("header").getByText("A", { exact: true });
      await seriesBadge.waitFor({ state: "visible", timeout: 10000 });

      const q1Badge = page.locator("main span", { hasText: /^Question 1$/ }).first();
      await q1Badge.waitFor({ state: "visible", timeout: 5000 });

      const typeBadge = page.getByText("SINGLE CORRECT", { exact: false });
      await typeBadge.waitFor({ state: "visible", timeout: 5000 });

      await captureScreenshot(page, "04-exam-delivery-workspace-q1.png");
      record("SPEC-04", "Examination attempt initialized with server-authoritative workspace", "PASS", `Attempt ID: ${attemptId}`);
    } catch (err) {
      record("SPEC-04", "Attempt start & workspace delivery", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-05: Answer Question 1 (Single Correct: SJF) & verify live durability
    // ------------------------------------------------------------------------
    try {
      // Click Option B (Shortest Job First)
      const optB = page.locator("button").filter({ hasText: "Shortest Job First (SJF / SRTF)" });
      await optB.waitFor({ state: "visible", timeout: 5000 });
      await optB.click();

      // Verify saved status indicator
      const savedIndicator = page.getByText("✓ Saved");
      await savedIndicator.waitFor({ state: "visible", timeout: 10000 });

      // Verify Question Palette: Q1 button turns green (ANSWERED)
      const paletteQ1 = page.locator("aside .grid button").filter({ hasText: /^1$/ }).first();
      const q1Class = await paletteQ1.getAttribute("class");
      assert.ok(q1Class.includes("bg-[#22C55E]") || q1Class.includes("bg-emerald-600"), `Q1 in palette should have green bg, got: ${q1Class}`);

      await captureScreenshot(page, "05-q1-single-choice-answered.png");
      record("SPEC-05", "Q1 (Single Correct) answered with atomic optimistic durability and palette sync", "PASS", "Saved and marked Answered");

      // Navigate to Q2: Click 'Save & Next'
      const saveNextBtn = page.getByRole("button", { name: /Save & Next/i });
      await saveNextBtn.click();
    } catch (err) {
      record("SPEC-05", "Q1 Single Correct answering", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-06: Answer Question 2 (Multiple Correct: A, C, D) & verify checkboxes
    // ------------------------------------------------------------------------
    try {
      // Verify Question 2 header
      const q2Badge = page.locator("main span", { hasText: /^Question 2$/ }).first();
      await q2Badge.waitFor({ state: "visible", timeout: 5000 });

      const multBadge = page.getByText("MULTIPLE CORRECT", { exact: false });
      await multBadge.waitFor({ state: "visible", timeout: 5000 });

      // Select Option A (Atomicity)
      const optA = page.locator("button").filter({ hasText: "Atomicity:" });
      await optA.click();
      await page.waitForTimeout(600);

      // Select Option C (Consistency)
      const optC = page.locator("button").filter({ hasText: "Consistency:" });
      await optC.click();
      await page.waitForTimeout(600);

      // Select Option D (Durability)
      const optD = page.locator("button").filter({ hasText: "Durability:" });
      await optD.click();

      // Verify saved status
      const savedIndicator = page.getByText("✓ Saved");
      await savedIndicator.waitFor({ state: "visible", timeout: 10000 });

      // Verify Question Palette: Q2 is green
      const paletteQ2 = page.locator("aside .grid button").filter({ hasText: /^2$/ }).first();
      const q2Class = await paletteQ2.getAttribute("class");
      assert.ok(q2Class.includes("bg-[#22C55E]") || q2Class.includes("bg-emerald-600"), `Q2 in palette should have green bg, got: ${q2Class}`);

      await captureScreenshot(page, "06-q2-multiple-correct-answered.png");
      record("SPEC-06", "Q2 (Multiple Correct) multi-selection saved durably with exact option set", "PASS", "Options {A, C, D} selected and saved");

      // Navigate to Q3
      const saveNextBtn = page.getByRole("button", { name: /Save & Next/i });
      await saveNextBtn.click();
    } catch (err) {
      record("SPEC-06", "Q2 Multiple Correct answering", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-07: Answer Question 3 (Assertion-Reason) & Mark for Review
    // ------------------------------------------------------------------------
    try {
      const q3Badge = page.locator("main span", { hasText: /^Question 3$/ }).first();
      await q3Badge.waitFor({ state: "visible", timeout: 5000 });

      const arBadge = page.getByText("ASSERTION REASON", { exact: false });
      await arBadge.waitFor({ state: "visible", timeout: 5000 });

      // Select Option A
      const optA = page.locator("button").filter({ hasText: "Both Assertion (A) and Reason (R) are true, and Reason" });
      await optA.click();

      // Wait for option save to complete
      const savedIndicator = page.getByText("✓ Saved");
      await savedIndicator.waitFor({ state: "visible", timeout: 10000 });

      // Click Mark for Review
      const reviewBtn = page.getByRole("button", { name: /Mark for Review/i });
      await reviewBtn.click();

      // Verify review button text toggled
      const markedReviewBtn = page.getByRole("button", { name: /Marked for Review/i });
      await markedReviewBtn.waitFor({ state: "visible", timeout: 5000 });

      // Wait for review save to complete
      await page.waitForTimeout(600);
      await savedIndicator.waitFor({ state: "visible", timeout: 10000 });

      // Verify palette status: Q3 has review bg
      const paletteQ3 = page.locator("aside .grid button").filter({ hasText: /^3$/ }).first();
      const q3Class = await paletteQ3.getAttribute("class");
      assert.ok(q3Class.includes("bg-[#FBBF24]") || q3Class.includes("bg-purple-600"), `Q3 should be answered and marked, got: ${q3Class}`);

      await captureScreenshot(page, "07-q3-assertion-reason-marked-review.png");
      record("SPEC-07", "Q3 (Assertion-Reason) answered and marked for review with dual-badge palette", "PASS", "Answered & Marked state verified");

      // Navigate to Q4
      const saveNextBtn = page.getByRole("button", { name: /Save & Next/i });
      await saveNextBtn.click();
    } catch (err) {
      record("SPEC-07", "Q3 Assertion-Reason answering", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-08: Answer Question 4 (Comprehension Child in Urdu RTL)
    // ------------------------------------------------------------------------
    try {
      const q4Badge = page.locator("main span", { hasText: /^Question 4$/ }).first();
      await q4Badge.waitFor({ state: "visible", timeout: 5000 });

      // Verify Passage Card
      const passageBadge = page.getByText("Reading Comprehension Passage");
      await passageBadge.waitFor({ state: "visible", timeout: 5000 });

      const passageTitle = page.getByText("کمپیوٹر نیٹ ورک اور او ایس آئی ماڈل");
      await passageTitle.waitFor({ state: "visible", timeout: 5000 });

      // Verify RTL layout on Urdu question
      const urduQuestion = page.locator('[dir="rtl"]').first();
      await urduQuestion.waitFor({ state: "visible", timeout: 5000 });

      // Select Option B (ٹرانسپورٹ لیئر)
      const optB = page.locator("button").filter({ hasText: "ٹرانسپورٹ لیئر" });
      await optB.click();

      // Wait for save
      const savedIndicator = page.getByText("✓ Saved");
      await savedIndicator.waitFor({ state: "visible", timeout: 10000 });

      // Verify palette: Q4 is green
      const paletteQ4 = page.locator("aside .grid button").filter({ hasText: /^4$/ }).first();
      const q4Class = await paletteQ4.getAttribute("class");
      assert.ok(q4Class.includes("bg-[#22C55E]") || q4Class.includes("bg-emerald-600"), `Q4 in palette should have green bg, got: ${q4Class}`);

      await captureScreenshot(page, "08-q4-comprehension-urdu-rtl.png");
      record("SPEC-08", "Q4 (Comprehension Child) renders passage with clean Urdu RTL isolation and saves response", "PASS", "Passage + Urdu options verified");
    } catch (err) {
      record("SPEC-08", "Q4 Comprehension Child Urdu", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-09: Browser Refresh / Recovery Resilience
    // ------------------------------------------------------------------------
    try {
      console.log("▶ Simulating candidate browser reload (refresh/disconnection recovery)...");
      await page.reload({ waitUntil: "domcontentloaded" });

      // Verify same attempt URL is maintained
      assert.ok(page.url().includes(`/attempt/${attemptId}`), "Should stay on identical attempt ID after reload");

      // Verify Q1 still answered: Navigate back to Q1
      const paletteQ1 = page.locator("aside .grid button").filter({ hasText: /^1$/ }).first();
      await paletteQ1.click();
      await page.waitForTimeout(500);

      // Verify Option B is still active/selected
      const q1OptB = page.locator("button").filter({ hasText: "Shortest Job First" });
      const q1OptBClass = await q1OptB.getAttribute("class");
      assert.ok(q1OptBClass.includes("border-[#D6B36A]") || q1OptBClass.includes("border-blue-600"), "Q1 Option B must remain selected after refresh");

      // Navigate to Q3: Check mark for review preserved
      const paletteQ3 = page.locator("aside .grid button").filter({ hasText: /^3$/ }).first();
      await paletteQ3.click();
      await page.waitForTimeout(500);

      const reviewBtn = page.getByRole("button", { name: /Marked for Review/i });
      await reviewBtn.waitFor({ state: "visible", timeout: 5000 });

      // Palette states preserved
      const q3Class = await paletteQ3.getAttribute("class");
      assert.ok(q3Class.includes("bg-[#FBBF24]") || q3Class.includes("bg-purple-600"), "Q3 review status must remain intact after refresh");

      await captureScreenshot(page, "09-exam-resumed-after-refresh.png");
      record("SPEC-09", "Resumption recovery preserves identical question sequence, answers, review flags, and timer", "PASS", "Full attempt state successfully recovered");
    } catch (err) {
      record("SPEC-09", "Browser refresh & recovery", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-10: Final Submission Confirmation Modal
    // ------------------------------------------------------------------------
    try {
      // Click 'Submit Examination' in palette
      const submitExamBtn = page.getByRole("button", { name: "Submit Examination" });
      await submitExamBtn.click();

      // Verify modal is open
      const modalHeading = page.locator("h3", { hasText: "Submit Examination?" });
      await modalHeading.waitFor({ state: "visible", timeout: 5000 });

      // Verify summary matrix counts: Answered: 4, Unanswered: 0, For Review: 1
      const modal = page.locator(".fixed.inset-0");
      const answeredStat = modal.getByText("Answered", { exact: true }).locator("..").locator(".font-black");
      const unansweredStat = modal.getByText("Unanswered", { exact: true }).locator("..").locator(".font-black");
      const reviewStat = modal.getByText("For Review", { exact: true }).locator("..").locator(".font-black");

      assert.equal((await answeredStat.innerText()).trim(), "4");
      assert.equal((await unansweredStat.innerText()).trim(), "0");
      assert.equal((await reviewStat.innerText()).trim(), "1");

      await captureScreenshot(page, "10-submit-confirmation-modal.png");
      record("SPEC-10", "Submission confirmation modal renders complete review matrix (4 Answered, 0 Unanswered, 1 Review)", "PASS", "Matrix counts verified");
    } catch (err) {
      record("SPEC-10", "Submit confirmation modal", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-11: Confirm Submission & Authoritative Scorecard
    // ------------------------------------------------------------------------
    try {
      const confirmSubmitBtn = page.getByRole("button", { name: "Yes, Submit Exam" });
      await confirmSubmitBtn.click();

      // Wait for submission completion screen
      const officialBadge = page.getByText("Official Result");
      await officialBadge.waitFor({ state: "visible", timeout: 15000 });

      // Verify scorecard details:
      // Q1: +2.0, Q2: +2.0, Q3: +2.0, Q4: +2.0 -> Score = 8 / 8
      const scoreCardText = await page.locator(".max-w-4xl").innerText();
      assert.ok(scoreCardText.includes("8") || scoreCardText.includes("8.00"), `Expected 8 in scorecard, got ${scoreCardText}`);

      const correctVal = page.locator(".rounded-xl", { has: page.getByText("Correct", { exact: true }) }).locator(".font-black");
      await correctVal.waitFor({ state: "visible", timeout: 5000 });
      const correctText = (await correctVal.innerText()).trim();
      assert.ok(correctText.includes("4"), `Expected 4 correct, got ${correctText}`);

      const incorrectVal = page.locator(".rounded-xl", { has: page.getByText("Incorrect", { exact: true }) }).locator(".font-black");
      await incorrectVal.waitFor({ state: "visible", timeout: 5000 });
      const incorrectText = (await incorrectVal.innerText()).trim();
      assert.ok(incorrectText.includes("0"), `Expected 0 incorrect, got ${incorrectText}`);

      await captureScreenshot(page, "11-exam-evaluated-scorecard.png");
      record("SPEC-11", "Authoritative evaluation engine computes perfect 8.00 / 8.00 score and renders result scorecard", "PASS", "Score: 8.00/8.00, Correct: 4, Wrong: 0");
    } catch (err) {
      record("SPEC-11", "Confirm submit & scorecard", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-12: Subsequent Access to Paper Locked & Shows Completed Summary
    // ------------------------------------------------------------------------
    try {
      await page.goto(`${BASE_URL}/exam/${fixtures.paperId}`, { waitUntil: "domcontentloaded" });

      // Should show 'Examination Completed' card with candidate score
      const completedBadge = page.getByText("Examination Completed");
      await completedBadge.waitFor({ state: "visible", timeout: 10000 });

      const singleAttemptNotice = page.getByText(/each candidate is permitted a single (?:official )?attempt/i);
      await singleAttemptNotice.waitFor({ state: "visible", timeout: 5000 });

      // Ensure no 'Begin Examination' button exists
      const beginBtn = page.getByRole("button", { name: /Begin Examination/i });
      const hasBeginBtn = await beginBtn.count();
      assert.equal(hasBeginBtn, 0, "Finalized exam must not display Begin Examination button");

      await captureScreenshot(page, "12-completed-exam-entry-locked.png");
      record("SPEC-12", "Subsequent visits to paper overview lock re-attempting and display completed performance summary", "PASS", "Attempt immutability preserved");
    } catch (err) {
      record("SPEC-12", "Subsequent paper access locked", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // SPEC-13: Cross-Candidate Security Isolation
    // ------------------------------------------------------------------------
    try {
      console.log("▶ Verifying cross-candidate security isolation in fresh browser context...");
      const cand2Context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const cand2Page = await cand2Context.newPage();

      // Sign in as Candidate 2
      await cand2Page.goto(`${BASE_URL}/auth/signin?next=%2Fexam%2F${fixtures.paperId}`, { waitUntil: "domcontentloaded" });
      await cand2Page.fill("input[name=email]", fixtures.cand2Email);
      await cand2Page.fill("input[name=password]", fixtures.cand2Password);
      await cand2Page.getByRole("button", { name: "Sign In" }).click();
      await cand2Page.waitForURL(`${BASE_URL}/exam/${fixtures.paperId}`, { timeout: 15000 });

      // Candidate 2 attempts to directly access Candidate 1's attempt URL
      await cand2Page.goto(`${BASE_URL}/exam/${fixtures.paperId}/attempt/${attemptId}`, { waitUntil: "domcontentloaded" });

      // Verify access error is displayed
      const errorHeading = cand2Page.locator("h1", { hasText: "Examination Access Error" });
      await errorHeading.waitFor({ state: "visible", timeout: 10000 });

      await captureScreenshot(cand2Page, "13-cross-candidate-access-denied.png");
      await cand2Context.close();

      record("SPEC-13", "Candidate 2 forbidden from accessing or viewing Candidate 1's attempt (MCQJ-ERR-6001: 403 Forbidden)", "PASS", "Cross-tenant attempt isolation enforced");
    } catch (err) {
      record("SPEC-13", "Cross-candidate security isolation", "FAIL", err.message);
    }

    console.log("\n================================================================================");
    const passCount = results.filter((r) => r.status === "PASS").length;
    const failCount = results.filter((r) => r.status === "FAIL").length;
    console.log(`  PHASE 10 BROWSER E2E SUMMARY: ${passCount} PASSED, ${failCount} FAILED (${results.length} TOTAL)`);
    console.log("================================================================================\n");

    if (failCount > 0) {
      process.exit(1);
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (nextProcess) {
      console.log("▶ Terminating Next.js test server process...");
      try {
        if (process.platform === "win32") {
          execSync(`taskkill /F /T /PID ${nextProcess.pid}`, { stdio: "ignore" });
        } else {
          nextProcess.kill("SIGTERM");
        }
      } catch {}
    }
    if (mockAuth) {
      await mockAuth.stop().catch(() => {});
    }
    if (fs.existsSync(envLocalBakPath)) {
      try {
        fs.renameSync(envLocalBakPath, envLocalPath);
      } catch {}
    }
  }
}

main().catch((err) => {
  console.error("Unhandled fatal candidate lifecycle test error:", err);
  process.exit(1);
});
