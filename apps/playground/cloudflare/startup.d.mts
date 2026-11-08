export function assertStartupEnvironment(env: {
  ASSETS?: { fetch: unknown };
  TUTURUUU_APP_COORDINATION_SECRET?: string;
  SUPABASE_SECRET_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
}): void;
