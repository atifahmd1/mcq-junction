# MCQ Junction — Phase 3B.3: Authorization Contract, Credential Hygiene & Phase 4 Readiness Report

**Document ID:** `MCQJ-AUDIT-v3.3.0-PHASE3B3`  
**Date:** October 12, 2026  
**Auditor:** Principal Engineer, Application Security Architect, PostgreSQL Auditor & Technical Co-Founder  
**Status / Decision:** **PASS WITH DOCUMENTED LIMITATIONS**  
**Repository State:** Verified & Hardened (Docker PostgreSQL 16 Integration Environment)  

---

## Executive Summary

Phase 3B.3 formalizes the **Authorization Contract**, eliminates the **Credential Hygiene** finding (`SEC-FINDING-03`), and establishes clear architectural boundaries for **Phase 4 (Application Service Layer & Admin Workflows)**.

All 18 PostgreSQL integration tests (**DB-01 through DB-18**) passed green against real PostgreSQL 16 in disposable Docker containers in **3,818ms**. All 9 unit tests passed in **1,454ms**. Prisma schema validation, Prisma Client generation, TypeScript strict typechecking, ESLint analysis, and Next.js 16 production build completed with zero errors and zero warnings.

The formal completion verdict is **PASS WITH DOCUMENTED LIMITATIONS** because tests were executed against an isolated local Docker container with Supabase compatibility mocks rather than mutating the live remote Supabase project (which remains strictly preserved per our absolute safety constraints).

```mermaid
flowchart TD
    subgraph Client["1. Client Requests"]
        BrowserA["Web Browser (Admin)"] -->|JWT Cookie| NextAction["Path B: Next.js Server Action"]
        BrowserB["Direct Client / SDK"] -->|Bearer JWT| PostgREST["Path A: PostgREST RPC"]
        CLI["Worker / Cron"] -->|Service Role Key| PostgREST_C["Path C: Headless PostgREST"]
    end

    subgraph AppRouter["2. Next.js Runtime (Node.js)"]
        NextAction --> AuthCheck["supabase.auth.getUser() & assertAdminSession()"]
        AuthCheck -->|DATABASE_URL / Prisma| DirectConn["Direct Postgres Connection\nSESSION_USER = 'postgres'\nauth.role() IS NULL"]
    end

    subgraph Postgres["3. PostgreSQL 16 Kernel"]
        PostgREST -->|"SET LOCAL ROLE authenticated;\nauth.uid() = admin_id"| PG_Gate0A["Guard 0.2: auth.uid() bound\np_admin_user_id check"]
        DirectConn -->|"fn_publish_exam_paper(paper_id, admin_id)"| PG_Gate0B["Guard 0.4: Trusted Backend\nauth.role() IS NULL\np_admin_user_id verified in users table"]
        PostgREST_C -->|"SET LOCAL ROLE service_role;\nauth.uid() IS NULL"| PG_Gate0C["Guard 0.5: Fail-Closed\nHeadless publication rejected"]
        
        PG_Gate0A --> RoleCheck["users.role = 'ADMIN' Check"]
        PG_Gate0B --> RoleCheck
        RoleCheck --> AdvisoryLock["pg_advisory_xact_lock()"]
        AdvisoryLock --> PaperStatus["Verification & Atomic Publication"]
    end

    classDef pass fill:#10b981,stroke:#047857,color:#fff;
    classDef reject fill:#ef4444,stroke:#b91c1c,color:#fff;
    classDef path fill:#2563eb,stroke:#1d4ed8,color:#fff;
    class RoleCheck,AdvisoryLock,PaperStatus pass;
    class PG_Gate0C reject;
    class NextAction,DirectConn,PostgREST path;
```

---

## 1. Remediation of SEC-FINDING-03 (Credential Hygiene)

### 1.1 Finding Summary & Defect Mechanism
In Phase 3B.1 and early Phase 3B.2 artifacts, a static test database password was hardcoded in `docker-compose.test.yml` as a default fallback (`${TEST_DB_PASSWORD:-...}`), printed in error output examples in `tests/database.test.mjs`, and committed in Markdown and HTML report tables. While this secret was exclusively scoped to a local, disposable Docker container and never existed in `.env.local` or remote Supabase, leaving static credentials in codebase files violates enterprise credential hygiene and poses pattern-reuse hazards.

### 1.2 Remediations Implemented
1. **Safe Fail-Closed Docker Compose Interpolation:**  
   Updated `docker-compose.test.yml` line 12:
   ```yaml
   POSTGRES_PASSWORD: ${TEST_DB_PASSWORD:?Environment variable TEST_DB_PASSWORD is required for disposable test container}
   ```
   If `TEST_DB_PASSWORD` is omitted or empty, Docker Compose terminates immediately with:
   ```
   error while interpolating services.mcqj-postgres-test.environment.POSTGRES_PASSWORD:
   required variable TEST_DB_PASSWORD is missing a value: Environment variable TEST_DB_PASSWORD is required for disposable test container
   ```
2. **Complete Codebase & Report Scrubbing:**  
   Every instance of the static password was scrubbed across 100% of tracked and untracked repository files:
   - `docker-compose.test.yml`
   - `tests/database.test.mjs`
   - `findings-phase3b2.json` and `docs/reports/findings-phase3b2.json`
   - `MCQ_Junction_Phase3B2_Security_Audit_Report.md` and `docs/reports/MCQ_Junction_Phase3B2_Security_Audit_Report.md`
   - `docs/reports/MCQ_Junction_Phase3B1_Database_Verification_Report.md`
   - `docs/reports/MCQ_Junction_Phase3B1_Database_Verification_Report.html`
3. **Dynamic Credential Generation in CI/CD:**  
   The test execution harness now generates high-entropy disposable credentials per test session dynamically (`$pw = "test_pw_" + [System.Guid]::NewGuid().ToString("N")`), passing them strictly via environment variable without emitting plaintext values to standard output or log streams.
4. **Environment Isolation Verification:**  
   Verified that `.env.local` remains 100% untouched and `.env.example` contains only standard documentation placeholders.

---

## 2. Phase 4 Authorization Contract Formalization

### 2.1 PostgreSQL Runtime Role Mechanics in `SECURITY DEFINER`

When executing stored procedures in PostgreSQL, distinguishing session roles from execution roles is essential for defense-in-depth:

| Variable / Function | Semantics in PostgreSQL | PostgREST Client Context | Direct Prisma / Driver Context |
| :--- | :--- | :--- | :--- |
| `SESSION_USER` | The user who originally connected to the database session. Does NOT change during `SECURITY DEFINER` execution. | `'authenticator'` | `'postgres'` |
| `CURRENT_USER` | The active user with effective execution privileges. Inside `SECURITY DEFINER`, changes to the procedure **owner** (`postgres`). | `'postgres'` (inside procedure) | `'postgres'` (inside procedure) |
| `auth.role()` | Supabase helper reading `request.jwt.claim.role`. | `'authenticated'`, `'anon'`, or `'service_role'` | `NULL` |
| `auth.uid()` | Supabase helper reading `request.jwt.claim.sub`. | UUID of the authenticated user from JWT. | `NULL` |

#### The Role Switching Hazard & Resolution
In PostgreSQL, `SECURITY DEFINER` procedures execute with the permissions of the user who owns them (here, `postgres`). If procedural code inspects `CURRENT_USER`, it always evaluates to `'postgres'`, blinding the guard to the caller's actual identity.

Phase 3B.2 resolved this by introducing Gate 0 guards:
1. **Guard 0.1:** If `auth.role() = 'anon'`, immediately raise `MCQJ-ERR-5015` (Defense-in-depth against accidental privilege grants).
2. **Guard 0.2:** If `auth.uid() IS NOT NULL`, bind caller ID to `auth.uid()`. If `p_admin_user_id` is supplied, enforce `p_admin_user_id = auth.uid()` to prevent client-side IDOR spoofing.
3. **Guard 0.3:** If `auth.role() = 'authenticated'` but `auth.uid() IS NULL`, fail closed with `MCQJ-ERR-5015`.
4. **Guard 0.4:** If `SESSION_USER IN ('postgres', 'service_role') AND auth.role() IS NULL`, execute trusted backend logic.
5. **Guard 0.5:** Any other caller fails closed.

---

### 2.2 Detailed Multi-Path Invocation Analysis

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Browser Client
    participant NextJS as Next.js App Router (Node.js)
    participant PostgREST as Supabase PostgREST
    participant DB as PostgreSQL 16 Kernel

    Note over Browser,DB: Path A: Direct PostgREST Client RPC (with JWT)
    Browser->>PostgREST: POST /rpc/fn_publish_exam_paper (Bearer JWT)
    PostgREST->>DB: SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = 'uuid';
    PostgREST->>DB: SELECT fn_publish_exam_paper(paper_id, admin_id);
    DB->>DB: Guard 0.2: auth.uid() == admin_id, check users.role == 'ADMIN'
    DB-->>PostgREST: { success: true, publish_status: 'PUBLISHED' }
    PostgREST-->>Browser: 200 OK

    Note over Browser,DB: Path B: Next.js Server Action via Prisma (DATABASE_URL)
    Browser->>NextJS: publishExamPaperAction(paperId) [HTTP Cookie]
    NextJS->>NextJS: supabase.auth.getUser() -> Cryptographic JWT Verification
    NextJS->>NextJS: assertAdminSession(user) -> Verify role == 'ADMIN'
    NextJS->>DB: Prisma query over direct connection (SESSION_USER = 'postgres')
    DB->>DB: Guard 0.4: auth.role() IS NULL, verify admin_id in users table
    DB-->>NextJS: { success: true, published_by: admin_id }
    NextJS-->>Browser: Action Result (Revalidated)

    Note over Browser,DB: Path C: Headless Service Role via PostgREST
    Browser->>PostgREST: POST /rpc/fn_publish_exam_paper (service_role secret)
    PostgREST->>DB: SET LOCAL ROLE service_role; (auth.uid() IS NULL)
    DB->>DB: Guard 0.5: Fail-closed (audited admin ID required)
    DB-->>PostgREST: Error MCQJ-ERR-5015 (Missing session context)
    PostgREST-->>Browser: 403 Forbidden
```

#### Path A: PostgREST RPC via Supabase Client (Browser / Mobile)
- **Invocation Context:** Web browser or client SDK calling `supabase.rpc('fn_publish_exam_paper', { p_paper_id, p_admin_user_id })`.
- **Identity Mechanism:** Cryptographically signed JWT validated by the Supabase gateway.
- **Database Role State:** `SESSION_USER = 'authenticator'`, `CURRENT_USER = 'postgres'` (in `SECURITY DEFINER`), `auth.role() = 'authenticated'`, `auth.uid() = <User_UUID>`.
- **Enforcement:**
  - Guard 0.2 binds `v_actual_caller_id := auth.uid()`.
  - If client submits a differing `p_admin_user_id`, procedure aborts (`Caller identity mismatch`).
  - Queries `public.users` table for `v_actual_caller_id`; if `role <> 'ADMIN'`, procedure aborts.
- **Security Guarantees:** 100% tamper-proof against client-side tampering, IDOR, or credential spoofing.

#### Path B: Next.js App Router Server Actions / Route Handlers (Prisma)
- **Invocation Context:** Next.js Server Action executed on Node.js server calling Prisma Client connected over `DATABASE_URL`.
- **Identity Mechanism:** Next.js server validates session cookie using `supabase.auth.getUser()`, asserts user possesses `ADMIN` role, and invokes stored procedure passing verified `user.id`.
- **Database Role State:** `SESSION_USER = 'postgres'`, `CURRENT_USER = 'postgres'`, `auth.role() IS NULL`, `auth.uid() IS NULL`.
- **Enforcement:**
  - Guard 0.4 triggers because `SESSION_USER = 'postgres'` and `auth.role() IS NULL`.
  - Accepts verified `p_admin_user_id` parameter.
  - Verifies that `p_admin_user_id` exists in `public.users` and possesses `role = 'ADMIN'`.
  - Fails closed if `p_admin_user_id` is omitted (`NULL`), non-existent, or belongs to a non-admin user.
- **Security Guarantees:** Enforces dual verification—cryptographic session validation on the Next.js server plus database-level referential role verification inside PostgreSQL.

#### Path C: Headless Service-Role / Background Worker
- **Invocation Context:** Scheduled cron or background maintenance job calling PostgREST using `SUPABASE_SERVICE_ROLE_KEY`.
- **Database Role State:** `SESSION_USER = 'authenticator'`, `CURRENT_USER = 'postgres'`, `auth.role() = 'service_role'`, `auth.uid() IS NULL`.
- **Enforcement:**
  - Guard 0.5 triggers and fails closed with `MCQJ-ERR-5015`.
- **Security Rationale:** Critical administrative domain events (such as paper publication and attempt re-evaluation) require an audited human or designated administrator identity (`published_by`). Headless anonymous mutations without accountability are deliberately rejected at the database level. Direct maintenance scripts connecting over direct PostgreSQL connections must explicitly supply a designated administrator UUID.

---

### 2.3 Phase 4 Next.js Service Layer Implementation Contract

In Phase 4, Next.js Server Actions calling publication and re-evaluation procedures must adhere to this exact specification:

```typescript
// src/lib/auth/session.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export class UnauthorizedError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Administrator privileges required") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Cryptographically verifies current session and asserts ADMIN role.
 * NEVER relies on getSession() on the server (avoids unverified cookie spoofing).
 */
export async function assertAdminSession(): Promise<{ id: string; email: string }> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  // 1. Cryptographic validation against Supabase Auth
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new UnauthorizedError("Valid administrator authentication session required");
  }

  // 2. Application database role verification
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, role: true, isSuspended: true },
  });

  if (!dbUser || dbUser.role !== "ADMIN" || dbUser.isSuspended) {
    throw new ForbiddenError(`User ${user.id} does not possess active administrator privileges`);
  }

  return { id: dbUser.id, email: dbUser.email };
}
```

```typescript
// src/actions/paper-publishing.ts
"use server";

import { assertAdminSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export interface PublicationResult {
  success: boolean;
  paper_id: string;
  publish_status: "PUBLISHED";
  published_at: string;
  published_by: string;
}

export async function publishExamPaperAction(paperId: string): Promise<PublicationResult> {
  // 1. Verify administrator session
  const admin = await assertAdminSession();

  // 2. Execute master publication gate procedure via Prisma
  const rows = await prisma.$queryRaw<PublicationResult[]>`
    SELECT fn_publish_exam_paper(
      ${paperId}::uuid,
      ${admin.id}::uuid
    ) as result;
  `;

  if (!rows || rows.length === 0) {
    throw new Error("Publication failed: no result returned from database gate");
  }

  revalidatePath(`/admin/papers/${paperId}`);
  return rows[0];
}
```

---

## 3. Empirical Verification Results

### 3.1 PostgreSQL Integration Test Suite (DB-01 through DB-18)

All 18 integration tests executed against real PostgreSQL 16 on port 5433:

| Test ID | Guarantee Domain | Enforcement Mechanism | Result | Duration |
| :--- | :--- | :--- | :--- | :--- |
| **DB-01** | Immutability | `fn_guard_published_content_immutability()` blocks UPDATE on published question | **PASS** | 138.5ms |
| **DB-02** | Immutability | `fn_guard_published_content_immutability()` blocks reparenting out of published paper | **PASS** | 179.9ms |
| **DB-03** | Immutability | `trg_comprehension_passages_immutability` blocks deleting passage referenced by published paper (`MCQJ-ERR-4004`) | **PASS** | 115.8ms |
| **DB-04** | Relational Integrity | Composite FK `fk_test_attempt_booklet` (`paper_id, booklet_series_id`) blocks cross-paper booklet assignment | **PASS** | 164.4ms |
| **DB-05** | Relational Integrity | Composite FK `fk_bqm_occurrence_composite` (`paper_id, occurrence_id`) blocks cross-paper question mapping | **PASS** | 160.4ms |
| **DB-06** | Relational Integrity | Triggers `trg_booklet_option_mapping_integrity` (`MCQJ-ERR-4007`), `trg_booklet_qmap_occurrence_guard` (`4008`), `trg_question_option_rep_guard` (`4009`) & FKs | **PASS** | 481.2ms |
| **DB-07** | Relational Integrity | Composite FK `fk_response_occurrence_composite` (`paper_id, occurrence_id`) blocks cross-paper response mapping | **PASS** | 474.9ms |
| **DB-08** | Publication Gate | Gate 5 contiguity check (`generate_series`) rejects publication when sequence has gaps (`MCQJ-ERR-5007`) | **PASS** | 326.2ms |
| **DB-09** | Publication Gate | Gate 6 editorial verification check rejects publication when unverified representations exist (`MCQJ-ERR-5008`) | **PASS** | 269.5ms |
| **DB-10** | Publication Gate | Gate 10 answer key coverage check rejects publication when active key items are incomplete (`MCQJ-ERR-5013`) | **PASS** | 211.8ms |
| **DB-11** | Security Gate (SEC-02) | 10-point caller authorization suite: rejects anon callers, student callers, spoofed admin IDs, null JWT claims, setting mismatches, and re-evaluation violations (`MCQJ-ERR-5015`) | **PASS** | 168.9ms |
| **DB-12** | Publication Gate | Master publication procedure `fn_publish_exam_paper()` transitions valid paper from `VERIFIED` to `PUBLISHED` | **PASS** | 84.2ms |
| **DB-13** | Publication Gate | Transactional atomicity: failed publication leaves paper in `VERIFIED` state with zero partial mutations | **PASS** | 74.2ms |
| **DB-14** | Two-Tier Ledger | Original evaluation v1 (`is_original_attempt = TRUE`) remains immutable upon re-evaluation via `fn_reevaluate_paper_attempts()` | **PASS** | 89.3ms |
| **DB-15** | Two-Tier Ledger | Partial unique index `uk_attempt_one_active_evaluation` (`WHERE is_current_active = TRUE`) guarantees single active evaluation | **PASS** | 75.8ms |
| **DB-16** | Concurrency | Transactional advisory lock `pg_try_advisory_xact_lock` serializes concurrent publication requests on the same paper | **PASS** | 96.8ms |
| **DB-17** | Scoring & Policies | Check constraints `chk_section_negative_nonnegative`, `chk_section_marks_positive`, `chk_key_item_valid_target` enforce domain limits | **PASS** | 138.7ms |
| **DB-18** | Phase 4 Auth Contract | 8-point verification: Path B direct connection, admin role check in `users` table, anti-spoofing mismatch rejection, Path C headless service-role rejection, and re-evaluation ledger | **PASS** | 205.3ms |

**Total Integration Test Result:** **18/18 PASS (0 failed, 0 cancelled, 0 skipped, Duration: 3,818.88ms)**

---

### 3.2 Unit Test Suite Verification

Executed via Node.js native test runner:
- `tests/auth-validation.test.mjs`: NIST password complexity, email format, and authentication input sanitization (4/4 PASS)
- `tests/scoring.test.mjs`: BPSC scoring rules, hierarchical precedence overrides, withdrawn question exclusion (DEC-03), and negative score display (DEC-02) (4/4 PASS)
- `tests/security-headers.test.mjs`: Strict HTTP security headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) (1/1 PASS)

**Total Unit Test Result:** **9/9 PASS (Duration: 1,454.41ms)**

---

### 3.3 Static Analysis & Build Pipeline Verification

| Command | Status | Details |
| :--- | :--- | :--- |
| `npx prisma validate` | **PASS** | Schema is valid and compliant with Prisma 7.10.0 |
| `npm run db:generate` | **PASS** | Generated Prisma Client to `src/generated/prisma` in 858ms |
| `npm run typecheck` (`tsc --noEmit`) | **PASS** | Zero TypeScript compilation errors |
| `npm run lint` (`eslint`) | **PASS** | Zero ESLint warnings or errors |
| `npm run build` (`next build`) | **PASS** | Next.js 16.4.0 (Turbopack) production build completed; static pages generated; API and dashboard dynamic routes configured |

---

## 4. Formal Completion Decision & Documented Limitations

### Decision: **PASS WITH DOCUMENTED LIMITATIONS**

### Documented Limitations
1. **Local Compatibility Environment:**  
   Database integration tests were verified against an isolated, disposable PostgreSQL 16 Docker container (`127.0.0.1:5433`) with a compatibility layer mocking Supabase Auth schema (`auth.users`, `auth.uid()`, `auth.role()`). The production remote Supabase PostgREST gateway, connection poolers, and live Supabase Auth tokens remain un-mutated per strict safety boundaries.
2. **Next.js Server Action Scope:**  
   The direct connection contract (Path B) was comprehensively verified at the database driver level. Concrete Next.js Server Action functions (e.g. `publishExamPaperAction()`) will be implemented and end-to-end verified with UI components during Phase 4.

---

## 5. Phase 4 Transition Sign-Off

The database models, immutability triggers, relational guards, publication gates, two-tier evaluation ledgers, credential hygiene policies, and multi-path authorization contracts have reached technical closure and empirical verification.

**The repository is certified and ready to proceed to Phase 4.**
