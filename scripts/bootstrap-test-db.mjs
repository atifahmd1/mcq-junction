// ============================================================================
// MCQ Junction — Test Database Bootstrap & Migration Runner
// File: scripts/bootstrap-test-db.mjs
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

// Strict safety check for disposable test database
const testDbUrl = process.env.TEST_DATABASE_URL;

if (!testDbUrl) {
  console.error("FATAL: TEST_DATABASE_URL environment variable is not defined.");
  console.error("Must point explicitly to local disposable PostgreSQL (e.g. 127.0.0.1:5433).");
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(testDbUrl);
} catch (err) {
  console.error("FATAL: TEST_DATABASE_URL is not a valid URL:", err.message);
  process.exit(1);
}

// Fail closed if host or port points anywhere outside the local test container
const allowedHosts = ["127.0.0.1", "localhost"];
const expectedPort = "5433";
const expectedDb = "/mcq_junction_test";

if (!allowedHosts.includes(parsedUrl.hostname) || parsedUrl.port !== expectedPort || parsedUrl.pathname !== expectedDb) {
  console.error("FATAL: Safety violation: TEST_DATABASE_URL must target 127.0.0.1:5433/mcq_junction_test.");
  console.error(`Received: hostname=${parsedUrl.hostname}, port=${parsedUrl.port}, db=${parsedUrl.pathname}`);
  process.exit(1);
}

const client = new Client({ connectionString: testDbUrl });

async function main() {
  await client.connect();
  console.log("✓ Connected to local disposable test database on port 5433.");

  // Verify server identity
  const idRes = await client.query("SELECT current_database(), inet_server_port(), version();");
  console.log(`✓ Verified target database: ${idRes.rows[0].current_database} (Port: ${idRes.rows[0].inet_server_port})`);
  console.log(`✓ Engine: ${idRes.rows[0].version}`);

  console.log("\n--- Step 1: Bootstrapping Supabase Compatibility Layer ---");
  const bootstrapSql = `
    -- Reset test database schemas cleanly
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO postgres;
    GRANT ALL ON SCHEMA public TO public;

    DROP SCHEMA IF EXISTS auth CASCADE;
    CREATE SCHEMA auth;

    -- Create pgcrypto extension if available
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    -- Create Supabase roles
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
      END IF;
    END
    $$;

    -- Create auth.users table
    CREATE TABLE auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT clock_timestamp()
    );

    -- auth.uid() function simulating JWT claim resolution
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS UUID
    LANGUAGE sql
    STABLE
    SET search_path = pg_catalog, pg_temp
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    -- auth.role() function
    CREATE OR REPLACE FUNCTION auth.role()
    RETURNS TEXT
    LANGUAGE sql
    STABLE
    SET search_path = pg_catalog, pg_temp
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text;
    $$;

    -- Grants
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    GRANT ALL ON auth.users TO authenticated, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  `;

  await client.query(bootstrapSql);
  console.log("✓ Supabase compatibility layer bootstrapped successfully.");
  await client.end();

  console.log("\n--- Step 2: Applying Migrations via Prisma Migrate Deploy ---");
  const { execSync } = await import("node:child_process");
  execSync("npx prisma migrate deploy", {
    env: {
      ...process.env,
      DIRECT_URL: testDbUrl,
      DATABASE_URL: testDbUrl,
    },
    stdio: "inherit",
  });

  console.log(`\n✓ All migrations applied successfully via Prisma Migration Engine to the clean disposable test database!`);
}

main().catch((err) => {
  console.error("FATAL: Bootstrap failed:", err);
  process.exit(1);
});
