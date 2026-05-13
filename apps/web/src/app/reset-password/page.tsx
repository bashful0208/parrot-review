"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#e9edf3] px-4 py-8 text-zinc-950 dark:bg-[#111318] dark:text-zinc-50 sm:px-6">
        <section className="w-full max-w-[420px] rounded-[28px] border border-white/70 bg-[#f5f6f8] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] dark:border-white/10 dark:bg-[#1a1d23] dark:shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:p-8">
          <div className="space-y-2">
            <h1 className="text-[32px] font-semibold tracking-[-0.05em] text-zinc-950 dark:text-white">
              Invalid link
            </h1>
            <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              This password reset link is invalid or missing.
            </p>
          </div>
        </section>
      </main>
    );
  }

  const handleSubmit = async (password: string) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!data.ok) {
        setError(data.error || "Reset failed");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#e9edf3] px-4 py-8 text-zinc-950 dark:bg-[#111318] dark:text-zinc-50 sm:px-6">
        <section className="w-full max-w-[420px] rounded-[28px] border border-white/70 bg-[#f5f6f8] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] dark:border-white/10 dark:bg-[#1a1d23] dark:shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:p-8">
          <div className="space-y-2">
            <h1 className="text-[32px] font-semibold tracking-[-0.05em] text-zinc-950 dark:text-white">
              Password reset
            </h1>
            <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Your password has been reset. Redirecting to sign in...
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#e9edf3] px-4 py-8 text-zinc-950 dark:bg-[#111318] dark:text-zinc-50 sm:px-6">
      <section className="w-full max-w-[420px] rounded-[28px] border border-white/70 bg-[#f5f6f8] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] dark:border-white/10 dark:bg-[#1a1d23] dark:shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:p-8">
        <div className="mb-8 space-y-2">
          <h1 className="text-[32px] font-semibold tracking-[-0.05em] text-zinc-950 dark:text-white">
            Set new password
          </h1>
        </div>

        <ResetPasswordForm onSubmit={handleSubmit} loading={loading} error={error} />
      </section>
    </main>
  );
}
