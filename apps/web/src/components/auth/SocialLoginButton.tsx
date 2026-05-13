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

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-1 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:active:bg-gray-600"
    >
      {getIcon(provider)}
      <span>{getProviderName(provider)}</span>
    </button>
  );
}
