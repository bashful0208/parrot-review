import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RegisterCredentials } from "@/lib/auth/types";
import {
  validateConfirmPassword,
  validateEmail,
  validatePassword,
} from "@/lib/auth/validators";
import { Eye, EyeOff } from "lucide-react";

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

  return (
    <div className="w-full">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-white">
        Create an account
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="register-email">Email address</Label>
          <Input
            id="register-email"
            type="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            placeholder="name@example.com"
            disabled={loading}
            aria-invalid={Boolean(emailError)}
            className={`h-12 px-4 text-base ${emailError ? "border-red-500" : ""}`}
          />
          {emailError && (
            <p className="text-sm text-red-500">{emailError}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="register-password">Password</Label>
          <div className="relative">
            <Input
              id="register-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              placeholder="At least 8 characters"
              disabled={loading}
              aria-invalid={Boolean(passwordError)}
              className={`h-12 px-4 text-base ${passwordError ? "border-red-500" : ""}`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={loading}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Must be at least 8 characters with uppercase, lowercase, and number
          </p>
          {passwordError && (
            <p className="text-sm text-red-500">{passwordError}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="register-confirm-password">Confirm password</Label>
          <div className="relative">
            <Input
              id="register-confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => handleConfirmPasswordChange(e.target.value)}
              placeholder="Repeat your password"
              disabled={loading}
              aria-invalid={Boolean(confirmPasswordError)}
              className={`h-12 px-4 text-base ${confirmPasswordError ? "border-red-500" : ""}`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              disabled={loading}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {confirmPasswordError && (
            <p className="text-sm text-red-500">{confirmPasswordError}</p>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-3 dark:bg-red-900/20">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          loading={loading}
          className="h-12 w-full bg-green-600 text-base hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
        >
          Create an account
        </Button>

        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          Already have an account?{" "}
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
            disabled={loading}
          >
            Sign in
          </button>
        </p>
      </form>
    </div>
  );
}
