import { assertWorkerStartup } from '@tuturuuu/start-bridge/startup';

/** Names the production Worker must have before it serves anything. */
export const REQUIRED_SECRETS = [
  'INVENTORY_APP_URL',
  'SUPABASE_SECRET_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
] as const;

export function startupRefusal(env: object): Response | null {
  try {
    assertWorkerStartup({
      profile: 'production',
      env,
      requiredSecrets: REQUIRED_SECRETS,
    });
    return null;
  } catch (error) {
    // The helper's message names the missing secret, never its value.
    console.error(
      `storefront Worker refused to serve: ${(error as Error).message}`
    );
    return new Response('Service misconfigured', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
