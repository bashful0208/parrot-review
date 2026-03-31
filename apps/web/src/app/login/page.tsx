"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Brand from "@/components/Brand";
import SocialLoginGroup from "@/components/auth/SocialLoginGroup";
import Divider from "@/components/auth/Divider";
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
        setError(data.error || "登录失败");
        return;
      }

      // Save user to localStorage
      localStorage.setItem("user", JSON.stringify(data.user));

      // Login successful - redirect to home page
      router.push("/");
    } catch (err) {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = (provider: "github" | "gitee" | "google") => {
    // TODO: Implement OAuth flow for social login
    console.log(`Initiating ${provider} login`);
    // For now, just show a message
    const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
    setError(`${providerName} 登录功能尚未实现`);
  };

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center p-6 sm:p-12 bg-zinc-50 dark:bg-black">
      <div className="relative z-10 w-full max-w-[460px]">
        <div className="bg-white dark:bg-black p-10 md:p-12 rounded-xl shadow-[0px_12px_32px_rgba(0,0,0,0.06)] border border-zinc-200 dark:border-zinc-700">
          <div className="mb-10">
            <Brand size="medium" />
          </div>

          <SocialLoginGroup
            providers={["github", "gitee", "google"]}
            onProviderClick={handleSocialLogin}
            disabled={loading}
          />

          <Divider text="或使用邮箱密码登录" />

          <LoginForm
            onSubmit={handleEmailPasswordLogin}
            loading={loading}
            error={error}
          />
        </div>
      </div>
    </main>
  );
}
