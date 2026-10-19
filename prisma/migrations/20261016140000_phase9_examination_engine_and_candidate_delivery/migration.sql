-- ============================================================================
-- MCQ Junction — Phase 9: Realtime Examination Engine & Candidate Test Delivery
-- Migration: 20261016140000_phase9_examination_engine_and_candidate_delivery
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend AttemptStatus Enum with EXPIRED
-- ----------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'attempt_status_enum' AND e.enumlabel = 'EXPIRED'
    ) THEN
        ALTER TYPE "attempt_status_enum" ADD VALUE 'EXPIRED' AFTER 'EVALUATED';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Add expires_at to test_attempts and version to attempt_responses
-- ----------------------------------------------------------------------------

ALTER TABLE "test_attempts"
ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ(6);

ALTER TABLE "attempt_responses"
ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- ----------------------------------------------------------------------------
-- 3. Partial Unique Index: Prevent Multiple Active IN_PROGRESS Attempts
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "uk_attempt_user_paper_active"
ON "test_attempts" ("user_id", "paper_id")
WHERE "attempt_status" = 'IN_PROGRESS';

CREATE INDEX IF NOT EXISTS "idx_test_attempts_user_paper"
ON "test_attempts" ("user_id", "paper_id");

CREATE INDEX IF NOT EXISTS "idx_test_attempts_status_expires"
ON "test_attempts" ("attempt_status", "expires_at");

CREATE INDEX IF NOT EXISTS "idx_attempt_responses_attempt_occ"
ON "attempt_responses" ("attempt_id", "occurrence_id");

-- ----------------------------------------------------------------------------
-- 4. State Machine Guard Trigger on test_attempts
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_guard_attempt_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Block regression from terminal states back to IN_PROGRESS
    IF OLD.attempt_status IN ('SUBMITTED', 'EVALUATED', 'EXPIRED', 'DISQUALIFIED') AND NEW.attempt_status = 'IN_PROGRESS' THEN
        RAISE EXCEPTION 'MCQJ-ERR-6004: Illegal status regression: cannot transition % back to IN_PROGRESS (attempt: %)',
            OLD.attempt_status, OLD.id;
    END IF;

    -- Block alteration of immutable EVALUATED attempts
    IF OLD.attempt_status = 'EVALUATED' AND NEW.attempt_status <> 'EVALUATED' THEN
        RAISE EXCEPTION 'MCQJ-ERR-6004: Cannot alter terminal status of EVALUATED attempt %', OLD.id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_test_attempts_status_guard ON "test_attempts";
CREATE TRIGGER trg_test_attempts_status_guard
BEFORE UPDATE OF attempt_status ON "test_attempts"
FOR EACH ROW EXECUTE FUNCTION fn_guard_attempt_status_transition();

-- ----------------------------------------------------------------------------
-- 5. Response Mutation Guard Trigger on attempt_responses
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_guard_attempt_response_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_target_attempt_id UUID;
    v_status "attempt_status_enum";
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_target_attempt_id := OLD.attempt_id;
    ELSE
        v_target_attempt_id := NEW.attempt_id;
    END IF;

    SELECT attempt_status INTO v_status
    FROM "test_attempts"
    WHERE id = v_target_attempt_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'MCQJ-ERR-6005: Parent test attempt % does not exist', v_target_attempt_id;
    END IF;

    IF v_status <> 'IN_PROGRESS' THEN
        RAISE EXCEPTION 'MCQJ-ERR-6002: Cannot % responses for attempt % with status %',
            TG_OP, v_target_attempt_id, v_status;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_attempt_responses_mutation_guard ON "attempt_responses";
CREATE TRIGGER trg_attempt_responses_mutation_guard
BEFORE INSERT OR UPDATE OR DELETE ON "attempt_responses"
FOR EACH ROW EXECUTE FUNCTION fn_guard_attempt_response_mutation();

-- ----------------------------------------------------------------------------
-- 6. Fail-Closed Privilege Management
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION fn_guard_attempt_status_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_guard_attempt_response_mutation() FROM PUBLIC;
