export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends LoginCredentials {
  confirmPassword: string;
}

export interface AuthApiSuccess {
  ok: true;
  user: AuthUser;
  provider?: "local";
}

export interface AuthApiFailure {
  ok: false;
  error: string;
  error_code?: string;
  request_id?: string;
}

export type AuthApiResponse = AuthApiSuccess | AuthApiFailure;

export interface AuthResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

export interface SocialAuthProvider {
  provider: "github" | "gitee" | "google";
}

export interface SocialAuthResult extends AuthResult {
  provider: SocialAuthProvider["provider"];
}
