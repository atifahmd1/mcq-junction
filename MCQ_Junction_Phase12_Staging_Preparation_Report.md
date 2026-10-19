# MCQ Junction — Phase 12: Controlled Staging Deployment Preparation Report

**Document ID:** `MCQJ-PHASE12-STAGING-PREPARATION-REPORT`  
**Date:** October 19, 2026  
**Auditor / Roles:** Principal Engineer, Database Security Engineer, Assessment-System Architect, Release Manager  
**Repository Branch:** `main`  
**Target Milestone:** Phase 12 — Controlled Staging Deployment Preparation  
**Final Release Verdict:** **PASS WITH DOCUMENTED LIMITATIONS**  

---

## 1. Executive Summary & Verdict

Phase 12 closes the final operational uncertainties and security boundaries required for a controlled staging deployment of MCQ Junction. Specifically, this phase establishes the autonomous background finalization mechanism, locks unprivileged candidates out of maintenance sweeps, hardens Prisma CLI against accidental remote connections, resolves Next.js 16 Turbopack production build constraints, and validates the entire assessment lifecycle across 201 automated tests.

### Final Milestone Verdict: **PASS WITH DOCUMENTED LIMITATIONS**

* **Local Verification Verdict:** **PASS (100% Green)**
  * **201 / 201 Automated Tests Passed (0 Failed, 0 Skipped)**
  * **124 Unit & Domain Tests** (`npm run test:unit`) covering scoring, evaluation, validation, schemas, and security headers.
  * **63 PostgreSQL Relational Integration Tests** (`npm run test:db`) covering immutability triggers, publication gates, optimistic concurrency, and 7 dedicated scheduler finalization specifications.
  * **14 Playwright Browser E2E Lifecycle Specifications** (`tests/candidate-lifecycle-browser.test.mjs`) verifying candidate signin, declaration pledge, question delivery, optimistic answer ledger, passage rendering, resumption, modal confirmation, and scorecard locking.
  * **0 TypeScript Errors** (`npm run typecheck` via `tsc --noEmit`).
  * **0 ESLint Errors / Warnings** (`npm run lint` via ESLint 9 and React 19 rules).
  * **Next.js 16.4.0 Production Build Succeeded** with all 23 App Router routes compiled cleanly with Turbopack and Partial Prerendering (PPR).
  * **Release Preflight Validated** (`npm run preflight`) all 10 sequential migrations, Prisma schema syntax, and cron route handlers.
  * **Prisma Migration Engine Status:** `npx prisma migrate status` reports `Database schema is up to date!` with full tracking in `_prisma_migrations`.
  * **Zero Remote Mutations:** Hosted Supabase staging database remained strictly untouched (0 mutations executed).
* **Documented Limitations:**
  1. **Remote Database Migration Approval Gate:** In accordance with release-safety rules, remote execution of `npx prisma migrate deploy` against the hosted Supabase staging instance is held at the human approval gate. Full operational guidance is provided in [STAGING_RUNBOOK.md](file:///d:/mcq-junction/docs/deployment/STAGING_RUNBOOK.md).
  2. **External Cron Secret Provisioning:** The autonomous cron route `/api/cron/finalize-overdue-attempts` requires `CRON_SECRET` to be provisioned in the hosting provider's encrypted environment variables. It strictly fails closed (HTTP 500) if unconfigured.

---

## 2. Background Finalization Architecture & Verification

### 1. Operational Gap Identified & Closed
In Phase 11, `finalizeOverdueAttempts()` existed only as a domain function in `src/lib/exam/service.ts` and was invoked during local test scenarios. It lacked:
- An authenticated production HTTP endpoint callable by serverless cron schedulers.
- A deployment schedule definition for cloud hosting (e.g. Vercel Cron).
- Strict role boundaries preventing candidates from triggering database-wide sweeps.

### 2. Autonomous Finalization Endpoint Implementation
Two HTTP route handlers were created:
- Primary: [`src/app/api/cron/finalize-overdue-attempts/route.ts`](file:///d:/mcq-junction/src/app/api/cron/finalize-overdue-attempts/route.ts)
- Alias: [`src/app/api/cron/finalize-overdue/route.ts`](file:///d:/mcq-junction/src/app/api/cron/finalize-overdue/route.ts)

Both routes support `GET` and `POST` methods and enforce the following requirements:
* **Authentication:** Validates incoming requests against `process.env.CRON_SECRET`. Supports standard `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>` headers.
* **Fail-Closed Configuration:** If `CRON_SECRET` is missing or empty, returns `HTTP 500` ("Server misconfiguration: CRON_SECRET is not configured in environment").
* **Unauthorized Rejection:** Returns `HTTP 401 Unauthorized` on missing or mismatched bearer credentials.
* **Structured Telemetry:** Emits structured JSON event logs:
  ```json
  {"event":"CRON_FINALIZE_OVERDUE_ATTEMPTS","timestamp":"2026-10-19T15:26:29.851Z","durationMs":275,"paperId":"407579de-1b02-46bb-897a-8927cd47ed90","finalizedCount":1,"attemptIds":["dfd4d409-ae46-4987-adea-121e44c0e6a8"]}
  ```
* **Scheduler Retry Handling:** Returns `HTTP 500` on database connectivity errors, enabling external schedulers (e.g. AWS EventBridge, Vercel Cron) to register failure and trigger automatic retries.

### 3. Vercel Cron Job Configuration
Configured [`vercel.json`](file:///d:/mcq-junction/vercel.json) with a standard 1-minute recurring schedule:
```json
{
  "crons": [
    {
      "path": "/api/cron/finalize-overdue-attempts",
      "schedule": "* * * * *"
    }
  ]
}
```

### 4. Privilege Hardening of Candidate-Facing Action
In `src/app/exam/actions.ts`, `finalizeOverdueAttemptsAction` previously permitted any authenticated student session to sweep attempts across an entire paper. It was hardened with `assertAdminSession()`. Candidates attempting to invoke the sweep are rejected with `MCQJ-ERR-4001` (401 Unauthorized) or `MCQJ-ERR-4003` (403 Forbidden).

### 5. Empirical Verification (`tests/scheduler-finalization.test.mjs`)
A dedicated suite of 7 automated test specifications was created and integrated into `npm run test:db`:

| Specification ID | Title / Assertion | Observed Result | Status |
| :--- | :--- | :--- | :--- |
| **SCHED-01** | Cron authentication fails closed when `CRON_SECRET` is missing (HTTP 500) | Rejected with HTTP 500 | **PASS** |
| **SCHED-02** | Cron authentication rejects missing or invalid credentials (HTTP 401) | Rejected with HTTP 401 | **PASS** |
| **SCHED-03** | Cron authentication accepts valid Bearer token and `x-cron-secret` header | Accepted with HTTP 200 | **PASS** |
| **SCHED-04** | Server action `finalizeOverdueAttemptsAction` rejects candidate callers | Throws `MCQJ-ERR-4003` (403 Forbidden) | **PASS** |
| **SCHED-05** | Delayed execution recovery: sweep finalizes attempt expired 3 hours ago | Atomically scored and finalized | **PASS** |
| **SCHED-06** | Repeat sweep idempotency: consecutive run yields 0 attempts, 0 duplicate evaluations | 0 finalized, 0 duplicates | **PASS** |
| **SCHED-07** | Database failure resilience: returns HTTP 500 to trigger scheduler retries | Clean 500 with error telemetry | **PASS** |

---

## 3. Migration Safety & Prisma Isolation Verification

### 1. Environment Variable Preservation in `prisma.config.ts`
Investigation revealed that `prisma.config.ts` previously utilized `dotenv.config({ path: ".env.local", override: true })`. This caused explicitly passed environment variables (e.g. `$env:DIRECT_URL=...` pointing to local Docker) to be overwritten by `.env.local`'s remote Supabase credentials.

**Resolution:** Updated [`prisma.config.ts`](file:///d:/mcq-junction/prisma.config.ts) to capture `process.env.DIRECT_URL` and `process.env.DATABASE_URL` prior to loading `dotenv`, restoring the explicit variables if present.

### 2. Prisma Migration Status & Ledger Tracking
Updated [`scripts/bootstrap-test-db.mjs`](file:///d:/mcq-junction/scripts/bootstrap-test-db.mjs) to execute official `npx prisma migrate deploy` instead of raw SQL concatenation. This populates `_prisma_migrations` on the local database and enables `prisma migrate status` tracking.

**Verification Result:**
```
$ npx prisma migrate status
Database schema is up to date!
10 migrations found in prisma/migrations
```

### 3. Remote Database Isolation Boundary
All database operations and test executions strictly targeted the local disposable PostgreSQL 16 container (`127.0.0.1:5433/mcq_junction_test`).
- **Remote Host in `.env.local`:** `aws-0-ap-northeast-1.pooler.supabase.com`
- **Remote Database Mutations:** Exactly **0** (untouched).
- **Isolation Safety:** Guaranteed fail-closed via `scripts/release-preflight.mjs` and test database guards.

---

## 4. Next.js 16 Turbopack Production Compilation

### Route Segment Compatibility Fix
During production compilation with `next build`, Turbopack reported:
```
Error: Route segment config "dynamic" is not compatible with nextConfig.cacheComponents. Please remove it.
```
In Next.js 16 with `cacheComponents` enabled, `export const dynamic = "force-dynamic"` is deprecated in favor of `await connection()` from `next/server.js`.

**Resolution:**
1. Removed `export const dynamic = "force-dynamic"` from `src/app/api/cron/finalize-overdue-attempts/route.ts`.
2. Maintained `await connection()` inside the request handler.
3. Verified clean production compilation across all 23 application routes:
   - `ƒ /api/cron/finalize-overdue` (Dynamic)
   - `ƒ /api/cron/finalize-overdue-attempts` (Dynamic)
   - `ƒ /api/db-health` (Dynamic)
   - `◐ /exam/[paperId]` (Partial Prerendering)
   - `◐ /exam/[paperId]/attempt/[attemptId]` (Partial Prerendering)
   - `ƒ /admin/papers` (Dynamic)

---

## 5. Comprehensive Quality & Release Verification Matrix

| Verification Dimension | Scope / Test Suite | Executed Result | Status |
| :--- | :--- | :--- | :--- |
| **Unit & Domain Test Suites** | 12 Suites: Auth, Scoring, Headers, Admin, Types, Shuffling | **124 / 124 Specs Passed** (8.0s) | **PASS** |
| **PostgreSQL Exam Database Suite** | Start, resume, CAS, expiry, concurrent saves, sweeps | **20 / 20 Specs Passed** (6.8s) | **PASS** |
| **PostgreSQL Core Domain Suite** | Immutability, relational integrity, publication gates | **19 / 19 Specs Passed** (5.1s) | **PASS** |
| **PostgreSQL Workflow Suite** | Admin publication, reordering, two-tier ledger | **10 / 10 Specs Passed** (2.9s) | **PASS** |
| **PostgreSQL Passage Suite** | Multi-language passage linking & Gate 7 checks | **7 / 7 Specs Passed** (1.2s) | **PASS** |
| **PostgreSQL Scheduler Suite** | Cron auth, fail-closed, delayed recovery, idempotency | **7 / 7 Specs Passed** (1.2s) | **PASS** |
| **Browser Lifecycle E2E Suite** | Playwright Chromium: 14 candidate lifecycle specifications | **14 / 14 Specs Passed** (34.2s) | **PASS** |
| **Visual Evidence Artifacts** | High-resolution UI screenshots of all candidate lifecycle stages | **14 Artifacts Captured & Verified** | **PASS** |
| **Static Type Safety** | Entire Codebase (`tsc --noEmit`) | **0 Errors** | **PASS** |
| **Linter & Code Standards** | ESLint 9 (`next/core-web-vitals` + React 19 rules) | **0 Errors, 0 Warnings** | **PASS** |
| **Production Build** | Next.js 16.4.0 Turbopack (`next build`) | **23 Routes Compiled (0 Errors)** | **PASS** |
| **Release Preflight Audit** | 10 Sequential migrations, schema validation, cron handlers | **All Checks Passed (Exit Code 0)** | **PASS** |
| **Prisma Migration Status** | `npx prisma migrate status` against local PostgreSQL | **Database schema is up to date!** | **PASS** |
| **Secret & Credential Scan** | Pattern matching against all tracked and untracked files | **0 Secrets / Tokens Committed** | **PASS** |
| **Total Automated Tests** | All verified unit, database, and browser test specs | **201 / 201 Passed (100% Green)** | **PASS** |

---

## 6. Modified Files Ledger

The following repository files were added or updated during Phase 12:

1. [`src/app/api/cron/finalize-overdue-attempts/route.ts`](file:///d:/mcq-junction/src/app/api/cron/finalize-overdue-attempts/route.ts): New primary autonomous finalization cron route handler with bearer authentication, structured logging, and retry status.
2. [`src/app/api/cron/finalize-overdue/route.ts`](file:///d:/mcq-junction/src/app/api/cron/finalize-overdue/route.ts): Alias cron route handler.
3. [`vercel.json`](file:///d:/mcq-junction/vercel.json): Vercel Cron configuration invoking finalization route every 1 minute.
4. [`src/app/exam/actions.ts`](file:///d:/mcq-junction/src/app/exam/actions.ts): Hardened `finalizeOverdueAttemptsAction` with `assertAdminSession()`.
5. [`src/lib/exam/service.ts`](file:///d:/mcq-junction/src/lib/exam/service.ts): Removed explicit `any` casts in `mapDatabaseExamError` for complete ESLint compliance.
6. [`prisma.config.ts`](file:///d:/mcq-junction/prisma.config.ts): Preserved explicit environment variables (`DIRECT_URL`, `DATABASE_URL`) from dotenv override.
7. [`scripts/bootstrap-test-db.mjs`](file:///d:/mcq-junction/scripts/bootstrap-test-db.mjs): Integrated official `npx prisma migrate deploy` to track migrations in `_prisma_migrations`.
8. [`package.json`](file:///d:/mcq-junction/package.json): Added `tests/scheduler-finalization.test.mjs` to `test:db`.
9. [`tests/scheduler-finalization.test.mjs`](file:///d:/mcq-junction/tests/scheduler-finalization.test.mjs): New dedicated test suite with 7 specifications for cron authentication, delayed execution, idempotency, and retries.
10. [`tests/candidate-lifecycle-browser.test.mjs`](file:///d:/mcq-junction/tests/candidate-lifecycle-browser.test.mjs): Hoisted `.env.local` stashing paths and ensured fail-safe restoration in `finally`.
11. [`scripts/release-preflight.mjs`](file:///d:/mcq-junction/scripts/release-preflight.mjs): Updated preflight validator for Phase 12 migrations, cron endpoints, and Vercel configuration.
12. [`docs/deployment/STAGING_RUNBOOK.md`](file:///d:/mcq-junction/docs/deployment/STAGING_RUNBOOK.md): Updated staging runbook with `CRON_SECRET` configuration, Vercel Cron setup, and verified metrics.
13. [`docs/reports/findings-phase12.json`](file:///d:/mcq-junction/docs/reports/findings-phase12.json): Machine-readable findings and metrics ledger.
14. [`docs/reports/MCQ_Junction_Phase12_Staging_Preparation_Report.md`](file:///d:/mcq-junction/docs/reports/MCQ_Junction_Phase12_Staging_Preparation_Report.md): Markdown release assurance report.

---

## 7. Next Action Requiring Human Authorization

The codebase, test suites, migration sequence, and operational runbook are fully prepared and validated for staging deployment.

> [!IMPORTANT]
> **Human Approval Gate:**
> No remote database migrations have been executed. To proceed with the hosted staging release, human authorization is required to execute the following steps as detailed in [STAGING_RUNBOOK.md](file:///d:/mcq-junction/docs/deployment/STAGING_RUNBOOK.md):
> 1. Set environment variables on the hosting platform (Vercel / Supabase), including `CRON_SECRET`, `DATABASE_URL`, and `DIRECT_URL`.
> 2. Execute `npx prisma migrate deploy` targeting the staging `DIRECT_URL` (direct port 5432).
> 3. Verify deployment via `curl https://staging.mcqjunction.com/api/db-health`.
