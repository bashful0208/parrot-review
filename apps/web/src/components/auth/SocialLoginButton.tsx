import { GithubIcon, GiteeIcon, GoogleIcon, getProviderName } from "@/lib/icons/social-icons";

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
      return <GithubIcon />;
      case "gitee":
      return <GiteeIcon />;
      case "google":
      return <GoogleIcon />;
    }
  };

  const getIconBgColor = (provider: "github" | "gitee" | "google") => {
    switch (provider) {
      case "github":
      return "text-zinc-900 dark:text-zinc-100";
      case "gitee":
      return "text-red-600 dark:text-red-400";
      case "google":
      return "text-blue-600 dark:text-blue-400";
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center p-3 rounded-lg bg-white dark:bg-black border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
    >
      <div className={`mb-1 group-hover:scale-110 transition-transform ${getIconBgColor(provider)}`}>
        {getIcon(provider)}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200">
        {getProviderName(provider)}
      </span>
    </button>
  );
}
