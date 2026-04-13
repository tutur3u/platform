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

const OTP_CONFIG_KEY = 'WEB_OTP_ENABLED';
const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Set whether web OTP is enabled by updating the workspace_configs table.
 * Returns the previous value so callers can restore it.
 *
 * Safety: only operates against the local E2E Supabase instance.
 */
export async function setWebOtpEnabled(enabled: boolean): Promise<boolean> {
  const { supabaseUrl, serviceKey } = await resolveRateLimitResetConfig();

  // Read the current value first
  const readResponse = await fetch(
    `${supabaseUrl}/rest/v1/workspace_configs?id=eq.${OTP_CONFIG_KEY}&ws_id=eq.${ROOT_WORKSPACE_ID}&select=value`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    }
  );

  let previousValue = false;
  if (readResponse.ok) {
    const rows = (await readResponse.json()) as { value: string }[];
    previousValue = rows[0]?.value === 'true';
  }

  // Upsert the new value
  const upsertResponse = await fetch(
    `${supabaseUrl}/rest/v1/workspace_configs`,
    {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: OTP_CONFIG_KEY,
        ws_id: ROOT_WORKSPACE_ID,
        value: String(enabled),
      }),
    }
  );

  if (!upsertResponse.ok) {
    throw new Error(
      `Failed to set WEB_OTP_ENABLED to ${enabled}: ${upsertResponse.status}`
    );
  }

  return previousValue;
}
