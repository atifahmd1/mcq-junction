"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncUserRecord } from "@/lib/auth/sync";
import { signInSchema, signUpSchema } from "@/lib/auth/schemas";

export type AuthState = {
  error?: string;
  success?: string;
};

/**
 * Initiates OAuth login (GitHub / Google) on the server.
 * Obtains the OAuth authorization URL from Supabase and redirects the browser.
 */
function getSiteOrigin(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL).origin;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

export async function signInWithOAuth(provider: "github" | "google") {
  const origin = getSiteOrigin();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
  }

  if (data?.url) {
    redirect(data.url);
  }
}

/**
 * Email & Password Sign-In.
 */
export async function signInWithEmail(
  _prevState: AuthState | null,
  formData: FormData
): Promise<AuthState> {
  const parseResult = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parseResult.success) {
    return {
      error: parseResult.error.issues[0]?.message ?? "Invalid sign-in format.",
    };
  }

  const { email, password } = parseResult.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Ensure user is present in application database table
  if (data.user) {
    await syncUserRecord(data.user);
  }

  redirect("/dashboard");
}

/**
 * Email & Password Sign-Up.
 * Creates credentials in Supabase Auth and populates application User record.
 */
export async function signUpWithEmail(
  _prevState: AuthState | null,
  formData: FormData
): Promise<AuthState> {
  const parseResult = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name") || undefined,
  });

  if (!parseResult.success) {
    return {
      error:
        parseResult.error.issues[0]?.message ?? "Invalid registration format.",
    };
  }

  const { email, password, name } = parseResult.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name ?? null,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.user) {
    await syncUserRecord(data.user);
  }

  // If Supabase is configured with email confirmation, inform the user
  if (data.session === null) {
    return {
      success:
        "Account created! Please check your email inbox to confirm your registration.",
    };
  }

  redirect("/dashboard");
}

/**
 * Sign out the current user session and redirect to signin.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/signin");
}
