import { afterEach, expect, it, vi } from 'vite-plus/test';
import { LedgerCore, memoryLedgerStore } from '../ledger';
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
  revalidation: (items: string[]) => Response = (items) =>
    Response.json({ results: items.map((wsId) => ({ wsId, ok: true })) }),
  {
    core = new LedgerCore(memoryLedgerStore().store),
    clock = { now: NOW },
    deadline = NOW + 240_000,
  }: {
    clock?: { now: number };
    core?: LedgerCore;
    deadline?: number;
  } = {}
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
      return revalidation(
        (JSON.parse(String(init?.body)) as { revalidateWorkspaceIds: string[] })
          .revalidateWorkspaceIds
      );
    }
  );
  const fence = vi.fn(async () => true);
  const job = 'inventory-checkout-expiry';
  const context = {
    deadline,
    env,
    fence,
    fetch: fetchMock as typeof fetch,
    now: () => clock.now,
    pending: {
      add: async (items: string[]) => core.addPendingWork(job, items),
      list: async () => core.pendingWork(job),
      fail: async (items: string[]) => core.failPendingWork(job, items),
      quarantined: async () => core.quarantinedWork(job),
      settle: async (items: string[]) => core.settlePendingWork(job, items),
    },
    userAgent: 'Tuturuuu-Cron-Control/1.0',
  };
  const rpc = () => calls.filter((call) => call.path.startsWith('/rest/'));
  const posts = () => calls.filter((call) => call.path.startsWith('/api/'));
  return { calls, context, core, fence, posts, rpc, clock };
}

it('an idle slot makes one RPC and no revalidation call', async () => {
  const h = harness([() => Response.json([])]);
  expect(await expireCheckouts(h.context)).toEqual({
    detail: {
      batches: 1,
      expired: 0,
      pending: 0,
      quarantined: 0,
      revalidated: 0,
    },
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
    detail: {
      batches: 2,
      expired: EXPIRY_BATCH_SIZE + 3,
      pending: 0,
      quarantined: 0,
      revalidated: 3,
    },
    outcome: 'ok',
  });
  expect(h.fence).toHaveBeenCalledTimes(3);
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
  expect(h.fence).toHaveBeenCalledTimes(EXPIRY_MAX_BATCHES + 1);
});

it('a stop between batches retains committed obligations without more HTTP work', async () => {
  const h = harness([
    () => Response.json(rows(EXPIRY_BATCH_SIZE)),
    () => Response.json(rows(EXPIRY_BATCH_SIZE)),
  ]);
  h.fence.mockResolvedValueOnce(true).mockResolvedValue(false);
  const result = await expireCheckouts(h.context);
  expect(result.outcome).toBe('stopped');
  expect(h.rpc()).toHaveLength(1);
  expect(h.posts()).toHaveLength(0);
  expect(h.core.pendingWork('inventory-checkout-expiry')).toEqual([ws(0)]);
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
    detail: {
      batches: 1,
      expired: 250,
      pending: 250,
      quarantined: 0,
      revalidated: 0,
    },
    outcome: 'failed',
  });
  expect(h.posts()).toHaveLength(3);

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

it('keeps every request inside the deadline and leaves the rest pending', async () => {
  const clock = { now: NOW };
  const timeouts: number[] = [];
  const starts: number[] = [];
  const realTimeout = AbortSignal.timeout.bind(AbortSignal);
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
    timeouts.push(ms);
    starts.push(clock.now);
    return realTimeout(ms);
  });
  const deadline = NOW + 240_000;
  // Each request hangs until its own timeout (the worst case).
  const slow = (respond: () => Response) => () => {
    clock.now += timeouts.at(-1) ?? 0;
    return respond();
  };
  const h = harness(
    [slow(() => Response.json(rows(600, 600)))],
    (items) => {
      clock.now += timeouts.at(-1) ?? 0;
      return Response.json({
        results: items.map((wsId) => ({ wsId, ok: true })),
      });
    },
    { clock, deadline }
  );
  const result = await expireCheckouts(h.context);
  expect(result).toMatchObject({
    detail: { pending: 300, revalidated: 300 },
    outcome: 'unknown',
  });
  starts.forEach((start, index) => {
    expect(start + timeouts[index]!).toBeLessThanOrEqual(deadline);
  });
  expect(clock.now).toBeLessThanOrEqual(deadline);
  expect(h.core.pendingWork('inventory-checkout-expiry')).toHaveLength(300);
});

it('retries a failed revalidation from durable state on a later sweep', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const first = harness(
    [() => Response.json(rows(3, 3))],
    () => new Response(null, { status: 503 })
  );
  expect(await expireCheckouts(first.context)).toMatchObject({
    detail: { expired: 3, pending: 3, revalidated: 0 },
    outcome: 'failed',
  });
  // A fresh sweep (new isolate) sees no new expiries but owes the cache work.
  const second = harness([() => Response.json([])], undefined, {
    core: first.core,
  });
  expect(await expireCheckouts(second.context)).toMatchObject({
    detail: { expired: 0, pending: 0, revalidated: 3 },
    outcome: 'ok',
  });
  expect(second.posts()[0]?.body).toEqual({
    revalidateWorkspaceIds: [ws(0), ws(1), ws(2)],
  });
  expect(first.core.pendingWork('inventory-checkout-expiry')).toEqual([]);
});

afterEach(() => vi.restoreAllMocks());

it('revalidates outstanding obligations before starting a new expiry batch', async () => {
  const h = harness([() => Response.json([])]);
  await h.context.pending.add([ws(99)]);
  await expireCheckouts(h.context);
  expect(h.calls.map((call) => call.path.startsWith('/api/'))).toEqual([
    true,
    false,
  ]);
});

it('applies backlog backpressure before expiry can exceed 5000 unique obligations', async () => {
  let batch = 0;
  const h = harness(
    Array.from({ length: 10 }, () => () => {
      const offset = batch++ * EXPIRY_BATCH_SIZE;
      return Response.json(
        Array.from({ length: EXPIRY_BATCH_SIZE }, (_, i) => ({
          ws_id: ws(offset + i),
        }))
      );
    }),
    () => new Response(null, { status: 503 })
  );
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const result = await expireCheckouts(h.context);
  const pending = h.core.pendingWork('inventory-checkout-expiry');
  expect(result.outcome).toBe('failed');
  expect(h.rpc().length).toBeLessThanOrEqual(5);
  expect(pending).toContain(ws(0));
  expect(pending.length).toBe(result.detail.expired);
});

it('does not report success when the deadline leaves obligations unprocessed', async () => {
  const h = harness([() => Response.json(rows(10, 10))]);
  const add = h.context.pending.add;
  h.context.pending.add = async (items) => {
    await add(items);
    h.clock.now = h.context.deadline;
  };
  expect((await expireCheckouts(h.context)).outcome).not.toBe('ok');
  expect(h.core.pendingWork('inventory-checkout-expiry')).toHaveLength(10);
});

it('isolates a poisoned chunk so later chunks can settle', async () => {
  const h = harness([() => Response.json(rows(250, 250))], (items) =>
    items.includes(ws(0))
      ? new Response(null, { status: 500 })
      : Response.json({ results: items.map((wsId) => ({ wsId, ok: true })) })
  );
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const result = await expireCheckouts(h.context);
  expect(result.outcome).toBe('failed');
  expect(result.detail.revalidated).toBe(150);
  expect(h.core.pendingWork('inventory-checkout-expiry')).toHaveLength(100);
});

it('settles only explicitly confirmed per-workspace invalidations on a 2xx', async () => {
  const h = harness([() => Response.json(rows(3, 3))], () =>
    Response.json({
      ok: false,
      results: [
        { wsId: ws(0), ok: true },
        { wsId: ws(1), ok: false },
        { wsId: ws(999), ok: true },
      ],
    })
  );
  const result = await expireCheckouts(h.context);
  expect(result).toMatchObject({
    detail: { revalidated: 1, pending: 2 },
    outcome: 'failed',
  });
  expect(h.core.pendingWork('inventory-checkout-expiry')).toEqual([
    ws(1),
    ws(2),
  ]);
});

it('does not settle legacy 2xx receipts that have no workspace confirmations', async () => {
  const h = harness([() => Response.json(rows(3, 3))], () =>
    Response.json({ ok: true, revalidated: 3 })
  );
  expect((await expireCheckouts(h.context)).outcome).toBe('failed');
  expect(h.core.pendingWork('inventory-checkout-expiry')).toHaveLength(3);
});

it('bounds a stalled pending-ledger read by the wall-clock deadline', async () => {
  vi.useFakeTimers();
  try {
    const h = harness([], undefined, { deadline: NOW + 240_000 });
    h.context.pending.list = () => new Promise(() => {});
    const result = expireCheckouts(h.context);
    await vi.advanceTimersByTimeAsync(240_000);
    expect(
      await Promise.race([result, Promise.resolve('still waiting')])
    ).toMatchObject({ outcome: 'unknown' });
    expect(h.calls).toHaveLength(0);
  } finally {
    vi.useRealTimers();
  }
});

it('quarantines each poison item after three attempts without retrying it forever', async () => {
  const h = harness([], () => new Response(null, { status: 500 }));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await h.context.pending.add([ws(0)]);
  const attempts = new Map<string, number>();
  const quarantine = new Set<string>();
  const originalList = h.context.pending.list;
  const context = {
    ...h.context,
    pending: {
      ...h.context.pending,
      list: async () =>
        (await originalList()).filter((id) => !quarantine.has(id)),
      quarantined: async () => [...quarantine],
      fail: async (items: string[]) => {
        const moved: string[] = [];
        for (const id of items) {
          const count = (attempts.get(id) ?? 0) + 1;
          attempts.set(id, count);
          if (count >= 3) {
            quarantine.add(id);
            moved.push(id);
          }
        }
        return moved;
      },
    },
  };
  for (let run = 0; run < 5; run++)
    expect((await expireCheckouts(context)).outcome).toBe('failed');
  expect(attempts.get(ws(0))).toBe(3);
  expect(h.posts()).toHaveLength(3);
  expect(quarantine).toEqual(new Set([ws(0)]));
});

it.each(['add', 'settle', 'fail', 'quarantined', 'fence'] as const)(
  'includes a stalled %s RPC in the whole-run deadline',
  async (phase) => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const h = harness(
        [() => Response.json(rows(1))],
        phase === 'fail' ? () => new Response(null, { status: 500 }) : undefined
      );
      if (phase !== 'add') await h.context.pending.add([ws(0)]);
      const stalled = () => new Promise<never>(() => {});
      if (phase === 'fence') h.fence.mockImplementation(stalled);
      else h.context.pending[phase] = stalled;
      const result = expireCheckouts(h.context);
      await vi.advanceTimersByTimeAsync(240_000);
      expect(
        await Promise.race([result, Promise.resolve('still waiting')])
      ).toMatchObject({ outcome: 'unknown' });
      const calls = h.calls.length;
      await vi.advanceTimersByTimeAsync(300_000);
      expect(h.calls).toHaveLength(calls);
    } finally {
      vi.useRealTimers();
    }
  }
);
