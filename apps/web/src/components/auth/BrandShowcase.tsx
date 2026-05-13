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
