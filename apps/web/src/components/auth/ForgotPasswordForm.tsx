import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { validateEmail } from "@/lib/auth/validators";

export interface ForgotPasswordFormProps {
  onSubmit: (email: string) => Promise<void>;
  loading?: boolean;
  error?: string;
}

export default function ForgotPasswordForm({
  onSubmit,
  loading = false,
  error: externalError,
}: ForgotPasswordFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [internalError, setInternalError] = useState("");
  const [emailError, setEmailError] = useState("");

  const error = externalError || internalError;

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setEmailError(validateEmail(value) || "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInternalError("");

    const nextEmailError = validateEmail(email);
    setEmailError(nextEmailError || "");
    if (nextEmailError) return;

    try {
      await onSubmit(email);
    } catch (err) {
      setInternalError(err instanceof Error ? err.message : "Request failed");
    }
  };

  const inputBaseClassName =
    "w-full rounded-[18px] border border-black/8 bg-white px-4 py-3 text-[15px] text-zinc-950 outline-none transition-all duration-200 placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-black/5 disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/10 dark:bg-[#20242b] dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-white/8";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>
      </div>

      <div className="space-y-3">
        <label
          htmlFor="forgot-email"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
        >
          Email
        </label>
        <input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(e) => handleEmailChange(e.target.value)}
          placeholder="name@company.com"
          disabled={loading}
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? "forgot-email-error" : undefined}
          className={`${inputBaseClassName} ${emailError ? "border-red-400 focus:border-red-400 focus:ring-red-100/70 dark:border-red-400/70 dark:focus:ring-red-500/10" : ""}`}
        />
        {emailError && (
          <p id="forgot-email-error" className="px-1 text-sm text-red-600 dark:text-red-300">
            {emailError}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/20 dark:bg-red-500/10">
          <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
        </div>
      )}

      <Button
        type="submit"
        loading={loading}
        className="mt-2 w-full rounded-[16px] px-5 py-3.5 text-[15px] font-semibold"
      >
        Send reset link
      </Button>

      <div className="pt-1 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Remember your password?{" "}
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="font-medium text-zinc-900 transition-colors hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading}
          >
            Sign in
          </button>
        </p>
      </div>
    </form>
  );
}
