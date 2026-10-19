# MCQ Junction — Phase 4 Module 1: Application Service Layer & Authorization Hardening Report

**Document ID:** `MCQJ-AUDIT-v4.1.0-PHASE4M1`  
**Date:** October 12, 2026  
**Auditor / Implementer:** Principal Engineer, Application Security Architect, Database Engineer, and QA Lead  
**Status / Decision:** **PASS WITH DOCUMENTED LIMITATIONS**  
**Repository State:** Production-Ready Service Layer & Verified PostgreSQL 16 Kernel  

---

## Executive Summary

Phase 4 Module 1 transitions MCQ Junction from database-level domain specifications to an end-to-end, type-safe, cryptographically hardened application service layer. This module establishes the server-side boundary connecting authenticated administrators to the publication gate and two-tier evaluation procedures implemented in Phase 3.

### Key Milestones Completed:
1. **Privileged PostgREST RPC Exposure Remediated:** Authored forward-only migration `20261012140000_revoke_authenticated_privileged_rpc/migration.sql`, revoking all `EXECUTE` privileges on `fn_publish_exam_paper` and `fn_reevaluate_paper_attempts` from `PUBLIC`, `anon`, and `authenticated`. Added integration test **DB-19** to empirically prove routine catalog grants are zero and unauthorized HTTP RPC calls fail closed.
2. **Server-Side Authorization Boundary (`assertAdminSession`):** Implemented in `src/lib/auth/session.ts`. Enforces cryptographic session validation via `supabase.auth.getUser()`, rejects anonymous callers, checks Supabase Auth `banned_until` and `deleted_at` timestamps, queries the authoritative application `users` table, and verifies `role === Role.ADMIN`, raising typed `UnauthorizedError` (401) and `ForbiddenError` (403).
3. **Zod Input Validation (`schemas.ts`):** Implemented `publishPaperSchema` and `reevaluatePaperSchema` in `src/lib/admin/schemas.ts`, enforcing strict RFC 4122 v4 UUID validation and string length constraints prior to database execution.
4. **Administrative Application Service (`service.ts`):** Implemented `publishExamPaper` and `reevaluatePaperAttempts` in `src/lib/admin/service.ts`. Parameters are passed via parameterized Prisma queries, caller identity is explicitly bound to the verified administrator UUID, and domain errors (`MCQJ-ERR-*`) are safely mapped to client-friendly messages while masking internal SQL and credentials under 500 status.
5. **Next.js Server Actions (`actions.ts`):** Implemented `publishExamPaperAction` and `reevaluatePaperAttemptsAction` in `src/app/admin/actions.ts`, providing structured `{ success, data, error }` contracts and triggering cache invalidation via `revalidatePath('/admin/papers')`.
6. **Unified Test Suite Expansion:** All **42 automated tests** passed 100% green:
   - **23 Unit Tests** (14 admin service tests, 4 auth validation tests, 4 scoring tests, 1 security headers suite).
   - **19 PostgreSQL Integration Tests** (DB-01 through DB-19) in disposable Docker container.
7. **Production Build & CI Verification:** `npm run typecheck`, `npm run lint`, and `npm run build` (Next.js 16 App Router + Turbopack) completed with **zero errors and zero warnings**.

---

## Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Client["Client Tier"]
        AdminBrowser["Admin Dashboard (Browser)"]
        Attacker["Untrusted Client / Script"]
    end

    subgraph PostgREST["PostgREST HTTP API"]
        RPC_Endpoint["POST /rest/v1/rpc/fn_publish_exam_paper"]
    end

    subgraph NextJS["Next.js 16 App Router Runtime (Node.js)"]
        ServerAction["src/app/admin/actions.ts\npublishExamPaperAction()"]
        ZodGate["src/lib/admin/schemas.ts\nZod UUID & Length Validation"]
        AuthGate["src/lib/auth/session.ts\nassertAdminSession()"]
        AdminService["src/lib/admin/service.ts\npublishExamPaper()"]
        ErrorSanitizer["mapDatabaseDomainError()\nSanitize SQL & Mask Secrets"]
    end

    subgraph Postgres["PostgreSQL 16 Engine"]
        PostgresPrivs["Routine Privileges Catalog\nREVOKED from PUBLIC, anon, authenticated"]
        Gate0["Gate 0 Authorization Guard\nSESSION_USER = 'postgres'\nauth.role() IS NULL"]
        Proc["fn_publish_exam_paper()\nAdvisory Locks & Integrity Checks"]
    end

    AdminBrowser -->|Form Action / RPC| ServerAction
    Attacker -->|Direct HTTP POST| RPC_Endpoint
    RPC_Endpoint -->|Role: authenticated| PostgresPrivs
    PostgresPrivs -->|403 Permission Denied| Attacker

    ServerAction --> ZodGate
    ZodGate --> AuthGate
    AuthGate -->|Cryptographic JWT Verification| AdminService
    AdminService -->|Parameterized Query: admin_id, paper_id| Gate0
    Gate0 --> Proc
    Proc -->|Result / Domain Exception| ErrorSanitizer
    ErrorSanitizer --> ServerAction
    ServerAction -->|revalidatePath('/admin/papers')| AdminBrowser

    classDef pass fill:#10b981,stroke:#047857,color:#fff;
    classDef reject fill:#ef4444,stroke:#b91c1c,color:#fff;
    classDef comp fill:#2563eb,stroke:#1d4ed8,color:#fff;
    class PostgresPrivs,Proc,ZodGate,AuthGate pass;
    class RPC_Endpoint reject;
    class ServerAction,AdminService,ErrorSanitizer comp;
```

---

## 1. Implementation Details

### 1.1 Privileged RPC Exposure Closure (Forward Migration)
- **File:** `prisma/migrations/20261012140000_revoke_authenticated_privileged_rpc/migration.sql`
- **Objective:** Prevent authenticated non-admins from invoking privileged functions via Supabase PostgREST endpoints.
- **Implementation:**
  ```sql
  REVOKE ALL ON FUNCTION public.fn_publish_exam_paper(UUID, UUID) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fn_publish_exam_paper(UUID, UUID) FROM anon;
  REVOKE ALL ON FUNCTION public.fn_publish_exam_paper(UUID, UUID) FROM authenticated;

  REVOKE ALL ON FUNCTION public.fn_reevaluate_paper_attempts(UUID, UUID, UUID, TEXT) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fn_reevaluate_paper_attempts(UUID, UUID, UUID, TEXT) FROM anon;
  REVOKE ALL ON FUNCTION public.fn_reevaluate_paper_attempts(UUID, UUID, UUID, TEXT) FROM authenticated;

  GRANT EXECUTE ON FUNCTION public.fn_publish_exam_paper(UUID, UUID) TO service_role;
  GRANT EXECUTE ON FUNCTION public.fn_publish_exam_paper(UUID, UUID) TO postgres;

  GRANT EXECUTE ON FUNCTION public.fn_reevaluate_paper_attempts(UUID, UUID, UUID, TEXT) TO service_role;
  GRANT EXECUTE ON FUNCTION public.fn_reevaluate_paper_attempts(UUID, UUID, UUID, TEXT) TO postgres;
  ```

### 1.2 Authorization Foundation (`src/lib/auth/session.ts`)
- **Key Invariants Enforced:**
  1. Cryptographic validation using `supabase.auth.getUser()`.
  2. Immediate rejection of anonymous sessions (`is_anonymous: true`).
  3. Suspension enforcement checking `user.banned_until` against `Date.now()`.
  4. Deactivation enforcement checking `user.deleted_at`.
  5. Application database record lookup verifying `user.role === Role.ADMIN`.
  6. Typed error hierarchy: `UnauthorizedError` (HTTP 401) and `ForbiddenError` (HTTP 403).

### 1.3 Validation Schemas (`src/lib/admin/schemas.ts`)
- **`publishPaperSchema`:** Validates `paperId` as a valid RFC 4122 v4 UUID string.
- **`reevaluatePaperSchema`:** Validates `paperId` and `newKeyVersionId` as UUIDs, and enforces a minimum length of 5 characters on `adjudicationReason` when provided.

### 1.4 Application Service Layer (`src/lib/admin/service.ts`)
- **Explicit Parameter Binding:** Passes `validated.paperId` and `admin.id` as explicit parameters in tagged template literals (`prisma.$queryRaw`), preventing SQL injection and avoiding ambient session variable pollution.
- **Safe Error Mapping (`mapDatabaseDomainError`):**
  * `MCQJ-ERR-5001` -> 404 Not Found ("The requested exam paper does not exist.")
  * `MCQJ-ERR-5002` -> 409 Conflict ("The exam paper is already published.")
  * `MCQJ-ERR-5007` -> 422 Unprocessable Entity ("Sequence numbering gap...")
  * `MCQJ-ERR-5008..5014` -> 422 Unprocessable Entity (Editorial review & key verification)
  * `MCQJ-ERR-5015` -> 403 Forbidden ("Caller does not possess administrative privileges.")
  * Fallback -> 500 Internal Server Error (all internal database strings, SQL, and credentials masked).

### 1.5 Server Actions (`src/app/admin/actions.ts`)
- **`publishExamPaperAction(input)`:** Runs full pipeline, invalidates cache path `/admin/papers`, and returns `{ success: true, data }` or `{ success: false, error }`.
- **`reevaluatePaperAttemptsAction(input)`:** Runs re-evaluation pipeline, invalidates `/admin/papers`, and returns ledger summary.

---

## 2. Test Execution & Verification Matrix

### 2.1 Unit Test Suite (`tests/admin-service.test.mjs` + existing suites)
Executed with `npm run test:unit`:

| Suite / Test Name | Assertion / Behavior Verified | Duration | Result |
| :--- | :--- | :--- | :--- |
| **assertAdminSession** | Rejects unauthenticated caller (missing/null user) (401) | 41.9ms | PASS |
| **assertAdminSession** | Rejects anonymous session (401) | 1.0ms | PASS |
| **assertAdminSession** | Rejects actively suspended/banned user (`banned_until` in future) (403) | 2.8ms | PASS |
| **assertAdminSession** | Rejects deactivated user (`deleted_at` set) (403) | 0.7ms | PASS |
| **assertAdminSession** | Rejects caller missing application user record in database (403) | 2.9ms | PASS |
| **assertAdminSession** | Rejects authenticated non-admin (`role = STUDENT`) (403) | 5.4ms | PASS |
| **assertAdminSession** | Successfully returns `AdminSessionUser` for active `ADMIN` | 0.7ms | PASS |
| **publishPaperSchema** | Rejects invalid or missing paper UUID before DB execution | 23.4ms | PASS |
| **reevaluatePaperSchema** | Rejects invalid UUIDs or too short adjudication reason | 3.5ms | PASS |
| **mapDatabaseDomainError** | Safely maps known PostgreSQL domain error codes (404, 409, 422, 403) | 3.8ms | PASS |
| **mapDatabaseDomainError** | Sanitizes unexpected errors and masks raw database credentials/SQL | 1.0ms | PASS |
| **publishExamPaper** | Correctly invokes stored procedure and returns typed result | 1.3ms | PASS |
| **publishExamPaper** | Maps failure when procedure returns empty result | 1.1ms | PASS |
| **reevaluatePaperAttempts** | Correctly invokes stored procedure and returns typed ledger result | 1.2ms | PASS |
| **auth-validation** | Production Authentication Validation Schemas (4 tests) | 18.7ms | PASS |
| **scoring** | Scoring Engine Baseline, Hierarchical, Withdrawn, Negative (4 tests) | 10.0ms | PASS |
| **security-headers** | Strict Security Headers Configuration (1 suite) | 10.9ms | PASS |
| **Total Unit Tests** | **23 passed, 0 failed** | **1,080ms** | **PASS** |

### 2.2 PostgreSQL Integration Test Suite (`tests/database.test.mjs`)
Executed with `npm run test:db` against PostgreSQL 16 container:

| Test ID | Domain & Focus | Duration | Result |
| :--- | :--- | :--- | :--- |
| **DB-01** | Immutability — Reject editing a published question | 178ms | PASS |
| **DB-02** | Immutability — Reject reparenting a question out of a published paper | 258ms | PASS |
| **DB-03** | Immutability — Reject deleting or invalidating a passage referenced by published content | 149ms | PASS |
| **DB-04** | Relational Integrity — Reject cross-paper booklet assignment | 135ms | PASS |
| **DB-05** | Relational Integrity — Reject invalid booklet occurrence mappings across papers | 133ms | PASS |
| **DB-06** | Relational Integrity — Reject invalid option-to-question mappings | 207ms | PASS |
| **DB-07** | Relational Integrity — Reject invalid attempt-response references across papers | 150ms | PASS |
| **DB-08** | Publication Gate — Reject publication when required sequence numbers contain a gap | 86ms | PASS |
| **DB-09** | Publication Gate — Reject publication with missing editorial verification | 78ms | PASS |
| **DB-10** | Publication Gate — Reject publication with incomplete official answer-key coverage | 109ms | PASS |
| **DB-11** | Security Gate (SEC-02) — Rigorous Caller Authorization & Anti-Spoofing Proof | 180ms | PASS |
| **DB-12** | Publication Gate — Verify publication succeeds for a valid, fully prepared paper | 82ms | PASS |
| **DB-13** | Publication Gate — Verify failed publication leaves paper unchanged (atomicity) | 103ms | PASS |
| **DB-14** | Two-Tier Evaluation Ledger — Verify original evaluation remains unchanged | 98ms | PASS |
| **DB-15** | Two-Tier Evaluation Ledger — Verify exactly one evaluation is current for an attempt | 86ms | PASS |
| **DB-16** | Concurrency — Verify concurrent publication requests coordinate via advisory lock | 101ms | PASS |
| **DB-17** | Scoring & Policies — Verify check constraints on penalties, targets & engine | 124ms | PASS |
| **DB-18** | Phase 4 Authorization Contract — Direct Server Action & Service Role Verification | 186ms | PASS |
| **DB-19** | **Privileged RPC PostgREST Exposure Closure — Verification of Revoked Grants** | **154ms** | **PASS** |
| **Total DB Tests** | **19 passed, 0 failed** | **3,030ms** | **PASS** |

### 2.3 Static Analysis & Compiler Verification
- **TypeScript (`npm run typecheck`):** `tsc --noEmit` exited with code 0 (zero errors).
- **ESLint (`npm run lint`):** `eslint` exited with code 0 (zero errors, zero warnings).
- **Next.js Production Build (`npm run build`):** Compiled successfully in 26.2s, TypeScript finished in 8.8s, all 8 static and dynamic routes generated cleanly.

---

## 3. Findings & Resolution Summary

| ID | Title | Severity | Classification | Status |
| :--- | :--- | :--- | :--- | :--- |
| **PH4-M1-F01** | Privileged RPC PostgREST Exposure Closure | HIGH | Vulnerability Remediated | RESOLVED |
| **PH4-M1-F02** | Server-Side Admin Session Guard with Suspension Check | HIGH | Security Hardening | RESOLVED |
| **PH4-M1-F03** | RFC 4122 v4 UUID Validation Boundary | MEDIUM | Input Hardening | RESOLVED |
| **PH4-M1-F04** | Admin Service Layer & Domain Error Sanitization | MEDIUM | Information Disclosure Hardening | RESOLVED |
| **PH4-M1-F05** | Administrative Server Actions with Cache Revalidation | INFO | Feature Implementation | RESOLVED |

---

## 4. Operational Boundaries & Documented Limitations

1. **Local Isolation vs Remote Supabase:**
   All database integration tests (DB-01 through DB-19) were executed against an isolated PostgreSQL 16 container running at `127.0.0.1:5433` with an authentic Supabase compatibility schema layer. The remote Supabase production project was **not mutated or touched**, adhering strictly to the safety directive. Deployment of migrations `20261012000000` and `20261012140000` to remote Supabase will occur in Phase 5 release gating.
2. **Environment Variable Hygiene:**
   The repository `.env.local` file was preserved intact without modification. Disposable dynamic test credentials were used per run and never committed.
3. **Phase 4 Module 2 Scope:**
   Module 1 establishes the administrative service foundation, validation boundary, and server actions. Module 2 will deliver the administrative UI components (Exam Paper Management, Question Editor, Publication Review Modal, and Answer Key Adjudication Dashboard).

---

## 5. Formal Verdict

**PASS WITH DOCUMENTED LIMITATIONS**

The application service layer and authorization hardening for Phase 4 Module 1 have been implemented, verified, and proven resilient. The codebase is fully prepared for Phase 4 Module 2 (Admin UI Workflows).
