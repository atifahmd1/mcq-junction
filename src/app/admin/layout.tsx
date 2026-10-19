import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { assertAdminSession, UnauthorizedError, ForbiddenError } from "@/lib/auth/session";
import { signOut } from "@/app/auth/actions";
import Logo from "@/components/ui/Logo";

export const instant = false;

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  await connection();

  let adminUser;
  let authError: string | null = null;

  try {
    adminUser = await assertAdminSession();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect("/auth/signin");
    }
    if (err instanceof ForbiddenError) {
      authError = err.message;
    } else {
      authError = "An unexpected error occurred while verifying administrator credentials.";
    }
  }

  // If user is authenticated but not an active administrator, show forbidden boundary
  if (!adminUser || authError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B0D0F] px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-[#F87171]/40 bg-[#111416] p-8 text-center shadow-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/20">
            <svg
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-bold tracking-tight text-[#F1F2F3]">
            Administrative Access Denied
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-[#A1A1AA]">
            {authError ?? "Caller does not possess administrator privileges."}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/dashboard"
              className="inline-flex w-full items-center justify-center rounded-xl bg-[#D6B36A] px-4 py-2.5 text-xs font-semibold text-[#0B0D0F] shadow-sm transition hover:bg-[#E4C582]"
            >
              Return to Candidate Dashboard
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="w-full rounded-xl border border-[#2A2F34] bg-[#171A1D] px-4 py-2 text-xs font-medium text-[#A1A1AA] transition hover:bg-[#1D2125] hover:text-[#F1F2F3]"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0D0F] text-[#F1F2F3]">
      {/* Top Administrative Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-[#2A2F34] bg-[#0B0D0F]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <Logo />
              <span className="rounded bg-[#D6B36A]/10 border border-[#D6B36A]/30 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#D6B36A]">
                Console
              </span>
            </div>

            <nav className="hidden items-center gap-1 md:flex" aria-label="Admin Navigation">
              <Link
                href="/admin"
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#A1A1AA] transition hover:bg-[#171A1D] hover:text-[#F1F2F3]"
              >
                Overview
              </Link>
              <Link
                href="/admin/papers"
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#A1A1AA] transition hover:bg-[#171A1D] hover:text-[#F1F2F3]"
              >
                Exam Papers
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <div className="text-xs font-mono font-medium text-[#F1F2F3]">
                {adminUser.email}
              </div>
              <div className="flex items-center justify-end gap-1.5 text-[10px] text-[#717780]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                Verified Administrator
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="hidden rounded-lg border border-[#2A2F34] bg-[#171A1D] px-3 py-1.5 text-xs font-medium text-[#A1A1AA] transition hover:bg-[#1D2125] hover:text-[#F1F2F3] sm:inline-block"
              >
                Student View
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-lg border border-[#2A2F34] bg-[#171A1D] px-3 py-1.5 text-xs font-medium text-[#A1A1AA] transition hover:bg-[#1D2125] hover:text-[#F1F2F3]"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Mobile Subnavigation */}
        <div className="flex border-t border-[#2A2F34] px-4 py-2 md:hidden bg-[#111416]">
          <nav className="flex gap-2">
            <Link
              href="/admin"
              className="rounded px-2.5 py-1 text-xs font-medium text-[#A1A1AA] hover:text-[#F1F2F3]"
            >
              Overview
            </Link>
            <Link
              href="/admin/papers"
              className="rounded px-2.5 py-1 text-xs font-medium text-[#A1A1AA] hover:text-[#F1F2F3]"
            >
              Exam Papers
            </Link>
            <Link
              href="/dashboard"
              className="rounded px-2.5 py-1 text-xs font-medium text-[#D6B36A]"
            >
              Student View
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Administrative Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
