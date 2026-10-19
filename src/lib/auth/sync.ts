import "server-only";

import type { User as SupabaseUser } from "@supabase/supabase-js";
import { prisma } from "../prisma.ts";

export type SyncUserResult = {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  error?: string;
};

/**
 * Synchronizes an authenticated Supabase identity to the application PostgreSQL User record.
 * This operation is idempotent and safe against repeated calls.
 */
export async function syncUserRecord(authUser: SupabaseUser): Promise<SyncUserResult> {
  if (!authUser.id || !authUser.email) {
    return { success: false, error: "Missing required user identity fields." };
  }

  const metadata = authUser.user_metadata ?? {};
  const name =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
      ? metadata.name
      : null;
  const avatarUrl =
    typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;

  try {
    const user = await prisma.user.upsert({
      where: { id: authUser.id },
      update: {
        email: authUser.email,
        name: name ?? undefined,
        avatarUrl: avatarUrl ?? undefined,
      },
      create: {
        id: authUser.id,
        email: authUser.email,
        name,
        avatarUrl,
      },
    });

    return { success: true, user };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Failed to synchronize user record";
    console.error("Database user synchronization failure:", errorMessage);
    return { success: false, error: errorMessage };
  }
}
