import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateEmail, validatePassword } from "@/lib/auth/validators";
import SocialLoginGroup from "./SocialLoginGroup";
import Divider from "./Divider";
import { Eye, EyeOff } from "lucide-react";

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

  const handleSocialLogin = (provider: "github" | "gitee" | "google") => {
    // TODO: Implement social login
    console.log(`Social login with ${provider}`);
  };

  return (
    <div className="w-full">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-white">
        Sign in
      </h1>

      <SocialLoginGroup
        providers={["github", "gitee", "google"]}
        onProviderClick={handleSocialLogin}
        disabled={loading}
      />

      <Divider />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email">Email address</Label>
          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            placeholder="name@example.com"
            disabled={loading}
            aria-invalid={Boolean(emailError)}
            className={`px-4 py-3 ${emailError ? "border-red-500" : ""}`}
          />
          {emailError && (
            <p className="text-sm text-red-500">{emailError}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <button
              type="button"
              onClick={() => router.push("/forgot-password")}
              className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400"
              disabled={loading}
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              placeholder="Enter your password"
              disabled={loading}
              aria-invalid={Boolean(passwordError)}
              className={`px-4 py-3 ${passwordError ? "border-red-500" : ""}`}
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
          {passwordError && (
            <p className="text-sm text-red-500">{passwordError}</p>
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
          className="w-full bg-green-600 px-4 py-3 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
        >
          Sign in
        </Button>

        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          New to Code Reviewer?{" "}
          <button
            type="button"
            onClick={() => router.push("/register")}
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
            disabled={loading}
          >
            Create an account
          </button>
        </p>
      </form>
    </div>
  );
}
