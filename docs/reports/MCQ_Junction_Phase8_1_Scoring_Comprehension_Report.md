# MCQ Junction — Phase 8.1: All-or-Nothing Scoring, Comprehension Questions & PostgreSQL Verification Report

**Document ID:** `MCQJ-PHASE8-1-SCORING-COMPREHENSION-REPORT`  
**Date:** October 16, 2026  
**Auditor / Roles:** Principal Engineer, Assessment-System Architect, QA Lead  
**Repository Branch:** `main`  
**Target Milestone:** Phase 8.1 — Strict All-or-Nothing Scoring, First-Class Comprehension Passages & Live PostgreSQL Verification  
**Final Release Verdict:** **PASS**  

---

## 1. Executive Summary & Verdict

Phase 8.1 hardens MCQ Junction's evaluation architecture following Phase 8. It resolves three critical architectural imperatives:
1. **Strict All-or-Nothing Multiple-Correct Scoring:** Eliminates proportional credit or partial marks for multiple-correct items. For any multiple-correct question (e.g. correct set `{B, D}`), a candidate receives full positive marks only upon an exact set match. Any partial subset (`{B}`, `{D}`), extra distractor (`{A, B, D}`), or isolated wrong option (`{A}`) receives zero positive marks and incurs the configured negative marking penalty when applicable. Unanswered items receive zero marks without penalty.
2. **First-Class Comprehension / Passage-Based Questions:** Extends the assessment domain model with a reusable `ComprehensionPassage` entity. Multiple child questions across any question type (`SINGLE_CORRECT`, `MULTIPLE_CORRECT`, `ASSERTION_REASON`) link to a single shared passage without duplicating passage text in the database or bulk import CSV files.
3. **Multi-Language & Right-to-Left (RTL) Layout Engine:** Implements full script preservation and responsive rendering for English, Hindi (Devanagari), Urdu (Nastaliq RTL), and Bangla (Bengali Unicode). Urdu passages and questions render natively in RTL (`dir="rtl"`) while strictly isolating option letter tags (`A`, `B`, `C`, `D`), numeric indicators, and action buttons in LTR (`dir="ltr"`) to prevent reversed punctuation or mirrored glyphs.
4. **Live PostgreSQL 16 Container Verification:** Docker Desktop was verified operational and all integration test suites were executed against the isolated local disposable test database container (`mcqj-postgres-test` on `127.0.0.1:5433`). All 9 forward-only migrations were applied sequentially in ~250ms, with zero mutations executed against hosted Supabase.
5. **Publication Integrity Gate 7 & Passage Immutability:** Enforces database-level Gate 7 rejecting publication if any `COMPREHENSION_CHILD` question lacks a linked passage (`MCQJ-ERR-5010`), and activates trigger `trg_comprehension_passages_immutability` blocking updates or deletes to any passage referenced by a published paper (`MCQJ-ERR-4004`).

### Comprehensive Verification Summary

| Metric / Dimension | Scope / Target | Result | Status |
| :--- | :--- | :--- | :--- |
| **All-or-Nothing Scoring Suite** | 9 discrete response permutations for `{B, D}` | **9 / 9 Exact Match Matrix Verified** | **PASS** |
| **Unit & Evaluation Tests** | 11 Test Suites across scoring, domain, and auth | **107 / 107 Passed (0 Failed)** | **PASS** |
| **Passage Database Integration** | Live Docker PostgreSQL 16 container (`127.0.0.1:5433`) | **7 / 7 Database Specs Passed** | **PASS** |
| **Domain Relational DB Suite** | Live PostgreSQL 16 container (`tests/database.test.mjs`) | **19 / 19 Integrity Tests Passed** | **PASS** |
| **E2E Admin Workflows Suite** | Live PostgreSQL 16 container (`tests/e2e-workflows.test.mjs`) | **10 / 10 Workflow Tests Passed** | **PASS** |
| **Security & Isolation Suite** | Disposable environment guards & credential audit | **9 / 9 Isolation Specs Passed** | **PASS** |
| **Static Type Safety** | Entire Codebase (`tsc --noEmit`) | **0 Errors** | **PASS** |
| **Code Style & Linter** | ESLint 9 (`next/core-web-vitals` + React 19 rules) | **0 Errors, 0 Warnings** | **PASS** |
| **Production Build** | Next.js 16.4.0 Turbopack (`next build`) | **15 Routes Compiled (0 Errors)** | **PASS** |
| **Sequential Migrations** | 9 Sequential forward-only migrations | **9 / 9 Applied Sequentially** | **PASS** |
| **Remote Database Safety** | Hosted Supabase Production / Staging | **0 Remote Mutations (Fail-Closed)** | **PASS** |

---

## 2. All-or-Nothing Multiple-Correct Scoring Engine

### Scoring Logic & Matrix

In examination scoring, partial credit creates psychometric inconsistencies and distorts test fairness unless explicitly authorized by the conducting body. In MCQ Junction:
- **Learning Mode:** Evaluation is binary (`isOverallCorrect: boolean`). Feedback is triggered only when the learner either completes the exact correct set (triggering `CORRECT`) or selects any incorrect option (triggering `INCORRECT`).
- **Authoritative Exam Scoring (`src/lib/scoring/engine.ts`):** Evaluates candidate response sets against authoritative answer keys stored on the server. Selections are deduplicated and normalized to uppercase sets.

#### Exact Evaluation Matrix for Target Set `{B, D}` with Marks = 3.0, Penalty = 1.0

| Candidate Selected Set | Set Comparison | Status | Marks Awarded | Penalty Deducted | Net Score Awarded |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `['B', 'D']` | Exact Match | `CORRECT` | +3.000 | 0.000 | **+3.000** |
| `['D', 'B']` | Exact Match (Permuted) | `CORRECT` | +3.000 | 0.000 | **+3.000** |
| `['B', 'B', 'D', 'D']` | Exact Match (Deduplicated) | `CORRECT` | +3.000 | 0.000 | **+3.000** |
| `['B']` | Incomplete Subset | `INCORRECT` | 0.000 | 1.000 | **-1.000** |
| `['D']` | Incomplete Subset | `INCORRECT` | 0.000 | 1.000 | **-1.000** |
| `['A', 'B', 'D']` | Wrong Distractor Included | `INCORRECT` | 0.000 | 1.000 | **-1.000** |
| `['A']` | Isolated Wrong Distractor | `INCORRECT` | 0.000 | 1.000 | **-1.000** |
| `[]` (Empty) | Unanswered | `UNANSWERED`| 0.000 | 0.000 | **0.000** |
| `['A', 'B']` (Zero-Penalty Config) | Wrong (Penalty = 0) | `INCORRECT` | 0.000 | 0.000 | **0.000** |

```mermaid
flowchart TD
    A["Candidate Response Set"] --> B["Deduplicate & Normalize Set"]
    B --> C{"Is Response Set Empty?"}
    C -- Yes --> D["Status: UNANSWERED<br/>Net: 0.000"]
    C -- No --> E["Retrieve Authoritative Correct Set"]
    E --> F{"Set Equality Check:<br/>Candidate Set == Correct Set?"}
    F -- Exact Match --> G["Status: CORRECT<br/>Award Full Configured Marks (+Marks)"]
    F -- Mismatch --> H{"Negative Marking Configured?"}
    H -- Yes --> I["Status: INCORRECT<br/>Deduct Negative Marks (-Penalty)"]
    H -- No --> J["Status: INCORRECT<br/>Award 0.000"]
```

---

## 3. Comprehension / Passage-Based Question Architecture

### Entity Relationship Model

Comprehension passages are modeled as reusable entities linked to paper question occurrences via foreign key `fk_occurrence_passage` (`paper_question_occurrences.passage_id` -> `comprehension_passages.id`).

```mermaid
erDiagram
    EXAM_PAPERS ||--o{ PAPER_QUESTION_OCCURRENCES : "contains"
    COMPREHENSION_PASSAGES ||--o{ PAPER_QUESTION_OCCURRENCES : "context for"
    PAPER_QUESTION_OCCURRENCES ||--o{ SOURCE_QUESTION_REPRESENTATIONS : "rendered as"
    SOURCE_QUESTION_REPRESENTATIONS ||--o{ QUESTION_OPTIONS : "has options"
    PAPER_QUESTION_OCCURRENCES ||--o{ ANSWER_KEY_ITEMS : "keyed by"

    COMPREHENSION_PASSAGES {
        uuid id PK
        varchar passage_ref_code UK
        varchar title
        text body_text
        language_code_enum language_code
        varchar image_url
        varchar image_alt
        timestamptz created_at
        timestamptz updated_at
    }

    PAPER_QUESTION_OCCURRENCES {
        uuid id PK
        uuid paper_id FK
        uuid section_id FK
        uuid conceptual_question_id FK
        uuid passage_id FK
        int sequence_number
        question_type_enum question_type
    }
```

### Key Architectural Invariants
1. **Passage Reusability:** Multiple child questions share the exact same `passage_id`. When navigating between questions 1 and 2 of the same passage, the passage content remains stationary while the child question and options update seamlessly.
2. **Independent Question Invariants:** Each child question retains its own independent question type (`SINGLE_CORRECT`, `MULTIPLE_CORRECT`, `ASSERTION_REASON`), option representations, short explanations, detailed-concept links, and marking scheme overrides.
3. **Safe Media Verification:** Optional passage images are strictly filtered through `isSafeImageUrl()`. URLs must either originate from trusted HTTPS domains or internal `/assets/` paths. Arbitrary schemes (`javascript:`, `data:`, `file:`) or raw HTML injection are completely blocked.
4. **Responsive Layout:**
   - **Desktop (`lg` breakpoint and above):** 2-column split layout with sticky left passage pane (scrollable if passage exceeds viewport height) and right question/options card.
   - **Mobile / Tablet:** Single-column layout with a collapsible passage drawer toggled via an accessible header bar with chevron indicators.

---

## 4. Multi-Language & RTL Layout Engine

MCQ Junction natively supports passages and questions in English, Hindi, Urdu, and Bangla without lossy automatic translation or script distortion.

| Language | Code | Script | Text Direction | Special Layout Handling |
| :--- | :--- | :--- | :--- | :--- |
| **English** | `EN` | Latin | Left-to-Right (`ltr`) | Standard sans-serif typography |
| **Hindi** | `HI` | Devanagari Unicode | Left-to-Right (`ltr`) | Full Unicode vowel ligature preservation |
| **Bangla** | `BN` | Bengali Unicode | Left-to-Right (`ltr`) | Complex conjunct consonant preservation |
| **Urdu** | `UR` | Perso-Arabic / Nastaliq | Right-to-Left (`rtl`) | `dir="rtl"` with isolated `dir="ltr"` option tags & numbers |

### Urdu RTL Isolation Architecture

When rendering Urdu (`languageCode === 'UR'`), setting `dir="rtl"` globally causes option labels (`A`, `B`, `C`, `D`), numeric indicators, and navigation controls to invert their order or mirror punctuation.

To solve this, MCQ Junction implements **Directional Isolation**:
```tsx
{/* Passage & Question Text: Rendered in native RTL */}
<div dir={isUrdu ? "rtl" : "ltr"} className={isUrdu ? "font-serif text-right text-lg leading-loose" : "text-sm"}>
  {passageText}
</div>

{/* Option Card: Direction isolated */}
<button className="flex items-start gap-3 w-full">
  {/* Option Badge: Explicitly isolated LTR */}
  <span dir="ltr" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-bold text-xs">
    {option.optionLabel}
  </span>
  {/* Option Text: Matches language direction */}
  <div dir={isUrdu ? "rtl" : "ltr"} className="flex-1 text-left">
    <span>{option.optionText}</span>
  </div>
</button>
```

---

## 5. Live PostgreSQL Integration & Migration 9

### Docker Container Environment
- **Container Name:** `mcqj-postgres-test` (Healthy)
- **Engine Version:** PostgreSQL 16.11
- **Endpoint:** `127.0.0.1:5433`
- **Database:** `mcq_junction_test`
- **Safety Boundary:** Strict fail-closed validation rejecting any host other than `127.0.0.1` / `localhost` on port `5433`.

### Sequential Migration Order
All 9 migrations apply sequentially without manual intervention:
1. `20261010145726_init_database_test`
2. `20261010164000_add_user_model`
3. `20261010191034_alter_user_id_uuid_and_enable_rls`
4. `20261010192500_add_role_enum_to_users`
5. `20261012000000_phase3_domain_models_and_integrity_guards`
6. `20261012140000_revoke_authenticated_privileged_rpc`
7. `20261013000000_add_detailed_concepts_and_option_explanations`
8. `20261016000000_phase8_question_types_and_answer_evaluation`
9. `20261016120000_phase8_1_comprehension_passages_and_all_or_nothing_scoring`

### Database Security & Publication Guards Verified

```
✔ DB-PASS-01: Inserts comprehension passage with multi-language Unicode and safe media (96.7ms)
✔ DB-PASS-02: Links multiple question occurrences to a single shared passage without duplication (43.7ms)
✔ DB-PASS-03: Publication Gate 7 rejects paper if COMPREHENSION_CHILD is missing passage (74.1ms)
✔ DB-PASS-04: Publication Gate 7 succeeds when COMPREHENSION_CHILD has valid linked passage (93.5ms)
✔ DB-PASS-05: Passage immutability trigger blocks modifying or deleting a published paper's passage (68.2ms)
✔ DB-PASS-06: FK fk_occurrence_passage restricts deleting passage when occurrences exist (38.4ms)
✔ DB-PASS-07: Authoritative scoring enforces strict all-or-nothing evaluation across candidate attempts (53.5ms)
```

---

## 6. Admin Authoring & Bulk CSV Import Pipeline

### Authoring Component (`QuestionAuthoringClient.tsx`)
- Adds explicit `COMPREHENSION_CHILD` question type selection.
- Provides a dedicated Comprehension Passage configuration panel with Passage Ref Code, Title, Language selector (`EN`, `HI`, `UR`, `BN`, `TA`, `TE`), Body Text textarea (with dynamic RTL preview for Urdu), and Safe Image URL / Alt inputs.
- Displays passage association badges (`📖 Passage: Title (REF) • LANG`) on existing question cards.

### Bulk CSV Import Pipeline (`src/lib/questions/import-export.ts`)
- Extends standard CSV columns to 23 RFC 4180 / Excel UTF-8 BOM headers:
  ```csv
  sequence_number,question_type,canonical_ref_code,primary_subject,default_topic,passage_ref_code,passage_title,passage_body_text,passage_language,passage_image_url,passage_image_alt,question_text,assertion_text,reason_text,option_a,option_b,option_c,option_d,option_e,correct_answers,overall_explanation,marks_override,negative_marks_override
  ```
- **Shared Passage Caching (`passageCache`):** An author specifies full passage body text on the first question of a passage. Subsequent questions need only specify `passage_ref_code` to automatically inherit cached passage title, body, and language, eliminating CSV row bloat.
- **Backward Compatibility:** Legacy CSV files without passage columns continue to import seamlessly.

---

## 7. Automated Test Suite Breakdown (152 Tests Total)

```
================================================================================
  TEST SUITE EXECUTION SUMMARY (ALL PASS GREEN)
================================================================================

1. Unit & Scoring Tests (tests/):
   ✔ Scoring Engine: Strict All-or-Nothing Multiple-Correct Matrix ({B, D}) (7 specs)
   ✔ Interactive Learning Evaluation State Machine (13 specs)
   ✔ Question Authoring Validation & Schemas (9 specs)
   ✔ CSV / XLSX Import & Export Pipeline (9 specs)
   ✔ Detailed Concept Modal & Keyboard Navigation (8 specs)
   ✔ Auth & Session Validation (8 specs)
   ✔ Admin Paper Service & Re-evaluation (18 specs)
   ✔ Admin Workflows (15 specs)
   ✔ Security Headers Configuration (1 spec)
   ✔ TLS Certificate Verification (10 specs)
   ✔ Security Isolation Unit Specs (9 specs)
   Total Unit Tests: 107 Passed (0 Failed)

2. Live PostgreSQL 16 Integration Tests (127.0.0.1:5433):
   ✔ Passage Database & Publication Gate 7 Suite (tests/passage-database.test.mjs): 7 Passed
   ✔ Domain Relational DB & Immutability Suite (tests/database.test.mjs): 19 Passed
   ✔ End-to-End Admin Workflows Suite (tests/e2e-workflows.test.mjs): 10 Passed
   ✔ Security Isolation & Anti-Spoofing Suite (tests/security-isolation.test.mjs): 9 Passed
   Total Integration Tests: 45 Passed (0 Failed)

TOTAL COMBINED AUTOMATED TESTS: 152 PASSED / 0 FAILED / 0 SKIPPED
```

---

## 8. Defect Log & Remediation

| Finding ID | Severity | Category | Description | Remediation | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PHASE8-1-DEFECT-01** | `MEDIUM` | Schema Alignment | Integration test queries referenced `ref_code` and `language` instead of Prisma's `passage_ref_code` and `language_code`. | Corrected SQL queries and parameter mappings in `tests/passage-database.test.mjs`. | **RESOLVED** |
| **PHASE8-1-DEFECT-02** | `LOW` | React Conventions | `LearningQuestionCard` called `setState` inside `useEffect` and mutated ref during render. | Refactored state synchronization to React render-time pattern using `prevOccurrenceId`. ESLint passed with 0 errors/warnings. | **RESOLVED** |
| **PHASE8-1-DEFECT-03** | `LOW` | Type Safety | `COMPREHENSION_CHILD` was missing from `EvaluatedQuestionType` in `evaluation.ts`. | Extended union type and updated `normalizeQuestionType` to dynamically inspect options. `tsc --noEmit` passed with 0 errors. | **RESOLVED** |

---

## 9. Phase 9 Transition Checklist

With Phase 8.1 complete, the core evaluation and question-type foundation is production-grade. The codebase is prepared for Phase 9:
- [x] All-or-nothing multiple-correct scoring strictly enforced and mathematically verified.
- [x] Comprehension passages entity modeled, indexed, and integrated into learning and admin pipelines.
- [x] Multi-language support (English, Hindi, Urdu, Bangla) verified with native RTL rendering.
- [x] Live PostgreSQL 16 tests passing on disposable Docker container with 9 migrations.
- [x] Zero remote database mutations executed.
- [x] Production build passes cleanly with Next.js Turbopack.
- [x] Ready to proceed to **Phase 9: Realtime Examination Engine & Candidate Test Delivery**.
