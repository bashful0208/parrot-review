"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check if user is logged in via localStorage
    const user = localStorage.getItem("user");
    setIsLoggedIn(!!user);
    setIsChecking(false);

    if (!user) {
      router.push("/login");
    }
  }, [router]);

  if (isChecking) {
    // Show loading state while checking auth
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black font-sans min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground"></div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return null; // Will redirect to /login
  }

  // Logged-in dashboard
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black font-sans min-h-screen">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-center py-32 px-16 bg-white dark:bg-black">
        <div className="flex flex-col items-center gap-8 text-center">
          <div className="w-16 h-16 rounded-lg bg-foreground text-background flex items-center justify-center shadow-lg">
            <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground mb-2">
            Welcome to Reviewer
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Precision AI for Code Reviews
          </p>
          <button
            onClick={() => {
              localStorage.removeItem("user");
              router.push("/login");
            }}
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 underline"
          >
            退出登录
          </button>
        </div>
      </main>
    </div>
  );
}
