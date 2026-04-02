import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { validateEmail, validatePassword } from "@/lib/auth/validators";

export interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  loading?: boolean;
  error?: string;
}

export default function LoginForm({
  onSubmit,
  loading = false,
  error: externalError,
}: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [internalError, setInternalError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const error = externalError || internalError;

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setEmailError(validateEmail(value) || "");
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setPasswordError(validatePassword(value) || "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInternalError("");

    const emailValidation = validateEmail(email);
    const passwordValidation = validatePassword(password);

    if (emailValidation) {
      setEmailError(emailValidation);
      return;
    }

    if (passwordValidation) {
      setPasswordError(passwordValidation);
      return;
    }

    try {
      await onSubmit(email, password);
    } catch (err) {
      setInternalError(err instanceof Error ? err.message : "Login failed");
    }
  };

  const inputBaseClassName =
    "w-full rounded-[18px] border border-black/8 bg-white px-4 py-3 text-[15px] text-zinc-950 outline-none transition-all duration-200 placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-black/5 disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/10 dark:bg-[#20242b] dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-white/8";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Use your email to sign in.
        </p>
      </div>

      <div className="space-y-3">
        <label
          htmlFor="login-email"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
        >
          Email
        </label>
        <div className="relative">
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            placeholder="name@company.com"
            disabled={loading}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "login-email-error" : undefined}
            className={`${inputBaseClassName} pr-11 ${emailError ? "border-red-400 focus:border-red-400 focus:ring-red-100/70 dark:border-red-400/70 dark:focus:ring-red-500/10" : ""}`}
          />
          <svg
            className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
          </svg>
        </div>
        {emailError && (
          <p id="login-email-error" className="px-1 text-sm text-red-600 dark:text-red-300">
            {emailError}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <label
            htmlFor="login-password"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-200"
          >
            Password
          </label>
          <button
            type="button"
            onClick={() => router.push("/forgot-password")}
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading}
          >
            Forgot password?
          </button>
        </div>
        <div className="relative">
          <input
            id="login-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            placeholder="Enter your password"
            disabled={loading}
            aria-invalid={Boolean(passwordError)}
            aria-describedby={passwordError ? "login-password-error" : undefined}
            className={`${inputBaseClassName} pr-12 ${passwordError ? "border-red-400 focus:border-red-400 focus:ring-red-100/70 dark:border-red-400/70 dark:focus:ring-red-500/10" : ""}`}
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
          <p
            id="login-password-error"
            className="px-1 text-sm text-red-600 dark:text-red-300"
          >
            {passwordError}
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
        Sign in
      </Button>

      <div className="space-y-3 pt-1 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No account?{" "}
          <button
            type="button"
            onClick={() => router.push("/register")}
            className="font-medium text-zinc-900 transition-colors hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading}
          >
            Create account
          </button>
        </p>
      </div>
    </form>
  );
}
