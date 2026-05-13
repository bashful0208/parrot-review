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
