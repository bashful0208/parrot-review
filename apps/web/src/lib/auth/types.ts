export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
  error?: string;
}

export interface SocialAuthProvider {
  provider: "github" | "gitee" | "google";
}

export interface SocialAuthResult extends AuthResult {
  provider: SocialAuthProvider["provider"];
}
