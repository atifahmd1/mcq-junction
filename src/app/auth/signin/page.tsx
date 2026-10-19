"use client";

import { useActionState, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithOAuth,
  type AuthState,
} from "@/app/auth/actions";
import Logo from "@/components/ui/Logo";

function sanitizeNextPath(raw: string | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.startsWith("/\\")
  ) {
    return trimmed;
  }
  return "";
}

function SignInContent() {
  const searchParams = useSearchParams();
  const nextParam = sanitizeNextPath(searchParams.get("next"));
  const queryError = searchParams.get("error");
  const [isSignUp, setIsSignUp] = useState(false);

  const [signInState, signInAction, isSignInPending] = useActionState<
    AuthState | null,
    FormData
  >(signInEmailWrapper, null);

  const [signUpState, signUpAction, isSignUpPending] = useActionState<
    AuthState | null,
    FormData
  >(signUpEmailWrapper, null);

  async function signInEmailWrapper(
    prevState: AuthState | null,
    formData: FormData
  ) {
    return signInWithEmail(prevState, formData);
  }

  async function signUpEmailWrapper(
    prevState: AuthState | null,
    formData: FormData
  ) {
    return signUpWithEmail(prevState, formData);
  }

  const activeState = isSignUp ? signUpState : signInState;
  const isPending = isSignUp ? isSignUpPending : isSignInPending;
  const errorMessage =
    activeState?.error ||
    (queryError ? "Authentication error: " + queryError : null);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-[#0B0D0F]">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-[#2A2F34] bg-[#111416] p-6 sm:p-8 shadow-2xl">
        <div className="text-center flex flex-col items-center">
          <Logo />
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-[#F1F2F3]">
            {isSignUp ? "Create your account" : "Sign in to MCQ Junction"}
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm text-[#A1A1AA]">
            {isSignUp
              ? "Join to practice questions, take mock tests, and track progress"
              : "Welcome back! Access your mock exams and revision notes"}
          </p>
        </div>

        {/* OAuth Social Login Buttons */}
        <div className="space-y-3">
          <form action={() => signInWithOAuth("github", nextParam)}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#2A2F34] bg-[#171A1D] px-4 py-2.5 text-xs sm:text-sm font-medium text-[#F1F2F3] transition hover:bg-[#1D2125] hover:border-[#D6B36A]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D6B36A]"
            >
              <svg className="h-4 w-4 fill-current text-[#F1F2F3]" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              <span>Continue with GitHub</span>
            </button>
          </form>

          <form action={() => signInWithOAuth("google", nextParam)}>
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#2A2F34] bg-[#171A1D] px-4 py-2.5 text-xs sm:text-sm font-medium text-[#F1F2F3] transition hover:bg-[#1D2125] hover:border-[#D6B36A]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D6B36A]"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </form>
        </div>

        <div className="relative flex items-center justify-center">
          <div className="w-full border-t border-[#2A2F34]" />
          <span className="absolute bg-[#111416] px-3 text-[11px] font-mono uppercase tracking-wider text-[#717780]">
            or continue with email
          </span>
        </div>

        {/* Feedback message banner */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-lg border border-[#F87171]/40 bg-[#F87171]/10 p-3 text-xs text-[#F87171]"
          >
            {errorMessage}
          </div>
        )}

        {activeState?.success && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border border-[#22C55E]/40 bg-[#22C55E]/10 p-3 text-xs text-[#22C55E]"
          >
            {activeState.success}
          </div>
        )}

        {/* Email & Password Form */}
        <form
          action={isSignUp ? signUpAction : signInAction}
          className="space-y-4"
        >
          {/* Preserve return destination */}
          {nextParam && <input type="hidden" name="next" value={nextParam} />}

          {isSignUp && (
            <div>
              <label
                htmlFor="name"
                className="block text-xs font-medium text-[#A1A1AA]"
              >
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Jane Doe"
                className="mt-1 block w-full rounded-lg border border-[#2A2F34] bg-[#171A1D] px-3.5 py-2 text-xs sm:text-sm text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none focus:ring-1 focus:ring-[#D6B36A]"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-[#A1A1AA]"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="mt-1 block w-full rounded-lg border border-[#2A2F34] bg-[#171A1D] px-3.5 py-2 text-xs sm:text-sm text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none focus:ring-1 focus:ring-[#D6B36A]"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-[#A1A1AA]"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={isSignUp ? 8 : undefined}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              placeholder={isSignUp ? "At least 8 characters" : "••••••••"}
              className="mt-1 block w-full rounded-lg border border-[#2A2F34] bg-[#171A1D] px-3.5 py-2 text-xs sm:text-sm text-[#F1F2F3] placeholder-[#717780] focus:border-[#D6B36A] focus:outline-none focus:ring-1 focus:ring-[#D6B36A]"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="flex w-full justify-center rounded-lg bg-[#D6B36A] px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#0B0D0F] shadow-sm transition hover:bg-[#E4C582] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D6B36A] disabled:opacity-50"
          >
            {isPending
              ? "Please wait..."
              : isSignUp
              ? "Create Account"
              : "Sign In"}
          </button>
        </form>

        <div className="text-center text-xs text-[#A1A1AA]">
          {isSignUp ? (
            <span>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                className="font-semibold text-[#D6B36A] hover:underline"
              >
                Sign in
              </button>
            </span>
          ) : (
            <span>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => setIsSignUp(true)}
                className="font-semibold text-[#D6B36A] hover:underline"
              >
                Sign up
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12 bg-[#0B0D0F]">
          <div className="text-xs font-mono text-[#717780]">Loading sign in...</div>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
