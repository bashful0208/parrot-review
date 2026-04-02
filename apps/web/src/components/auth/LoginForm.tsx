import { useState } from "react";
import { useRouter } from "next/navigation";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";

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

  const validateEmail = (value: string): string | null => {
    if (!value) return "邮箱不能为空";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return "邮箱格式不正确";
    return null;
  };

  const validatePassword = (value: string): string | null => {
    if (!value) return "密码不能为空";
    if (value.length < 6) return "密码长度至少6位";
    return null;
  };

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
      setInternalError(err instanceof Error ? err.message : "登录失败");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          工作邮箱
        </label>
        <div className="relative">
          <input
            type="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            placeholder="name@company.com"
            disabled={loading}
            className={`
              w-full px-4 py-3 rounded-lg border
              bg-white dark:bg-black
              text-zinc-900 dark:text-zinc-50
              placeholder-zinc-400 dark:placeholder-zinc-500
              border-zinc-200 dark:border-zinc-700
              focus:border-zinc-500 dark:focus:border-zinc-400
              focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-800
              focus:ring-offset-2 dark:focus:ring-offset-zinc-900
              transition-colors duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              ${emailError ? "border-red-500 dark:border-red-400" : ""}
            `}
          />
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 dark:text-zinc-500"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
          </svg>
        </div>
        {emailError && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{emailError}</p>
        )}
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            密码
          </label>
          <button
            type="button"
            onClick={() => router.push("/forgot-password")}
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:underline decoration-zinc-400/30 dark:decoration-zinc-500/30 underline-offset-4 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            忘记密码？
          </button>
        </div>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            placeholder="••••••••"
            disabled={loading}
            className={`
              w-full px-4 py-3 rounded-lg border
              bg-white dark:bg-black
              text-zinc-900 dark:text-zinc-50
              placeholder-zinc-400 dark:placeholder-zinc-500
              border-zinc-200 dark:border-zinc-700
              focus:border-zinc-500 dark:focus:border-zinc-400
              focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-800
              focus:ring-offset-2 dark:focus:ring-offset-zinc-900
              transition-colors duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              ${passwordError ? "border-red-500 dark:border-red-400" : ""}
            `}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            disabled={loading}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {showPassword ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-3.13 2.7-5.22 0-4.42-3.58-8-8-8s-8 3.58-8 8c0 2.09 1.19 3.96 2.7 5.22l2.92-2.92c-.23-.57-.36-1.18-.36-1.83zm0 10c-2.76 0-5-2.24-5-5 0-.65.13-1.26.36-1.83L4.44 7.46C2.93 8.72 1.74 10.59 1.74 12.68c0 4.42 3.58 8 8 8s8-3.58 8-8c0-2.09-1.19-3.96-2.7-5.22l-2.92 2.92c.23.57.36 1.18.36 1.83z"/>
              </svg>
            )}
          </button>
        </div>
        {passwordError && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{passwordError}</p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        loading={loading}
        className="w-full tracking-wide mt-4"
      >
        登录
      </Button>

      <p className="mt-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
        还没有账号？{" "}
        <button
          type="button"
          onClick={() => router.push("/register")}
          className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-zinc-700 dark:hover:text-zinc-300 hover:underline decoration-zinc-400/30 dark:decoration-zinc-500/30 underline-offset-4 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          立即注册
        </button>
      </p>
    </form>
  );
}
