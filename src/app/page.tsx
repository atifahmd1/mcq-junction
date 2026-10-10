export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-medium tracking-wide text-zinc-500 uppercase">
          Foundation
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
          MCQ Junction
        </h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Module 3 Authentication Foundation is active. Explore secure sign-in and session verification below.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <a
            href="/auth/signin"
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            Sign In / Sign Up
          </a>
          <a
            href="/dashboard"
            className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
