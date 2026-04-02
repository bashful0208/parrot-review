import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import type { RegisterCredentials } from "@/lib/auth/types";
import {
  validateConfirmPassword,
  validateEmail,
  validatePassword,
} from "@/lib/auth/validators";

export interface RegisterFormProps {
  onSubmit: (credentials: RegisterCredentials) => Promise<void>;
  loading?: boolean;
  error?: string;
}

export default function RegisterForm({
  onSubmit,
  loading = false,
  error: externalError,
}: RegisterFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [internalError, setInternalError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");

  const error = externalError || internalError;

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setEmailError(validateEmail(value) || "");
  };

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

    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);
    const nextConfirmPasswordError = validateConfirmPassword(password, confirmPassword);

    setEmailError(nextEmailError || "");
    setPasswordError(nextPasswordError || "");
    setConfirmPasswordError(nextConfirmPasswordError || "");

    if (nextEmailError || nextPasswordError || nextConfirmPasswordError) {
      return;
    }

    try {
      await onSubmit({ email, password, confirmPassword });
    } catch (err) {
      setInternalError(err instanceof Error ? err.message : "Registration failed");
    }
  };

  const inputBaseClassName =
    "w-full rounded-[18px] border border-black/8 bg-white px-4 py-3 text-[15px] text-zinc-950 outline-none transition-all duration-200 placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-black/5 disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/10 dark:bg-[#20242b] dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-white/8";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Use your email to create an account.
        </p>
      </div>

      <div className="space-y-3">
        <label
          htmlFor="register-email"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
        >
          Email
        </label>
        <input
          id="register-email"
          type="email"
          value={email}
          onChange={(e) => handleEmailChange(e.target.value)}
          placeholder="name@company.com"
          disabled={loading}
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? "register-email-error" : undefined}
          className={`${inputBaseClassName} ${emailError ? "border-red-400 focus:border-red-400 focus:ring-red-100/70 dark:border-red-400/70 dark:focus:ring-red-500/10" : ""}`}
        />
        {emailError && (
          <p id="register-email-error" className="px-1 text-sm text-red-600 dark:text-red-300">
            {emailError}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <label
          htmlFor="register-password"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
        >
          Password
        </label>
        <div className="relative">
          <input
            id="register-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            placeholder="At least 6 characters"
            disabled={loading}
            aria-invalid={Boolean(passwordError)}
            aria-describedby={passwordError ? "register-password-error" : undefined}
            className={`${inputBaseClassName} pr-16 ${passwordError ? "border-red-400 focus:border-red-400 focus:ring-red-100/70 dark:border-red-400/70 dark:focus:ring-red-500/10" : ""}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            disabled={loading}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {passwordError && (
          <p id="register-password-error" className="px-1 text-sm text-red-600 dark:text-red-300">
            {passwordError}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <label
          htmlFor="register-confirm-password"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
        >
          Confirm password
        </label>
        <div className="relative">
          <input
            id="register-confirm-password"
            type={showConfirmPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => handleConfirmPasswordChange(e.target.value)}
            placeholder="Repeat your password"
            disabled={loading}
            aria-invalid={Boolean(confirmPasswordError)}
            aria-describedby={confirmPasswordError ? "register-confirm-password-error" : undefined}
            className={`${inputBaseClassName} pr-16 ${confirmPasswordError ? "border-red-400 focus:border-red-400 focus:ring-red-100/70 dark:border-red-400/70 dark:focus:ring-red-500/10" : ""}`}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            disabled={loading}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
          >
            {showConfirmPassword ? "Hide" : "Show"}
          </button>
        </div>
        {confirmPasswordError && (
          <p
            id="register-confirm-password-error"
            className="px-1 text-sm text-red-600 dark:text-red-300"
          >
            {confirmPasswordError}
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
        variant="primary"
        loading={loading}
        className="mt-2 w-full rounded-[16px] px-5 py-3.5 text-[15px] font-semibold"
      >
        Create account
      </Button>

      <div className="pt-1 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Already have an account?{" "}
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
