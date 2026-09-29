interface Env {
  CRON_CONTROL_DELIVERY_TOKEN: string;
  SUPABASE_SECRET_KEY: string;
  SUPABASE_URL: string;
  WEB_ORIGIN: string;
}

function databaseHeaders(env: Env) {
  return {
    apikey: env.SUPABASE_SECRET_KEY,
    'Content-Type': 'application/json',
    'Accept-Profile': 'private',
    'Content-Profile': 'private',
  };
}

async function requeueStalePushBatches(env: Env) {
  const response = await fetch(
    new URL('/rest/v1/rpc/requeue_mail_push_batches', env.SUPABASE_URL),
    {
      method: 'POST',
      headers: databaseHeaders(env),
      body: '{}',
    }
  );
  if (!response.ok)
    throw new Error(`Push batch recovery failed: ${response.status}`);
}

async function hasImmediateWork(env: Env) {
  const url = new URL('/rest/v1/notification_batches', env.SUPABASE_URL);
  url.searchParams.set('select', 'id');
  url.searchParams.set('status', 'eq.pending');
  url.searchParams.set('delivery_mode', 'eq.immediate');
  url.searchParams.set('limit', '1');
  const response = await fetch(url, { headers: databaseHeaders(env) });
  if (!response.ok)
    throw new Error(`Immediate batch lookup failed: ${response.status}`);
  const rows = (await response.json()) as { id: string }[];
  return rows.length > 0;
}

export async function processImmediateNotifications(env: Env) {
  await requeueStalePushBatches(env);
  if (!(await hasImmediateWork(env))) return { invoked: false };
  const response = await fetch(
    new URL('/api/notifications/send-immediate', env.WEB_ORIGIN),
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CRON_CONTROL_DELIVERY_TOKEN}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(180_000),
    }
  );
  if (!response.ok)
    throw new Error(`Immediate batch delivery failed: ${response.status}`);
  return { invoked: true };
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (
      request.method === 'GET' &&
      new URL(request.url).pathname === '/health'
    ) {
      return Response.json(
        { ok: true },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return Response.json({ message: 'Not found' }, { status: 404 });
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    if (controller.cron !== '*/5 * * * *')
      throw new Error('Unexpected cron trigger');
    const result = await processImmediateNotifications(env);
    console.log('Immediate notification recovery completed', result);
  },
} satisfies ExportedHandler<Env>;
