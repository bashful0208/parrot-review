# Login & Register Pages Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign login and registration pages with a modern split-screen layout using shadcn/ui components and GitHub-inspired styling.

**Architecture:** Create a reusable `AuthLayout` component for the split-screen layout, update form components to use shadcn/ui `Input` and `Label` components, and implement GitHub-style social login buttons.

**Tech Stack:** Next.js, React, shadcn/ui, Tailwind CSS, Lucide icons

---

## File Structure

### Files to Create

1. `apps/web/src/components/auth/AuthLayout.tsx` - Split-screen layout component
2. `apps/web/src/components/auth/BrandShowcase.tsx` - Left side brand showcase

### Files to Modify

1. `apps/web/src/components/auth/LoginForm.tsx` - Use shadcn/ui components
2. `apps/web/src/components/auth/RegisterForm.tsx` - Use shadcn/ui components
3. `apps/web/src/components/auth/SocialLoginGroup.tsx` - Horizontal layout
4. `apps/web/src/components/auth/SocialLoginButton.tsx` - GitHub-style buttons
5. `apps/web/src/components/auth/Divider.tsx` - Update styling
6. `apps/web/src/app/login/page.tsx` - Use new layout
7. `apps/web/src/app/register/page.tsx` - Use new layout (no social login)

---

### Task 1: Create BrandShowcase Component

**Files:**
- Create: `apps/web/src/components/auth/BrandShowcase.tsx`

- [ ] **Step 1: Create BrandShowcase component**

```tsx
// apps/web/src/components/auth/BrandShowcase.tsx
import { Code2, GitBranch, Users } from "lucide-react";

const features = [
  {
    icon: Code2,
    title: "Intelligent code analysis",
    description: "AI-powered review for quality and security",
  },
  {
    icon: GitBranch,
    title: "Multi-language support",
    description: "Works with 20+ programming languages",
  },
  {
    icon: Users,
    title: "Real-time collaboration",
    description: "Review code together in real-time",
  },
];

export default function BrandShowcase() {
  return (
    <div className="flex flex-col justify-center bg-gradient-to-br from-slate-800 to-slate-900 p-8 text-white lg:p-12">
      <div className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Code Reviewer</h2>
        <p className="mt-2 text-lg text-slate-300">
          AI-Powered Code Review Platform
        </p>
      </div>

      <div className="space-y-6">
        {features.map((feature) => (
          <div key={feature.title} className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
              <feature.icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium">{feature.title}</h3>
              <p className="text-sm text-slate-300">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify component compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/auth/BrandShowcase.tsx
git commit -m "feat: add BrandShowcase component for auth pages / 添加认证页面品牌展示组件"
```

---

### Task 2: Create AuthLayout Component

**Files:**
- Create: `apps/web/src/components/auth/AuthLayout.tsx`

- [ ] **Step 1: Create AuthLayout component**

```tsx
// apps/web/src/components/auth/AuthLayout.tsx
import BrandShowcase from "./BrandShowcase";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="flex min-h-screen">
      {/* Brand Showcase - Hidden on mobile */}
      <div className="hidden lg:block lg:w-1/2">
        <BrandShowcase />
      </div>

      {/* Form Area */}
      <div className="flex w-full items-center justify-center bg-white px-4 py-8 sm:px-6 lg:w-1/2">
        <div className="w-full max-w-[320px]">{children}</div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify component compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/auth/AuthLayout.tsx
git commit -m "feat: add AuthLayout component for split-screen layout / 添加认证页面分屏布局组件"
```

---

### Task 3: Update SocialLoginButton Component

**Files:**
- Modify: `apps/web/src/components/auth/SocialLoginButton.tsx`

- [ ] **Step 1: Update SocialLoginButton with GitHub-style design**

```tsx
// apps/web/src/components/auth/SocialLoginButton.tsx
import { Github, GitBranch, Globe } from "lucide-react";

export interface SocialLoginButtonProps {
  provider: "github" | "gitee" | "google";
  onClick: () => void;
  disabled?: boolean;
}

export default function SocialLoginButton({
  provider,
  onClick,
  disabled = false,
}: SocialLoginButtonProps) {
  const getIcon = (provider: "github" | "gitee" | "google") => {
    switch (provider) {
      case "github":
        return <Github className="h-5 w-5" />;
      case "gitee":
        return <GitBranch className="h-5 w-5" />;
      case "google":
        return <Globe className="h-5 w-5" />;
    }
  };

  const getLabel = (provider: "github" | "gitee" | "google") => {
    switch (provider) {
      case "github":
        return "GitHub";
      case "gitee":
        return "Gitee";
      case "google":
        return "Google";
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-1 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600"
    >
      {getIcon(provider)}
      <span>{getLabel(provider)}</span>
    </button>
  );
}
```

- [ ] **Step 2: Verify component compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/auth/SocialLoginButton.tsx
git commit -m "feat: update SocialLoginButton with GitHub-style design / 更新社交登录按钮为 GitHub 风格"
```

---

### Task 4: Update SocialLoginGroup Component

**Files:**
- Modify: `apps/web/src/components/auth/SocialLoginGroup.tsx`

- [ ] **Step 1: Update SocialLoginGroup for horizontal layout**

```tsx
// apps/web/src/components/auth/SocialLoginGroup.tsx
import SocialLoginButton from "./SocialLoginButton";

export interface SocialLoginGroupProps {
  providers: Array<"github" | "gitee" | "google">;
  onProviderClick: (provider: "github" | "gitee" | "google") => void;
  disabled?: boolean;
}

export default function SocialLoginGroup({
  providers,
  onProviderClick,
  disabled = false,
}: SocialLoginGroupProps) {
  return (
    <div className="flex gap-3">
      {providers.map((provider) => (
        <SocialLoginButton
          key={provider}
          provider={provider}
          onClick={() => onProviderClick(provider)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify component compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/auth/SocialLoginGroup.tsx
git commit -m "feat: update SocialLoginGroup for horizontal layout / 更新社交登录按钮组为水平布局"
```

---

### Task 5: Update Divider Component

**Files:**
- Modify: `apps/web/src/components/auth/Divider.tsx`

- [ ] **Step 1: Update Divider styling**

```tsx
// apps/web/src/components/auth/Divider.tsx
export interface DividerProps {
  text?: string;
}

export default function Divider({ text = "or" }: DividerProps) {
  return (
    <div className="relative my-6 flex items-center">
      <div className="flex-1 border-t border-gray-300 dark:border-gray-600" />
      <span className="mx-4 text-sm text-gray-500 dark:text-gray-400">
        {text}
      </span>
      <div className="flex-1 border-t border-gray-300 dark:border-gray-600" />
    </div>
  );
}
```

- [ ] **Step 2: Verify component compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/auth/Divider.tsx
git commit -m "feat: update Divider styling / 更新分隔线样式"
```

---

### Task 6: Update LoginForm Component

**Files:**
- Modify: `apps/web/src/components/auth/LoginForm.tsx`

- [ ] **Step 1: Update LoginForm to use shadcn/ui components**

```tsx
// apps/web/src/components/auth/LoginForm.tsx
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
    <div>
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
            className={emailError ? "border-red-500" : ""}
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
              className={passwordError ? "border-red-500" : ""}
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
          className="w-full bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
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
```

- [ ] **Step 2: Verify component compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/auth/LoginForm.tsx
git commit -m "feat: update LoginForm to use shadcn/ui components / 更新登录表单使用 shadcn/ui 组件"
```

---

### Task 7: Update RegisterForm Component

**Files:**
- Modify: `apps/web/src/components/auth/RegisterForm.tsx`

- [ ] **Step 1: Update RegisterForm to use shadcn/ui components**

```tsx
// apps/web/src/components/auth/RegisterForm.tsx
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
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900 dark:text-white">
        Create an account
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
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
            className={emailError ? "border-red-500" : ""}
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
              className={passwordError ? "border-red-500" : ""}
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
              className={confirmPasswordError ? "border-red-500" : ""}
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
          className="w-full bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
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
```

- [ ] **Step 2: Verify component compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/auth/RegisterForm.tsx
git commit -m "feat: update RegisterForm to use shadcn/ui components / 更新注册表单使用 shadcn/ui 组件"
```

---

### Task 8: Update Login Page

**Files:**
- Modify: `apps/web/src/app/login/page.tsx`

- [ ] **Step 1: Update login page to use AuthLayout**

```tsx
// apps/web/src/app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/auth/AuthLayout";
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

      router.push("/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <LoginForm
        onSubmit={handleEmailPasswordLogin}
        loading={loading}
        error={error}
      />
    </AuthLayout>
  );
}
```

- [ ] **Step 2: Verify page compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/login/page.tsx
git commit -m "feat: update login page with new design / 更新登录页面使用新设计"
```

---

### Task 9: Update Register Page

**Files:**
- Modify: `apps/web/src/app/register/page.tsx`

- [ ] **Step 1: Update register page to use AuthLayout**

```tsx
// apps/web/src/app/register/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthLayout from "@/components/auth/AuthLayout";
import RegisterForm from "@/components/auth/RegisterForm";
import type { RegisterCredentials, AuthApiResponse } from "@/lib/auth/types";

export default function RegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async (credentials: RegisterCredentials) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
      });

      const data = (await response.json()) as AuthApiResponse;

      if (!data.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      router.push("/login");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <RegisterForm onSubmit={handleRegister} loading={loading} error={error} />
    </AuthLayout>
  );
}
```

- [ ] **Step 2: Verify page compiles**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/register/page.tsx
git commit -m "feat: update register page with new design / 更新注册页面使用新设计"
```

---

### Task 10: Verify Dark Mode Support

**Files:**
- Modify: `apps/web/src/components/auth/BrandShowcase.tsx`

- [ ] **Step 1: Update BrandShowcase for dark mode**

The BrandShowcase component uses dark colors by default (bg-gradient-to-br from-slate-800 to-slate-900), so it works in both light and dark mode. No changes needed.

- [ ] **Step 2: Verify dark mode works**

Run: `cd apps/web && npm run dev`
Open browser and toggle dark mode to verify both login and register pages look correct.

- [ ] **Step 3: Commit**

No commit needed - dark mode already works.

---

### Task 11: Test Responsive Design

**Files:**
- No file changes

- [ ] **Step 1: Test mobile layout**

Run: `cd apps/web && npm run dev`
Open browser DevTools and test:
- Mobile (<768px): Stacked layout, brand showcase hidden
- Tablet (768px-1023px): Split screen, reduced padding
- Desktop (≥1024px): Full split screen

- [ ] **Step 2: Verify all breakpoints work**

Check that:
- Brand showcase is hidden on mobile
- Form is centered on all screen sizes
- Social login buttons don't overflow on mobile
- Text is readable on all screen sizes

- [ ] **Step 3: Commit**

No commit needed - responsive design is already implemented.

---

### Task 12: Final Verification

**Files:**
- No file changes

- [ ] **Step 1: Run TypeScript check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run linting**

Run: `cd apps/web && npm run lint`
Expected: No errors

- [ ] **Step 3: Test login flow**

1. Navigate to `/login`
2. Enter valid credentials
3. Click "Sign in"
4. Verify redirect to `/`

- [ ] **Step 4: Test register flow**

1. Navigate to `/register`
2. Enter valid credentials
3. Click "Create an account"
4. Verify redirect to `/login`

- [ ] **Step 5: Test error handling**

1. Enter invalid email
2. Verify error message appears
3. Enter short password
4. Verify error message appears

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: complete auth pages redesign / 完成认证页面重新设计"
```

---

## Summary

This plan implements a modern login/registration page redesign with:

1. **Split-screen layout** - Brand showcase on left, form on right
2. **GitHub-inspired styling** - Green primary button, gray borders, blue links
3. **shadcn/ui components** - Button, Input, Label for consistency
4. **Horizontal social login** - GitHub, Gitee, Google buttons
5. **Responsive design** - Mobile-first, works on all screen sizes
6. **Dark mode support** - Automatic theme switching

Total: 12 tasks, 36 steps
