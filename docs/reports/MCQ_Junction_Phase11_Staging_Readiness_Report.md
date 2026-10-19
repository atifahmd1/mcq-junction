# MCQ Junction — Phase 11: Staging Readiness, Security Closure & Operational Runbook Report

**Document ID:** `MCQJ-PHASE11-STAGING-READINESS-REPORT`  
**Date:** October 19, 2026  
**Auditor / Roles:** Principal Engineer, Database Security Engineer, Assessment-System Architect, Release Manager  
**Repository Branch:** `main`  
**Target Milestone:** Phase 11 — Staging Readiness, Security Closure & Operational Runbook  
**Final Release Verdict:** **PASS WITH DOCUMENTED LIMITATIONS**  

---

## 1. Executive Summary & Verdict

Phase 11 completes the formal release assurance, operational hardening, and security closure required for staging deployment of MCQ Junction. The assessment platform was verified against real PostgreSQL 16 containerized databases, headless Chromium browser instances, strict static analysis, and credential safety scans.

### Final Milestone Verdict: **PASS WITH DOCUMENTED LIMITATIONS**
* **Local Verification Verdict:** **PASS (100% Green)**
  * **194 / 194 Automated Tests Passed (0 Failed, 0 Skipped)**
  * **124 Unit & Domain Tests** covering scoring, evaluation, validation, schemas, and security headers.
  * **56 PostgreSQL Integration Tests** covering immutability triggers, relational integrity, publication gates, optimistic concurrency, and autonomous sweeps.
  * **14 Playwright Browser E2E Lifecycle Specifications** with 13 visual UI artifacts verifying full candidate flow from unauthenticated redirect to scorecard locking.
  * **0 TypeScript Errors** (`tsc --noEmit`).
  * **0 ESLint Errors / Warnings** (`eslint`).
  * **Next.js 16.4.0 Production Build Succeeded** with 21 App Router routes compiled cleanly with Turbopack and Partial Prerendering (PPR).
  * **Release Preflight Validated** all 10 sequential migrations and database isolation guards.
  * **Zero Remote Mutations:** Hosted Supabase remained 100% untouched with fail-closed isolation guards.
* **Documented Limitations:**
  1. **Hosted Staging Deployment Deferred to Human Approval:** In strict adherence to security rules, remote migrations (`npx prisma migrate deploy`) and hosting provider deployments were not executed automatically. Complete step-by-step instructions are codified in [STAGING_RUNBOOK.md](file:///d:/mcq-junction/docs/deployment/STAGING_RUNBOOK.md).
  2. **External OAuth Provider Credentials:** Live OAuth authentication (GitHub / Google) was validated via a local mock Supabase Auth server (`127.0.0.1:54321`). Production OAuth client secrets must be added via the Supabase dashboard before public end-user staging access.

---

## 2. Gate 1 — Deadline and Recovery Semantics

### Architectural Analysis: Three Distinct Timing Concepts

A critical assessment-system invariant is the separation of timing authorities:

```
[Candidate Starts Exam] ──────────► [Authoritative Deadline: expires_at] ──────────► [Autonomous Sweep] ────────► [Final Evaluation]
                                                ▲                                             ▲                           ▲
                                    Enforced immediately at                     Tolerates latency / runs        Timestamp when evaluation
                                   saveAttemptAnswer() (server)               every 60s or on-demand          record is committed to ledger
```

1. **The Authoritative Answer-Save Deadline:**
   * **Definition:** Stored at attempt inception as `expires_at = started_at + total_duration_minutes * 60000`.
   * **Enforcement:** Enforced directly on the application server in `saveAttemptAnswer()`:
     ```typescript
     const now = Date.now();
     const deadline = attempt.expiresAt.getTime();
     if (now > deadline) {
       if (attempt.attemptStatus === AttemptStatus.IN_PROGRESS) {
         await submitExamAttempt({ attemptId: attempt.id, reason: "AUTO_EXPIRED_ON_LATE_SAVE" }, candidateUser, ctx).catch(() => {});
       }
       throw new ExamServiceError("The examination deadline has expired. Answers can no longer be accepted.", "MCQJ-ERR-6003", 403);
     }
     ```
   * **Guaranteed Invariant:** **No answer can be saved after `expires_at` under any circumstances**, regardless of client clock tampering, browser state, network latency, or whether the sweep has executed. Late answer saves trigger auto-finalization and immediately fail closed with `MCQJ-ERR-6003` (403 Forbidden).
   * **Database Trigger Protection:** PostgreSQL trigger `trg_attempt_responses_mutation_guard` independently raises `MCQJ-ERR-6002` if an attempt is no longer `IN_PROGRESS`.

2. **The Sweep's Scheduling Tolerance:**
   * **Definition:** `finalizeOverdueAttempts()` scans for attempts with `attemptStatus = 'IN_PROGRESS'` AND `expires_at <= now()`.
   * **Tolerance Independence:** Whether the sweep runs every 10 seconds, every 5 minutes, or encounters a temporary scheduler delay (e.g. 2 hours late), candidate answer saves remain strictly blocked by the authoritative deadline check.
   * **Idempotency:** Verified via `DB-EXAM-16`. When run repeatedly, subsequent sweep runs find 0 overdue attempts and leave existing evaluations intact.

3. **The Finalization & Evaluation Timestamp:**
   * `answeredAt`: Recorded per question when the candidate saves an answer before the deadline.
   * `evaluatedAt`: Recorded when `submitExamAttempt()` calculates scores and commits the evaluation record to `attempt_evaluations`.

### Empirical Verification of Gate 1:
* `DB-EXAM-10`: Deadline expiry strictly blocks answer saves (`MCQJ-ERR-6003`).
* `DB-EXAM-14`: Autonomous sweep finalizes abandoned overdue attempts.
* `DB-EXAM-15`: Late answer save on expired attempt auto-finalizes attempt and rejects late write with `MCQJ-ERR-6003`.
* `DB-EXAM-16`: Repeated sweep executions are strictly idempotent (second run finds 0 attempts, evaluation count remains 1).
* `DB-EXAM-17`: Concurrent manual submit and system sweep resolve to exactly one evaluation record without collisions.
* `DB-EXAM-18`: Delayed sweep execution (2 hours late) cleanly recovers and evaluates overdue attempt without duplicate records.

---

## 3. Gate 2 — Concurrency and Examination Integrity

### 1. Atomic Version-Predicate Compare-and-Swap (CAS)
* In `saveAttemptAnswer()`, answers are updated using Prisma `updateMany` with a strict version condition:
  ```typescript
  const updated = await tx.attemptResponse.updateMany({
    where: { id: existing.id, version: input.clientVersion },
    data: { ... version: existing.version + 1, answeredAt: new Date() },
  });
  if (updated.count === 0) {
    return { success: false, status: "STALE_REJECTED", code: "VERSION_CONFLICT" };
  }
  ```
* **Simultaneous Writes:** If two concurrent requests arrive with client version 1, exactly one transaction matches `version: 1` and increments to 2. The second transaction encounters `updated.count === 0`, rolls back, and returns actionable `VERSION_CONFLICT` with the current server version. Verified by `DB-EXAM-11`.
* **Concurrent First-Time Inserts:** Guarded by unique constraint `uk_response_attempt_occurrence`. Concurrent first-time inserts catch `P2002` collisions and return safe conflict status without duplicate rows. Verified by `DB-EXAM-12`.

### 2. Idempotent Double-Submission Protection
* `submitExamAttempt()` applies atomic status CAS:
  ```typescript
  const updateRes = await tx.testAttempt.updateMany({
    where: { id: attempt.id, attemptStatus: { in: [AttemptStatus.IN_PROGRESS, AttemptStatus.EXPIRED] } },
    data: { attemptStatus: AttemptStatus.SUBMITTED, submittedAt },
  });
  ```
* Rapid double-clicks or auto-submit races resolve idempotently to the existing evaluation record v1. Verified by `DB-EXAM-13`.

### 3. Booklet Ordering & Option Invariance
* Question permutations (Mulberry32 PRNG) are deterministic based on `paper_id + series_code`.
* Comprehension child questions are grouped into atomic contiguous units by `passage_id`.
* Verified by `SPEC-09` that browser page reloads restore identical question sequence, option mapping, responses, review marks, and countdown timer.

### 4. Zero Leakage of Correct Answers & Answer Keys (Privacy Gate)
* `CandidateQuestionView` projection in `getExamAttempt` and `startExamAttempt` strictly omits `isCorrect`, `correctOptionLabels`, `correctSourceOptionIds`, `answerKey`, and explanations. Verified by `DB-EXAM-19`.

### 5. Multi-Tenant Cross-Candidate Isolation
* Candidate ownership is strictly validated on every read, save, and submit operation (`attempt.userId !== candidateUser.id`).
* Cross-candidate access attempts are rejected with `MCQJ-ERR-6005` (403 Forbidden). Verified by `DB-EXAM-20` and `SPEC-13`.

---

## 4. Gate 3 — Authentication and Authorization

### Server Entry-Point Audit

| Entry Point | Route / Handler | Session Assertion | Role Lookup | Authorization Invariants |
| :--- | :--- | :--- | :--- | :--- |
| **Start Attempt** | `startExamAction` | `assertCandidateSession()` | `public.users` table | Verifies active non-banned candidate. Validates paper is published. |
| **Save Answer** | `saveAnswerAction` | `assertCandidateSession()` | `public.users` table | Rejects anonymous callers. Validates candidate owns attempt. |
| **Submit Attempt** | `submitExamAction` | `assertCandidateSession()` | `public.users` table | Validates candidate ownership. Atomic status CAS. |
| **Overdue Sweep** | `finalizeOverdueAttemptsAction` | `assertCandidateSession()` | `public.users` table | Sweeps expired attempts for paper. |
| **Attempt Delivery UI** | `/exam/[paperId]/attempt/[attemptId]` | `assertCandidateSession()` | `public.users` table | Server-side redirect to signin if unauthenticated. Renders 403 on IDOR. |
| **Admin Operations** | `publishExamAction`, `reorderQuestionsAction` | `assertAdminSession()` | `public.users` table | Strictly requires `role === Role.ADMIN`. Blocks demoted users with 403. |
| **Admin Shell** | `/admin/*` | `assertAdminSession()` | `public.users` table | Displays "Administrative Access Denied" boundary if non-admin. |

### Open-Redirect Immunity
`sanitizeNextPath()` is strictly enforced on `/auth/signin`, OAuth redirect initiation, and `/auth/callback`. It rejects protocol-relative (`//evil.com`), backslash (`/\\evil.com`), external (`https://evil.com`), and JavaScript URI schemes, safely falling back to `/dashboard`. Verified by unit tests in `tests/auth-validation.test.mjs`.

---

## 5. Gate 4 — Migration & Staging Safety

### 10 Sequential Forward-Only Migrations

All 10 migrations were inspected in chronological order and validated against `prisma/schema.prisma`:

1. `20261010145726_init_database_test` — Baseline schema.
2. `20261010164000_add_user_model` — User table with auth.users link.
3. `20261010191034_alter_user_id_uuid_and_enable_rls` — UUID primary keys and RLS.
4. `20261010192500_add_role_enum_to_users` — Role enum (`STUDENT`, `CONTRIBUTOR`, `REVIEWER`, `ADMIN`).
5. `20261012000000_phase3_domain_models_and_integrity_guards` — Complete domain hierarchy, triggers, and publication procedure.
6. `20261012140000_revoke_authenticated_privileged_rpc` — Revoked EXECUTE on `fn_publish_exam_paper` from PUBLIC, anon, and authenticated.
7. `20261013000000_add_detailed_concepts_and_option_explanations` — Detailed concept entities and option explanations.
8. `20261016000000_phase8_question_types_and_answer_evaluation` — Canonical question types and evaluation rules.
9. `20261016120000_phase8_1_comprehension_passages_and_all_or_nothing_scoring` — Comprehension passages and all-or-nothing scoring.
10. `20261016140000_phase9_examination_engine_and_candidate_delivery` — `EXPIRED` status, `expires_at`, monotonic `version`, and status guard triggers.

### Isolation Safeguards
* `release-preflight.mjs` and `bootstrap-test-db.mjs` enforce that `TEST_DATABASE_URL` can **only** point to `127.0.0.1:5433/mcq_junction_test`. Any invocation targeting remote hostnames immediately fails closed.
* Remote hosted Supabase was **never mutated** during testing.

---

## 6. Gate 5 — Staging Configuration & Operational Runbook

A complete operational runbook was created at [**`docs/deployment/STAGING_RUNBOOK.md`**](file:///d:/mcq-junction/docs/deployment/STAGING_RUNBOOK.md).

Key operational procedures defined:
* **Environment Configuration:** Non-sensitive descriptions of all required runtime variables (`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SSL_ROOT_CERT`).
* **Supabase Auth & OAuth Allow-Lists:** Required redirect URIs and provider callback configurations.
* **Database Connection & TLS:** Requirements for port 6543 (transaction pooler with pgbouncer) vs port 5432 (direct session for migrations) and root CA validation.
* **Migration Runbook:** Manual 3-step migration execution (`validate` -> `status` -> `deploy`) with post-migration verification SQL queries.
* **Build & Smoke Tests:** Production compile and 4-point post-deployment smoke test suite.
* **Telemetry & Monitoring:** Metric alarm thresholds for version conflicts, deadline expirations, and state regressions.
* **Incident Response & Emergency Rollback:** Clear procedures for application rollbacks, stuck attempt finalization, and schema compatibility.
* **Local vs Hosted Separation:** Explicit demarcation between local verification and human-authorized cloud tasks.

---

## 7. Gate 6 — Comprehensive Release Verification Matrix

| Verification Dimension | Scope / Test Suite | Executed Result | Status |
| :--- | :--- | :--- | :--- |
| **Unit & Domain Test Suites** | 12 Suites: Auth, Scoring, Headers, Admin, Types, Shuffling | **124 / 124 Specs Passed** (7.7s) | **PASS** |
| **PostgreSQL Exam Database Suite** | Start, resume, CAS, expiry, concurrent saves, sweeps | **20 / 20 Specs Passed** (6.4s) | **PASS** |
| **PostgreSQL Core Domain Suite** | Immutability, relational integrity, publication gates | **19 / 19 Specs Passed** (4.9s) | **PASS** |
| **PostgreSQL Workflow Suite** | Admin publication, reordering, two-tier ledger | **10 / 10 Specs Passed** (2.8s) | **PASS** |
| **PostgreSQL Passage Suite** | Multi-language passage linking & Gate 7 checks | **7 / 7 Specs Passed** (1.1s) | **PASS** |
| **Browser Lifecycle E2E Suite** | Playwright Chromium: 14 E2E lifecycle specifications | **14 / 14 Specs Passed** (32.8s) | **PASS** |
| **Visual Evidence Artifacts** | High-resolution UI screenshots of all lifecycle stages | **13 Artifacts Captured & Verified** | **PASS** |
| **Static Type Safety** | Entire Codebase (`tsc --noEmit`) | **0 Errors** | **PASS** |
| **Linter & Code Standards** | ESLint 9 (`next/core-web-vitals` + React 19 rules) | **0 Errors, 0 Warnings** | **PASS** |
| **Production Build** | Next.js 16.4.0 Turbopack (`next build`) | **21 Routes Compiled (0 Errors)** | **PASS** |
| **Release Preflight Audit** | 10 Sequential migrations, schema validation, safety | **All Checks Passed (Exit Code 0)** | **PASS** |
| **Secret & Credential Scan** | Pattern matching against all tracked and untracked files | **0 Secrets / Tokens Committed** | **PASS** |
| **Total Automated Tests** | All verified unit, database, and browser test specs | **194 / 194 Passed (100% Green)** | **PASS** |

---

## 8. Modified Files Ledger

The following repository files were added or modified during Phase 11:

1. [`tests/exam-database.test.mjs`](file:///d:/mcq-junction/tests/exam-database.test.mjs): Added `DB-EXAM-16` through `DB-EXAM-20` testing repeated sweeps, concurrent sweep/submit overlap, delayed sweep recovery, candidate API privacy redaction, and cross-candidate isolation.
2. [`tests/auth-validation.test.mjs`](file:///d:/mcq-junction/tests/auth-validation.test.mjs): Added unit tests for `assertCandidateSession` error states (null session, anonymous user, suspended user, deactivated user, missing user record) and `sanitizeNextPath` open-redirect immunity.
3. [`tests/candidate-lifecycle-browser.test.mjs`](file:///d:/mcq-junction/tests/candidate-lifecycle-browser.test.mjs): Refined Playwright locators for palette grid buttons, exact modal summary counts, and completed examination status.
4. [`docs/deployment/STAGING_RUNBOOK.md`](file:///d:/mcq-junction/docs/deployment/STAGING_RUNBOOK.md): Complete operational and staging deployment runbook.
5. [`docs/reports/findings-phase11.json`](file:///d:/mcq-junction/docs/reports/findings-phase11.json): Structured JSON findings and metric ledger.
6. [`docs/reports/MCQ_Junction_Phase11_Staging_Readiness_Report.md`](file:///d:/mcq-junction/docs/reports/MCQ_Junction_Phase11_Staging_Readiness_Report.md): Markdown release assurance report.
7. [`docs/reports/MCQ_Junction_Phase11_Staging_Readiness_Report.html`](file:///d:/mcq-junction/docs/reports/MCQ_Junction_Phase11_Staging_Readiness_Report.html): Standalone HTML report with embedded styles and architecture diagrams.
8. [`docs/PHASE_3_EXECUTION_STATE.md`](file:///d:/mcq-junction/docs/PHASE_3_EXECUTION_STATE.md): Updated state and decision record.

---

## 9. Next Action Requiring User Approval

The codebase and local verification artifacts are fully prepared and validated for staging.

**Next Required Action:**
To execute the live staging deployment, the user must provide explicit approval to:
1. Configure staging environment variables on hosting provider (e.g. Vercel / Supabase Staging).
2. Execute `npx prisma migrate deploy` targeting the staging `DIRECT_URL` (port 5432).
3. Trigger the initial staging production deployment.
