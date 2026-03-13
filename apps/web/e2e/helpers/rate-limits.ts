export async function resetDbRateLimits(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY for E2E rate-limit reset'
    );
  }

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
