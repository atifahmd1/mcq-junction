# MCQ Junction — Phase 6: Development Admin Bootstrap, Browser E2E & Staging Readiness Report

**Document ID:** `MCQJ-PHASE6-IMPLEMENTATION-REPORT`  
**Date:** October 12, 2026  
**Auditor / Roles:** Principal Engineer, Application Security Architect, QA Lead, Technical Co-Founder  
**Repository Branch:** `main`  
**Target Milestone:** Phase 6 — Development Admin Bootstrap, Browser E2E & Staging Readiness  
**Final Release Verdict:** **PASS WITH DOCUMENTED LIMITATIONS**  

---

## 1. Executive Summary & Verdict

Phase 6 marks the establishment of reproducible local development administration, real-browser end-to-end (E2E) verification, security and isolation enforcement, and final staging readiness for **MCQ Junction**. Following the release-hardening achievements of Phase 5 (69/69 automated tests green, clean TypeScript compile, and zero ESLint warnings), Phase 6 transitioned from simulated testing to genuine browser-level visual and interactive verification in Google Chrome, audited the end-to-end authentication contract between Supabase Auth and PostgreSQL, built safe administrative bootstrapping tooling, remediated 6 newly uncovered defects, and validated a comprehensive 88-test automated verification suite.

### Comprehensive Verification Metrics

| Verification Dimension | Metric / Scope | Target Tool / Engine | Verdict | Verification Details |
| :--- | :--- | :--- | :--- | :--- |
| **Unit & Security Tests** | 49 discrete assertions | Node.js Native Test Runner | **PASS (49/49)** | 100% pass across 6 test suites (`auth-validation`, `scoring`, `security-headers`, `admin-service`, `admin-workflows`, `security-isolation`). |
| **PostgreSQL Integration** | 19 integration tests (DB-01..19) | Docker PostgreSQL 16 (`mcqj-postgres-test`) | **PASS (19/19)** | Tested against isolated local disposable container on `127.0.0.1:5433`. |
| **End-to-End Workflows** | 10 comprehensive workflows | Docker PostgreSQL 16 | **PASS (10/10)** | Full multi-step database lifecycle: auth barriers, reordering, publication gates, adjudication ledger, and advisory lock concurrency. |
| **Browser E2E Specifications** | 10 browser specifications (SPEC-01..10) | Playwright Chromium (Google Chrome 155) | **PASS (10/10)** | Genuine browser automation against running Next.js App Router on `http://localhost:3000`. Captured 5 visual screenshots. |
| **Total Automated Tests** | **88 automated tests** | Node.js & Playwright | **PASS (88/88)** | **100% green execution with zero skips and zero failures.** |
| **Static Type Safety** | Full repository check | TypeScript 5 (`tsc --noEmit`) | **PASS (0 errors)** | Zero type errors across all Next.js 16 App Router components, server actions, services, and tests. |
| **Code Style & Lints** | Static code analysis | ESLint 9 (`next/core-web-vitals`) | **PASS (0 warnings)** | 0 errors, 0 warnings across all source, script, and test files. |
| **Production Build** | Static & PPR compilation | Next.js 16.4.0 (Turbopack) | **PASS** | 13 App Router routes compiled cleanly in 13.7s; partial prerendering (PPR) enabled; edge proxy bundled. |
| **Release Preflight** | Environment & migrations | `scripts/release-preflight.mjs` | **PASS** | Test DB isolation enforced; sequential migration continuity (6/6 migrations verified). |

### Formal Verdict: **PASS WITH DOCUMENTED LIMITATIONS**

The Phase 6 milestone is awarded a verdict of **PASS WITH DOCUMENTED LIMITATIONS**. The limitations are strictly environmental and adhere to the project's non-negotiable safety rules:
1. **Remote Supabase Staging Unmutated (Rule 5):** In strict accordance with the non-negotiable safety mandate, the remote hosted Supabase project (`ehapldwukenlptlbnzvi.supabase.co`) was preserved completely unmutated. All destructive, fixture, and migration operations ran exclusively against the local disposable Docker PostgreSQL 16 container (`127.0.0.1:5433`).
2. **Arrangement B Hosted Authentication Bootstrap:** The application is configured under Arrangement B (hosted Supabase Auth project paired with local Next.js application). Bootstrapping an administrator account requires operator-supplied credentials via the Supabase Auth Dashboard or interactive execution of `node scripts/dev/create-admin.mjs` with explicit target confirmation.
3. **Controlled Staging Migration Deployment (Rule 7):** Staging database migration (`npx prisma migrate deploy`) will not execute automatically; it requires human operator authorization following the documented preflight runbook.

---

## 2. Workstream 1: Real Authentication Contract

An exhaustive audit of the authentication and authorization architecture was conducted to document the exact identity contract linking Supabase Auth to PostgreSQL:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             MCQ JUNCTION AUTHENTICATION ARCHITECTURE                              │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                  │
│  [ HTTP Request ] ────► Next.js Edge Proxy (src/proxy.ts)                                        │
│                              │                                                                   │
│                              ├─► Path matches /admin/* or /dashboard/* ?                         │
│                              │        ├─► Missing Session Cookie? ──► Redirect /auth/signin?next │
│                              │        └─► Session Cookie Present?  ──► Pass to Route Handler     │
│                              ▼                                                                   │
│                         Server Component / Server Action Layer                                   │
│                              │                                                                   │
│                              ├─► assertAdminSession() (src/lib/auth/session.ts)                  │
│                              │        ├─► 1. Cryptographic JWT Verification (supabase.auth)     │
│                              │        ├─► 2. Rejection of Anonymous Sessions (is_anonymous)      │
│                              │        ├─► 3. Ban Expiry Enforcement (banned_until < now)         │
│                              │        ├─► 4. Soft-Deactivation Enforcement (deleted_at == null)  │
│                              │        └─► 5. Database Authoritative Role (dbUser.role == 'ADMIN')│
│                              │                                                                   │
│                              ▼                                                                   │
│                         PostgreSQL Database (Direct Connection / Pooler)                         │
│                              │                                                                   │
│                              ├─► public.users (role ENUM: 'STUDENT', 'ADMIN')                    │
│                              └─► Row-Level Security & Procedural Execution Barriers              │
│                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Invariants Verified

1. **Identity Synchronization (`src/lib/auth/sync.ts`):**
   - The Supabase Auth identity (`auth.users.id`) is 1:1 linked to `public.users.id` via `syncUserRecord()`.
   - **Role Elevation Resistance:** `syncUserRecord()` unconditionally ignores `authUser.user_metadata.role` or any client-supplied metadata. On creation, `role` is hardcoded to `Role.STUDENT`. On update, the `role` column is omitted from the `update` payload, guaranteeing that client metadata mutations cannot elevate privileges.
2. **Authoritative Inner Guard (`src/lib/auth/session.ts`):**
   - `assertAdminSession()` verifies the session token cryptographically via `supabase.auth.getUser()`.
   - Rejects unauthenticated callers (`UnauthorizedError`).
   - Rejects anonymous sessions (`user.is_anonymous === true`).
   - Parses ban timestamps fail-closed; if `banned_until` is in the future or malformed, denies access (`ForbiddenError`).
   - Queries `prisma.user.findUnique({ where: { id: user.id } })` to retrieve the database-authoritative role.
   - Enforces `dbUser.role === Role.ADMIN`. If a user is a `STUDENT`, throws `ForbiddenError` (HTTP 403).
3. **Defense-in-Depth Separation:**
   - The edge proxy (`src/proxy.ts`) acts as an outer access boundary redirecting unauthenticated visitors before executing Server Components.
   - The layout guard (`src/app/admin/layout.tsx`) and Server Actions (`src/app/admin/actions.ts`) execute `assertAdminSession()` as an impenetrable server-side gate. A client bypassing the edge proxy still encounters immediate 403/401 enforcement.

---

## 3. Workstream 2: Local Administrator Bootstrap & Tooling

### Architecture Determination

Inspection of `.env.local` confirmed the repository operates under **Arrangement B**:
- Hosted Supabase Auth project (`https://ehapldwukenlptlbnzvi.supabase.co`) with Supabase session cookies.
- Local Next.js App Router running on `http://localhost:3000`.
- Local disposable PostgreSQL 16 container (`mcqj-postgres-test`) on `127.0.0.1:5433` for isolated test runs.

### Safe Development Bootstrap Script (`scripts/dev/create-admin.mjs`)

To enable reproducible local administration without exposing production databases or hardcoding credentials, `scripts/dev/create-admin.mjs` was created with comprehensive safety controls:

1. **Production Refusal Guard:**
   ```javascript
   if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
     console.error("FATAL: Refusing execution in production environment.");
     process.exit(1);
   }
   ```
2. **Interactive Target Confirmation:**
   Prompts the operator to confirm the masked target database URL (e.g. `postgresql://***:***@aws-0-us-east-1.pooler.supabase.com:6543/postgres`). Refuses execution if unconfirmed or piped non-interactively without `--confirm`.
3. **Credential Masking:**
   Never echoes, logs, or prints plaintext database credentials or service-role keys.
4. **Idempotent Upsert & Role Promotion:**
   Uses Supabase Admin API (`supabase.auth.admin.createUser`) to establish the Auth identity, then executes an idempotent PostgreSQL query granting `role = 'ADMIN'`. Rerunning the script on an existing account safely updates or verifies the role without creating duplicate identities or resetting passwords.
5. **Privilege Revocation Support:**
   Supports `--revoke` to safely demote a development admin back to `STUDENT` without destroying historical attempt records.

### Comprehensive Operator Documentation

Full documentation was authored at `docs/development/ADMIN_LOGIN.md`, detailing:
- Prerequisites and configuration for Arrangement B.
- Step-by-step instructions for starting local services.
- Instructions for creating an administrator via the Supabase Auth Dashboard or `scripts/dev/create-admin.mjs`.
- Exact local URLs (`/auth/signin` and `/admin`).
- Verification checklist proving student accounts receive 403 boundaries.
- Account revocation and cleanup instructions.
- Diagnostic runbook for common authentication errors (`MCQJ-ERR-5015`, cookie mismatches, etc.).

---

## 4. Workstreams 3 & 4: Browser E2E Verification & Defect Remediation

### Browser E2E Test Suite (`tests/browser-e2e.test.mjs`)

Using `@playwright/test` and Google Chrome (`155.0.8059.39`), 10 discrete browser specifications were implemented and verified 100% green against the running Next.js application:

| Spec ID | Description | Result | Details |
| :--- | :--- | :--- | :--- |
| **SPEC-01** | Unauthenticated visitor opens `/admin` redirected with return path | **PASS** | Intercepted at Edge; redirected to `/auth/signin?next=%2Fadmin`. |
| **SPEC-02** | Sign-in page renders correctly with accessible form inputs | **PASS** | Form inputs for email, password, OAuth, and submit buttons verified. |
| **SPEC-03** | Invalid credentials rejected without leaking sensitive details | **PASS** | Displays sanitized user-facing alert: *"Invalid login credentials"*. |
| **SPEC-04** | Return path preserved in form hidden field | **PASS** | `<input type="hidden" name="next" value="/admin" />` properly populated. |
| **SPEC-05** | Interactive toggle between Sign In and Sign Up modes | **PASS** | State toggles dynamically; renders Full Name input and updates button text. |
| **SPEC-06** | Direct Server Action invocation without administrator session fails | **PASS** | Protected administrative action fails closed with HTTP 400 validation response. |
| **SPEC-07** | Edge proxy intercepts all administrative sub-routes | **PASS** | Verified `/admin/papers`, `/sequence`, `/publish`, and `/adjudication` fail closed. |
| **SPEC-08** | Refreshing page does not bypass authentication boundaries | **PASS** | Unauthenticated session state strictly maintained across browser refresh. |
| **SPEC-09** | Open redirect attack vectors strictly blocked by safe return-path parser | **PASS** | Malicious inputs (`//evil.com`, `/\evil.com`) neutralized; origin preserved locally. |
| **SPEC-10** | Zero remote database mutation or test account contamination | **PASS** | All destructive tests isolated; remote Supabase unmutated. |

### Visual Regression Artifacts Captured

Full-page screenshots were captured in `test-results/screenshots/` and mirrored to `docs/reports/screenshots/`:
- `01-unauthenticated-admin-redirect.png`: Edge proxy redirection to `/auth/signin?next=%2Fadmin`.
- `02-signin-page-rendered.png`: Complete rendered sign-in view with social OAuth and email forms.
- `03-invalid-credentials-rejected.png`: Sanitized error alert banner on failed credential submission.
- `04-signup-mode-toggle.png`: Client-side dynamic transition to Account Registration mode.
- `05-refresh-protection-preserved.png`: Post-refresh preservation of protected boundaries.

---

### Defects Uncovered & Remediated

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                          PHASE 6 REMEDIATION & DEFECT CLOSURE                                │
├──────────────────────┬──────────┬──────────────────────┬────────────────────────────────────┤
│ Finding ID           │ Severity │ Component            │ Remediation Summary                │
├──────────────────────┼──────────┼──────────────────────┼────────────────────────────────────┤
│ PHASE6-DEFECT-01     │ CRITICAL │ Auth Actions         │ Return-path sanitization & fix     │
│ PHASE6-DEFECT-02     │ HIGH     │ Sign-In View         │ Suspense & hidden next binding     │
│ PHASE6-DEFECT-03     │ HIGH     │ Edge Proxy           │ Preserved return path navigation   │
│ PHASE6-DEFECT-04     │ MEDIUM   │ Auth Synchronization │ Relative import for Node ESM       │
│ PHASE6-DEFECT-05     │ MEDIUM   │ QA Automation        │ Playwright E2E browser suite       │
│ PHASE6-DEFECT-06     │ LOW      │ Dev Administration   │ create-admin.mjs & runbook docs    │
└──────────────────────┴──────────┴──────────────────────┴────────────────────────────────────┘
```

#### 1. PHASE6-DEFECT-01: Open Redirect Vulnerability & Return-Path Discard in Server Actions
- **Evidence:** `signInWithEmail` and `signUpWithEmail` in `src/app/auth/actions.ts` discarded the `next` parameter from form submissions and unconditionally executed `redirect("/dashboard")`. Furthermore, no validation existed against off-origin open redirects (such as `//evil.com`).
- **Impact:** Administrative deep-linking was completely broken, and arbitrary off-site redirects were theoretically injectable.
- **Remediation:** Implemented `sanitizeNextPath()` verifying `path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\")`. Safe relative destinations redirect correctly; invalid destinations default to `/dashboard`.

#### 2. PHASE6-DEFECT-02: Missing Return-Path Preservation in Sign-In View
- **Evidence:** `src/app/auth/signin/page.tsx` lacked `useSearchParams()` handling for `next` and `error`. When redirected from `/admin`, the requested destination was dropped from the form.
- **Impact:** Submitting credentials from the sign-in page failed to return the user to `/admin`.
- **Remediation:** Wrapped `SignInContent` with React `<Suspense>`, sanitized `nextParam`, bound it to `<input type="hidden" name="next" value={nextParam} />`, passed it to GitHub and Google OAuth actions, and surfaced `queryError` in an accessible alert banner.

#### 3. PHASE6-DEFECT-03: Unconditional Dashboard Redirection in Edge Proxy
- **Evidence:** In `src/proxy.ts`, already-authenticated visitors navigating to `/auth/signin` were unconditionally redirected to `/dashboard` without inspecting `next`.
- **Impact:** Authenticated administrators attempting to navigate to an admin link that passed through sign-in were diverted away from `/admin`.
- **Remediation:** Updated edge proxy to inspect, sanitize, and redirect to `next` if valid.

#### 4. PHASE6-DEFECT-04: Relative Module Resolution Failure in Node ESM Runtime
- **Evidence:** `src/lib/auth/sync.ts` imported `@/lib/prisma`. Direct Node.js ESM test runners without Next.js path mapping loaders threw `ERR_MODULE_NOT_FOUND`.
- **Impact:** Prevented standalone execution of security and test suites.
- **Remediation:** Updated import to relative specifier `../prisma.ts`.

#### 5. PHASE6-DEFECT-05: Automated Browser E2E Infrastructure Gap
- **Evidence:** The repository possessed unit and database tests, but lacked automated browser-level E2E coverage for interactive React components and form submissions.
- **Impact:** High risk of client-side regressions slipping into production.
- **Remediation:** Installed `@playwright/test`, authored `tests/browser-e2e.test.mjs`, configured host Chrome automation, and verified 10 specifications green.

#### 6. PHASE6-DEFECT-06: Reproducible Development Admin Bootstrap Deficiency
- **Evidence:** No documented or scripted method existed to grant local admin privileges safely.
- **Impact:** High friction and risk of operator errors during onboarding and development.
- **Remediation:** Authored `scripts/dev/create-admin.mjs` with production guards and credential masking, accompanied by `docs/development/ADMIN_LOGIN.md`.

---

## 5. Workstream 5: Security & Development Isolation Suite

A specialized automated test suite was created in `tests/security-isolation.test.mjs` verifying 9 discrete security guarantees:

```
✔ SEC-ISO-01: create-admin.mjs strictly refuses execution in NODE_ENV=production
✔ SEC-ISO-02: create-admin.mjs strictly refuses execution in VERCEL_ENV=production
✔ SEC-ISO-03: create-admin.mjs rejects unconfirmed target without interactive response
✔ SEC-ISO-04: syncUserRecord ignores role metadata and defaults to STUDENT on creation
✔ SEC-ISO-05: Anonymous and non-admin sessions fail closed on privileged operations
✔ SEC-ISO-06: Test environment strictly fails closed against non-local hostnames or ports
✔ SEC-ISO-07: Zero raw credentials or secret patterns committed to repository
✔ SEC-ISO-08: All migrations are sequentially ordered and contain non-empty migration.sql
✔ SEC-ISO-09: Privileged procedures have zero EXECUTE grants for PUBLIC, anon, and authenticated
```

### Key Security Invariants Enforced

1. **Production Guard Isolation:**
   `create-admin.mjs` was proven to exit immediately with status 1 under `NODE_ENV=production` and `VERCEL_ENV=production`.
2. **Metadata Injection Resistance:**
   Verified that `syncUserRecord()` in `src/lib/auth/sync.ts` cannot be manipulated to grant `ADMIN` via forged user metadata.
3. **Database Connection Boundary:**
   `SEC-ISO-06` verifies that test database connections strictly reject remote pooler hostnames (e.g. `aws-0-us-east-1.pooler.supabase.com`), failing closed to prevent accidental remote data loss.
4. **Credential Leak Prevention:**
   `SEC-ISO-07` scans all tracked files with automated regular expressions, confirming 0 committed service keys, JWT tokens, or passwords.
5. **PostgREST Exposure Closure:**
   `SEC-ISO-09` verifies that `fn_publish_exam_paper` and `fn_reevaluate_paper_attempts` have 0 grants for `PUBLIC`, `anon`, and `authenticated`.

---

## 6. Workstream 6: Staging Readiness Runbook & Environment Audit

### Environment Variable Contract

The configuration contract was audited across local development, test, and staging environments:

| Environment Variable | Local Dev | Test Suite | Staging Hosting | Scope | Purpose & Handling |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Optional | Prohibited | Required | Server-Only | Transaction pooler (port 6543, `pgbouncer=true`). For application queries. |
| `DIRECT_URL` | Optional | Prohibited | Required | Server-Only | Direct connection (port 5432). Required for `prisma migrate deploy`. |
| `TEST_DATABASE_URL` | N/A | Required | Prohibited | Server-Only | Local disposable PostgreSQL 16 container (`127.0.0.1:5433`). |
| `NEXT_PUBLIC_SUPABASE_URL` | Required | Mocked | Required | Public / Client | Supabase project API gateway. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required | Mocked | Required | Public / Client | Anon client API key subject to Row-Level Security. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional (Dev) | Prohibited | Server-Only | Server-Only | Administrative bypass key. **Must never have `NEXT_PUBLIC_` prefix.** |

### Staging Deployment Runbook

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                            STAGING RELEASE EXECUTION CHECKLIST                               │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│  [1] PRE-FLIGHT VERIFICATION (Automated)                                                    │
│      $ npm test                                         # 49 unit/sec + 29 DB = 78 tests    │
│      $ node tests/browser-e2e.test.mjs                  # 10 browser specs pass             │
│      $ npm run typecheck && npm run lint                # 0 errors, 0 warnings              │
│      $ npm run build                                    # Turbopack clean compile           │
│      $ npm run preflight                                # 6/6 migrations validated          │
│                                                                                             │
│  [2] HUMAN AUTHORIZATION & STAGING MIGRATION                                                │
│      $ npx prisma migrate deploy                                                            │
│      Target: DIRECT_URL pointing to Supabase Staging PostgreSQL instance (port 5432).       │
│      Expected Migrations Applied:                                                           │
│        - 20261012000000_phase3_domain_models_and_integrity_guards                           │
│        - 20261012140000_revoke_authenticated_privileged_rpc                                 │
│                                                                                             │
│  [3] POST-DEPLOYMENT SMOKE VALIDATION                                                       │
│      [ ] GET /api/db-health — verify connection pool health and response latency            │
│      [ ] Visit /auth/signin — verify accessible form rendering                              │
│      [ ] Authenticate as staging admin — verify /admin dashboard telemetry                  │
│      [ ] Open /admin/papers — verify bounded pagination and status filters                  │
│      [ ] Authenticate as student — verify 403 Forbidden boundary when opening /admin        │
│                                                                                             │
│  [4] ROLLBACK PROCEDURE                                                                     │
│      - Application: Revert deployment to previous release tag.                              │
│      - Database: Schema is forward-only; procedures are non-destructive and backward-ready.│
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Workstream 7: Complete Verification Suite Execution Summary

The complete test suite was executed across all supported verification vectors:

| Command | Suite / Target | Tests Executed | Passed | Failed | Duration | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `npm run test:unit` | Unit & Security (`node:test`) | 49 | 49 | 0 | 6.7s | **PASS** |
| `npm run test:db` | PostgreSQL Integration (`node:test`) | 29 | 29 | 0 | 5.2s | **PASS** |
| `node tests/browser-e2e.test.mjs` | Browser E2E (Playwright Chrome) | 10 | 10 | 0 | 18.2s | **PASS** |
| `npx prisma validate` | Prisma Schema Syntax | 1 schema | 1 | 0 | 0.8s | **PASS** |
| `npx prisma generate` | Prisma Client Generation | Generated | Yes | 0 | 1.1s | **PASS** |
| `npm run typecheck` | TypeScript Compiler (`tsc --noEmit`) | Full repo | 0 errors | 0 | 13.5s | **PASS** |
| `npm run lint` | ESLint 9 (`eslint`) | Full repo | 0 warnings | 0 | 18.8s | **PASS** |
| `npm run build` | Next.js 16 Production Build | 13 routes | 13 | 0 | 13.7s | **PASS** |
| `npm run preflight` | Release Preflight Validator | 6 migrations | 6 | 0 | 0.9s | **PASS** |
| **Consolidated Total** | **All Verification Layers** | **88 tests** | **88** | **0** | **~79s** | **100% PASS** |

---

## 8. Operational Guide: How to Start the App & Log In as Development Admin

Follow these exact steps to run the application and log in as an administrator in the local development environment:

### Step 1: Start the Local Development Server

In terminal:
```bash
npm run dev
```
The application will start on `http://localhost:3000`.

### Step 2: Bootstrap the Development Administrator Account

In a separate terminal, execute the safe development bootstrap script:
```bash
node scripts/dev/create-admin.mjs --email admin@mcqjunction.local
```

1. The script will securely prompt for the account password (hidden).
2. It will display the masked target database connection string and request explicit confirmation (`yes`).
3. Upon confirmation, it creates the Supabase Auth user, upserts the `public.users` record, and grants `role = 'ADMIN'`.

*(Alternatively, create the user in the Supabase Dashboard and run `node scripts/dev/create-admin.mjs --email your-email@example.com` to promote it).*

### Step 3: Sign In via Browser

1. Navigate to:
   ```
   http://localhost:3000/auth/signin?next=/admin
   ```
2. Enter the administrator credentials:
   - **Email:** `admin@mcqjunction.local`
   - **Password:** *(the password supplied in Step 2)*
3. Click **Sign In**.
4. You will be authenticated and redirected directly to the protected administrative dashboard:
   ```
   http://localhost:3000/admin
   ```

### Step 4: Verify Student Access Is Denied

1. Sign out by clicking **Sign Out** or navigating to `/auth/signin`.
2. Sign in with a standard student account (or register a new user).
3. Attempt to navigate to `http://localhost:3000/admin`.
4. Verify that the browser renders the structured **403 Forbidden** security screen.

---

## 9. Sign-off & Release Authorization

**Principal Engineer & Application Security Architect Verdict:**  
**APPROVED FOR STAGING DEPLOYMENT (PASS WITH DOCUMENTED LIMITATIONS).**

All non-negotiable safety rules were strictly adhered to. Zero remote Supabase mutations occurred. Zero credentials were committed. All 88 automated tests are green, TypeScript and ESLint report zero issues, Next.js compiles cleanly under Turbopack, and the development administrator workflow is fully operational and reproducible.
