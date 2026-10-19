import type { SupabaseClient } from "@supabase/supabase-js";
import { Role } from "../../generated/prisma/enums.ts";

/**
 * Standard typed authorization errors for server-side operations.
 */
export class UnauthorizedError extends Error {
  public readonly statusCode = 401;
  constructor(message = "Authentication session required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  public readonly statusCode = 403;
  constructor(message = "Administrator privileges required") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export interface AdminSessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  bannedUntil: string | null;
}

export interface SessionPrismaClient {
  user?: {
    findUnique: (args: {
      where: { id: string };
      select?: { id?: boolean; email?: boolean; name?: boolean; role?: boolean };
    }) => Promise<{
      id: string;
      email: string;
      name: string | null;
      role: Role;
    } | null>;
  };
}

export interface SessionOptions {
  supabaseClient?: SupabaseClient;
  prismaClient?: SessionPrismaClient;
}

/**
 * Cryptographically verifies current session and asserts active ADMIN role.
 *
 * Security Invariants:
 * 1. Uses supabase.auth.getUser() to cryptographically validate the JWT against Supabase Auth.
 * 2. Rejects missing, expired, invalid, or anonymous sessions with UnauthorizedError (401).
 * 3. Enforces account suspension checks via official Supabase Auth `banned_until` and `deleted_at`.
 * 4. Queries authoritative public.users table for the verified Supabase user UUID.
 * 5. Strictly requires dbUser.role === Role.ADMIN, failing closed on non-admin or demoted users with ForbiddenError (403).
 * 6. Never trusts client-supplied user IDs, cookies, or unverified claims.
 */
export async function assertAdminSession(options?: SessionOptions): Promise<AdminSessionUser> {
  const supabase =
    options?.supabaseClient ?? (await (await import("../supabase/server.ts")).createClient());

  // 1. Cryptographic validation of active user session
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    throw new UnauthorizedError(error?.message ?? "Authentication session required");
  }

  const user = data.user;

  // 2. Reject anonymous sessions
  if (user.is_anonymous) {
    throw new UnauthorizedError("Anonymous sessions cannot access administrative functions");
  }

  // 3. Authoritative ban / suspension checks from Supabase Auth
  const userMeta = user as unknown as { banned_until?: string; deleted_at?: string };
  const bannedUntil = userMeta.banned_until ?? (user.app_metadata?.banned_until as string | undefined);
  if (bannedUntil) {
    const banExpiry = new Date(bannedUntil);
    if (isNaN(banExpiry.getTime())) {
      // Malformed ban timestamp cannot be authoritatively verified: fail closed
      throw new ForbiddenError("Account suspension status could not be verified (malformed ban timestamp)");
    }
    if (banExpiry.getTime() > Date.now()) {
      throw new ForbiddenError(`Account is currently suspended until ${bannedUntil}`);
    }
  }

  const deletedAt = userMeta.deleted_at ?? (user.app_metadata?.deleted_at as string | undefined);
  if (deletedAt) {
    throw new ForbiddenError("Account has been deactivated");
  }

  // 4. Authoritative application database lookup
  const db =
    options?.prismaClient ?? (await import("../prisma.ts")).prisma;

  if (!db?.user?.findUnique) {
    throw new ForbiddenError("Database user model is unavailable for authentication verification");
  }

  let dbUser;
  try {
    dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });
  } catch (lookupErr) {
    const msg = lookupErr instanceof Error ? lookupErr.message : "Database lookup failure";
    throw new ForbiddenError(`Failed to verify administrative authorization: ${msg}`);
  }

  if (!dbUser) {
    throw new ForbiddenError("Application user record not found for authenticated identity");
  }

  // 5. Strict Role.ADMIN verification
  if (dbUser.role !== Role.ADMIN) {
    throw new ForbiddenError(
      `Caller does not possess administrator privileges (current role: ${dbUser.role})`
    );
  }

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    bannedUntil: user.banned_until ?? null,
  };
}

export interface CandidateSessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  bannedUntil: string | null;
}

/**
 * Cryptographically verifies current candidate session.
 * Accepts any non-banned, active user role (STUDENT, CONTRIBUTOR, REVIEWER, ADMIN).
 *
 * Security Invariants:
 * 1. Validates cryptographic session JWT via Supabase Auth.
 * 2. Rejects anonymous sessions (401).
 * 3. Enforces account suspension checks via banned_until and deleted_at (403).
 * 4. Authoritatively resolves application database record in public.users table.
 * 5. Never trusts client-supplied user IDs, cookies, or headers.
 */
export async function assertCandidateSession(
  options?: SessionOptions
): Promise<CandidateSessionUser> {
  const supabase =
    options?.supabaseClient ?? (await (await import("../supabase/server.ts")).createClient());

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    throw new UnauthorizedError(error?.message ?? "Authentication session required");
  }

  const user = data.user;

  if (user.is_anonymous) {
    throw new UnauthorizedError("Anonymous sessions cannot take examinations");
  }

  const userMeta = user as unknown as { banned_until?: string; deleted_at?: string };
  const bannedUntil = userMeta.banned_until ?? (user.app_metadata?.banned_until as string | undefined);
  if (bannedUntil) {
    const banExpiry = new Date(bannedUntil);
    if (isNaN(banExpiry.getTime())) {
      throw new ForbiddenError("Account suspension status could not be verified (malformed ban timestamp)");
    }
    if (banExpiry.getTime() > Date.now()) {
      throw new ForbiddenError(`Account is currently suspended until ${bannedUntil}`);
    }
  }

  const deletedAt = userMeta.deleted_at ?? (user.app_metadata?.deleted_at as string | undefined);
  if (deletedAt) {
    throw new ForbiddenError("Account has been deactivated");
  }

  const db =
    options?.prismaClient ?? (await import("../prisma.ts")).prisma;

  if (!db?.user?.findUnique) {
    throw new ForbiddenError("Database user model is unavailable for authentication verification");
  }

  let dbUser;
  try {
    dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });
  } catch (lookupErr) {
    const msg = lookupErr instanceof Error ? lookupErr.message : "Database lookup failure";
    throw new ForbiddenError(`Failed to verify candidate authorization: ${msg}`);
  }

  if (!dbUser) {
    throw new ForbiddenError("Application user record not found for authenticated identity");
  }

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    bannedUntil: user.banned_until ?? null,
  };
}

