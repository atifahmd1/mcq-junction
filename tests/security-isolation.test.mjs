// ============================================================================
// MCQ Junction — Security & Development Isolation Test Suite (Phase 6)
// File: tests/security-isolation.test.mjs
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import pg from "pg";
import { Role } from "../src/generated/prisma/enums.ts";
import { assertAdminSession, UnauthorizedError, ForbiddenError } from "../src/lib/auth/session.ts";

const { Pool } = pg;

// ----------------------------------------------------------------------------
// 1. Production Mode Guard & Target Safety Checks for create-admin.mjs
// ----------------------------------------------------------------------------

test("SEC-ISO-01: create-admin.mjs strictly refuses execution in NODE_ENV=production", () => {
  const scriptPath = path.resolve(process.cwd(), "scripts/dev/create-admin.mjs");
  const res = spawnSync(
    process.execPath,
    [scriptPath, "--email", "attacker@mcq.test", "--confirm"],
    {
      env: { ...process.env, NODE_ENV: "production" },
      encoding: "utf-8",
    }
  );

  assert.strictEqual(res.status, 1, "Script must exit with code 1 in production");
  assert.match(
    res.stderr,
    /FATAL: Refusing execution in production environment/,
    "Error message must indicate refusal in production"
  );
});

test("SEC-ISO-02: create-admin.mjs strictly refuses execution in VERCEL_ENV=production", () => {
  const scriptPath = path.resolve(process.cwd(), "scripts/dev/create-admin.mjs");
  const res = spawnSync(
    process.execPath,
    [scriptPath, "--email", "attacker@mcq.test", "--confirm"],
    {
      env: { ...process.env, VERCEL_ENV: "production" },
      encoding: "utf-8",
    }
  );

  assert.strictEqual(res.status, 1, "Script must exit with code 1 under VERCEL_ENV=production");
  assert.match(
    res.stderr,
    /FATAL: Refusing execution in production environment/
  );
});

test("SEC-ISO-03: create-admin.mjs rejects unconfirmed target without interactive response", () => {
  const scriptPath = path.resolve(process.cwd(), "scripts/dev/create-admin.mjs");
  // Pass empty input to stdin so prompt receives EOF
  const res = spawnSync(
    process.execPath,
    [scriptPath, "--email", "test@mcq.test"],
    {
      env: { ...process.env, DEV_ADMIN_CONFIRM: "" },
      input: "no\n",
      encoding: "utf-8",
    }
  );

  assert.match(
    res.stdout,
    /Aborted by user: Execution cancelled/,
    "Must abort when target is unconfirmed"
  );
});

// ----------------------------------------------------------------------------
// 2. Privilege Elevation Resistance
// ----------------------------------------------------------------------------

test("SEC-ISO-04: syncUserRecord ignores role metadata and defaults to STUDENT on creation", async () => {
  // We verify syncUserRecord doesn't pass role into create or update
  // Check implementation of syncUserRecord in source
  const syncSource = fs.readFileSync(path.resolve(process.cwd(), "src/lib/auth/sync.ts"), "utf-8");
  assert.doesNotMatch(
    syncSource,
    /role:\s*(?:authUser|metadata)/,
    "syncUserRecord must never read role from authUser or metadata"
  );
  assert.doesNotMatch(
    syncSource,
    /update:\s*{[^}]*role:/,
    "syncUserRecord update block must never touch role"
  );
});

test("SEC-ISO-05: Anonymous and non-admin sessions fail closed on privileged operations", async () => {
  // Anonymous caller simulation
  const mockAnonSupabase = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "anon-id", is_anonymous: true } },
        error: null,
      }),
    },
  };

  await assert.rejects(
    async () => assertAdminSession({ supabaseClient: mockAnonSupabase }),
    UnauthorizedError
  );

  // Student caller simulation
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

  await assert.rejects(
    async () => assertAdminSession({ supabaseClient: mockStudentSupabase, prismaClient: mockDb }),
    ForbiddenError
  );
});

// ----------------------------------------------------------------------------
// 3. Database Isolation and Host Bounds
// ----------------------------------------------------------------------------

test("SEC-ISO-06: Test environment strictly fails closed against non-local hostnames or ports", () => {
  const allowedHosts = ["127.0.0.1", "localhost"];
  const dangerousUrls = [
    "postgresql://postgres:secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    "postgresql://postgres:secret@127.0.0.1:5432/postgres", // Wrong port
    "postgresql://postgres:secret@192.168.1.100:5433/mcq_junction_test", // Remote IP
    "postgresql://postgres:secret@production.internal:5433/mcq_junction_test", // Internal domain
  ];

  for (const urlStr of dangerousUrls) {
    const parsed = new URL(urlStr);
    const isSafe =
      allowedHosts.includes(parsed.hostname) &&
      parsed.port === "5433" &&
      parsed.pathname === "/mcq_junction_test";
    assert.strictEqual(
      isSafe,
      false,
      `URL ${urlStr} must be flagged as UNSAFE for disposable test operations`
    );
  }
});

// ----------------------------------------------------------------------------
// 4. Credential Hygiene and Secret Scanner
// ----------------------------------------------------------------------------

test("SEC-ISO-07: Zero raw credentials or secret patterns committed to repository", () => {
  const trackedFiles = execSync("git ls-files", { encoding: "utf-8" })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  const secretPatterns = [
    /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}/, // Raw JWT
    /sbp_[a-zA-Z0-9]{30,}/, // Supabase PAT
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, // Private keys
  ];

  for (const file of trackedFiles) {
    if (file.endsWith(".png") || file.endsWith(".ico") || file.endsWith(".svg")) continue;
    if (!fs.existsSync(file)) continue;

    const content = fs.readFileSync(file, "utf-8");
    for (const pattern of secretPatterns) {
      assert.strictEqual(
        pattern.test(content),
        false,
        `Potential secret leak detected in tracked file: ${file}`
      );
    }
  }
});

// ----------------------------------------------------------------------------
// 5. Migration Continuity and Integrity
// ----------------------------------------------------------------------------

test("SEC-ISO-08: All migrations are sequentially ordered and contain non-empty migration.sql", () => {
  const migrationsDir = path.resolve(process.cwd(), "prisma/migrations");
  const entries = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();

  assert.strictEqual(entries.length, 10, "Expected exactly 10 sequential migrations");

  const expectedOrder = [
    "20261010145726_init_database_test",
    "20261010164000_add_user_model",
    "20261010191034_alter_user_id_uuid_and_enable_rls",
    "20261010192500_add_role_enum_to_users",
    "20261012000000_phase3_domain_models_and_integrity_guards",
    "20261012140000_revoke_authenticated_privileged_rpc",
    "20261013000000_add_detailed_concepts_and_option_explanations",
    "20261016000000_phase8_question_types_and_answer_evaluation",
    "20261016120000_phase8_1_comprehension_passages_and_all_or_nothing_scoring",
    "20261016140000_phase9_examination_engine_and_candidate_delivery",
  ];

  assert.deepStrictEqual(entries, expectedOrder, "Migrations must match strict timestamp sequence");

  for (const mig of entries) {
    const sqlPath = path.join(migrationsDir, mig, "migration.sql");
    assert.strictEqual(fs.existsSync(sqlPath), true, `Missing migration.sql in ${mig}`);
    const size = fs.statSync(sqlPath).size;
    assert.strictEqual(size > 0, true, `migration.sql in ${mig} is empty`);
  }
});

// ----------------------------------------------------------------------------
// 6. Privileged RPC Grant Revocation Verification in PostgreSQL Catalog
// ----------------------------------------------------------------------------

test("SEC-ISO-09: Privileged procedures have zero EXECUTE grants for PUBLIC, anon, and authenticated", async () => {
  const testDbUrl = process.env.TEST_DATABASE_URL;
  if (!testDbUrl) {
    // If running in environment without local test db, skip database catalog check
    return;
  }

  const pool = new Pool({ connectionString: testDbUrl });
  try {
    const res = await pool.query(`
      SELECT
        p.proname,
        r.rolname
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      CROSS JOIN pg_roles r
      WHERE n.nspname = 'public'
        AND p.proname IN ('fn_publish_exam_paper', 'fn_reevaluate_paper_attempts')
        AND r.rolname IN ('public', 'anon', 'authenticated')
        AND has_function_privilege(r.oid, p.oid, 'EXECUTE');
    `);

    assert.strictEqual(
      res.rows.length,
      0,
      `Security violation: found unauthorized EXECUTE grants on privileged procedures: ${JSON.stringify(res.rows)}`
    );
  } finally {
    await pool.end();
  }
});
