/** Worker bindings by name. Values are secrets or vars; none are read here. */
export interface PasswordsEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Durable stop fence. Only the exact string `true` enables vault work. */
  PASSWORDS_ENABLED?: string;
  NEXT_PUBLIC_APP_URL: string;
  NEXT_PUBLIC_WEB_APP_URL: string;
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
  TUTURUUU_APP_COORDINATION_SECRET: string;
  ENCRYPTION_MASTER_KEY: string;
}
