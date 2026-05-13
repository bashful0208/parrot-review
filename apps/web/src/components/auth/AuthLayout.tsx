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
