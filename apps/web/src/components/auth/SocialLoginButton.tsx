import {
  GithubIcon,
  GiteeIcon,
  GoogleIcon,
  getProviderName,
} from "@/lib/icons/social-icons";

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

  const getIconColor = (provider: "github" | "gitee" | "google") => {
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
      className="group flex w-full items-center justify-between rounded-[16px] border border-black/8 bg-white px-4 py-3 text-left transition-colors duration-200 hover:bg-zinc-50 active:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-[#20242b] dark:hover:bg-[#262b33] dark:active:bg-[#2c313a]"
    >
      <div className="flex items-center gap-3">
        <div className={`${getIconColor(provider)}`}>
          {getIcon(provider)}
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {getProviderName(provider)}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Not yet enabled. Use email sign-in for now.
          </p>
        </div>
      </div>
    </button>
  );
}
