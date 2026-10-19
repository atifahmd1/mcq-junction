-- ============================================================================
-- MCQ Junction — Migration 20261016120000_phase8_1_comprehension_passages_and_all_or_nothing_scoring
-- Forward-only, idempotent migration for Phase 8.1
-- Adds image support to comprehension_passages and indexes passage_id on occurrences
-- ============================================================================

-- 1. Add optional image fields to comprehension_passages safely
ALTER TABLE public.comprehension_passages
  ADD COLUMN IF NOT EXISTS image_url VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS image_alt VARCHAR(255);

-- 2. Add performance index on paper_question_occurrences(passage_id)
CREATE INDEX IF NOT EXISTS idx_paper_occurrences_passage_id
  ON public.paper_question_occurrences(passage_id);

-- 3. Enforce strict least-privilege security boundaries (fail-closed)
REVOKE ALL ON TABLE public.comprehension_passages FROM anon, authenticated;
