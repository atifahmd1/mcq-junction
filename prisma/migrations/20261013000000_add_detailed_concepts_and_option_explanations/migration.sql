-- ============================================================================
-- MCQ Junction — Migration 7: Detailed Concepts and Option Explanations
-- File: prisma/migrations/20261013000000_add_detailed_concepts_and_option_explanations/migration.sql
-- ============================================================================

-- Create detailed_concepts table
CREATE TABLE IF NOT EXISTS public.detailed_concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    key_points TEXT[] NOT NULL DEFAULT '{}',
    image_url VARCHAR(1000),
    image_alt VARCHAR(255),
    image_caption VARCHAR(500),
    video_url VARCHAR(1000),
    video_title VARCHAR(255),
    "references" JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT clock_timestamp()
);

-- Add option explanation and concept relation to question_options
ALTER TABLE public.question_options
    ADD COLUMN IF NOT EXISTS explanation_text TEXT,
    ADD COLUMN IF NOT EXISTS concept_id UUID;

-- Add foreign key constraint safely
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_question_options_concept'
    ) THEN
        ALTER TABLE public.question_options
            ADD CONSTRAINT fk_question_options_concept
            FOREIGN KEY (concept_id) REFERENCES public.detailed_concepts(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- Create index on concept_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_question_options_concept_id ON public.question_options(concept_id);

-- Set search_path and grant permissions
GRANT SELECT ON public.detailed_concepts TO anon, authenticated, service_role;
GRANT ALL ON public.detailed_concepts TO postgres, service_role;
