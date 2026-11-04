import { assertWorkerStartup } from '@tuturuuu/start-bridge/startup';

/** Names the production Worker must have before it serves anything. */
export const REQUIRED_SECRETS = [
  'SUPABASE_SECRET_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
] as const;

/**
 * The production wrangler config sets TUTURUUU_REQUIRE_SECRETS=1, which selects
 * the shared production startup profile (NODE_ENV + required secrets). Source
 * and CI fixture configs leave it unset and run the staging profile.
 */
export function startupRefusal(env: object): Response | null {
  const flags = env as { TUTURUUU_REQUIRE_SECRETS?: unknown };
  const production = flags.TUTURUUU_REQUIRE_SECRETS === '1';
  try {
    assertWorkerStartup({
      profile: production ? 'production' : 'staging',
      env,
      requiredSecrets: production ? REQUIRED_SECRETS : [],
    });
    return null;
  } catch (error) {
    // The helper's message names the missing secret, never its value.
    console.error(`track Worker refused to serve: ${(error as Error).message}`);
    return new Response('Service misconfigured', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
