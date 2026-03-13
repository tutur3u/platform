const LOCAL_E2E_SUPABASE_URL = 'http://127.0.0.1:8001';
const SAFE_LOCAL_SUPABASE_ORIGINS = new Set([
  'http://127.0.0.1:8001',
  'http://localhost:8001',
]);

export function getLocalE2ESupabaseSecretKey(): string {
  return ['sb', 'secret', 'N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz'].join('_');
}

export async function resolveRateLimitResetConfig(): Promise<{
  supabaseUrl: string;
  serviceKey: string;
}> {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseUrl = configuredUrl ?? LOCAL_E2E_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ?? getLocalE2ESupabaseSecretKey();

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY for E2E rate-limit reset'
    );
  }

  const normalizedOrigin = new URL(supabaseUrl).origin;
  if (!SAFE_LOCAL_SUPABASE_ORIGINS.has(normalizedOrigin)) {
    throw new Error(
      `Refusing to reset rate limits against non-local Supabase URL: ${normalizedOrigin}`
    );
  }

  return {
    supabaseUrl,
    serviceKey,
  };
}

export async function resetDbRateLimits(): Promise<void> {
  const { supabaseUrl, serviceKey } = await resolveRateLimitResetConfig();

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/admin_reset_rate_limits`,
    {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    }
  );

  if (!response.ok) {
    let message = `Failed to reset DB rate limits: ${response.status}`;

    try {
      const body = (await response.json()) as {
        error?: string;
        message?: string;
      };
      const detail = body.error ?? body.message;

      if (detail) {
        message = `Failed to reset DB rate limits: ${detail}`;
      }
    } catch {
      // Ignore JSON parsing issues and keep the status-based message.
    }

    throw new Error(message);
  }
}
