import SocialLoginButton, { SocialLoginButtonProps } from "./SocialLoginButton";

export interface SocialLoginGroupProps {
  providers: Array<"github" | "gitee" | "google">;
  onProviderClick: (provider: "github" | "gitee" | "google") => void;
  disabled?: boolean;
}

export default function SocialLoginGroup({
  providers,
  onProviderClick,
  disabled = false,
}: SocialLoginGroupProps) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-8">
      {providers.map((provider) => (
        <SocialLoginButton
          key={provider}
          provider={provider}
          onClick={() => onProviderClick(provider)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
