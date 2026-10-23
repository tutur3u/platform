import { expect, it, vi } from 'vite-plus/test';
import {
  EXPIRY_BATCH_SIZE,
  EXPIRY_MAX_BATCHES,
  expireCheckouts,
} from './checkout-expiry';

const env = {
  CRON_SECRET_INVENTORY: 'inventory-cron-secret',
  INVENTORY_ORIGIN: 'https://inventory.example.test',
  SUPABASE_SECRET_KEY: 'service-key',
  SUPABASE_URL: 'https://db.example.test',
};
const NOW = Date.parse('2026-10-23T03:15:00.000Z');
const ws = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const rows = (count: number, wsCount = 1) =>
  Array.from({ length: count }, (_, index) => ({
    checkout_id: `checkout-${index}`,
    ws_id: ws(index % wsCount),
  }));

function harness(
  batches: (() => Response | Promise<Response>)[],
  revalidation: () => Response = () => Response.json({ ok: true })
) {
  const calls: {
    body: unknown;
    headers: Headers;
    init?: RequestInit;
    path: string;
  }[] = [];
  let batch = 0;
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: new Headers(init?.headers),
        init,
        path: url.pathname,
      });
      if (url.hostname === 'db.example.test')
        return (batches[batch++] ?? (() => Response.json([])))();
      return revalidation();
    }
  );
  const fence = vi.fn(async () => true);
  const context = {
    env,
    fence,
    fetch: fetchMock as typeof fetch,
    now: () => NOW,
    userAgent: 'Tuturuuu-Cron-Control/1.0',
  };
  const rpc = () => calls.filter((call) => call.path.startsWith('/rest/'));
  const posts = () => calls.filter((call) => call.path.startsWith('/api/'));
  return { context, fence, posts, rpc };
}

it('an idle slot makes one RPC and no revalidation call', async () => {
  const h = harness([() => Response.json([])]);
  expect(await expireCheckouts(h.context)).toEqual({
    detail: { batches: 1, expired: 0, revalidated: 0 },
    outcome: 'ok',
  });
  expect(h.rpc()).toHaveLength(1);
  expect(h.posts()).toHaveLength(0);
  const [call] = h.rpc();
  expect(call.path).toBe('/rest/v1/rpc/expire_inventory_checkout_sessions');
  expect(call.body).toEqual({
    p_limit: EXPIRY_BATCH_SIZE,
    p_now: '2026-10-23T03:15:00.000Z',
    p_ws_id: null,
  });
  expect(call.headers.get('apikey')).toBe('service-key');
  expect(call.headers.get('authorization')).toBeNull();
  expect(call.headers.get('content-profile')).toBe('private');
  expect(call.init?.redirect).toBe('manual');
});

it('drains full batches and revalidates each workspace once', async () => {
  const h = harness([
    () => Response.json(rows(EXPIRY_BATCH_SIZE, 2)),
    () => Response.json(rows(3, 3)),
  ]);
  expect(await expireCheckouts(h.context)).toEqual({
    detail: { batches: 2, expired: EXPIRY_BATCH_SIZE + 3, revalidated: 3 },
    outcome: 'ok',
  });
  expect(h.fence).toHaveBeenCalledTimes(1);
  const [post] = h.posts();
  expect(post.path).toBe('/api/cron/inventory/checkout-expiry');
  expect(post.init?.method).toBe('POST');
  expect(post.init?.redirect).toBe('manual');
  expect(post.headers.get('authorization')).toBe(
    'Bearer inventory-cron-secret'
  );
  expect(post.body).toEqual({ revalidateWorkspaceIds: [ws(0), ws(1), ws(2)] });
});

it('stops after the batch cap even if every batch is full', async () => {
  const h = harness(
    Array.from(
      { length: 20 },
      () => () => Response.json(rows(EXPIRY_BATCH_SIZE))
    )
  );
  const result = await expireCheckouts(h.context);
  expect(result.detail.batches).toBe(EXPIRY_MAX_BATCHES);
  expect(h.rpc()).toHaveLength(EXPIRY_MAX_BATCHES);
  expect(h.fence).toHaveBeenCalledTimes(EXPIRY_MAX_BATCHES - 1);
});

it('a stop between batches halts work but revalidates committed expiries', async () => {
  const h = harness([
    () => Response.json(rows(EXPIRY_BATCH_SIZE)),
    () => Response.json(rows(EXPIRY_BATCH_SIZE)),
  ]);
  h.fence.mockResolvedValue(false);
  const result = await expireCheckouts(h.context);
  expect(result.outcome).toBe('stopped');
  expect(h.rpc()).toHaveLength(1);
  expect(h.posts()).toHaveLength(1);
});

it('a failed later batch still revalidates earlier expiries', async () => {
  const h = harness([
    () => Response.json(rows(EXPIRY_BATCH_SIZE)),
    () => new Response(null, { status: 503 }),
  ]);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const result = await expireCheckouts(h.context);
  expect(result).toMatchObject({
    detail: { batches: 1, revalidated: 1 },
    outcome: 'failed',
  });
  expect(h.rpc()).toHaveLength(2);
});

it('a database deadline is an unknown outcome', async () => {
  const h = harness([
    () => {
      throw new DOMException('Deadline', 'TimeoutError');
    },
  ]);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  expect((await expireCheckouts(h.context)).outcome).toBe('unknown');
  expect(h.posts()).toHaveLength(0);
});

it('rejects an unexpected RPC shape and a redirect', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  for (const response of [
    () => Response.json({ rows: [] }),
    () => Response.json([{ checkout_id: 'x' }]),
    () => new Response(null, { status: 302, headers: { Location: '/x' } }),
  ]) {
    const h = harness([response]);
    expect((await expireCheckouts(h.context)).outcome).toBe('failed');
    expect(h.posts()).toHaveLength(0);
  }
});

it('chunks revalidation and fails the slot when it is rejected', async () => {
  const h = harness(
    [() => Response.json(rows(250, 250))],
    () => new Response(null, { status: 401 })
  );
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(await expireCheckouts(h.context)).toEqual({
    detail: { batches: 1, expired: 250, revalidated: 0 },
    outcome: 'failed',
  });
  expect(h.posts()).toHaveLength(1);

  const ok = harness([() => Response.json(rows(250, 250))]);
  await expireCheckouts(ok.context);
  expect(
    ok
      .posts()
      .map(
        (post) =>
          (post.body as { revalidateWorkspaceIds: string[] })
            .revalidateWorkspaceIds.length
      )
  ).toEqual([100, 100, 50]);
});
