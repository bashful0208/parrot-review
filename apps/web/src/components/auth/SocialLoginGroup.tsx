import SocialLoginButton from "./SocialLoginButton";

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
    <div className="flex gap-3">
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
