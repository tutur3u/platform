export interface ImmediateNotificationsEnv {
  CRON_CONTROL_DELIVERY_TOKEN: string;
  SUPABASE_SECRET_KEY: string;
  SUPABASE_URL: string;
  WEB_ORIGIN: string;
}

function databaseHeaders(env: ImmediateNotificationsEnv) {
  return {
    apikey: env.SUPABASE_SECRET_KEY,
    'Content-Type': 'application/json',
    'Accept-Profile': 'private',
    'Content-Profile': 'private',
  };
}

async function requeueStalePushBatches(env: ImmediateNotificationsEnv) {
  const response = await fetch(
    new URL('/rest/v1/rpc/requeue_mail_push_batches', env.SUPABASE_URL),
    {
      method: 'POST',
      headers: databaseHeaders(env),
      body: '{}',
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok)
    throw new Error(`Push batch recovery failed: ${response.status}`);
}

async function hasImmediateWork(env: ImmediateNotificationsEnv) {
  const url = new URL('/rest/v1/notification_batches', env.SUPABASE_URL);
  url.searchParams.set('select', 'id');
  url.searchParams.set('status', 'eq.pending');
  url.searchParams.set('delivery_mode', 'eq.immediate');
  url.searchParams.set('limit', '1');
  const response = await fetch(url, {
    headers: databaseHeaders(env),
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Immediate batch lookup failed: ${response.status}`);
  const rows = (await response.json()) as { id: string }[];
  return rows.length > 0;
}

export async function processImmediateNotifications(
  env: ImmediateNotificationsEnv
) {
  await requeueStalePushBatches(env);
  if (!(await hasImmediateWork(env))) return { invoked: false };
  const response = await fetch(
    new URL('/api/notifications/send-immediate', env.WEB_ORIGIN),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CRON_CONTROL_DELIVERY_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Tuturuuu-Cron-Control/1.0',
      },
      body: '{}',
      redirect: 'manual',
      signal: AbortSignal.timeout(180_000),
    }
  );
  if (!response.ok)
    throw new Error(`Immediate batch delivery failed: ${response.status}`);
  return { invoked: true };
}
