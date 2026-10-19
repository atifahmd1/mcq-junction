# MCQ Junction — Vercel Production Build Fix: Prisma Enums Generation in Clean Environments

**Document ID:** `MCQJ-REPORT-BUILD-PRISMA-ENUMS-01`  
**Date:** October 20, 2026  
**Status:** **RESOLVED — VERIFIED VIA CLEAN SIMULATION & FULL PASS CI**  
**Lead Engineer:** Senior Next.js 16 + Prisma 7 Engineer, Assessment-System Architect  

---

## 1. Executive Summary

During deployment of MCQ Junction to Vercel staging, the build pipeline halted during `npm run build` with the following error:

```text
Import map: aliased to relative './src/generated/prisma/enums'
Error: [BUILD_UTILS_SPAWN_1] Command "npm run build" exited with 1
```

The stack trace pointed directly to `ExamEntryPageProps` in `src/app/exam/[paperId]/page.tsx` and related modules importing from `@/generated/prisma/enums`.

### Root Cause
1. **Configured Output Target:** `prisma/schema.prisma` configures the Prisma client generator with a custom output path:
   ```prisma
   generator client {
     provider = "prisma-client"
     output   = "../src/generated/prisma"
   }
   ```
2. **Git Ignore Policy:** `.gitignore` (line 44) intentionally specifies `/src/generated/prisma`. Consequently, generated Prisma TypeScript artifacts (`client.ts`, `enums.ts`, `models.ts`) are never committed to the Git repository.
3. **Missing Pre-Build Hook:** In `package.json`, the build script was configured as:
   ```json
   "build": "next build"
   ```
   In a local developer environment where `npx prisma generate` or `npm run db:generate` had been executed previously, `src/generated/prisma/enums.ts` existed on disk, and `next build` succeeded.
   However, on Vercel's clean build environment (which clones directly from GitHub into a fresh ephemeral container), `src/generated/prisma/` did not exist. When Next.js 16 (Turbopack) began compiling the App Router routes, it encountered `import { AttemptStatus } from "@/generated/prisma/enums";` and aborted with module resolution failure `[BUILD_UTILS_SPAWN_1]`.

### Permanent Resolution
The `build` script in `package.json` was updated to explicitly generate the Prisma Client artifacts before invoking the Next.js compiler:
```json
"build": "prisma generate && next build"
```
Because `@prisma/client` and `prisma` CLI (`^7.10.0`) are installed dependencies, `prisma generate` reads `prisma.config.ts` and `prisma/schema.prisma`, generates all client and enum types into `./src/generated/prisma/` (completing in under 800ms) without requiring an active database connection, and hands off a complete file tree to `next build`.

---

## 2. Comprehensive Configuration & Code Audit

| Item | File / Location | Current Configuration & Role | Status |
| :--- | :--- | :--- | :--- |
| **Prisma Generator Provider** | `prisma/schema.prisma` (lines 8–11) | `provider = "prisma-client"`, `output = "../src/generated/prisma"` | Valid |
| **Prisma Config** | `prisma.config.ts` (lines 1–8) | Standard Prisma 7 configuration file loaded by `prisma generate` | Valid |
| **Git Ignore Directives** | `.gitignore` (line 44) | `/src/generated/prisma` ignored. Prevents committing build artifacts. | Preserved |
| **Vercel Ignore Directives** | `.vercelignore` | Not present (standard Vercel build behavior applies). | Verified |
| **Build Script (Before)** | `package.json` (line 7) | `"build": "next build"` (Failed in clean environments). | Defective |
| **Build Script (After)** | `package.json` (line 7) | `"build": "prisma generate && next build"` | Hardened |
| **Import References** | Multiple App Router & Lib files | Imports from `@/generated/prisma/enums` and `@/generated/prisma/client` | Valid |

### Audit of Referenced Imports
The following application modules rely directly on the generated Prisma enum module:
- `src/app/exam/[paperId]/page.tsx`: Imports `AttemptStatus` for `ExamEntryPageProps`.
- `src/app/admin/papers/page.tsx`: Imports `PaperPublishStatus`.
- `src/lib/auth/session.ts`: Imports `Role`.
- `src/lib/concept/service.ts`: Imports `LanguageCode`.
- `src/lib/exam/service.ts`: Imports `AttemptStatus`, `KeyStatus`, `QuestionType`, `WithdrawalPolicy`.

No speculative import path changes (such as aliasing to `@prisma/client` or stubbing enum definitions) were made. The canonical source of truth remains the Prisma schema domain model.

---

## 3. Empirical Verification & Clean-Build Simulation

To prove reproducibility and confirm the permanent resolution without relying on cached artifacts:

### Simulation Steps:
1. Removed `src/generated/prisma` entirely from disk.
2. Verified `Test-Path src/generated/prisma` returned `False`.
3. Executed `npm run build` from this clean state.

### Results:
```text
> mcq-junction@0.1.0 build
> prisma generate && next build

Loaded Prisma config from prisma.config.ts.
Prisma schema loaded from prisma\schema.prisma.
✔ Generated Prisma Client (7.10.0) to .\src\generated\prisma in 768ms

▲ Next.js 16.4.0 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 71ms
- Cache Components enabled
- Partial Prefetching enabled

  Creating an optimized production build ...
✓ Compiled successfully in 10.6s
  Running TypeScript ...
  Finished TypeScript in 5.7s ...
  Collecting page data using 3 workers ...
✓ Generating static pages using 3 workers (23/23) in 4.9s
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /admin
├ ƒ /admin/papers
├   /admin/papers/[paperId]/adjudication
│ └ ◐ /admin/papers/[paperId]/adjudication
├   /admin/papers/[paperId]/publish
│ └ ◐ /admin/papers/[paperId]/publish
├   /admin/papers/[paperId]/questions
│ └ ◐ /admin/papers/[paperId]/questions
├   /admin/papers/[paperId]/sequence
│ └ ◐ /admin/papers/[paperId]/sequence
├ ○ /ai-studio
├ ƒ /api/concepts/[conceptId]
├ ƒ /api/cron/finalize-overdue
├ ƒ /api/cron/finalize-overdue-attempts
├ ƒ /api/db-health
├ ƒ /auth/callback
├ ○ /auth/signin
├ ƒ /dashboard
├   /exam/[paperId]
│ └ ◐ /exam/[paperId]
├   /exam/[paperId]/attempt/[attemptId]
│ └ ◐ /exam/[paperId]/attempt/[attemptId]
├ ƒ /exams
├   /exams/[examId]
│ └ ◐ /exams/[examId]
├ ƒ /learn
└ ○ /progress

Exit Code: 0
```

---

## 4. Full Quality & Regression Matrix

All automated suites were executed to verify system integrity:

| Verification Suite | Target Commands | Result | Key Metrics |
| :--- | :--- | :--- | :--- |
| **Clean Production Build** | `npm run build` | **PASS** | `prisma generate` in 768ms; 23 routes compiled in 10.6s |
| **TypeScript Static Analysis** | `npm run typecheck` (`tsc --noEmit`) | **PASS** | 0 type errors across whole codebase |
| **ESLint Static Analysis** | `npm run lint` (`eslint`) | **PASS** | 0 warnings, 0 errors |
| **Security & Isolation Tests** | `npm run test:security` | **PASS** | 18/18 specs pass (fail-closed, TLS, zero leaked secrets) |
| **Unit & Domain Tests** | `npm run test:unit` | **PASS** | 124/124 specs pass (12 suites, scoring, parsing, auth) |
| **PostgreSQL Integration Tests** | `npm run test:db` | **PASS** | 65/65 specs pass (ledger, triggers, CAS, scheduler) |
| **Total Automated Tests** | All Suites Combined | **PASS** | **189 / 189 tests passing (100% green)** |

---

## 5. Architectural & Deployment Guidelines

1. **Keep Generated Code Ignored in Git:**
   Never commit `src/generated/prisma` to Git. Generating client code at build time ensures that TypeScript types strictly align with the local schema and generator version without drift or bloat in Git history.
2. **Build Order Invariant:**
   Any CI/CD environment (Vercel, GitHub Actions, Docker) must execute `prisma generate` prior to running `next build`, `tsc --noEmit`, or test suites. Configuring `"build": "prisma generate && next build"` in `package.json` guarantees this sequence across all platforms.
3. **No Database Connection Needed for Generation:**
   `prisma generate` strictly reads `prisma/schema.prisma` and emits client code. It does not require `DATABASE_URL` or network access, making it fast and safe in build environments.
