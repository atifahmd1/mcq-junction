import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { syncUserRecord } from "@/lib/auth/sync";
import { signOut } from "@/app/auth/actions";

// Tell Next.js 16 Cache Components that this route requires runtime session verification
export const instant = false;

export default async function DashboardPage() {
  await connection();
  const supabase = await createClient();

  // SECURE SERVER-SIDE VERIFICATION:
  // We call getUser() to cryptographically verify the session token against
  // Supabase Auth. Never trust client-submitted headers, cookies, or IDs directly.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/signin");
  }

  // QUERY APPLICATION DATA LAYER VIA PRISMA:
  // Using the verified user.id from Supabase Auth, we query our strongly typed
  // application database table in PostgreSQL.
  let dbUser = null;
  try {
    dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
  } catch (findError) {
    console.error(
      "Database read error during dashboard load:",
      findError instanceof Error ? findError.message : "DB error"
    );
  }

  // Self-healing recovery: If the user is authenticated in Supabase Auth
  // but their application record was not yet created (e.g. preexisting user
  // or signup DB sync transient failure), heal the record immediately via centralized sync:
  if (!dbUser && user.email) {
    const syncRes = await syncUserRecord(user);
    if (syncRes.success && syncRes.user) {
      dbUser = syncRes.user;
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              Authenticated Session
            </span>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              User Dashboard
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Server-verified identity and Prisma data model demonstration
            </p>
          </div>

          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-750"
            >
              Sign out
            </button>
          </form>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Identity verification from Supabase Auth */}
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-6 dark:border-zinc-800/60 dark:bg-zinc-800/40">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              1. Supabase Auth Identity
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Extracted from verified JWT via `supabase.auth.getUser()`
            </p>
            <dl className="mt-4 space-y-3 text-xs">
              <div>
                <dt className="text-zinc-500">Auth User ID (UUID)</dt>
                <dd className="font-mono text-zinc-900 dark:text-zinc-200">
                  {user.id}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Email</dt>
                <dd className="text-zinc-900 dark:text-zinc-200">
                  {user.email ?? "No email provided"}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Auth Provider</dt>
                <dd className="capitalize text-zinc-900 dark:text-zinc-200">
                  {user.app_metadata.provider ?? "email"}
                </dd>
              </div>
            </dl>
          </div>

          {/* Application Data Layer from Prisma */}
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-6 dark:border-zinc-800/60 dark:bg-zinc-800/40">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              2. Prisma Database Entity
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Queried from `public.users` via `prisma.user.findUnique()`
            </p>
            <dl className="mt-4 space-y-3 text-xs">
              <div>
                <dt className="text-zinc-500">Prisma Record Status</dt>
                <dd className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {dbUser ? "Synchronized in PostgreSQL" : "Pending Sync"}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Name</dt>
                <dd className="text-zinc-900 dark:text-zinc-200">
                  {dbUser?.name ?? "None"}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Created At</dt>
                <dd className="text-zinc-900 dark:text-zinc-200">
                  {dbUser ? new Date(dbUser.createdAt).toLocaleString() : "—"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
