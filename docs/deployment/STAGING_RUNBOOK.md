# MCQ Junction — Staging Deployment & Operational Runbook

**Document ID:** `MCQJ-RUNBOOK-STAGING-01`  
**Revision:** `1.1.0` (Phase 12 Staging Preparation & Security Hardening)  
**Classification:** Confidential — Operational Infrastructure Guide  
**Target Environment:** Staging / Controlled Pre-Production  

---

## 1. Overview & Operational Scope

This runbook establishes standard operating procedures for deploying, verifying, monitoring, and operating MCQ Junction in a hosted staging environment. 

### Environment Status & Verification State
* **Local Verification (Completed & Proven):** 201 automated tests (124 unit/domain specs, 63 PostgreSQL integration specs including 7 dedicated scheduler tests, 14 Playwright browser lifecycle specs), 10 forward-only migrations verified against disposable local PostgreSQL (`127.0.0.1:5433`), Next.js 16 Turbopack production build verified.
* **Hosted Staging Deployment (Completed & Verified):**
  - Target Project: `ehapldwukenlptlbnzvi` (`aws-0-ap-northeast-1.pooler.supabase.com`).
  - Pre-migration backup captured to `scratch/staging-pre-migration-backup.json`.
  - All 10 migrations deployed and verified via `npx prisma migrate deploy` and `npx prisma migrate status` (Zero drift, Exit Code 0).
  - Live hosted acceptance suite `tests/staging-acceptance.test.mjs` executed directly against remote Supabase instance: **11/11 specifications PASS 100% GREEN**.
  - All disposable test fixtures (`stg_*`) purged cleanly on teardown.

---

## 2. Environment Variables Configuration

> [!CAUTION]
> **Secret Hygiene Policy:** Never commit secret values or private keys to the repository. Configure these variables strictly through the hosting platform's encrypted dashboard or secret manager (e.g. Vercel Environment Variables, Doppler).

| Variable Name | Required Scope | Target Component | Description & Operational Guidance |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Runtime (App) | Prisma Client (pg adapter) | **Transaction pooler URL** (port 6543) with `pgbouncer=true`. Used by Next.js Server Actions and read requests during candidate delivery. Must use SSL mode `verify-full` in staging. |
| `DIRECT_URL` | Build / Migration | Prisma Migration Engine | **Direct database session URL** (port 5432). Bypasses pgbouncer to allow transaction locks, DDL migrations (`prisma migrate deploy`), and advisory locking. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public / Runtime | Client & Server Auth | The public HTTPS endpoint of the hosted Supabase project (e.g. `https://<project-ref>.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public / Runtime | Client & Server Auth | The public anonymous API key (JWT) used for browser client initialization and unprivileged session discovery. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-Only | Admin Sync & Background | Privileged Supabase secret key with bypass-RLS capabilities. **Never expose to client bundles.** |
| `CRON_SECRET` | Server-Only | Autonomous Sweeper API | High-entropy random secret key (>= 32 chars) authenticating external cron workers to `/api/cron/finalize-overdue-attempts`. |
| `NEXT_PUBLIC_SITE_URL` | Public / Runtime | OAuth & Callbacks | Canonical public origin URL of the staging deployment (e.g. `https://staging.mcqjunction.com` or Vercel preview URL). |
| `SUPABASE_SSL_ROOT_CERT` | Server-Only | PostgreSQL TLS Adapter | Base64-encoded or PEM string of the official Supabase Root CA certificate (required when `DATABASE_SSL_REJECT_UNAUTHORIZED=true`). |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Server-Only | PostgreSQL Connection | Boolean flag (`true` in staging/production) enforcing certificate chain validation against trusted root CA. |

---

## 3. Supabase Auth & Redirect URL Configuration

In the Supabase Management Dashboard (`Authentication -> URL Configuration`):

1. **Site URL:**
   Set to canonical staging origin: `https://staging.mcqjunction.com` (or current deployment domain).
2. **Redirect URLs (Allow-List):**
   * `https://staging.mcqjunction.com/auth/callback`
   * `https://staging-*.vercel.app/auth/callback` (for branch previews)
   * `http://localhost:3000/auth/callback` (local development only)
3. **OAuth Providers:**
   * **GitHub:** Configure Client ID & Secret; set Authorization Callback URL to `https://<project-ref>.supabase.co/auth/v1/callback`.
   * **Google:** Configure OAuth Client ID & Secret in Google Cloud Console; set Authorized redirect URI to `https://<project-ref>.supabase.co/auth/v1/callback`.
4. **Security Settings:**
   * Enable "Secure email change" and "Prevent user enumeration".
   * Session lifetime: 3600 seconds (1 hour) with refresh token rotation enabled.

---

## 4. Database Connection & TLS Requirements

1. **Strict TLS Enforcement:**  
   MCQ Junction requires TLS 1.3 / 1.2 with certificate chain validation (`rejectUnauthorized: true`). The trusted Supabase Root 2021 CA certificate must be loaded into the `pg` pool config via `buildDatabaseClientConfig()`.
2. **Connection Pooling Capacity:**
   * Staging pool size: `min: 2, max: 10` per serverless runtime instance.
   * `idleTimeoutMillis`: 30,000 ms.
   * `connectionTimeoutMillis`: 5,000 ms.

---

## 5. Migration Execution & Verification (Step-by-Step)

> [!IMPORTANT]
> Migrations must **never** be executed automatically during `next build`. They must be executed as a controlled pre-deployment release step by authorized personnel.

### Step 5.1: Pre-Migration Safety Check
```bash
# 1. Validate migrations against schema locally
npx prisma validate

# 2. Check current remote migration status (read-only)
# Uses DIRECT_URL pointing to port 5432
npx prisma migrate status
```

### Step 5.2: Apply Forward-Only Migrations
```bash
# Deploys pending forward-only migrations (20261010145726 through 20261016140000)
npx prisma migrate deploy
```

### Step 5.3: Post-Migration Verification
Execute the verification query on the staging database:
```sql
-- 1. Verify all 10 migrations are applied
SELECT migration_name, finished_at 
FROM _prisma_migrations 
ORDER BY finished_at DESC 
LIMIT 10;

-- 2. Verify triggers are active
SELECT tgname, relname 
FROM pg_trigger t 
JOIN pg_class c ON t.tgrelid = c.oid 
WHERE tgname IN (
  'trg_test_attempts_status_guard',
  'trg_attempt_responses_mutation_guard',
  'trg_comprehension_passages_immutability'
);

-- 3. Verify RPC execute privileges are revoked
SELECT routine_name, grantee, privilege_type 
FROM information_schema.routine_privileges 
WHERE routine_name = 'fn_publish_exam_paper' 
  AND grantee IN ('PUBLIC', 'anon', 'authenticated');
-- Expected: 0 rows returned
```

---

## 6. Build, Deployment & Smoke-Test Commands

### Step 6.1: Production Build
```bash
# Compile optimized Next.js 16 Turbopack production bundle
npm run build
```

### Step 6.2: Post-Deployment Smoke Tests
1. **Health Check:**
   ```bash
   curl -i https://staging.mcqjunction.com/api/db-health
   # Expected: HTTP 200 OK, { "status": "healthy", "database": "connected" }
   ```
2. **Autonomous Finalization Cron Smoke Check:**
   ```bash
   # Test unauthenticated rejection (Expected: 401 Unauthorized)
   curl -i https://staging.mcqjunction.com/api/cron/finalize-overdue-attempts

   # Test authorized sweep invocation (Expected: 200 OK)
   curl -i -H "Authorization: Bearer <STAGING_CRON_SECRET>" https://staging.mcqjunction.com/api/cron/finalize-overdue-attempts
   # Expected: { "success": true, "sweptPapers": ..., "totalFinalized": ... }
   ```
3. **Unauthenticated Redirect Boundary:**
   Navigate in private browser window to `https://staging.mcqjunction.com/exam/sample-paper-id`.  
   *Expected:* Immediate redirect to `/auth/signin?next=/exam/sample-paper-id`.
4. **Open-Redirect Immunity:**
   Attempt to access `/auth/signin?next=//attacker.com`.  
   *Expected:* Destination is sanitized to `/dashboard`.
5. **Administrative Boundary:**
   Sign in with a `STUDENT` account and navigate to `/admin`.  
   *Expected:* Display of "Administrative Access Denied" 403 Forbidden screen.

---

## 7. Autonomous Sweeps & Background Worker Operations

Examinations enforce a server-authoritative deadline (`expires_at`). Abandoned attempts are swept autonomously.

### Deployed Background Finalization Architecture:
1. **Scheduled Vercel Cron (`vercel.json`):**
   * MCQ Junction defines a 1-minute cron job in `vercel.json`:
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
   * Vercel Cron automatically attaches `Authorization: Bearer <CRON_SECRET>` to invocations.
2. **Alternative External Schedulers (AWS EventBridge / GitHub Actions / Supabase pg_cron):**
   * Configured to invoke `GET` or `POST /api/cron/finalize-overdue-attempts` every 60 seconds with header `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`.
   * Endpoint returns HTTP 500 on database connection errors, allowing external schedulers to register failure and perform exponential backoff retries.
3. **Security Boundary Enforcement:**
   * Unauthenticated or candidate-origin sweep requests are strictly rejected with HTTP 401 Unauthorized (`MCQJ-ERR-4001`) or HTTP 403 Forbidden (`MCQJ-ERR-4003`).
   * The server action `finalizeOverdueAttemptsAction` is gated with `assertAdminSession()`. Unprivileged candidates cannot trigger sweeps across other candidates' attempts.
4. **Resilience & Idempotency:**
   * If the scheduler is delayed or fails temporarily, the next sweep immediately identifies and atomically evaluates all expired attempts regardless of how long ago they expired (`expires_at < clock_timestamp()`).
   * Repeated executions on clean state evaluate zero attempts and produce zero duplicate scorecards or notifications.

---

## 8. Real-Time Telemetry & Monitoring Strategy

Monitor the following key signals via logging provider (e.g. Datadog / Vercel Log Drains / Axiom):

| Signal / Metric | Detection Filter | Alert Threshold | Action Required |
| :--- | :--- | :--- | :--- |
| **Optimistic Version Conflicts** | `code: "VERSION_CONFLICT"` or `MCQJ-ERR-6001` | > 10 per minute per paper | Investigate client clock drift, flaky mobile connectivity, or concurrent multi-tab usage. |
| **Expired Answer Rejections** | `code: "MCQJ-ERR-6003"` | Normal on exam deadline; spike indicates clock skew | Verify server NTP synchronization; confirm auto-submit transition completed. |
| **Illegal State Regressions** | `code: "MCQJ-ERR-6004"` | > 0 events (Critical) | Database trigger blocked an illegal transition. Inspect application server attempt lifecycle logic. |
| **Cross-Tenant Access Violations** | `code: "MCQJ-ERR-6005"` | > 2 events (Security) | Potential IDOR / session hijacking attempt. Review audit log for offending `userId`. |
| **Evaluation Deadlocks / Collisions** | `P2002` or `P2034` in `submitExamAttempt` | > 0 events | Concurrency CAS failure. Verify attempt was not already in terminal `EVALUATED` status. |
| **Cron Sweep Latency** | `event: "CRON_FINALIZE_OVERDUE_ATTEMPTS"` | durationMs > 5000 ms | Database connection pool exhaustion or high volume of overdue attempts. Scale pool min/max connections. |

---

## 9. Incident Response & Emergency Rollback Procedures

### Scenario A: Application Layer Defect (Broken Client / Server Action Error)
1. **Trigger:** Unhandled exception rate > 1% on `/exam/*` routes.
2. **Action:** Instant rollback in hosting provider dashboard (e.g. Vercel Instant Rollback to previous immutable deployment tag).
3. **Data Impact:** None. Database schema is forward-only and backward-compatible.

### Scenario B: Stuck Examination Attempt (Candidate Cannot Submit)
1. **Trigger:** Candidate reports timer expired but UI did not display scorecard.
2. **Diagnosis:** Run query to inspect attempt status:
   ```sql
   SELECT id, user_id, paper_id, attempt_status, started_at, expires_at 
   FROM test_attempts 
   WHERE id = '<attempt-id>';
   ```
3. **Resolution:**
   Trigger server-side autonomous sweep for the paper:
   `await finalizeOverdueAttempts('<paper-id>')` or call `GET /api/cron/finalize-overdue-attempts?paperId=<paper-id>` with `CRON_SECRET`.
   The candidate's attempt will be atomically scored and transitioned to `EVALUATED` without data loss.

### Scenario C: Database Rollback (Emergency DDL Reversion)
> [!WARNING]
> Because schema migrations are forward-only and do not drop tables destructively, **never run `prisma migrate reset` on staging or production.**
* If a new column causes issues, roll back the application code first. The existing database columns with nullable defaults will remain inert without disrupting traffic.

---

## 10. Staging Deployment Verification Checklist
All items verified and passed:

- [x] Local unit and domain suites passed 100% green (`124 / 124 specs`)
- [x] Local PostgreSQL 16 container integration tests passed 100% green (`63 / 63 specs`, including 7 scheduler specs)
- [x] Browser E2E candidate lifecycle passed 100% green (`14 / 14 specs`)
- [x] Static typecheck passed with 0 errors (`npm run typecheck`)
- [x] ESLint passed with 0 errors and 0 warnings (`npm run lint`)
- [x] Production build compiled with Turbopack (`npm run build`)
- [x] Release preflight validated migration sequence & cron handler (`npm run preflight`)
- [x] Credential scan confirmed 0 secrets or sensitive tokens in git history (`npm run test:security`)
- [x] Human authorization requested and explicitly granted for remote migration execution
- [x] Pre-migration logical database backup captured (`scratch/staging-pre-migration-backup.json`)
- [x] Forward-only migrations applied via `npx prisma migrate deploy` on Supabase port 5432
- [x] Remote schema verified via `npx prisma migrate status` (10/10 migrations applied, 0 drift)
- [x] Live staging acceptance suite passed 100% green (`11 / 11 specs`, `tests/staging-acceptance.test.mjs`)
- [x] Disposable staging test fixtures purged cleanly (`stg_*`)
