import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { validatePassword, validateConfirmPassword } from "@/lib/auth/validators";

export interface ResetPasswordFormProps {
  onSubmit: (password: string) => Promise<void>;
  loading?: boolean;
  error?: string;
}

export default function ResetPasswordForm({
  onSubmit,
  loading = false,
  error: externalError,
}: ResetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [internalError, setInternalError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");

  const error = externalError || internalError;

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setPasswordError(validatePassword(value) || "");
    if (confirmPassword) {
      setConfirmPasswordError(validateConfirmPassword(value, confirmPassword) || "");
    }
  };

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value);
    setConfirmPasswordError(validateConfirmPassword(password, value) || "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInternalError("");

    const nextPasswordError = validatePassword(password);
    const nextConfirmError = validateConfirmPassword(password, confirmPassword);

    setPasswordError(nextPasswordError || "");
    setConfirmPasswordError(nextConfirmError || "");

    if (nextPasswordError || nextConfirmError) return;

    try {
      await onSubmit(password);
    } catch (err) {
      setInternalError(err instanceof Error ? err.message : "Reset failed");
    }
  };

  const inputBaseClassName =
    "w-full rounded-[18px] border border-black/8 bg-white px-4 py-3 text-[15px] text-zinc-950 outline-none transition-all duration-200 placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-black/5 disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/10 dark:bg-[#20242b] dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-white/8";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Enter your new password below.
        </p>
      </div>

      <div className="space-y-3">
        <label htmlFor="reset-password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
          New password
        </label>
        <div className="relative">
          <input
            id="reset-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            placeholder="At least 8 characters"
            disabled={loading}
            aria-invalid={Boolean(passwordError)}
            aria-describedby={passwordError ? "reset-password-error" : undefined}
            className={`${inputBaseClassName} pr-16 ${passwordError ? "border-red-400 focus:border-red-400 focus:ring-red-100/70 dark:border-red-400/70 dark:focus:ring-red-500/10" : ""}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            disabled={loading}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {passwordError && (
          <p id="reset-password-error" className="px-1 text-sm text-red-600 dark:text-red-300">{passwordError}</p>
        )}
      </div>

      <div className="space-y-3">
        <label htmlFor="reset-confirm-password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-200">
          Confirm password
        </label>
        <input
          id="reset-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => handleConfirmPasswordChange(e.target.value)}
          placeholder="Repeat your password"
          disabled={loading}
          aria-invalid={Boolean(confirmPasswordError)}
          aria-describedby={confirmPasswordError ? "reset-confirm-password-error" : undefined}
          className={`${inputBaseClassName} ${confirmPasswordError ? "border-red-400 focus:border-red-400 focus:ring-red-100/70 dark:border-red-400/70 dark:focus:ring-red-500/10" : ""}`}
        />
        {confirmPasswordError && (
          <p id="reset-confirm-password-error" className="px-1 text-sm text-red-600 dark:text-red-300">{confirmPasswordError}</p>
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
        Reset password
      </Button>

      <div className="pt-1 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="font-medium text-zinc-900 transition-colors hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300"
            disabled={loading}
          >
            Back to sign in
          </button>
        </p>
      </div>
    </form>
  );
}
