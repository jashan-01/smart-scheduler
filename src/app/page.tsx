"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  consent_denied: "Google sign-in was cancelled.",
  token_exchange_failed: "Failed to complete sign-in. Please try again.",
  no_email: "Could not retrieve your email. Please try again.",
  auth_failed: "Authentication failed. Please try again.",
  no_code: "Invalid sign-in response. Please try again.",
};

function LandingContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-4">
      {/* Logo + title */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Smart Scheduler</h1>
        <span className="text-xs px-2 py-0.5 rounded bg-indigo-600/20 text-indigo-400 font-medium">
          AI
        </span>
      </div>
      <p className="text-zinc-500 text-sm mb-10">
        Voice-powered calendar scheduling
      </p>

      {error && (
        <div className="mb-6 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm max-w-md text-center">
          {ERROR_MESSAGES[error] || "An error occurred. Please try again."}
        </div>
      )}

      <div className="flex gap-6 flex-wrap justify-center">
        {/* Personal card */}
        <a
          href="/api/auth/google/login"
          className="w-72 p-6 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 hover:bg-zinc-900/80 transition-all cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center mb-4 group-hover:bg-blue-600/30 transition-colors">
            <svg
              className="w-5 h-5 text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-1 text-zinc-100">
            Personal
          </h2>
          <p className="text-sm text-zinc-500">
            Sign in with Google and manage your own calendar with voice.
          </p>
        </a>

        {/* Org demo card */}
        <a
          href="/org"
          className="w-72 p-6 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-900/80 transition-all cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center mb-4 group-hover:bg-emerald-600/30 transition-colors">
            <svg
              className="w-5 h-5 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-1 text-zinc-100">
            Organization Demo
          </h2>
          <p className="text-sm text-zinc-500">
            Multi-user scheduling with pre-configured workspace users.
          </p>
        </a>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen bg-zinc-950 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LandingContent />
    </Suspense>
  );
}
