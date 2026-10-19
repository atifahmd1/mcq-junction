// ============================================================================
// MCQ Junction — Development Administrator Bootstrap Script
// File: scripts/dev/create-admin.mjs
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import dotenv from "dotenv";
import pg from "pg";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  maskUrl,
  validateTargetPreflight,
  buildDatabaseClientConfig,
} from "./admin-bootstrap-lib.mjs";

const { Client } = pg;

// ----------------------------------------------------------------------------
// 1. Production Mode Guard & Safety Boundary
// ----------------------------------------------------------------------------

if (
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL_ENV === "production"
) {
  console.error("FATAL: Refusing execution in production environment.");
  console.error("create-admin.mjs is strictly for local development environments.");
  process.exit(1);
}

// ----------------------------------------------------------------------------
// 2. Load and Validate Local Environment Configuration
// ----------------------------------------------------------------------------

const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!databaseUrl) {
  console.error("FATAL: Missing database connection string.");
  console.error("Please configure DIRECT_URL or DATABASE_URL in .env.local.");
  process.exit(1);
}

// ----------------------------------------------------------------------------
// 3. Parse CLI Arguments
// ----------------------------------------------------------------------------

const args = process.argv.slice(2);
function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}
const hasFlag = (flag) => args.includes(flag);

const cliEmail = getArg("--email");
const cliRole = (getArg("--role") || (hasFlag("--revoke") ? "STUDENT" : "ADMIN")).toUpperCase();
const confirmFlag = hasFlag("--confirm") || process.env.DEV_ADMIN_CONFIRM === "yes";
const dryRun = hasFlag("--dry-run");
const allowRemoteProject = getArg("--allow-remote-project");
const customCaPath = getArg("--ca");

// ----------------------------------------------------------------------------
// 4. Main Bootstrap Routine
// ----------------------------------------------------------------------------

async function main() {
  console.log("================================================================================");
  console.log("  MCQ Junction — Development Administrator Bootstrap");
  console.log("================================================================================\n");

  // Run preflight safety check
  const preflight = validateTargetPreflight({
    databaseUrl,
    supabaseUrl,
    env: process.env,
    allowRemoteProject,
  });

  if (!preflight.valid) {
    console.error(`FATAL: Preflight safety check failed: ${preflight.reason}`);
    process.exit(1);
  }

  const isLocal = preflight.isLocal;
  const projectRefDisplay = preflight.effectiveRef || (isLocal ? "local-postgresql" : "[Unknown remote ref]");

  console.log("Target Environment:");
  console.log(`  Database Host: ${preflight.hostname} (Port: ${preflight.port})`);
  console.log(`  Database URL:  ${maskUrl(databaseUrl)}`);
  console.log(`  Database Name: ${preflight.database}`);
  console.log(`  Project Ref:   ${projectRefDisplay}`);
  console.log(`  Supabase URL:  ${supabaseUrl || "[Not configured]"}`);
  console.log(`  TLS Mode:      ${isLocal ? "LOCAL (Plain / Standard)" : "STRICT VERIFICATION (rejectUnauthorized: true)"}`);
  if (!isLocal) {
    console.log("  TLS Root CA:   Supabase Root 2021 CA (certs/supabase-prod-ca-2021.crt)");
  }
  console.log(`  Service Role:  ${serviceRoleKey ? "[Configured via environment]" : "[Not provided - DB direct mode]"}`);
  console.log(`  Target Role:   ${cliRole}`);
  console.log(`  Mode:          ${dryRun ? "DRY-RUN (No mutations)" : "LIVE"}\n`);

  // Explicit confirmation check
  if (!confirmFlag) {
    const rl = readline.createInterface({ input, output });
    const promptMessage = isLocal
      ? "CONFIRM TARGET: Proceed with development bootstrap against local database? [y/N]: "
      : `CONFIRM TARGET: You are targeting remote project [${projectRefDisplay}]. Proceed? [y/N]: `;
    const answer = await rl.question(promptMessage);
    rl.close();

    if (answer.trim().toLowerCase() !== "y" && answer.trim().toLowerCase() !== "yes") {
      console.log("Aborted by user: Execution cancelled.");
      process.exit(0);
    }
  }

  // Operator email acquisition
  let targetEmail = cliEmail;
  if (!targetEmail) {
    const rl = readline.createInterface({ input, output });
    targetEmail = await rl.question("Enter development admin email address: ");
    rl.close();
    targetEmail = targetEmail.trim();
  }

  if (!targetEmail || !targetEmail.includes("@")) {
    console.error("FATAL: Invalid email address provided.");
    process.exit(1);
  }

  console.log(`\nProcessing account: ${targetEmail}`);

  // Step 4.1: If Supabase Service Role Key is available and not revoking, check/create auth identity
  let authUserId = null;
  if (serviceRoleKey && supabaseUrl) {
    console.log("▶ Verifying Supabase Auth identity via Admin API...");
    const supabaseAdmin = createSupabaseClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: usersList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.warn("  ⚠ Warning: Unable to query Supabase admin.listUsers:", listError.message);
    } else {
      const existing = usersList?.users?.find(
        (u) => u.email?.toLowerCase() === targetEmail.toLowerCase()
      );
      if (existing) {
        console.log(`  ✔ Supabase Auth user identity exists (ID: ${existing.id}).`);
        authUserId = existing.id;
      }
    }

    if (!authUserId) {
      let devPassword = process.env.DEV_ADMIN_PASSWORD;
      if (!devPassword) {
        const rl = readline.createInterface({ input, output });
        devPassword = await rl.question(
          "Enter password for newly created development admin (min 8 chars): "
        );
        rl.close();
      }

      if (!devPassword || devPassword.length < 8) {
        console.error("FATAL: Password must be at least 8 characters long.");
        process.exit(1);
      }

      if (!dryRun) {
        console.log("  Creating new user in Supabase Auth...");
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: targetEmail,
          password: devPassword,
          email_confirm: true,
          user_metadata: { name: "Development Admin" },
        });

        if (createError) {
          console.error("FATAL: Failed to create Supabase Auth user:", createError.message);
          process.exit(1);
        }

        authUserId = newUser.user.id;
        console.log(`  ✔ Supabase Auth user created successfully (ID: ${authUserId}).`);
      } else {
        console.log("  [DRY RUN] Would create Supabase Auth user.");
      }
    }
  }

  // Step 4.2: Connect to PostgreSQL database to verify schema and assign role
  console.log("▶ Connecting to PostgreSQL database to assign authoritative role...");
  const clientConfig = buildDatabaseClientConfig(databaseUrl, customCaPath);
  const dbClient = new Client(clientConfig);

  try {
    await dbClient.connect();
    console.log("  ✔ PostgreSQL connection established securely.");
  } catch (connErr) {
    console.error("\nFATAL: Database connection failed during TLS / TCP handshake.");
    if (connErr.code === "SELF_SIGNED_CERT_IN_CHAIN") {
      console.error("  Error Code: SELF_SIGNED_CERT_IN_CHAIN");
      console.error("  Diagnosis:  The database certificate was signed by a CA not trusted by Node.js.");
      console.error("  Resolution: Ensure 'certs/supabase-prod-ca-2021.crt' is present or pass --ca <path>.");
    } else if (connErr.code === "ERR_TLS_CERT_ALTNAME_INVALID") {
      console.error(`  Error Code: Hostname mismatch (${connErr.message}).`);
    } else {
      console.error(`  Error: ${connErr.message}`);
    }
    process.exit(1);
  }

  try {
    // Verify Role enum in database
    const roleCheck = await dbClient.query(`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'Role';
    `);

    const validRoles = roleCheck.rows.map((r) => r.enumlabel);
    if (!validRoles.includes(cliRole)) {
      console.error(
        `FATAL: Invalid role '${cliRole}'. Database 'Role' enum supports: ${validRoles.join(", ")}`
      );
      process.exit(1);
    }

    // Check if user exists in auth.users (if accessible)
    if (!authUserId) {
      try {
        const authUserRes = await dbClient.query(
          "SELECT id FROM auth.users WHERE LOWER(email) = LOWER($1) LIMIT 1;",
          [targetEmail]
        );
        if (authUserRes.rows.length > 0) {
          authUserId = authUserRes.rows[0].id;
          console.log(`  ✔ Found Supabase auth.users identity in database (ID: ${authUserId}).`);
        }
      } catch {
        // auth.users may not be queryable depending on database permissions
      }
    }

    // Check public.users table
    const publicUserRes = await dbClient.query(
      "SELECT id, email, role FROM public.users WHERE LOWER(email) = LOWER($1) LIMIT 1;",
      [targetEmail]
    );

    if (publicUserRes.rows.length === 0) {
      if (!authUserId) {
        console.error("\n✖ ACTION REQUIRED: User identity not found in database or Auth project.");
        console.error("  To initialize this account safely:");
        console.error("  1. Start local application: npm run dev");
        console.error("  2. Open http://localhost:3000/auth/signin in your browser");
        console.error(`  3. Register with email: ${targetEmail}`);
        console.error("  4. Rerun this script to grant the ADMIN role.");
        process.exit(1);
      }

      // We have authUserId, so we can insert the user into public.users
      if (!dryRun) {
        console.log(`  Creating public.users record for ${targetEmail}...`);
        await dbClient.query(
          `INSERT INTO public.users (id, email, name, role, created_at, updated_at)
           VALUES ($1, $2, 'Development Admin', $3::"Role", clock_timestamp(), clock_timestamp())
           ON CONFLICT (id) DO UPDATE SET role = $3::"Role", updated_at = clock_timestamp();`,
          [authUserId, targetEmail, cliRole]
        );
        console.log(`  ✔ User created in public.users with role '${cliRole}'.`);
      } else {
        console.log(`  [DRY RUN] Would create public.users record with role '${cliRole}'.`);
      }
    } else {
      const existingUser = publicUserRes.rows[0];
      if (existingUser.role === cliRole) {
        console.log(
          `  ✔ Idempotent: User ${targetEmail} is already assigned role '${cliRole}' (ID: ${existingUser.id}).`
        );
        console.log("  No role change required.");
      } else {
        if (!dryRun) {
          await dbClient.query(
            'UPDATE public.users SET role = $1::"Role", updated_at = clock_timestamp() WHERE id = $2;',
            [cliRole, existingUser.id]
          );
          console.log(
            `  ✔ Role updated successfully from '${existingUser.role}' to '${cliRole}' for ${targetEmail}.`
          );
        } else {
          console.log(
            `  [DRY RUN] Would update role from '${existingUser.role}' to '${cliRole}'.`
          );
        }
      }
    }

    console.log("\n================================================================================");
    console.log("  BOOTSTRAP SUCCESSFUL");
    console.log("================================================================================");
    console.log(`  Account:       ${targetEmail}`);
    console.log(`  Role:          ${cliRole}`);
    console.log(`  Sign-In URL:   http://localhost:3000/auth/signin`);
    console.log(`  Admin URL:     http://localhost:3000/admin\n`);
  } finally {
    await dbClient.end();
  }
}

main().catch((err) => {
  console.error("FATAL: Bootstrap error:", err.message);
  process.exit(1);
});
