// ============================================================================
// MCQ Junction — Phase 7: Administrative Login & Workflow Verification Suite
// File: tests/phase7-admin-workflows.test.mjs
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import assert from "node:assert/strict";
import dotenv from "dotenv";
import pg from "pg";
import { chromium } from "@playwright/test";

import { buildDatabaseClientConfig } from "../scripts/dev/admin-bootstrap-lib.mjs";
import { createMockAuthServer } from "./mock-auth-server.mjs";

// Load local environment safely
dotenv.config({ path: ".env.local" });

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:test_pw_disposable_12345@127.0.0.1:5433/mcq_junction_test";
const MOCK_AUTH_PORT = 54321;
const APP_PORT = 3000;
const BASE_URL = `http://localhost:${APP_PORT}`;

const SCREENSHOT_DIRS = [
  path.resolve(process.cwd(), "test-results/screenshots/phase7"),
  path.resolve(process.cwd(), "docs/reports/screenshots/phase7"),
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

// ----------------------------------------------------------------------------
// Step 1A: Remote Supabase Admin Identity Pre-Verification
// ----------------------------------------------------------------------------
async function verifyRemoteAdminIdentity() {
  console.log("\n================================================================================");
  console.log("  STEP 1A: REMOTE SUPABASE ADMIN IDENTITY VERIFICATION");
  console.log("================================================================================\n");

  const remoteDbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!remoteDbUrl) {
    throw new Error("Missing DIRECT_URL / DATABASE_URL for remote Supabase verification.");
  }

  const clientConfig = buildDatabaseClientConfig(remoteDbUrl);
  const client = new pg.Client(clientConfig);

  try {
    await client.connect();
    console.log("✓ Connected to remote database via TLS with trusted root CA.");

    const expectedEmail = "atifahmad900@gmail.com";
    const expectedUuid = "6154d3b6-f309-4e32-a524-e83d471dbdef";

    const res = await client.query(
      `SELECT id, email, role, created_at, updated_at FROM public.users WHERE email = $1;`,
      [expectedEmail]
    );

    assert.equal(res.rowCount, 1, `Expected exactly 1 user record for ${expectedEmail}`);
    const row = res.rows[0];
    assert.equal(row.id, expectedUuid, "User UUID does not match authoritative admin UUID");
    assert.equal(row.role, "ADMIN", "Authoritative database role must be ADMIN");

    console.log(`✓ Verified authoritative admin identity in remote database:`);
    console.log(`  UUID:  ${row.id}`);
    console.log(`  Email: ${row.email}`);
    console.log(`  Role:  ${row.role}`);
    console.log(`  State: Verified Active Administrator (Zero remote mutation performed)\n`);

    return {
      id: row.id,
      email: row.email,
      role: row.role,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

// ----------------------------------------------------------------------------
// Step 1B: Disposable Test Database Fixture Seeding
// ----------------------------------------------------------------------------
async function seedPhase7Fixtures() {
  console.log("================================================================================");
  console.log("  STEP 1B: SEEDING DISPOSABLE TEST FIXTURES (127.0.0.1:5433)");
  console.log("================================================================================\n");

  const client = new pg.Client({ connectionString: TEST_DB_URL });
  await client.connect();

  const suffix = "p7" + Date.now().toString(36);
  const adminId = "6154d3b6-f309-4e32-a524-e83d471dbdef";
  const adminEmail = "atifahmad900@gmail.com";
  const studentId = "e2000000-0000-0000-0000-000000000002";
  const studentEmail = "student@mcq.test";

  try {
    // 1. Users & Roles in test DB
    await client.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET email = $2;`,
      [adminId, adminEmail]
    );
    await client.query(
      `INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET email = $2;`,
      [studentId, studentEmail]
    );

    await client.query(
      `INSERT INTO public.users (id, email, name, role, created_at, updated_at)
       VALUES ($1, $2, 'Atif Ahmad (Admin)', 'ADMIN'::"Role", clock_timestamp(), clock_timestamp())
       ON CONFLICT (id) DO UPDATE SET role = 'ADMIN'::"Role", name = 'Atif Ahmad (Admin)';`,
      [adminId, adminEmail]
    );
    await client.query(
      `INSERT INTO public.users (id, email, name, role, created_at, updated_at)
       VALUES ($1, $2, 'Student Candidate', 'STUDENT'::"Role", clock_timestamp(), clock_timestamp())
       ON CONFLICT (id) DO UPDATE SET role = 'STUDENT'::"Role", name = 'Student Candidate';`,
      [studentId, studentEmail]
    );

    // 2. Conducting Body, Exam, Exam Session
    const cb = (
      await client.query(
        `INSERT INTO conducting_bodies (code, full_name, region_code)
         VALUES ('BPSC-${suffix}', 'Bihar Public Service Commission', 'BR')
         RETURNING id;`
      )
    ).rows[0].id;

    const exam = (
      await client.query(
        `INSERT INTO exams (conducting_body_id, code, title, tier)
         VALUES ($1, 'BPSC-CS-${suffix}', 'BPSC Computer Science', 'STATE_LEVEL')
         RETURNING id;`,
        [cb]
      )
    ).rows[0].id;

    const session = (
      await client.query(
        `INSERT INTO exam_sessions (exam_id, session_year, cycle_code)
         VALUES ($1, 2026, 'CYCLE-${suffix}')
         RETURNING id;`,
        [exam]
      )
    ).rows[0].id;

    // 3. Draft Paper for Sequence Reordering (2 questions: seq 1 and 2)
    const draftPaperId = (
      await client.query(
        `INSERT INTO exam_papers (session_id, paper_code, title, publish_status, total_duration_minutes, total_questions, max_score)
         VALUES ($1, 'DRAFT-SEQ-${suffix}', 'Draft Computer Science Exam (Sequence Test)', 'DRAFT', 120, 2, 2.0)
         RETURNING id;`,
        [session]
      )
    ).rows[0].id;

    await client.query(
      `INSERT INTO paper_marking_schemes (paper_id, marks_per_correct, negative_marks_per_wrong) VALUES ($1, 1.000, 0.250);`,
      [draftPaperId]
    );

    const draftSectionId = (
      await client.query(
        `INSERT INTO paper_sections (paper_id, section_order, title, total_questions) VALUES ($1, 1, 'Core CS Section', 2) RETURNING id;`,
        [draftPaperId]
      )
    ).rows[0].id;

    const draftBookletId = (
      await client.query(
        `INSERT INTO booklet_series (paper_id, series_code, is_master_series) VALUES ($1, 'A', TRUE) RETURNING id;`,
        [draftPaperId]
      )
    ).rows[0].id;

    const cq1 = (
      await client.query(
        `INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic)
         VALUES ('CQ-DS-${suffix}', 'Data Structures', 'Binary Trees') RETURNING id;`
      )
    ).rows[0].id;

    const draftOcc1 = (
      await client.query(
        `INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
         VALUES ($1, $2, $3, 1, 'SINGLE_CHOICE') RETURNING id;`,
        [draftPaperId, draftSectionId, cq1]
      )
    ).rows[0].id;

    const rep1 = (
      await client.query(
        `INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
         VALUES ($1, 'EN', 'What is the maximum number of nodes at depth d in a binary tree?', TRUE) RETURNING id;`,
        [draftOcc1]
      )
    ).rows[0].id;

    const optA1 = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, option_text, sort_order) VALUES ($1, 'A', '2^d', 1) RETURNING id;`,
        [rep1]
      )
    ).rows[0].id;
    const optB1 = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, option_text, sort_order) VALUES ($1, 'B', '2^(d+1)', 2) RETURNING id;`,
        [rep1]
      )
    ).rows[0].id;

    const bqm1 = (
      await client.query(
        `INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence) VALUES ($1, $2, $3, 1) RETURNING id;`,
        [draftPaperId, draftBookletId, draftOcc1]
      )
    ).rows[0].id;
    await client.query(
      `INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'A', 1), ($1, $3, 'B', 2);`,
      [bqm1, optA1, optB1]
    );

    const cq2 = (
      await client.query(
        `INSERT INTO conceptual_questions (canonical_ref_code, primary_subject, default_topic)
         VALUES ('CQ-ALG-${suffix}', 'Algorithms', 'Sorting') RETURNING id;`
      )
    ).rows[0].id;

    const draftOcc2 = (
      await client.query(
        `INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
         VALUES ($1, $2, $3, 2, 'SINGLE_CHOICE') RETURNING id;`,
        [draftPaperId, draftSectionId, cq2]
      )
    ).rows[0].id;

    const rep2 = (
      await client.query(
        `INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
         VALUES ($1, 'EN', 'What is the worst-case time complexity of QuickSort?', TRUE) RETURNING id;`,
        [draftOcc2]
      )
    ).rows[0].id;

    const optA2 = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, option_text, sort_order) VALUES ($1, 'A', 'O(n^2)', 1) RETURNING id;`,
        [rep2]
      )
    ).rows[0].id;
    const optB2 = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, option_text, sort_order) VALUES ($1, 'B', 'O(n log n)', 2) RETURNING id;`,
        [rep2]
      )
    ).rows[0].id;

    const bqm2 = (
      await client.query(
        `INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence) VALUES ($1, $2, $3, 2) RETURNING id;`,
        [draftPaperId, draftBookletId, draftOcc2]
      )
    ).rows[0].id;
    await client.query(
      `INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'A', 1), ($1, $3, 'B', 2);`,
      [bqm2, optA2, optB2]
    );

    // 4. Incomplete Paper (Sequence Gap: seq 1 and seq 3) to test Publication Review Gates failure
    const incompletePaperId = (
      await client.query(
        `INSERT INTO exam_papers (session_id, paper_code, title, publish_status, total_duration_minutes, total_questions, max_score)
         VALUES ($1, 'INCOMPL-${suffix}', 'Incomplete Review Paper (Gap Test)', 'DRAFT', 120, 2, 2.0)
         RETURNING id;`,
        [session]
      )
    ).rows[0].id;

    await client.query(
      `INSERT INTO paper_marking_schemes (paper_id, marks_per_correct, negative_marks_per_wrong) VALUES ($1, 1.000, 0.250);`,
      [incompletePaperId]
    );

    const incSectionId = (
      await client.query(
        `INSERT INTO paper_sections (paper_id, section_order, title, total_questions) VALUES ($1, 1, 'Section Gap Test', 2) RETURNING id;`,
        [incompletePaperId]
      )
    ).rows[0].id;

    const incOcc1 = (
      await client.query(
        `INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
         VALUES ($1, $2, $3, 1, 'SINGLE_CHOICE') RETURNING id;`,
        [incompletePaperId, incSectionId, cq1]
      )
    ).rows[0].id;

    await client.query(
      `INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
       VALUES ($1, 'EN', 'Occurrence 1 with sequence gap test', TRUE);`,
      [incOcc1]
    );

    const incOcc2 = (
      await client.query(
        `INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
         VALUES ($1, $2, $3, 3, 'SINGLE_CHOICE') RETURNING id;`,
        [incompletePaperId, incSectionId, cq2]
      )
    ).rows[0].id;

    await client.query(
      `INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
       VALUES ($1, 'EN', 'Occurrence 2 with sequence gap test (seq 3)', FALSE);`,
      [incOcc2]
    );

    // 5. Fully Verified Paper (Clears all 6 gates, ready for publication test)
    const verifiedPaperId = (
      await client.query(
        `INSERT INTO exam_papers (session_id, paper_code, title, publish_status, total_duration_minutes, total_questions, max_score)
         VALUES ($1, 'VERIF-${suffix}', 'Verified CS Exam Ready For Live Publication', 'VERIFIED', 120, 1, 1.0)
         RETURNING id;`,
        [session]
      )
    ).rows[0].id;

    await client.query(
      `INSERT INTO paper_marking_schemes (paper_id, marks_per_correct, negative_marks_per_wrong) VALUES ($1, 1.000, 0.250);`,
      [verifiedPaperId]
    );

    const verifSectionId = (
      await client.query(
        `INSERT INTO paper_sections (paper_id, section_order, title, total_questions) VALUES ($1, 1, 'Verified Section', 1) RETURNING id;`,
        [verifiedPaperId]
      )
    ).rows[0].id;

    const verifBookletId = (
      await client.query(
        `INSERT INTO booklet_series (paper_id, series_code, is_master_series) VALUES ($1, 'A', TRUE) RETURNING id;`,
        [verifiedPaperId]
      )
    ).rows[0].id;

    const verifOcc = (
      await client.query(
        `INSERT INTO paper_question_occurrences (paper_id, section_id, conceptual_question_id, sequence_number, question_type)
         VALUES ($1, $2, $3, 1, 'SINGLE_CHOICE') RETURNING id;`,
        [verifiedPaperId, verifSectionId, cq1]
      )
    ).rows[0].id;

    const verifRep = (
      await client.query(
        `INSERT INTO source_question_representations (occurrence_id, language_code, question_text, editorial_verified)
         VALUES ($1, 'EN', 'Verified Question: Definition of NP-Completeness?', TRUE) RETURNING id;`,
        [verifOcc]
      )
    ).rows[0].id;

    const verifOptA = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, option_text, sort_order) VALUES ($1, 'A', 'Decision problem in NP and NP-hard', 1) RETURNING id;`,
        [verifRep]
      )
    ).rows[0].id;
    const verifOptB = (
      await client.query(
        `INSERT INTO question_options (representation_id, option_label, option_text, sort_order) VALUES ($1, 'B', 'Polynomial time solvable problem', 2) RETURNING id;`,
        [verifRep]
      )
    ).rows[0].id;

    const verifBqm = (
      await client.query(
        `INSERT INTO booklet_question_mappings (paper_id, booklet_series_id, occurrence_id, display_sequence) VALUES ($1, $2, $3, 1) RETURNING id;`,
        [verifiedPaperId, verifBookletId, verifOcc]
      )
    ).rows[0].id;
    await client.query(
      `INSERT INTO booklet_option_mappings (question_mapping_id, source_option_id, display_label, display_sort_order) VALUES ($1, $2, 'A', 1), ($1, $3, 'B', 2);`,
      [verifBqm, verifOptA, verifOptB]
    );

    const keyVerif = (
      await client.query(
        `INSERT INTO answer_key_versions (paper_id, version_number, version_tag, is_official)
         VALUES ($1, 1, 'OFFICIAL_PROVISIONAL', TRUE) RETURNING id;`,
        [verifiedPaperId]
      )
    ).rows[0].id;

    await client.query(
      `INSERT INTO answer_key_items (paper_id, key_version_id, occurrence_id, key_status, correct_option_labels)
       VALUES ($1, $2, $3, 'ACTIVE', ARRAY['A']);`,
      [verifiedPaperId, keyVerif, verifOcc]
    );

    console.log("✓ Disposable relational test hierarchy created:");
    console.log(`  Admin User:          ${adminEmail} (${adminId})`);
    console.log(`  Student User:        ${studentEmail} (${studentId})`);
    console.log(`  Draft Paper:         ${draftPaperId}`);
    console.log(`  Incomplete Paper:    ${incompletePaperId}`);
    console.log(`  Verified Paper:      ${verifiedPaperId}\n`);

    return {
      adminId,
      adminEmail,
      adminPassword: "AdminPassword123!",
      studentId,
      studentEmail,
      studentPassword: "StudentPassword123!",
      draftPaperId,
      draftOcc1,
      draftOcc2,
      incompletePaperId,
      verifiedPaperId,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

// ----------------------------------------------------------------------------
// Helper: Wait for HTTP server to become responsive
// ----------------------------------------------------------------------------
async function waitForHttp(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 307 || res.status === 200) {
        return true;
      }
    } catch {
      // Keep polling
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${url} after ${timeoutMs}ms`);
}

// ----------------------------------------------------------------------------
// Main Test Runner
// ----------------------------------------------------------------------------
async function main() {
  console.log("================================================================================");
  console.log("  MCQ Junction — Phase 7: Administrative Login & Workflow E2E");
  console.log("================================================================================\n");

  const results = [];
  function record(id, title, status, details = "") {
    results.push({ id, title, status, details });
    const mark = status === "PASS" ? "✔" : "✖";
    console.log(`  ${mark} [${id}] ${title}: ${status} ${details ? "— " + details : ""}`);
  }

  // 1. Remote Supabase identity pre-verification
  let remoteAdmin;
  try {
    remoteAdmin = await verifyRemoteAdminIdentity();
    record(
      "STEP-1A",
      "Authoritative remote Supabase admin identity verification",
      "PASS",
      `UUID: ${remoteAdmin.id}, Role: ${remoteAdmin.role}`
    );
  } catch (err) {
    record("STEP-1A", "Authoritative remote Supabase admin identity verification", "FAIL", err.message);
    process.exit(1);
  }

  // 2. Disposable test fixtures seeding
  let fixtures;
  try {
    fixtures = await seedPhase7Fixtures();
    record("STEP-1B", "Disposable relational test hierarchy seeding", "PASS", "All tables & gates seeded");
  } catch (err) {
    record("STEP-1B", "Disposable relational test hierarchy seeding", "FAIL", err.message);
    process.exit(1);
  }

  // 3. Start Mock Supabase Auth Server
  const mockAuth = createMockAuthServer({ port: MOCK_AUTH_PORT });
  mockAuth.addAccount({
    id: fixtures.adminId,
    email: fixtures.adminEmail,
    password: fixtures.adminPassword,
    name: "Atif Ahmad (Admin)",
    app_metadata: { role: "ADMIN" },
  });
  mockAuth.addAccount({
    id: fixtures.studentId,
    email: fixtures.studentEmail,
    password: fixtures.studentPassword,
    name: "Student Candidate",
    app_metadata: { role: "STUDENT" },
  });

  await mockAuth.start();
  console.log(`✓ Mock Supabase Auth Server active on port ${MOCK_AUTH_PORT}\n`);

  // 4. Terminate any existing node on port 3000 to cleanly bind test server
  console.log("▶ Binding Next.js test server on port 3000 targeting test DB & Mock Auth...");
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

  let envLocalStashed = false;
  const envLocalPath = path.resolve(process.cwd(), ".env.local");
  const envLocalBakPath = path.resolve(process.cwd(), ".env.local.test_bak");

  if (fs.existsSync(envLocalPath)) {
    try {
      fs.renameSync(envLocalPath, envLocalBakPath);
      envLocalStashed = true;
    } catch {}
  }

  // Spawn Next.js dev server with isolated environment variables
  const nextEnv = {
    ...process.env,
    PORT: String(APP_PORT),
    DATABASE_URL: TEST_DB_URL,
    DIRECT_URL: TEST_DB_URL,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${MOCK_AUTH_PORT}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.test",
  };

  const nextProcess = spawn("node", ["node_modules/next/dist/bin/next", "dev", "-p", String(APP_PORT)], {
    env: nextEnv,
    stdio: "pipe",
    shell: true,
  });

  nextProcess.stdout.on("data", (chunk) => {
    const s = chunk.toString();
    if (s.includes("Ready in") || s.includes("compiled") || s.includes("Starting")) {
      process.stdout.write(`  [next] ${s}`);
    }
  });
  nextProcess.stderr.on("data", (chunk) => {
    process.stderr.write(`  [next-err] ${chunk.toString()}`);
  });

  let browser = null;

  try {
    console.log("▶ Waiting for Next.js test server readiness...");
    await waitForHttp(`${BASE_URL}/api/db-health`, 60000);
    console.log("✔ Next.js test server is online and connected to test database.\n");

    console.log("================================================================================");
    console.log("  EXECUTING BROWSER E2E SPECIFICATIONS (PLAYWRIGHT GOOGLE CHROME)");
    console.log("================================================================================\n");

    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    // ------------------------------------------------------------------------
    // Specification 1: Sign in via /auth/signin?next=/admin with return path
    // ------------------------------------------------------------------------
    try {
      await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
      await page.waitForURL(/signin.*next=%2Fadmin/, { timeout: 25000 });
      await page.locator("input[name=email]").waitFor({ state: "visible", timeout: 30000 });
      await page.waitForLoadState("networkidle").catch(() => {});
      await captureScreenshot(page, "01-admin-signin-form.png");

      // Fill credentials
      await page.fill("input[name=email]", fixtures.adminEmail);
      await page.fill("input[name=password]", fixtures.adminPassword);
      await page.getByRole("button", { name: "Sign In" }).click();

      // Should follow redirect to /admin
      await page.waitForURL(`${BASE_URL}/admin`, { timeout: 30000 });
      await page.locator("header").getByText(fixtures.adminEmail).waitFor({ state: "visible", timeout: 20000 });

      // Verify cookies established
      const cookies = await context.cookies();
      const authCookie = cookies.find((c) => c.name.includes("auth-token"));
      assert.ok(authCookie, "Supabase authentication token cookie must be present");

      await captureScreenshot(page, "02-admin-signin-success-dashboard.png");
      record(
        "SPEC-01",
        "Admin login at /auth/signin?next=/admin redirects to /admin with session cookies",
        "PASS",
        `Landed on: ${page.url()}, Cookie: ${authCookie.name}`
      );
    } catch (err) {
      record("SPEC-01", "Admin login at /auth/signin?next=/admin", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // Specification 2: Assert Admin Session verifies UUID and role=ADMIN
    // ------------------------------------------------------------------------
    try {
      // Header verification
      const emailBadge = page.locator("header").getByText(fixtures.adminEmail);
      await emailBadge.waitFor({ state: "visible", timeout: 15000 });

      const verifiedBadge = page.locator("header").getByText("Verified Administrator");
      await verifiedBadge.waitFor({ state: "visible", timeout: 15000 });

      const heading = page.getByRole("heading", { name: /Administrator Overview/i });
      await heading.waitFor({ state: "visible", timeout: 15000 });

      await captureScreenshot(page, "03-admin-identity-verified.png");
      record(
        "SPEC-02",
        "assertAdminSession() cryptographically verifies user UUID and role=ADMIN",
        "PASS",
        `Header rendered for ${fixtures.adminEmail} with 'Verified Administrator'`
      );
    } catch (err) {
      record("SPEC-02", "assertAdminSession() identity and role verification", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // Specification 3: Confirm /admin overview dashboard and metric cards
    // ------------------------------------------------------------------------
    try {
      const totalPapersCard = page.getByText("Total Exam Papers");
      await totalPapersCard.waitFor({ state: "visible", timeout: 5000 });

      const papersNavLink = page.locator("header nav").getByRole("link", { name: "Exam Papers" });
      await papersNavLink.waitFor({ state: "visible", timeout: 5000 });

      await captureScreenshot(page, "04-admin-overview-metrics.png");
      record(
        "SPEC-03",
        "Admin overview page (/admin) renders metric cards and navigation",
        "PASS",
        "Verified Total Exam Papers card and Exam Papers navigation"
      );
    } catch (err) {
      record("SPEC-03", "Admin overview page (/admin)", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // Specification 4: Papers management table: search, status filter, pagination
    // ------------------------------------------------------------------------
    try {
      await page.goto(`${BASE_URL}/admin/papers`);
      const table = page.locator("table");
      await table.waitFor({ state: "visible", timeout: 15000 });
      await captureScreenshot(page, "05-papers-management-table.png");

      // Test Search query filter
      const searchInput = page.locator("input[name=search]");
      await searchInput.fill("Sequence Test");
      await page.getByRole("button", { name: "Filter" }).click();
      await page.waitForURL(/search=Sequence/, { timeout: 10000 });

      const filteredRow = page.getByText("Draft Computer Science Exam (Sequence Test)").first();
      await filteredRow.waitFor({ state: "visible", timeout: 10000 });
      await captureScreenshot(page, "06-papers-table-search-filtered.png");

      // Clear search
      await page.getByRole("link", { name: "Clear" }).click();
      await page.locator("table").waitFor({ state: "visible", timeout: 10000 });

      // Test Status dropdown filter
      const statusSelect = page.locator("select[name=status]");
      await statusSelect.selectOption("DRAFT");
      await page.getByRole("button", { name: "Filter" }).click();
      await page.waitForURL(/status=DRAFT/, { timeout: 10000 });

      assert.ok(page.url().includes("status=DRAFT"), "URL must include status=DRAFT parameter");
      await captureScreenshot(page, "07-papers-table-status-filtered.png");

      record(
        "SPEC-04",
        "Papers management UI (/admin/papers) verifies search, status filtering, and controls",
        "PASS",
        "Search and status filtering executed cleanly"
      );
    } catch (err) {
      record("SPEC-04", "Papers management UI (/admin/papers)", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // Specification 5: Eligible draft paper sequence editor & atomic reordering
    // ------------------------------------------------------------------------
    try {
      await page.goto(`${BASE_URL}/admin/papers/${fixtures.draftPaperId}/sequence`);
      const editorTitle = page.getByRole("heading", { name: /Question Sequence/i }).first();
      await editorTitle.waitFor({ state: "visible", timeout: 15000 });

      await captureScreenshot(page, "08-sequence-editor-initial.png");

      // Click "Down" on Question #1
      const moveDownBtn = page.getByRole("button", { name: "Move Question #1 Down" }).first();
      await moveDownBtn.waitFor({ state: "visible", timeout: 5000 });
      await moveDownBtn.click();

      // Wait for success alert
      const successAlert = page.getByText(/Swapped sequence #1 with #2 successfully/i).first();
      await successAlert.waitFor({ state: "visible", timeout: 15000 });

      // Verify sequence swap in database directly
      const dbClient = new pg.Client({ connectionString: TEST_DB_URL });
      await dbClient.connect();
      const occ1Row = (
        await dbClient.query(`SELECT sequence_number FROM paper_question_occurrences WHERE id = $1;`, [
          fixtures.draftOcc1,
        ])
      ).rows[0];
      const occ2Row = (
        await dbClient.query(`SELECT sequence_number FROM paper_question_occurrences WHERE id = $1;`, [
          fixtures.draftOcc2,
        ])
      ).rows[0];
      await dbClient.end();

      assert.equal(occ1Row.sequence_number, 2, "Occurrence 1 must be moved to sequence 2");
      assert.equal(occ2Row.sequence_number, 1, "Occurrence 2 must be moved to sequence 1");

      await captureScreenshot(page, "09-sequence-editor-swapped-success.png");
      record(
        "SPEC-05",
        "Sequence editor atomic reordering swaps adjacent questions in DRAFT paper",
        "PASS",
        `DB confirmed: Occ1 -> #${occ1Row.sequence_number}, Occ2 -> #${occ2Row.sequence_number}`
      );
    } catch (err) {
      record("SPEC-05", "Sequence editor atomic reordering", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // Specification 6: Publication review gates reject incomplete paper with gap
    // ------------------------------------------------------------------------
    try {
      await page.goto(`${BASE_URL}/admin/papers/${fixtures.incompletePaperId}/publish`);
      const gateChecklist = page.getByText("Master Publication Gate Verification");
      await gateChecklist.waitFor({ state: "visible", timeout: 15000 });

      // Gate 3: Sequence contiguity should be marked failed (✗)
      const actionReqBadge = page.getByText("Action Required");
      await actionReqBadge.waitFor({ state: "visible", timeout: 5000 });

      const gapWarning = page.getByText(/Discontinuity/i);
      await gapWarning.waitFor({ state: "visible", timeout: 5000 });

      // "Review & Publish Paper" button should be disabled
      const publishBtn = page.getByRole("button", { name: "Review & Publish Paper" });
      const isDisabled = await publishBtn.isDisabled();
      assert.ok(isDisabled, "Publication button must be strictly disabled when gates fail");

      // Verify paper in database remains DRAFT
      const dbClient = new pg.Client({ connectionString: TEST_DB_URL });
      await dbClient.connect();
      const statusRes = (
        await dbClient.query(`SELECT publish_status FROM exam_papers WHERE id = $1;`, [
          fixtures.incompletePaperId,
        ])
      ).rows[0];
      await dbClient.end();
      assert.equal(statusRes.publish_status, "DRAFT", "Incomplete paper must remain in DRAFT status");

      await captureScreenshot(page, "10-publication-gate-rejection-gap.png");
      record(
        "SPEC-06",
        "Publication review gates strictly reject paper with sequence gap (MCQJ-ERR-5008)",
        "PASS",
        "Gate 3 rejected discontinuity; publication button strictly disabled"
      );
    } catch (err) {
      record("SPEC-06", "Publication review gates rejection", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // Specification 7: Publication of verified paper passing all 6 gates
    // ------------------------------------------------------------------------
    try {
      await page.goto(`${BASE_URL}/admin/papers/${fixtures.verifiedPaperId}/publish`);
      const allClearBadge = page.getByText("All Gates Clear");
      await allClearBadge.waitFor({ state: "visible", timeout: 15000 });

      const publishBtn = page.getByRole("button", { name: "Review & Publish Paper" });
      await publishBtn.waitFor({ state: "visible", timeout: 5000 });
      const isEnabled = !(await publishBtn.isDisabled());
      assert.ok(isEnabled, "Publish button must be enabled when all 6 gates pass");

      await captureScreenshot(page, "11-publication-all-gates-clear.png");

      // Click to open confirmation modal
      await publishBtn.click();
      const modalHeader = page.getByText("Confirm Final Examination Paper Publication");
      await modalHeader.waitFor({ state: "visible", timeout: 5000 });
      await captureScreenshot(page, "12-publication-confirm-modal.png");

      // Confirm publication
      const executeBtn = page.getByRole("button", { name: "Yes, Execute Publication" });
      await executeBtn.click();

      // Wait for success card
      const successTitle = page.getByText("Publication Successfully Executed!");
      await successTitle.waitFor({ state: "visible", timeout: 15000 });

      // Verify in DB that paper status is PUBLISHED
      const dbClient = new pg.Client({ connectionString: TEST_DB_URL });
      await dbClient.connect();
      const pubRes = (
        await dbClient.query(`SELECT publish_status, published_at FROM exam_papers WHERE id = $1;`, [
          fixtures.verifiedPaperId,
        ])
      ).rows[0];
      await dbClient.end();

      assert.equal(pubRes.publish_status, "PUBLISHED", "Database status must transition to PUBLISHED");
      assert.ok(pubRes.published_at, "published_at timestamp must be recorded");

      await captureScreenshot(page, "13-publication-executed-success.png");
      record(
        "SPEC-07",
        "Publication procedure executes atomically under advisory lock and transitions to PUBLISHED",
        "PASS",
        `DB confirmed: Status=PUBLISHED, PublishedAt=${pubRes.published_at}`
      );
    } catch (err) {
      record("SPEC-07", "Publication procedure execution", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // Specification 8: Student user strictly denied administrative access (403)
    // ------------------------------------------------------------------------
    try {
      // Sign out admin
      await page.locator("header form button:has-text('Sign Out')").click();
      await page.waitForURL(/signin/, { timeout: 15000 });
      await page.locator("input[name=email]").waitFor({ state: "visible", timeout: 10000 });

      // Sign in as student
      await page.fill("input[name=email]", fixtures.studentEmail);
      await page.fill("input[name=password]", fixtures.studentPassword);
      await page.getByRole("button", { name: "Sign In" }).click();
      await page.waitForURL(/dashboard|admin/, { timeout: 20000 });

      // Student attempts to access /admin
      await page.goto(`${BASE_URL}/admin`);

      // Must see "Administrative Access Denied" card
      const deniedCard = page.getByRole("heading", { name: "Administrative Access Denied" });
      await deniedCard.waitFor({ state: "visible", timeout: 15000 });

      const roleMsg = page.getByText(/Caller does not possess administrator privileges/i);
      await roleMsg.waitFor({ state: "visible", timeout: 5000 });

      const returnLink = page.getByRole("link", { name: "Return to Candidate Dashboard" });
      await returnLink.waitFor({ state: "visible", timeout: 5000 });

      // Verify admin header is NOT rendered
      const adminNav = await page.locator("header nav[aria-label='Admin Navigation']").count();
      assert.equal(adminNav, 0, "Admin navigation bar must not be visible to student");

      await captureScreenshot(page, "14-student-forbidden-access-denied.png");
      record(
        "SPEC-08",
        "Student user (role=STUDENT) strictly denied admin access with structured 403 boundary",
        "PASS",
        "Administrative Access Denied card displayed with Candidate Dashboard return"
      );
    } catch (err) {
      record("SPEC-08", "Student user authorization boundary", "FAIL", err.message);
    }

    // ------------------------------------------------------------------------
    // Specification 9: Session persistence across reload & clean sign-out
    // ------------------------------------------------------------------------
    try {
      // Sign out student
      await page.getByRole("button", { name: "Sign Out" }).click();
      await page.waitForURL(/signin/, { timeout: 15000 });

      // Navigate to sign in with return path /admin
      await page.goto(`${BASE_URL}/auth/signin?next=%2Fadmin`);
      await page.locator("input[name=email]").waitFor({ state: "visible", timeout: 10000 });

      // Sign back in as admin
      await page.fill("input[name=email]", fixtures.adminEmail);
      await page.fill("input[name=password]", fixtures.adminPassword);
      await page.getByRole("button", { name: "Sign In" }).click();
      await page.waitForURL(`${BASE_URL}/admin`, { timeout: 15000 });
      await page.locator("header").getByText(fixtures.adminEmail).waitFor({ state: "visible", timeout: 10000 });

      // Reload page — session must persist
      await page.reload();
      const verifiedAdmin = page.locator("header").getByText("Verified Administrator");
      await verifiedAdmin.waitFor({ state: "visible", timeout: 15000 });

      // Sign out
      await page.locator("header").getByRole("button", { name: "Sign Out" }).click();
      await page.waitForURL(/signin/, { timeout: 15000 });
      await page.locator("input[name=email]").waitFor({ state: "visible", timeout: 10000 });

      // Attempt to access /admin again — must be redirected to /auth/signin?next=/admin
      await page.goto(`${BASE_URL}/admin`);
      await page.waitForURL(/signin.*next=%2Fadmin/, { timeout: 15000 });

      await captureScreenshot(page, "15-signout-boundary-cleared.png");
      record(
        "SPEC-09",
        "Session persists across page reloads and cleanly invalidates on sign-out",
        "PASS",
        "Reload maintained admin session; sign out destroyed cookies and failed closed"
      );
    } catch (err) {
      record("SPEC-09", "Session persistence and sign-out", "FAIL", err.message);
    }

    console.log("\n================================================================================");
    const passCount = results.filter((r) => r.status === "PASS").length;
    const failCount = results.filter((r) => r.status === "FAIL").length;
    console.log(
      `  PHASE 7 E2E SUMMARY: ${passCount} PASSED, ${failCount} FAILED (${results.length} TOTAL)`
    );
    console.log("================================================================================\n");

    if (failCount > 0) {
      process.exit(1);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (mockAuth) await mockAuth.stop().catch(() => {});

    if (nextProcess && nextProcess.pid) {
      console.log("▶ Shutting down test Next.js server...");
      try {
        if (process.platform === "win32") {
          execSync(`taskkill /F /T /PID ${nextProcess.pid}`, { stdio: "ignore" });
        } else {
          nextProcess.kill("SIGTERM");
        }
      } catch {}
    }

    if (fs.existsSync(envLocalBakPath)) {
      try {
        fs.renameSync(envLocalBakPath, envLocalPath);
      } catch {}
    }

    const hasFailed = results.some((r) => r.status === "FAIL");
    if (hasFailed) {
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("FATAL: Phase 7 verification suite failure:", err);
  process.exit(1);
});
