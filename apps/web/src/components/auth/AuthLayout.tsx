import BrandShowcase from "./BrandShowcase";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="flex h-screen">
      {/* Brand Showcase - Hidden on mobile */}
      <div className="hidden h-screen lg:block lg:w-1/2">
        <BrandShowcase />
      </div>

      {/* Form Area */}
      <div className="flex h-screen w-full items-center justify-center overflow-y-auto bg-white px-6 py-8 sm:px-8 lg:w-1/2">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </main>
  );
}
