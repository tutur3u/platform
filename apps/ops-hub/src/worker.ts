import {
  ASSERTION_HEADER,
  allowedUsers,
  bytesFromBase64,
  json,
  MAX_BODY_BYTES,
  PUBLISHER_USER_HEADER,
  publisherMessage,
  readBounded,
  routeAllowed,
  SIGNATURE_HEADER,
  verifyAssertion,
} from './protocol';

export { OpsHub } from './hub';

type HubEnvironment = Partial<
  Omit<
    import('cf/config').InferEnv<
      typeof import('../cloudflare.config').default.worker
    >,
    'HUB'
  >
> & {
  HUB: {
    getByName(name: string): { fetch(request: Request): Promise<Response> };
  };
};

async function handle(request: Request, env: HubEnvironment) {
  const url = new URL(request.url);
  const target = url.pathname + url.search;
  const users = allowedUsers(env.OPS_HUB_ALLOWED_USER_IDS);
  let userId: string | null = null;
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (request.method === 'POST' && target === '/ingest') {
    userId = request.headers.get(PUBLISHER_USER_HEADER)?.toLowerCase() ?? null;
    if (!userId || !users.has(userId)) return json({ error: 'Not found' }, 404);
    if (
      !/^application\/json(?:;|$)/i.test(
        request.headers.get('content-type') ?? ''
      )
    )
      return json({ error: 'Invalid payload' }, 400);
    try {
      body = await readBounded(request.body, MAX_BODY_BYTES);
    } catch {
      return json({ error: 'Payload limit' }, 413);
    }
    try {
      const publicKey = await crypto.subtle.importKey(
        'raw',
        bytesFromBase64(env.OPS_HUB_PUBLISHER_PUBLIC_KEY ?? ''),
        'Ed25519',
        false,
        ['verify']
      );
      if (
        !(await crypto.subtle.verify(
          'Ed25519',
          publicKey,
          bytesFromBase64(request.headers.get(SIGNATURE_HEADER) ?? ''),
          publisherMessage(userId, body)
        ))
      )
        return json({ error: 'Not found' }, 404);
    } catch {
      return json({ error: 'Not found' }, 404);
    }
  } else {
    const assertion = request.headers.get(ASSERTION_HEADER) ?? '';
    const keyId = assertion.split('.')[0];
    const key =
      keyId === 'mastermind'
        ? {
            current: env.OPS_HUB_MASTERMIND_SNAPSHOT_SECRET,
            next: env.OPS_HUB_MASTERMIND_SNAPSHOT_SECRET_NEXT,
            start: env.OPS_HUB_MASTERMIND_SNAPSHOT_NEXT_NOT_BEFORE,
            end: env.OPS_HUB_MASTERMIND_SNAPSHOT_NEXT_EXPIRES_AT,
            allowed:
              request.method === 'GET' &&
              ['/snapshot', '/status'].includes(target),
          }
        : keyId === 'gateway'
          ? {
              current: env.OPS_HUB_GATEWAY_SECRET,
              next: env.OPS_HUB_GATEWAY_SECRET_NEXT,
              start: env.OPS_HUB_GATEWAY_NEXT_NOT_BEFORE,
              end: env.OPS_HUB_GATEWAY_NEXT_EXPIRES_AT,
              allowed: routeAllowed(request.method, target),
            }
          : null;
    if (!key?.allowed) return json({ error: 'Not found' }, 404);
    userId = await verifyAssertion(
      key.current ?? '',
      assertion,
      request.method,
      target,
      Date.now(),
      keyId
    );
    const seconds = Math.floor(Date.now() / 1000);
    const start = Number(key.start);
    const end = Number(key.end);
    if (
      !userId &&
      key.next &&
      /^\d{10}$/.test(key.start ?? '') &&
      /^\d{10}$/.test(key.end ?? '') &&
      end > start &&
      end - start <= 3600 &&
      seconds >= start &&
      seconds < end
    ) {
      userId = await verifyAssertion(
        key.next,
        assertion,
        request.method,
        target,
        Date.now(),
        keyId
      );
    }
    if (!userId || !users.has(userId)) return json({ error: 'Not found' }, 404);
  }
  return env.HUB.getByName(`hub:${userId}`).fetch(
    new Request(new URL(target, 'https://hub.internal'), {
      method: request.method,
      body,
      headers: { 'content-type': 'application/json' },
    })
  );
}
export default {
  async fetch(request: Request, env: HubEnvironment) {
    let response: Response;
    try {
      response = await handle(request, env);
    } catch {
      response = json({ error: 'Invalid request' }, 400);
    }
    const path = new URL(request.url).pathname;
    const route = [
      '/ingest',
      '/status',
      '/snapshot',
      '/events',
      '/needs-you',
      '/environments',
      '/decisions',
      '/observability',
      '/hub',
      '/hub/export',
    ].includes(path)
      ? path
      : '/unknown';
    console.info(JSON.stringify({ status: response.status, route }));
    return response;
  },
};
