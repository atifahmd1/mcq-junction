-- ============================================================================
-- MCQ Junction — Phase 4 Module 1: Revoke Public RPC Execute Grants
-- File: prisma/migrations/20261012140000_revoke_authenticated_privileged_rpc/migration.sql
-- ============================================================================

-- Close direct client PostgREST RPC access to administrative functions.
-- Administrative procedures must only be invoked via server-side Next.js
-- Server Actions over direct connection (DATABASE_URL / SESSION_USER = postgres).

REVOKE EXECUTE ON FUNCTION fn_publish_exam_paper(UUID, UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION fn_reevaluate_paper_attempts(UUID, UUID, UUID, TEXT) FROM authenticated;
