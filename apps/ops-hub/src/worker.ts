import { authorize } from './board/assertion';
import { job } from './board/contracts';
import { errorResponse, reject } from './board/store';
import { boardName } from './board/tasks';
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
export { FleetBoard } from './board';

async function handle(request: Request, env: Env) {
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
        bytesFromBase64(env.OPS_HUB_PUBLISHER_PUBLIC_KEY),
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
    if (!routeAllowed(request.method, target))
      return json({ error: 'Not found' }, 404);
    userId = await verifyAssertion(
      env.OPS_HUB_GATEWAY_SECRET,
      request.headers.get(ASSERTION_HEADER) ?? '',
      request.method,
      target
    );
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
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname.startsWith('/board/')) {
      try {
        const { actor } = await authorize(request.clone(), env);
        const name = boardName(actor.workspaceId, actor.boardId);
        if (name !== env.BOARD_TASKS_SCOPE) reject(404, 'not_found');
        const headers = new Headers();
        for (const key of [
          'Content-Type',
          'Idempotency-Key',
          'X-Board-Assertion',
        ]) {
          const value = request.headers.get(key);
          if (value !== null) headers.set(key, value);
        }
        return env.BOARD.getByName(name).fetch(request.url, {
          method: request.method,
          body: request.body,
          headers,
        });
      } catch (error) {
        return errorResponse(error);
      }
    }
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
  async queue(batch: MessageBatch<unknown>, env: Env) {
    for (const message of batch.messages) {
      const envelope = job.safeParse(message.body);
      if (envelope.success) {
        const { workspaceId, boardId } = envelope.data;
        const name = boardName(workspaceId, boardId);
        if (name === env.BOARD_TASKS_SCOPE) {
          const response = await env.BOARD.getByName(name).fetch(
            'https://board.internal/_queue',
            {
              method: 'POST',
              body: JSON.stringify(envelope.data),
            }
          );
          if (!response.ok) console.error('Board queue delivery failed');
        }
      }
      message.ack();
    }
  },
} satisfies ExportedHandler<Env>;
