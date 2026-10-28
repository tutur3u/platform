type QuotaReaperEnv = {
  TUTURUUU_DEVBOX_QUOTA_REAPER_ENABLED?: string;
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
};
export async function reapQuotaRuns(env: QuotaReaperEnv, tick: number) {
  if (
    env.TUTURUUU_DEVBOX_QUOTA_REAPER_ENABLED !== 'true' ||
    !env.SUPABASE_URL ||
    !env.SUPABASE_SECRET_KEY
  )
    return;
  const response = await fetch(
    new URL('/rest/v1/rpc/reap_devbox_quota_runs', env.SUPABASE_URL),
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        'Content-Profile': 'private',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_tick: new Date(tick).toISOString(),
        p_limit: 25,
      }),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!response.ok) throw new Error(`Quota reaper failed: ${response.status}`);
}
