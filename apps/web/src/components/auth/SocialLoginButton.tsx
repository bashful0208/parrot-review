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
