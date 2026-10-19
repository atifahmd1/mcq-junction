-- ============================================================================
-- MCQ Junction — Migration 8: Phase 8 Question Types & Answer Evaluation
-- File: prisma/migrations/20261016000000_phase8_question_types_and_answer_evaluation/migration.sql
-- ============================================================================

-- Step 1: Extend question_type_enum with SINGLE_CORRECT and MULTIPLE_CORRECT
ALTER TYPE "question_type_enum" ADD VALUE IF NOT EXISTS 'SINGLE_CORRECT';
ALTER TYPE "question_type_enum" ADD VALUE IF NOT EXISTS 'MULTIPLE_CORRECT';

-- Step 2: Add explicit question_type column to conceptual_questions table
ALTER TABLE "conceptual_questions"
    ADD COLUMN IF NOT EXISTS "question_type" "question_type_enum" NOT NULL DEFAULT 'SINGLE_CHOICE';

-- Step 3: Add index on question_type for efficient filtering
CREATE INDEX IF NOT EXISTS "idx_conceptual_questions_type" ON "conceptual_questions"("question_type");
CREATE INDEX IF NOT EXISTS "idx_paper_occurrences_type" ON "paper_question_occurrences"("question_type");

-- Step 4: Ensure permissions are preserved
GRANT SELECT ON "conceptual_questions" TO anon, authenticated, service_role;
GRANT ALL ON "conceptual_questions" TO postgres, service_role;
