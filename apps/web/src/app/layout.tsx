import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";
import Script from "next/script";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

const geist = localFont({
  src: "../fonts/Geist-Variable.woff2",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Reviewer",
  description:
    "Organization dashboard for AI-powered code review operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full antialiased", "font-sans", geist.variable)}
      suppressHydrationWarning
    >
      <head />
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
      <Script
        id="theme-flash"
        strategy="beforeInteractive"
      >{`try{var t=document.cookie.match(/(?:^|; )theme=([^;]*)/)?.[1]||'system';if(t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`}</Script>
    </html>
  );
}
