"use client";

import { useState } from "react";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (email: string) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!data.ok) {
        setError(data.error || "Request failed");
        return;
      }

      setSent(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#e9edf3] px-4 py-8 text-zinc-950 dark:bg-[#111318] dark:text-zinc-50 sm:px-6">
        <section className="w-full max-w-[420px] rounded-[28px] border border-white/70 bg-[#f5f6f8] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] dark:border-white/10 dark:bg-[#1a1d23] dark:shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:p-8">
          <div className="mb-8 space-y-2">
            <h1 className="text-[32px] font-semibold tracking-[-0.05em] text-zinc-950 dark:text-white">
              Check your email
            </h1>
            <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              If an account exists with that email, we&apos;ve sent a password reset link.
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
            Reset password
          </h1>
        </div>

        <ForgotPasswordForm onSubmit={handleSubmit} loading={loading} error={error} />
      </section>
    </main>
  );
}
