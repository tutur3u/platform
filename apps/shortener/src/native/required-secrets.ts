/** Secrets the production Worker cannot resolve links without. Names only. */
export const SHORTENER_REQUIRED_SECRETS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
] as const;

/** Applies only once canonical hosts are enabled; staging stays fenced instead. */
export function missingSecretsResponse(env: object) {
  const values = env as Record<string, unknown>;
  if (values.SHORTENER_CANONICAL_HOST_ENABLED !== '1') return null;
  const missing = SHORTENER_REQUIRED_SECRETS.filter((name) => {
    const value = values[name];
    return typeof value !== 'string' || !value.trim();
  });
  if (!missing.length) return null;
  console.error(`Shortener missing required secrets: ${missing.join(', ')}`);
  return new Response('Service misconfigured', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
