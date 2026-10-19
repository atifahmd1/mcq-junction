-- ============================================================================
-- MCQ Junction — Phase 3 Production Schema & Integrity Guards Migration
-- Migration: 20261012000000_phase3_domain_models_and_integrity_guards
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Create Core Domain Enumerations
-- ----------------------------------------------------------------------------

CREATE TYPE "exam_tier_enum" AS ENUM ('STATE_LEVEL', 'NATIONAL_LEVEL', 'INSTITUTIONAL');
CREATE TYPE "paper_publish_status_enum" AS ENUM ('DRAFT', 'EDITORIAL_REVIEW', 'VERIFIED', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "question_type_enum" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'ASSERTION_REASON', 'COMPREHENSION_CHILD', 'NUMERICAL_DISCRETE');
CREATE TYPE "key_status_enum" AS ENUM ('PROVISIONAL', 'ACTIVE', 'CONTESTED', 'SUPERSEDED', 'WITHDRAWN');
CREATE TYPE "attempt_status_enum" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'EVALUATED', 'DISQUALIFIED', 'ABANDONED');
CREATE TYPE "language_code_enum" AS ENUM ('EN', 'HI', 'UR', 'BN', 'TA', 'TE');
CREATE TYPE "withdrawal_policy_enum" AS ENUM ('FULL_MARKS_AWARDED', 'EXCLUDED_FROM_TOTAL');

-- ----------------------------------------------------------------------------
-- 2. Create Examination Hierarchy Tables
-- ----------------------------------------------------------------------------

CREATE TABLE "conducting_bodies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "region_code" VARCHAR(50) NOT NULL,
    "official_website" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conducting_bodies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "conducting_bodies_code_key" ON "conducting_bodies"("code");

CREATE TABLE "exams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conducting_body_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "tier" "exam_tier_enum" NOT NULL DEFAULT 'STATE_LEVEL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exams_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_exam_conducting_body" FOREIGN KEY ("conducting_body_id") REFERENCES "conducting_bodies"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "exams_code_key" ON "exams"("code");

CREATE TABLE "exam_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "session_year" INTEGER NOT NULL,
    "cycle_code" VARCHAR(50) NOT NULL,
    "advertisement_no" VARCHAR(100),
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_session_exam" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "uk_exam_session_cycle" ON "exam_sessions"("exam_id", "session_year", "cycle_code");

CREATE TABLE "exam_papers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "paper_code" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "publish_status" "paper_publish_status_enum" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(6),
    "total_duration_minutes" INTEGER NOT NULL,
    "total_questions" INTEGER NOT NULL,
    "max_score" DECIMAL(8, 3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exam_papers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_paper_session" FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "exam_papers_paper_code_key" ON "exam_papers"("paper_code");

CREATE TABLE "paper_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paper_id" UUID NOT NULL,
    "section_order" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "total_questions" INTEGER NOT NULL,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "paper_sections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_section_paper" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "uk_paper_section_composite" ON "paper_sections"("paper_id", "id");
CREATE UNIQUE INDEX "uk_paper_section_order" ON "paper_sections"("paper_id", "section_order");

-- ----------------------------------------------------------------------------
-- 3. Create Content & Question Representation Tables
-- ----------------------------------------------------------------------------

CREATE TABLE "conceptual_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "canonical_ref_code" VARCHAR(100) NOT NULL,
    "primary_subject" VARCHAR(100) NOT NULL,
    "default_topic" VARCHAR(150) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conceptual_questions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "conceptual_questions_canonical_ref_code_key" ON "conceptual_questions"("canonical_ref_code");

CREATE TABLE "comprehension_passages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "passage_ref_code" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255),
    "body_text" TEXT NOT NULL,
    "language_code" "language_code_enum" NOT NULL DEFAULT 'EN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comprehension_passages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "comprehension_passages_passage_ref_code_key" ON "comprehension_passages"("passage_ref_code");

CREATE TABLE "paper_question_occurrences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paper_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "conceptual_question_id" UUID NOT NULL,
    "passage_id" UUID,
    "sequence_number" INTEGER NOT NULL,
    "question_type" "question_type_enum" NOT NULL DEFAULT 'SINGLE_CHOICE',
    "marks_override" DECIMAL(6, 3),
    "negative_marks_override" DECIMAL(6, 3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "paper_question_occurrences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_occurrence_paper" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE RESTRICT,
    CONSTRAINT "fk_occurrence_section_composite" FOREIGN KEY ("paper_id", "section_id") REFERENCES "paper_sections"("paper_id", "id") ON DELETE RESTRICT,
    CONSTRAINT "fk_occurrence_conceptual" FOREIGN KEY ("conceptual_question_id") REFERENCES "conceptual_questions"("id") ON DELETE RESTRICT,
    CONSTRAINT "fk_occurrence_passage" FOREIGN KEY ("passage_id") REFERENCES "comprehension_passages"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "uk_paper_occurrence_composite" ON "paper_question_occurrences"("paper_id", "id");
CREATE UNIQUE INDEX "uk_occurrence_paper_seq" ON "paper_question_occurrences"("paper_id", "sequence_number");

CREATE TABLE "source_question_representations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "occurrence_id" UUID NOT NULL,
    "language_code" "language_code_enum" NOT NULL,
    "question_text" TEXT NOT NULL,
    "is_original_language" BOOLEAN NOT NULL DEFAULT true,
    "editorial_verified" BOOLEAN NOT NULL DEFAULT false,
    "explanation_text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "source_question_representations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_representation_occurrence" FOREIGN KEY ("occurrence_id") REFERENCES "paper_question_occurrences"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "uk_rep_occurrence_composite" ON "source_question_representations"("occurrence_id", "id");
CREATE UNIQUE INDEX "uk_representation_occurrence_lang" ON "source_question_representations"("occurrence_id", "language_code");

CREATE TABLE "question_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "representation_id" UUID NOT NULL,
    "option_label" VARCHAR(10) NOT NULL,
    "option_text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_option_representation" FOREIGN KEY ("representation_id") REFERENCES "source_question_representations"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "uk_opt_rep_composite" ON "question_options"("representation_id", "id");
CREATE UNIQUE INDEX "uk_option_rep_label" ON "question_options"("representation_id", "option_label");
CREATE UNIQUE INDEX "uk_option_rep_order" ON "question_options"("representation_id", "sort_order");

-- ----------------------------------------------------------------------------
-- 4. Create Answer Key Versioning Tables
-- ----------------------------------------------------------------------------

CREATE TABLE "answer_key_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paper_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_tag" VARCHAR(50) NOT NULL,
    "is_official" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(6),
    "release_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "answer_key_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_key_version_paper" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "uk_answer_key_paper_composite" ON "answer_key_versions"("paper_id", "id");
CREATE UNIQUE INDEX "uk_answer_key_paper_version" ON "answer_key_versions"("paper_id", "version_number");

CREATE TABLE "answer_key_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paper_id" UUID NOT NULL,
    "key_version_id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "key_status" "key_status_enum" NOT NULL DEFAULT 'ACTIVE',
    "correct_option_labels" VARCHAR(10)[] NOT NULL,
    "numerical_target_value" DECIMAL(10, 4),
    "numerical_tolerance" DECIMAL(10, 4),
    "withdrawal_policy" "withdrawal_policy_enum",
    "adjudication_rationale" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "answer_key_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_key_item_paper" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE RESTRICT,
    CONSTRAINT "fk_key_item_version_composite" FOREIGN KEY ("paper_id", "key_version_id") REFERENCES "answer_key_versions"("paper_id", "id") ON DELETE RESTRICT,
    CONSTRAINT "fk_key_item_occurrence_composite" FOREIGN KEY ("paper_id", "occurrence_id") REFERENCES "paper_question_occurrences"("paper_id", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "uk_key_item_version_occurrence" ON "answer_key_items"("key_version_id", "occurrence_id");

-- ----------------------------------------------------------------------------
-- 5. Create Marking Scheme & Scoring Hierarchy Tables
-- ----------------------------------------------------------------------------

CREATE TABLE "paper_marking_schemes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paper_id" UUID NOT NULL,
    "marks_per_correct" DECIMAL(6, 3) NOT NULL,
    "negative_marks_per_wrong" DECIMAL(6, 3) NOT NULL,
    "partial_marking_allowed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "paper_marking_schemes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_marking_scheme_paper" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "paper_marking_schemes_paper_id_key" ON "paper_marking_schemes"("paper_id");

CREATE TABLE "section_scoring_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "section_id" UUID NOT NULL,
    "marks_per_correct" DECIMAL(6, 3) NOT NULL,
    "negative_marks_per_wrong" DECIMAL(6, 3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "section_scoring_overrides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_override_section" FOREIGN KEY ("section_id") REFERENCES "paper_sections"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "section_scoring_overrides_section_id_key" ON "section_scoring_overrides"("section_id");

-- ----------------------------------------------------------------------------
-- 6. Create Booklet Series & Permutation Mapping Tables
-- ----------------------------------------------------------------------------

CREATE TABLE "booklet_series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paper_id" UUID NOT NULL,
    "series_code" VARCHAR(10) NOT NULL,
    "is_master_series" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booklet_series_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_booklet_paper" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "uk_booklet_series_composite" ON "booklet_series"("paper_id", "id");
CREATE UNIQUE INDEX "uk_booklet_paper_series" ON "booklet_series"("paper_id", "series_code");

CREATE TABLE "booklet_question_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paper_id" UUID NOT NULL,
    "booklet_series_id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "display_sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booklet_question_mappings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_bqm_paper" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE RESTRICT,
    CONSTRAINT "fk_bqm_series_composite" FOREIGN KEY ("paper_id", "booklet_series_id") REFERENCES "booklet_series"("paper_id", "id") ON DELETE RESTRICT,
    CONSTRAINT "fk_bqm_occurrence_composite" FOREIGN KEY ("paper_id", "occurrence_id") REFERENCES "paper_question_occurrences"("paper_id", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "uk_booklet_q_seq" ON "booklet_question_mappings"("booklet_series_id", "display_sequence");
CREATE UNIQUE INDEX "uk_booklet_q_occurrence" ON "booklet_question_mappings"("booklet_series_id", "occurrence_id");

CREATE TABLE "booklet_option_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_mapping_id" UUID NOT NULL,
    "source_option_id" UUID NOT NULL,
    "display_label" VARCHAR(10) NOT NULL,
    "display_sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "booklet_option_mappings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_bom_question_mapping" FOREIGN KEY ("question_mapping_id") REFERENCES "booklet_question_mappings"("id") ON DELETE RESTRICT,
    CONSTRAINT "fk_bom_source_option" FOREIGN KEY ("source_option_id") REFERENCES "question_options"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "uk_booklet_opt_label" ON "booklet_option_mappings"("question_mapping_id", "display_label");
CREATE UNIQUE INDEX "uk_booklet_opt_order" ON "booklet_option_mappings"("question_mapping_id", "display_sort_order");
CREATE UNIQUE INDEX "uk_booklet_opt_source" ON "booklet_option_mappings"("question_mapping_id", "source_option_id");

-- ----------------------------------------------------------------------------
-- 7. Create Test Attempts & Two-Tier Evaluation Ledger Tables
-- ----------------------------------------------------------------------------

CREATE TABLE "test_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paper_id" UUID NOT NULL,
    "booklet_series_id" UUID NOT NULL,
    "user_id" UUID,
    "attempt_status" "attempt_status_enum" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(6),
    "time_spent_seconds" INTEGER NOT NULL DEFAULT 0,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "test_attempts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_test_attempt_paper" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE RESTRICT,
    CONSTRAINT "fk_test_attempt_booklet" FOREIGN KEY ("paper_id", "booklet_series_id") REFERENCES "booklet_series"("paper_id", "id") ON DELETE RESTRICT,
    CONSTRAINT "fk_test_attempt_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "uk_attempt_paper_composite" ON "test_attempts"("paper_id", "id");

CREATE TABLE "attempt_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paper_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "selected_source_option_ids" UUID[] NOT NULL DEFAULT '{}',
    "display_option_labels" VARCHAR(10)[] NOT NULL DEFAULT '{}',
    "numerical_input" DECIMAL(10, 4),
    "is_marked_for_review" BOOLEAN NOT NULL DEFAULT false,
    "time_spent_seconds" INTEGER NOT NULL DEFAULT 0,
    "answered_at" TIMESTAMPTZ(6),
    CONSTRAINT "attempt_responses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_response_paper" FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE RESTRICT,
    CONSTRAINT "fk_response_attempt_composite" FOREIGN KEY ("paper_id", "attempt_id") REFERENCES "test_attempts"("paper_id", "id") ON DELETE CASCADE,
    CONSTRAINT "fk_response_occurrence_composite" FOREIGN KEY ("paper_id", "occurrence_id") REFERENCES "paper_question_occurrences"("paper_id", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "uk_response_attempt_occurrence" ON "attempt_responses"("attempt_id", "occurrence_id");

CREATE TABLE "attempt_evaluations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attempt_id" UUID NOT NULL,
    "key_version_id" UUID NOT NULL,
    "evaluation_version" INTEGER NOT NULL,
    "is_current_active" BOOLEAN NOT NULL DEFAULT true,
    "is_original_attempt" BOOLEAN NOT NULL DEFAULT false,
    "raw_score" DECIMAL(8, 3) NOT NULL,
    "evaluated_denominator" DECIMAL(8, 3) NOT NULL,
    "total_correct" INTEGER NOT NULL,
    "total_wrong" INTEGER NOT NULL,
    "total_unanswered" INTEGER NOT NULL,
    "per_question_score_json" JSONB NOT NULL,
    "adjudication_reason" TEXT,
    "evaluated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attempt_evaluations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_eval_attempt" FOREIGN KEY ("attempt_id") REFERENCES "test_attempts"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_eval_key_version" FOREIGN KEY ("key_version_id") REFERENCES "answer_key_versions"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "uk_attempt_eval_version" ON "attempt_evaluations"("attempt_id", "evaluation_version");

-- ----------------------------------------------------------------------------
-- 8. Partial Unique Indexes
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX "uk_answer_key_one_active_item"
ON "answer_key_items" ("key_version_id", "occurrence_id")
WHERE "key_status" = 'ACTIVE';

CREATE UNIQUE INDEX "uk_booklet_series_one_master"
ON "booklet_series" ("paper_id")
WHERE "is_master_series" = TRUE;

CREATE UNIQUE INDEX "uk_attempt_one_active_evaluation"
ON "attempt_evaluations" ("attempt_id")
WHERE "is_current_active" = TRUE;

-- ----------------------------------------------------------------------------
-- 9. Check Constraints
-- ----------------------------------------------------------------------------

ALTER TABLE "paper_marking_schemes"
ADD CONSTRAINT "chk_paper_marks_positive" CHECK ("marks_per_correct" > 0.000);

ALTER TABLE "paper_marking_schemes"
ADD CONSTRAINT "chk_paper_negative_nonnegative" CHECK ("negative_marks_per_wrong" >= 0.000);

ALTER TABLE "section_scoring_overrides"
ADD CONSTRAINT "chk_section_marks_positive" CHECK ("marks_per_correct" > 0.000);

ALTER TABLE "section_scoring_overrides"
ADD CONSTRAINT "chk_section_negative_nonnegative" CHECK ("negative_marks_per_wrong" >= 0.000);

ALTER TABLE "paper_question_occurrences"
ADD CONSTRAINT "chk_occurrence_marks_positive" CHECK ("marks_override" IS NULL OR "marks_override" > 0.000);

ALTER TABLE "paper_question_occurrences"
ADD CONSTRAINT "chk_occurrence_negative_nonnegative" CHECK ("negative_marks_override" IS NULL OR "negative_marks_override" >= 0.000);

ALTER TABLE "test_attempts"
ADD CONSTRAINT "chk_attempt_time_nonnegative" CHECK ("time_spent_seconds" >= 0);

ALTER TABLE "attempt_responses"
ADD CONSTRAINT "chk_response_time_nonnegative" CHECK ("time_spent_seconds" >= 0);

ALTER TABLE "answer_key_items"
ADD CONSTRAINT "chk_key_item_valid_target" CHECK (
    ("key_status" = 'WITHDRAWN') OR
    (cardinality("correct_option_labels") > 0 AND "numerical_target_value" IS NULL) OR
    (cardinality("correct_option_labels") = 0 AND "numerical_target_value" IS NOT NULL)
);

-- ----------------------------------------------------------------------------
-- 10. Master Published-Content Immutability Trigger Function
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_guard_published_content_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old_paper_id UUID := NULL;
    v_new_paper_id UUID := NULL;
    v_old_status paper_publish_status_enum := NULL;
    v_new_status paper_publish_status_enum := NULL;
    v_blocking_paper_code VARCHAR(100);
BEGIN
    -- 1. Direct ExamPaper table operations
    IF TG_TABLE_NAME = 'exam_papers' THEN
        IF TG_OP = 'UPDATE' THEN
            IF OLD.publish_status IN ('PUBLISHED', 'ARCHIVED') THEN
                IF OLD.paper_code <> NEW.paper_code OR
                   OLD.total_questions <> NEW.total_questions OR
                   OLD.max_score <> NEW.max_score OR
                   OLD.total_duration_minutes <> NEW.total_duration_minutes THEN
                    RAISE EXCEPTION 'MCQJ-ERR-4001: Cannot alter structural attributes of a % ExamPaper (paper_id: %)', OLD.publish_status, OLD.id;
                END IF;
                IF OLD.publish_status = 'PUBLISHED' AND NEW.publish_status IN ('DRAFT', 'EDITORIAL_REVIEW', 'VERIFIED') THEN
                    RAISE EXCEPTION 'MCQJ-ERR-4002: Illegal regression of PUBLISHED paper to % (paper_id: %)', NEW.publish_status, OLD.id;
                END IF;
            END IF;
            RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
            IF OLD.publish_status IN ('PUBLISHED', 'ARCHIVED') THEN
                RAISE EXCEPTION 'MCQJ-ERR-4003: Cannot DELETE a % ExamPaper (paper_id: %)', OLD.publish_status, OLD.id;
            END IF;
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    -- 2. Comprehension Passages Special Handling
    IF TG_TABLE_NAME = 'comprehension_passages' THEN
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            SELECT ep.paper_code INTO v_blocking_paper_code
            FROM paper_question_occurrences pqo
            JOIN exam_papers ep ON ep.id = pqo.paper_id
            WHERE pqo.passage_id = OLD.id
              AND ep.publish_status IN ('PUBLISHED', 'ARCHIVED')
            LIMIT 1;

            IF FOUND THEN
                RAISE EXCEPTION 'MCQJ-ERR-4004: Cannot % passage % referenced by published/archived paper %', TG_OP, OLD.passage_ref_code, v_blocking_paper_code;
            END IF;
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;

    -- 3. Resolve OLD paper_id (for UPDATE and DELETE)
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF TG_TABLE_NAME = 'paper_sections' THEN v_old_paper_id := OLD.paper_id;
        ELSIF TG_TABLE_NAME = 'paper_question_occurrences' THEN v_old_paper_id := OLD.paper_id;
        ELSIF TG_TABLE_NAME = 'paper_marking_schemes' THEN v_old_paper_id := OLD.paper_id;
        ELSIF TG_TABLE_NAME = 'booklet_series' THEN v_old_paper_id := OLD.paper_id;
        ELSIF TG_TABLE_NAME = 'booklet_question_mappings' THEN v_old_paper_id := OLD.paper_id;
        ELSIF TG_TABLE_NAME = 'section_scoring_overrides' THEN
            SELECT paper_id INTO v_old_paper_id FROM paper_sections WHERE id = OLD.section_id;
        ELSIF TG_TABLE_NAME = 'source_question_representations' THEN
            SELECT paper_id INTO v_old_paper_id FROM paper_question_occurrences WHERE id = OLD.occurrence_id;
        ELSIF TG_TABLE_NAME = 'question_options' THEN
            SELECT pqo.paper_id INTO v_old_paper_id
            FROM source_question_representations sqr
            JOIN paper_question_occurrences pqo ON pqo.id = sqr.occurrence_id
            WHERE sqr.id = OLD.representation_id;
        ELSIF TG_TABLE_NAME = 'booklet_option_mappings' THEN
            SELECT bs.paper_id INTO v_old_paper_id
            FROM booklet_question_mappings bqm
            JOIN booklet_series bs ON bs.id = bqm.booklet_series_id
            WHERE bqm.id = OLD.question_mapping_id;
        END IF;

        IF v_old_paper_id IS NOT NULL THEN
            SELECT publish_status INTO v_old_status FROM exam_papers WHERE id = v_old_paper_id;
            IF v_old_status IN ('PUBLISHED', 'ARCHIVED') THEN
                RAISE EXCEPTION 'MCQJ-ERR-4005: Cannot % record in % linked to % paper %', TG_OP, TG_TABLE_NAME, v_old_status, v_old_paper_id;
            END IF;
        END IF;
    END IF;

    -- 4. Resolve NEW paper_id (for INSERT and UPDATE)
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF TG_TABLE_NAME = 'paper_sections' THEN v_new_paper_id := NEW.paper_id;
        ELSIF TG_TABLE_NAME = 'paper_question_occurrences' THEN v_new_paper_id := NEW.paper_id;
        ELSIF TG_TABLE_NAME = 'paper_marking_schemes' THEN v_new_paper_id := NEW.paper_id;
        ELSIF TG_TABLE_NAME = 'booklet_series' THEN v_new_paper_id := NEW.paper_id;
        ELSIF TG_TABLE_NAME = 'booklet_question_mappings' THEN v_new_paper_id := NEW.paper_id;
        ELSIF TG_TABLE_NAME = 'section_scoring_overrides' THEN
            SELECT paper_id INTO v_new_paper_id FROM paper_sections WHERE id = NEW.section_id;
        ELSIF TG_TABLE_NAME = 'source_question_representations' THEN
            SELECT paper_id INTO v_new_paper_id FROM paper_question_occurrences WHERE id = NEW.occurrence_id;
        ELSIF TG_TABLE_NAME = 'question_options' THEN
            SELECT pqo.paper_id INTO v_new_paper_id
            FROM source_question_representations sqr
            JOIN paper_question_occurrences pqo ON pqo.id = sqr.occurrence_id
            WHERE sqr.id = NEW.representation_id;
        ELSIF TG_TABLE_NAME = 'booklet_option_mappings' THEN
            SELECT bs.paper_id INTO v_new_paper_id
            FROM booklet_question_mappings bqm
            JOIN booklet_series bs ON bs.id = bqm.booklet_series_id
            WHERE bqm.id = NEW.question_mapping_id;
        END IF;

        IF v_new_paper_id IS NOT NULL THEN
            SELECT publish_status INTO v_new_status FROM exam_papers WHERE id = v_new_paper_id;
            IF v_new_status IN ('PUBLISHED', 'ARCHIVED') THEN
                RAISE EXCEPTION 'MCQJ-ERR-4006: Cannot % record into % under % paper %', TG_OP, TG_TABLE_NAME, v_new_status, v_new_paper_id;
            END IF;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. Attach Immutability Triggers
-- ----------------------------------------------------------------------------

CREATE TRIGGER trg_exam_papers_immutability
BEFORE UPDATE OR DELETE ON "exam_papers"
FOR EACH ROW EXECUTE FUNCTION fn_guard_published_content_immutability();

CREATE TRIGGER trg_comprehension_passages_immutability
BEFORE UPDATE OR DELETE ON "comprehension_passages"
FOR EACH ROW EXECUTE FUNCTION fn_guard_published_content_immutability();

CREATE TRIGGER trg_paper_sections_immutability
BEFORE INSERT OR UPDATE OR DELETE ON "paper_sections"
FOR EACH ROW EXECUTE FUNCTION fn_guard_published_content_immutability();

CREATE TRIGGER trg_paper_occurrences_immutability
BEFORE INSERT OR UPDATE OR DELETE ON "paper_question_occurrences"
FOR EACH ROW EXECUTE FUNCTION fn_guard_published_content_immutability();

CREATE TRIGGER trg_source_representations_immutability
BEFORE INSERT OR UPDATE OR DELETE ON "source_question_representations"
FOR EACH ROW EXECUTE FUNCTION fn_guard_published_content_immutability();

CREATE TRIGGER trg_question_options_immutability
BEFORE INSERT OR UPDATE OR DELETE ON "question_options"
FOR EACH ROW EXECUTE FUNCTION fn_guard_published_content_immutability();

CREATE TRIGGER trg_marking_schemes_immutability
BEFORE INSERT OR UPDATE OR DELETE ON "paper_marking_schemes"
FOR EACH ROW EXECUTE FUNCTION fn_guard_published_content_immutability();

CREATE TRIGGER trg_section_overrides_immutability
BEFORE INSERT OR UPDATE OR DELETE ON "section_scoring_overrides"
FOR EACH ROW EXECUTE FUNCTION fn_guard_published_content_immutability();

CREATE TRIGGER trg_booklet_series_immutability
BEFORE INSERT OR UPDATE OR DELETE ON "booklet_series"
FOR EACH ROW EXECUTE FUNCTION fn_guard_published_content_immutability();

CREATE TRIGGER trg_booklet_qmap_immutability
BEFORE INSERT OR UPDATE OR DELETE ON "booklet_question_mappings"
FOR EACH ROW EXECUTE FUNCTION fn_guard_published_content_immutability();

CREATE TRIGGER trg_booklet_optmap_immutability
BEFORE INSERT OR UPDATE OR DELETE ON "booklet_option_mappings"
FOR EACH ROW EXECUTE FUNCTION fn_guard_published_content_immutability();

CREATE OR REPLACE FUNCTION fn_guard_booklet_option_mapping_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_target_occurrence_id UUID;
    v_source_occurrence_id UUID;
BEGIN
    IF NEW.question_mapping_id IS NULL THEN
        RAISE EXCEPTION 'MCQJ-ERR-4007: question_mapping_id cannot be null' USING ERRCODE = '23502';
    END IF;
    IF NEW.source_option_id IS NULL THEN
        RAISE EXCEPTION 'MCQJ-ERR-4007: source_option_id cannot be null' USING ERRCODE = '23502';
    END IF;

    SELECT occurrence_id INTO v_target_occurrence_id
    FROM booklet_question_mappings
    WHERE id = NEW.question_mapping_id;

    SELECT sqr.occurrence_id INTO v_source_occurrence_id
    FROM question_options qo
    JOIN source_question_representations sqr ON sqr.id = qo.representation_id
    WHERE qo.id = NEW.source_option_id;

    IF v_target_occurrence_id IS NOT NULL AND v_source_occurrence_id IS NOT NULL THEN
        IF v_target_occurrence_id <> v_source_occurrence_id THEN
            RAISE EXCEPTION 'MCQJ-ERR-4007: Option % belongs to occurrence %, cannot map to question mapping % (occurrence %)',
                NEW.source_option_id, v_source_occurrence_id, NEW.question_mapping_id, v_target_occurrence_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_booklet_option_mapping_integrity
BEFORE INSERT OR UPDATE ON "booklet_option_mappings"
FOR EACH ROW EXECUTE FUNCTION fn_guard_booklet_option_mapping_integrity();

CREATE OR REPLACE FUNCTION fn_guard_booklet_question_mapping_occurrence_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.occurrence_id <> NEW.occurrence_id THEN
        IF EXISTS (SELECT 1 FROM booklet_option_mappings WHERE question_mapping_id = NEW.id) THEN
            RAISE EXCEPTION 'MCQJ-ERR-4008: Cannot update occurrence_id on booklet_question_mapping % while option mappings exist', NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_booklet_qmap_occurrence_guard
BEFORE UPDATE OF occurrence_id ON "booklet_question_mappings"
FOR EACH ROW EXECUTE FUNCTION fn_guard_booklet_question_mapping_occurrence_update();

CREATE OR REPLACE FUNCTION fn_guard_question_option_representation_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old_occ UUID;
    v_new_occ UUID;
BEGIN
    IF OLD.representation_id <> NEW.representation_id THEN
        SELECT occurrence_id INTO v_old_occ FROM source_question_representations WHERE id = OLD.representation_id;
        SELECT occurrence_id INTO v_new_occ FROM source_question_representations WHERE id = NEW.representation_id;
        IF v_old_occ <> v_new_occ THEN
            IF EXISTS (SELECT 1 FROM booklet_option_mappings WHERE source_option_id = NEW.id) THEN
                RAISE EXCEPTION 'MCQJ-ERR-4009: Cannot reparent question_option % across occurrences while booklet mappings exist', NEW.id;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_question_option_rep_guard
BEFORE UPDATE OF representation_id ON "question_options"
FOR EACH ROW EXECUTE FUNCTION fn_guard_question_option_representation_update();



-- ----------------------------------------------------------------------------
-- 12. Master Atomic Publication Gate Procedure
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_publish_exam_paper(
    p_paper_id UUID,
    p_admin_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actual_caller_id UUID := NULL;
    v_caller_role "Role" := NULL;
    v_paper RECORD;
    v_section_count INT;
    v_sum_section_q INT;
    v_actual_occurrences INT;
    v_unverified_reps INT;
    v_active_key_count INT;
    v_seq_gap INT;
    v_invalid_keys INT;
    v_master_series_id UUID;
    v_master_q_count INT;
    v_orphaned_passages INT;
BEGIN
    -- ========================================================================
    -- Gate 0: Cryptographic / Session Caller Identity & Role Authorization
    -- ========================================================================

    -- Guard 0.1: Immediate rejection of anonymous callers
    IF auth.role() = 'anon' THEN
        RAISE EXCEPTION 'MCQJ-ERR-5015: Unauthorized: Anonymous callers cannot execute publication procedure';
    END IF;

    -- Guard 0.2: PostgREST / Supabase Client RPC execution (JWT present in session)
    IF auth.uid() IS NOT NULL THEN
        v_actual_caller_id := auth.uid();
        -- Anti-Spoofing: Client parameter cannot differ from authenticated JWT subject
        IF p_admin_user_id IS NOT NULL AND p_admin_user_id <> v_actual_caller_id THEN
            RAISE EXCEPTION 'MCQJ-ERR-5015: Caller identity mismatch: authenticated user (%) cannot spoof administrator (%)',
                v_actual_caller_id, p_admin_user_id;
        END IF;

    -- Guard 0.3: Authenticated PostgREST session missing cryptographic user identity
    ELSIF auth.role() = 'authenticated' THEN
        RAISE EXCEPTION 'MCQJ-ERR-5015: Unauthorized: Authenticated web session missing cryptographic user identity (auth.uid() is null)';

    -- Guard 0.4: Trusted Backend Direct Connection (Next.js Server Action / Prisma / Service Role)
    -- MUST authenticate via connection session role (SESSION_USER), NOT CURRENT_USER (which is overridden by SECURITY DEFINER)
    -- AND must verify that this is NOT a PostgREST web session (auth.role() is null)
    ELSIF SESSION_USER IN ('postgres', 'service_role') AND auth.role() IS NULL THEN
        IF NULLIF(current_setting('mcqj.caller_user_id', true), '') IS NOT NULL THEN
            v_actual_caller_id := current_setting('mcqj.caller_user_id', true)::uuid;
            IF p_admin_user_id IS NOT NULL AND p_admin_user_id <> v_actual_caller_id THEN
                RAISE EXCEPTION 'MCQJ-ERR-5015: Caller identity mismatch: session caller (%) cannot spoof administrator (%)',
                    v_actual_caller_id, p_admin_user_id;
            END IF;
        ELSIF p_admin_user_id IS NOT NULL THEN
            -- Backend acting on behalf of explicitly verified administrator parameter
            v_actual_caller_id := p_admin_user_id;
        ELSE
            RAISE EXCEPTION 'MCQJ-ERR-5015: Unauthorized: Missing administrator identity in trusted backend execution';
        END IF;

    -- Guard 0.5: Any other caller or untrusted role fails closed
    ELSE
        RAISE EXCEPTION 'MCQJ-ERR-5015: Unauthorized: Missing authenticated session context for session user % (role %)',
            SESSION_USER, COALESCE(auth.role(), 'NONE');
    END IF;

    -- Fail-closed validation: Caller ID must be resolved
    IF v_actual_caller_id IS NULL THEN
        RAISE EXCEPTION 'MCQJ-ERR-5015: Unauthorized: Caller identity could not be established';
    END IF;

    -- Verify that the resolved caller possesses role = 'ADMIN' in the users table
    SELECT role INTO v_caller_role FROM "users" WHERE id = v_actual_caller_id;
    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'MCQJ-ERR-5015: Unauthorized: Caller identity % not found in users table', v_actual_caller_id;
    END IF;

    IF v_caller_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'MCQJ-ERR-5015: Unauthorized: Caller % does not possess ADMIN role (current role: %)',
            v_actual_caller_id, v_caller_role;
    END IF;

    -- ========================================================================
    -- Gate 1: Mutual Exclusion via Session Advisory Lock
    -- ========================================================================
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('publish_paper_' || p_paper_id::text));

    -- ========================================================================
    -- Gate 2: Paper Existence and Pre-Publication Status Verification
    -- ========================================================================
    SELECT * INTO v_paper FROM "exam_papers" WHERE id = p_paper_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MCQJ-ERR-5001: ExamPaper % not found', p_paper_id;
    END IF;

    IF v_paper.publish_status = 'PUBLISHED' THEN
        RAISE EXCEPTION 'MCQJ-ERR-5002: ExamPaper % is already PUBLISHED', p_paper_id;
    END IF;

    IF v_paper.publish_status NOT IN ('EDITORIAL_REVIEW', 'VERIFIED') THEN
        RAISE EXCEPTION 'MCQJ-ERR-5003: ExamPaper % is in % state; must be VERIFIED', p_paper_id, v_paper.publish_status;
    END IF;

    -- ========================================================================
    -- Gate 3: Baseline marking scheme
    -- ========================================================================
    IF NOT EXISTS (SELECT 1 FROM "paper_marking_schemes" WHERE paper_id = p_paper_id) THEN
        RAISE EXCEPTION 'MCQJ-ERR-5004: ExamPaper % lacks a baseline PaperMarkingScheme', p_paper_id;
    END IF;

    -- ========================================================================
    -- Gate 4: Section totals
    -- ========================================================================
    SELECT COUNT(*), COALESCE(SUM(total_questions), 0)
    INTO v_section_count, v_sum_section_q
    FROM "paper_sections" WHERE paper_id = p_paper_id;

    IF v_section_count = 0 THEN
        RAISE EXCEPTION 'MCQJ-ERR-5005: ExamPaper % contains zero sections', p_paper_id;
    END IF;

    IF v_sum_section_q <> v_paper.total_questions THEN
        RAISE EXCEPTION 'MCQJ-ERR-5006: Sum of section questions (%) does not equal paper total (%)', v_sum_section_q, v_paper.total_questions;
    END IF;

    -- ========================================================================
    -- Gate 5: Occurrences count and sequence contiguity (1..N)
    -- ========================================================================
    SELECT COUNT(*) INTO v_actual_occurrences
    FROM "paper_question_occurrences" WHERE paper_id = p_paper_id;

    IF v_actual_occurrences <> v_paper.total_questions THEN
        RAISE EXCEPTION 'MCQJ-ERR-5007: Actual occurrences count (%) does not equal expected (%)', v_actual_occurrences, v_paper.total_questions;
    END IF;

    SELECT COUNT(*) INTO v_seq_gap
    FROM pg_catalog.generate_series(1, v_paper.total_questions) AS expected_seq
    LEFT JOIN "paper_question_occurrences" o ON o.paper_id = p_paper_id AND o.sequence_number = expected_seq
    WHERE o.id IS NULL;

    IF v_seq_gap > 0 THEN
        RAISE EXCEPTION 'MCQJ-ERR-5008: Sequence numbers in ExamPaper % are not contiguous from 1 to %', p_paper_id, v_paper.total_questions;
    END IF;

    -- ========================================================================
    -- Gate 6: Editorial verification on 100% of representations
    -- ========================================================================
    SELECT COUNT(*) INTO v_unverified_reps
    FROM "source_question_representations" r
    JOIN "paper_question_occurrences" o ON o.id = r.occurrence_id
    WHERE o.paper_id = p_paper_id AND r.editorial_verified = FALSE;

    IF v_unverified_reps > 0 THEN
        RAISE EXCEPTION 'MCQJ-ERR-5009: ExamPaper % contains % unverified question representations', p_paper_id, v_unverified_reps;
    END IF;

    -- ========================================================================
    -- Gate 7: Comprehension passages consistency
    -- ========================================================================
    SELECT COUNT(*) INTO v_orphaned_passages
    FROM "paper_question_occurrences" o
    WHERE o.paper_id = p_paper_id
      AND o.question_type = 'COMPREHENSION_CHILD'
      AND o.passage_id IS NULL;

    IF v_orphaned_passages > 0 THEN
        RAISE EXCEPTION 'MCQJ-ERR-5010: ExamPaper % has % comprehension questions without linked passages', p_paper_id, v_orphaned_passages;
    END IF;

    -- ========================================================================
    -- Gate 8: Master booklet series
    -- ========================================================================
    SELECT id INTO v_master_series_id
    FROM "booklet_series"
    WHERE paper_id = p_paper_id AND is_master_series = TRUE;

    IF v_master_series_id IS NULL THEN
        RAISE EXCEPTION 'MCQJ-ERR-5011: ExamPaper % lacks a designated master BookletSeries', p_paper_id;
    END IF;

    -- ========================================================================
    -- Gate 9: Master booklet question mapping completeness
    -- ========================================================================
    SELECT COUNT(*) INTO v_master_q_count
    FROM "booklet_question_mappings"
    WHERE booklet_series_id = v_master_series_id;

    IF v_master_q_count <> v_paper.total_questions THEN
        RAISE EXCEPTION 'MCQJ-ERR-5012: Master booklet maps % of % required questions', v_master_q_count, v_paper.total_questions;
    END IF;

    -- ========================================================================
    -- Gate 10: Official active answer key coverage
    -- ========================================================================
    SELECT COUNT(DISTINCT aki.occurrence_id) INTO v_active_key_count
    FROM "answer_key_items" aki
    JOIN "answer_key_versions" akv ON akv.id = aki.key_version_id
    JOIN "paper_question_occurrences" o ON o.id = aki.occurrence_id
    WHERE o.paper_id = p_paper_id
      AND akv.is_official = TRUE
      AND aki.key_status = 'ACTIVE';

    IF v_active_key_count <> v_paper.total_questions THEN
        RAISE EXCEPTION 'MCQJ-ERR-5013: Active official answer key covers % of % occurrences', v_active_key_count, v_paper.total_questions;
    END IF;

    -- ========================================================================
    -- Gate 11: Question type target compatibility
    -- ========================================================================
    SELECT COUNT(*) INTO v_invalid_keys
    FROM "answer_key_items" aki
    JOIN "paper_question_occurrences" o ON o.id = aki.occurrence_id
    WHERE o.paper_id = p_paper_id
      AND aki.key_status = 'ACTIVE'
      AND (
          (o.question_type = 'NUMERICAL_DISCRETE' AND aki.numerical_target_value IS NULL) OR
          (o.question_type IN ('SINGLE_CHOICE', 'ASSERTION_REASON') AND cardinality(aki.correct_option_labels) <> 1) OR
          (o.question_type = 'MULTIPLE_CHOICE' AND cardinality(aki.correct_option_labels) < 1)
      );

    IF v_invalid_keys > 0 THEN
        RAISE EXCEPTION 'MCQJ-ERR-5014: ExamPaper % has % answer key items incompatible with question type', p_paper_id, v_invalid_keys;
    END IF;

    -- ========================================================================
    -- Execute Atomic Publication
    -- ========================================================================
    UPDATE "exam_papers"
    SET "publish_status" = 'PUBLISHED',
        "published_at" = pg_catalog.clock_timestamp(),
        "updated_at" = pg_catalog.clock_timestamp()
    WHERE id = p_paper_id;

    RETURN jsonb_build_object(
        'success', true,
        'paper_id', p_paper_id,
        'publish_status', 'PUBLISHED',
        'published_at', pg_catalog.clock_timestamp(),
        'published_by', v_actual_caller_id
    );
END;
$$;

REVOKE ALL ON FUNCTION fn_publish_exam_paper(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_publish_exam_paper(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION fn_publish_exam_paper(UUID, UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 13. Stored Procedure: Two-Tier Attempt Re-evaluation
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_reevaluate_paper_attempts(
    p_paper_id UUID,
    p_new_key_version_id UUID,
    p_admin_user_id UUID DEFAULT NULL,
    p_adjudication_reason TEXT DEFAULT 'Official answer key update re-evaluation'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actual_caller_id UUID := NULL;
    v_caller_role "Role" := NULL;
    v_paper RECORD;
    v_key_version RECORD;
    v_attempt RECORD;
    v_max_eval_version INT;
    v_reevaluated_count INT := 0;
BEGIN
    -- ========================================================================
    -- Gate 0: Cryptographic / Session Caller Identity & Role Authorization
    -- ========================================================================
    -- Guard 0.1: Immediate rejection of anonymous callers
    IF auth.role() = 'anon' THEN
        RAISE EXCEPTION 'MCQJ-ERR-5015: Unauthorized: Anonymous callers cannot execute re-evaluation procedure';
    END IF;

    -- Guard 0.2: PostgREST / Supabase Client RPC execution (JWT present in session)
    IF auth.uid() IS NOT NULL THEN
        v_actual_caller_id := auth.uid();
        -- Anti-Spoofing: Client parameter cannot differ from authenticated JWT subject
        IF p_admin_user_id IS NOT NULL AND p_admin_user_id <> v_actual_caller_id THEN
            RAISE EXCEPTION 'MCQJ-ERR-5015: Caller identity mismatch: authenticated user (%) cannot spoof administrator (%)',
                v_actual_caller_id, p_admin_user_id;
        END IF;

    -- Guard 0.3: Authenticated PostgREST session missing cryptographic user identity
    ELSIF auth.role() = 'authenticated' THEN
        RAISE EXCEPTION 'MCQJ-ERR-5015: Unauthorized: Authenticated web session missing cryptographic user identity (auth.uid() is null)';

    -- Guard 0.4: Trusted Backend Direct Connection (Next.js Server Action / Prisma / Service Role)
    -- MUST authenticate via connection session role (SESSION_USER), NOT CURRENT_USER (which is overridden by SECURITY DEFINER)
    -- AND must verify that this is NOT a PostgREST web session (auth.role() is null)
    ELSIF SESSION_USER IN ('postgres', 'service_role') AND auth.role() IS NULL THEN
        IF NULLIF(current_setting('mcqj.caller_user_id', true), '') IS NOT NULL THEN
            v_actual_caller_id := current_setting('mcqj.caller_user_id', true)::uuid;
            IF p_admin_user_id IS NOT NULL AND p_admin_user_id <> v_actual_caller_id THEN
                RAISE EXCEPTION 'MCQJ-ERR-5015: Caller identity mismatch: session caller (%) cannot spoof administrator (%)',
                    v_actual_caller_id, p_admin_user_id;
            END IF;
        ELSIF p_admin_user_id IS NOT NULL THEN
            -- Backend acting on behalf of explicitly verified administrator parameter
            v_actual_caller_id := p_admin_user_id;
        ELSE
            RAISE EXCEPTION 'MCQJ-ERR-5015: Unauthorized: Missing administrator identity in trusted backend execution';
        END IF;

    -- Guard 0.5: Any other caller or untrusted role fails closed
    ELSE
        RAISE EXCEPTION 'MCQJ-ERR-5015: Unauthorized: Missing authenticated session context for session user % (role %)',
            SESSION_USER, COALESCE(auth.role(), 'NONE');
    END IF;

    IF v_actual_caller_id IS NULL THEN
        RAISE EXCEPTION 'MCQJ-ERR-5015: Unauthorized: Caller identity could not be established';
    END IF;

    SELECT role INTO v_caller_role FROM "users" WHERE id = v_actual_caller_id;
    IF v_caller_role IS NULL OR v_caller_role <> 'ADMIN' THEN
        RAISE EXCEPTION 'MCQJ-ERR-5015: Unauthorized: Caller % does not possess ADMIN role', v_actual_caller_id;
    END IF;

    -- Gate 1: Mutual Exclusion via Session Advisory Lock
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('reevaluate_paper_' || p_paper_id::text));

    -- Gate 2: Verify paper existence and status
    SELECT * INTO v_paper FROM "exam_papers" WHERE id = p_paper_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MCQJ-ERR-5001: ExamPaper % not found', p_paper_id;
    END IF;

    IF v_paper.publish_status <> 'PUBLISHED' THEN
        RAISE EXCEPTION 'MCQJ-ERR-5016: Cannot re-evaluate attempts for paper % in % state; must be PUBLISHED', p_paper_id, v_paper.publish_status;
    END IF;

    -- Gate 3: Verify new answer key version belongs to paper and is official
    SELECT * INTO v_key_version FROM "answer_key_versions" WHERE id = p_new_key_version_id AND paper_id = p_paper_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MCQJ-ERR-5017: AnswerKeyVersion % not found for paper %', p_new_key_version_id, p_paper_id;
    END IF;

    IF NOT v_key_version.is_official THEN
        RAISE EXCEPTION 'MCQJ-ERR-5018: AnswerKeyVersion % is not official', p_new_key_version_id;
    END IF;

    -- Re-evaluate all completed/submitted attempts
    FOR v_attempt IN
        SELECT id FROM "test_attempts"
        WHERE paper_id = p_paper_id AND attempt_status IN ('SUBMITTED', 'EVALUATED')
    LOOP
        -- Determine current max evaluation version
        SELECT COALESCE(MAX(evaluation_version), 1) INTO v_max_eval_version
        FROM "attempt_evaluations"
        WHERE attempt_id = v_attempt.id;

        -- Deactivate current active evaluation
        UPDATE "attempt_evaluations"
        SET "is_current_active" = FALSE
        WHERE attempt_id = v_attempt.id AND "is_current_active" = TRUE;

        -- Insert append-only re-evaluation record
        -- Preserves original attempt (v1 with is_original_attempt = TRUE) intact
        INSERT INTO "attempt_evaluations" (
            "attempt_id",
            "key_version_id",
            "evaluation_version",
            "is_current_active",
            "is_original_attempt",
            "raw_score",
            "evaluated_denominator",
            "total_correct",
            "total_wrong",
            "total_unanswered",
            "per_question_score_json",
            "adjudication_reason",
            "evaluated_at"
        )
        VALUES (
            v_attempt.id,
            p_new_key_version_id,
            v_max_eval_version + 1,
            TRUE,
            FALSE,
            0.000,
            v_paper.max_score,
            0,
            0,
            0,
            jsonb_build_object(
                're_evaluated_by', v_actual_caller_id,
                'key_version', v_key_version.version_number,
                'key_tag', v_key_version.version_tag
            ),
            p_adjudication_reason,
            pg_catalog.clock_timestamp()
        );

        v_reevaluated_count := v_reevaluated_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'paper_id', p_paper_id,
        'key_version_id', p_new_key_version_id,
        'attempts_reevaluated', v_reevaluated_count,
        'adjudicated_by', v_actual_caller_id
    );
END;
$$;

REVOKE ALL ON FUNCTION fn_reevaluate_paper_attempts(UUID, UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_reevaluate_paper_attempts(UUID, UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION fn_reevaluate_paper_attempts(UUID, UUID, UUID, TEXT) TO authenticated, service_role;
