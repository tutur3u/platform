import { randomUUID } from 'node:crypto';
import type { SecretsCredentials } from './secrets-credentials';

export interface FakeCall {
  action: string;
  requestId: string;
  body: Record<string, unknown>;
  init: RequestInit;
  url: string;
}

export type FakeFault = 'drop' | 'timeout' | Response | undefined;

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/**
 * In-memory stand-in for POST /api/v1/secrets/operation. `afterCommit` runs
 * once the operation has been applied, so returning 'drop' models a lost
 * response after a durable write; `beforeCommit` models a lost request.
 */
export function createFakeVault(credentials: SecretsCredentials) {
  const items = new Map<string, { id: string; bytes: Buffer }>();
  const receipts = new Map<
    string,
    { action: string; itemId?: string; revision: number }
  >();
  const calls: FakeCall[] = [];
  const hooks: {
    beforeCommit?: (call: FakeCall) => FakeFault;
    afterCommit?: (call: FakeCall) => FakeFault;
  } = {};
  let revision = 0;

  const fetchFake = (async (
    input: string | URL | Request,
    init: RequestInit = {}
  ) => {
    const url = String(input);
    const raw = init.body;
    const body = JSON.parse(
      Buffer.from(raw as Uint8Array).toString('utf8')
    ) as Record<string, unknown>;
    const call: FakeCall = {
      action: String(body.action),
      requestId: String(body.requestId),
      body,
      init,
      url,
    };
    calls.push(call);
    const headers = init.headers as Record<string, string>;
    if (headers.authorization !== `Bearer ${credentials.token}`)
      return jsonResponse({ ok: false, code: 'unauthorized' }, 401);
    if (
      body.workspaceId !== credentials.workspaceId ||
      body.vaultId !== credentials.vaultId
    )
      return jsonResponse({ ok: false, code: 'forbidden' }, 403);
    const before = hooks.beforeCommit?.(call);
    if (before === 'drop') throw new TypeError('fetch failed');
    if (before instanceof Response) return before;
    const response = apply(call);
    const after = hooks.afterCommit?.(call);
    if (after === 'drop') throw new TypeError('fetch failed');
    if (after === 'timeout')
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    return after instanceof Response ? after : response;
  }) as typeof fetch;

  function apply(call: FakeCall) {
    const { action, requestId, body } = call;
    const replay = receipts.get(requestId);
    if (action === 'list')
      return jsonResponse({
        ok: true,
        value: {
          items: [...items.entries()].map(([name, item]) => ({
            id: item.id,
            name,
            createdAt: 'x',
          })),
          revision: String(revision),
        },
      });
    if (action === 'get') {
      const item = items.get(String(body.name));
      return item
        ? jsonResponse({
            ok: true,
            value: {
              name: body.name,
              bytesBase64: item.bytes.toString('base64'),
            },
          })
        : jsonResponse({ ok: false, code: 'not_found' }, 404);
    }
    if (action === 'request.status') {
      const found = receipts.get(String(body.targetRequestId));
      return jsonResponse({
        ok: true,
        value: found
          ? {
              found: true,
              action: found.action,
              receipt: { itemId: found.itemId, revision: found.revision },
            }
          : { found: false },
      });
    }
    if (action === 'put') {
      const done =
        replay ??
        commit(
          requestId,
          'put',
          String(body.name),
          Buffer.from(String(body.bytesBase64), 'base64')
        );
      return jsonResponse({
        ok: true,
        value: { requestId, itemId: done.itemId, revision: done.revision },
      });
    }
    if (action === 'rotate') {
      const done = replay ?? commit(requestId, 'rotate');
      return jsonResponse({
        ok: true,
        value: { requestId, revision: done.revision },
      });
    }
    return jsonResponse({ ok: false, code: 'unsupported_action' }, 400);
  }

  function commit(
    requestId: string,
    action: string,
    name?: string,
    bytes?: Buffer
  ) {
    revision += 1;
    let itemId: string | undefined;
    if (name && bytes) {
      itemId = items.get(name)?.id ?? randomUUID();
      items.set(name, { id: itemId, bytes });
    }
    const receipt = { action, itemId, revision };
    receipts.set(requestId, receipt);
    return receipt;
  }

  return {
    fetch: fetchFake,
    items,
    receipts,
    calls,
    hooks,
    writes: () =>
      calls.filter((c) => c.action === 'put' || c.action === 'rotate'),
  };
}
