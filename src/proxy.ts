import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next.js 16 Proxy convention (renamed from middleware.ts).
 * Runs on the server before requests complete.
 *
 * Responsibilities:
 * 1. Reads incoming cookies and refreshes expired Supabase session tokens.
 * 2. Synchronizes updated auth cookies into both request and response headers.
 * 3. Enforces server-level protection on /dashboard by redirecting unauthenticated users.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Fail closed: if critical authentication configuration is missing, reject with 500
  if (!supabaseUrl || !supabaseAnonKey) {
    return new NextResponse(
      "Server Configuration Error: Missing authentication provider credentials.",
      { status: 500 }
    );
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: Use getUser() instead of getSession() for secure server verification.
  // getUser() authenticates the user against Supabase Auth servers, rejecting spoofed JWTs.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect /dashboard and /admin routes: redirect unauthenticated requests to signin
  if (
    !user &&
    (request.nextUrl.pathname.startsWith("/dashboard") ||
      request.nextUrl.pathname.startsWith("/admin"))
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/signin";
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // If already authenticated and visiting signin, redirect to safe next or dashboard
  if (user && request.nextUrl.pathname === "/auth/signin") {
    const rawNext = request.nextUrl.searchParams.get("next");
    const safeNext =
      rawNext &&
      rawNext.startsWith("/") &&
      !rawNext.startsWith("//") &&
      !rawNext.startsWith("/\\")
        ? rawNext
        : "/dashboard";
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = safeNext;
    redirectUrl.searchParams.delete("next");
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images / svg static assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
