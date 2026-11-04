/**
 * Names the production Worker must have before it serves anything. A missing
 * name fails closed with 503 instead of falling back to a dev value. Enforced
 * when the production wrangler config sets TUTURUUU_REQUIRE_SECRETS=1; source
 * and CI fixture configs (no secrets) leave it unset.
 */
export const REQUIRED_ENV = ['INVENTORY_APP_URL'] as const;

export function missingRequiredEnv(env: object): string[] {
  const values = env as Record<string, unknown>;
  if (values.TUTURUUU_REQUIRE_SECRETS !== '1') return [];
  return REQUIRED_ENV.filter(
    (name) => typeof values[name] !== 'string' || !values[name]
  );
}

export function misconfiguredResponse(missing: string[]): Response | null {
  if (missing.length === 0) return null;
  // Names only; never values.
  console.error(
    `storefront Worker refused to serve: missing ${missing.join(', ')}`
  );
  return new Response('Service misconfigured', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
