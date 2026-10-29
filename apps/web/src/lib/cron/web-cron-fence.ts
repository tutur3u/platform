export const WEB_CRON_PATHS = {
  '/api/cron/process-notification-batches': ['web-notification-batches', 15],
  '/api/cron/process-post-email-queue': ['web-post-email-queue', 30],
  '/api/cron/process-report-automation': ['web-report-automation', 15],
  '/api/cron/process-topic-announcement-queue': ['web-topic-announcements', 15],
  '/api/cron/tasks/deadline-reminders': ['web-deadline-reminders', 5],
} as const;
export type WebCronPath = keyof typeof WEB_CRON_PATHS;
export interface WebCronEnv {
  CRON_SECRET?: string;
  VERCEL_CRON_SECRET?: string;
  WEB_CRON_GATE_ORIGIN?: string;
  CRON_CONTROL_WEB_GATE_TOKEN?: string;
}
function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++)
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}
export function isCloudflareCron(request: Request) {
  return request.headers.has('x-tuturuuu-cron-slot');
}
function unavailable() {
  return Response.json(
    {
      ok: false,
      error: 'Cron execution gate unavailable; reconcile before retrying',
    },
    { status: 503 }
  );
}
export async function withWebCronFence(
  request: Request,
  path: WebCronPath,
  handler: () => Promise<Response>,
  env: WebCronEnv,
  send: typeof fetch = fetch,
  now = Date.now()
): Promise<Response> {
  const cloudflare = isCloudflareCron(request);
  // Preserve the existing response/auth contract until the gate is wired.
  if (!env.WEB_CRON_GATE_ORIGIN && !cloudflare) return handler();
  const secret =
    env.CRON_SECRET ??
    (path === '/api/cron/process-report-automation' ||
    path === '/api/cron/process-post-email-queue' ||
    path === '/api/cron/process-topic-announcement-queue'
      ? env.VERCEL_CRON_SECRET
      : undefined);
  if (
    !secret ||
    !constantTimeEqual(
      request.headers.get('authorization') ?? '',
      `Bearer ${secret}`
    )
  )
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  // The legacy owner remains live until the boundary gate is explicitly wired.
  if (!env.WEB_CRON_GATE_ORIGIN) return unavailable();
  const token = env.CRON_CONTROL_WEB_GATE_TOKEN;
  if (!token || token.length < 32) return unavailable();
  let origin: URL;
  try {
    origin = new URL(env.WEB_CRON_GATE_ORIGIN);
    if (origin.protocol !== 'https:' || origin.username || origin.password)
      return unavailable();
  } catch {
    return unavailable();
  }
  const [job, minutes] = WEB_CRON_PATHS[path];
  const slot = cloudflare
    ? Number(request.headers.get('x-tuturuuu-cron-slot'))
    : Math.floor(now / (minutes * 60_000)) * minutes * 60_000;
  const id = crypto.randomUUID();
  const call = async (body: object) => {
    const response = await send(new URL(`/web-crons/${job}`, origin), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Tuturuuu-Web-Cron-Gate/1.0',
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return false;
    }
    const reader = response.body?.getReader();
    if (!reader) return false;
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2048) return false;
        text += decoder.decode(value, { stream: true });
      }
      const result: unknown = JSON.parse(text + decoder.decode());
      return (
        result !== null &&
        typeof result === 'object' &&
        'ok' in result &&
        result.ok === true
      );
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  };
  try {
    if (
      !(await call({
        kind: 'acquire',
        owner: cloudflare ? 'cloudflare' : 'vercel',
        id,
        slot,
      }))
    )
      return Response.json(
        { ok: false, error: 'Cron execution fenced' },
        { status: 409 }
      );
    const response = await handler();
    // Errors may follow a committed side effect. Retain the original operation.
    if (!response.ok) return response;
    if (!(await call({ kind: 'complete', id }))) return unavailable();
    return response;
  } catch {
    return unavailable();
  }
}
