"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleEmailPasswordLogin = async (email: string, password: string) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!data.ok) {
        setError(data.error || "Login failed");
        return;
      }

      localStorage.setItem("user", JSON.stringify(data.user));
      router.push("/");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#e9edf3] px-4 py-8 text-zinc-950 dark:bg-[#111318] dark:text-zinc-50 sm:px-6">
      <section className="w-full max-w-[420px] rounded-[28px] border border-white/70 bg-[#f5f6f8] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.10)] dark:border-white/10 dark:bg-[#1a1d23] dark:shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:p-8">
        <div className="mb-8 space-y-2">
          <h1 className="text-[32px] font-semibold tracking-[-0.05em] text-zinc-950 dark:text-white">
            Sign in
          </h1>
        </div>

        <LoginForm
          onSubmit={handleEmailPasswordLogin}
          loading={loading}
          error={error}
        />
      </section>
    </main>
  );
}
