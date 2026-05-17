import {
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
  SAFE_LOCAL_SUPABASE_ORIGINS,
} from './environment';

export function getLocalE2ESupabaseSecretKey(): string {
  return LOCAL_E2E_SUPABASE_SECRET_KEY;
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

const ADAPTIVE_ABUSE_STATE_TABLES = [
  'abuse_activity_signals',
  'abuse_step_up_challenges',
  'abuse_reputation_subjects',
] as const;

function serviceRoleHeaders(serviceKey: string) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
}

async function parseResetFailure(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: string;
      message?: string;
    };
    const detail = body.error ?? body.message;

    if (detail) {
      return `${fallbackMessage}: ${detail}`;
    }
  } catch {
    // Ignore JSON parsing issues and keep the status-based message.
  }

  return `${fallbackMessage}: ${response.status}`;
}

async function resetAdaptiveAbuseState(
  supabaseUrl: string,
  serviceKey: string
): Promise<void> {
  // Local E2E intentionally triggers 429s. Clear generated reputation state so
  // one test's negative signals do not lower another test's adaptive budget.
  for (const table of ADAPTIVE_ABUSE_STATE_TABLES) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${table}?id=not.is.null`,
      {
        method: 'DELETE',
        headers: {
          ...serviceRoleHeaders(serviceKey),
          Prefer: 'return=minimal',
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        await parseResetFailure(
          response,
          `Failed to reset adaptive abuse state for ${table}`
        )
      );
    }
  }
}

export async function resetDbRateLimits(): Promise<void> {
  const { supabaseUrl, serviceKey } = await resolveRateLimitResetConfig();

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/admin_reset_rate_limits`,
    {
      method: 'POST',
      headers: {
        ...serviceRoleHeaders(serviceKey),
        'Content-Type': 'application/json',
      },
      body: '{}',
    }
  );

  if (!response.ok) {
    throw new Error(
      await parseResetFailure(response, 'Failed to reset DB rate limits')
    );
  }

  await resetAdaptiveAbuseState(supabaseUrl, serviceKey);
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
