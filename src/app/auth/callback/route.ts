import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncUserRecord } from "@/lib/auth/sync";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Sync identity into application User table via centralized sync helper
      await syncUserRecord(data.user);

      // Safe redirect: ensure destination is a strict internal relative path to prevent open redirects
      const safeRedirect =
        next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
          ? next
          : "/dashboard";
      return NextResponse.redirect(`${origin}${safeRedirect}`);
    }
  }

  // Return to signin if code exchange failed
  return NextResponse.redirect(`${origin}/auth/signin?error=callback_failed`);
}
