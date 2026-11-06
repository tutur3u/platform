// @vitest-environment node
import { expect, it, vi } from 'vitest';
import {
  assertReminderBudget,
  chargeWebCronPage,
  hasWebCronBudget,
  WEB_CRON_BATCH_LIMIT,
  WEB_CRON_MAX_PAGES,
  WEB_CRON_MAX_REMINDER_RECIPIENTS,
  withWebCronBudget,
} from './web-cron-budget';
import {
  WEB_CRON_PATHS,
  type WebCronPath,
  withWebCronFence,
} from './web-cron-fence';

const SECRET = 'disposable-cron-secret';
const env = {
  CRON_SECRET: SECRET,
  WEB_CRON_GATE_ORIGIN: 'https://cron.test',
  CRON_CONTROL_WEB_GATE_TOKEN: 'disposable-gate-token-longer-than-32',
};
const path = '/api/cron/tasks/deadline-reminders';
const T0 = Date.parse('2026-10-28T00:00:00Z');
function request(cloudflare = false) {
  return new Request(`https://web.test${path}`, {
    headers: {
      Authorization: `Bearer ${SECRET}`,
      ...(cloudflare ? { 'x-tuturuuu-cron-slot': String(T0) } : {}),
    },
  });
}

const secretContracts = [
  ['/api/cron/process-notification-batches', false],
  ['/api/cron/process-post-email-queue', true],
  ['/api/cron/process-report-automation', true],
  ['/api/cron/process-topic-announcement-queue', true],
  ['/api/cron/tasks/deadline-reminders', false],
] as const satisfies readonly (readonly [WebCronPath, boolean])[];

it.each(secretContracts)(
  'preserves the handler secret contract for %s (Vercel fallback=%s)',
  async (jobPath, acceptsVercelSecret) => {
    expect(secretContracts.map(([entry]) => entry).sort()).toEqual(
      Object.keys(WEB_CRON_PATHS).sort()
    );
    for (const cloudflare of [false, true]) {
      for (const [secrets, bearer, accepted] of [
        [{ CRON_SECRET: SECRET }, SECRET, true],
        [{ VERCEL_CRON_SECRET: SECRET }, SECRET, acceptsVercelSecret],
        [
          { CRON_SECRET: SECRET, VERCEL_CRON_SECRET: 'fallback-secret' },
          SECRET,
          true,
        ],
        [
          { CRON_SECRET: SECRET, VERCEL_CRON_SECRET: 'fallback-secret' },
          'fallback-secret',
          false,
        ],
        [{ CRON_SECRET: '', VERCEL_CRON_SECRET: SECRET }, SECRET, false],
      ] as const) {
        const handler = vi.fn(async () => Response.json({ ok: true }));
        const send = vi.fn(async () => Response.json({ ok: true }));
        const response = await withWebCronFence(
          new Request(`https://web.test${jobPath}`, {
            headers: {
              Authorization: `Bearer ${bearer}`,
              ...(cloudflare ? { 'x-tuturuuu-cron-slot': String(T0) } : {}),
            },
          }),
          jobPath,
          handler,
          { ...env, CRON_SECRET: undefined, ...secrets },
          send,
          T0
        );
        expect(response.status).toBe(accepted ? 200 : 401);
        expect(handler).toHaveBeenCalledTimes(accepted ? 1 : 0);
        expect(send).toHaveBeenCalledTimes(accepted ? 2 : 0);
      }
    }
  }
);

it.each([
  null,
  '',
  `Bearer X${SECRET.slice(1)}`,
  `Bearer ${SECRET.slice(0, -1)}X`,
  `Bearer ${SECRET.slice(0, -1)}`,
  `Bearer ${SECRET}X`,
  SECRET,
])(
  'rejects a mismatched bearer before gate or processor work: %s',
  async (auth) => {
    const handler = vi.fn();
    const send = vi.fn();
    const response = await withWebCronFence(
      new Request(`https://web.test${path}`, {
        headers: auth === null ? {} : { Authorization: auth },
      }),
      path,
      handler,
      env,
      send
    );
    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  }
);
it('keeps Vercel active and Cloudflare off before gate wiring', async () => {
  const handler = vi.fn(async () => Response.json({ ok: true }));
  const send = vi.fn();
  expect(
    (
      await withWebCronFence(
        request(),
        path,
        handler,
        { CRON_SECRET: SECRET },
        send
      )
    ).status
  ).toBe(200);
  expect(
    (
      await withWebCronFence(
        request(true),
        path,
        handler,
        { CRON_SECRET: SECRET },
        send
      )
    ).status
  ).toBe(503);
  expect(handler).toHaveBeenCalledOnce();
  expect(send).not.toHaveBeenCalled();
});
it.each([false, true])(
  'requires gate admission for owner CF=%s; completes with the same operation id',
  async (cf) => {
    const bodies: {
      kind: string;
      id: string;
      owner?: string;
      slot?: number;
    }[] = [];
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const send = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ ok: true });
    });
    expect(
      (await withWebCronFence(request(cf), path, handler, env, send, T0)).status
    ).toBe(200);
    expect(bodies).toEqual([
      {
        kind: 'acquire',
        id: bodies[0]?.id,
        owner: cf ? 'cloudflare' : 'vercel',
        slot: T0,
      },
      { kind: 'complete', id: bodies[0]?.id },
    ]);
    expect(handler).toHaveBeenCalledOnce();
  }
);
it.each(['duplicate', 'stopped', 'owner', 'unresolved-run'])(
  'a %s gate denial runs no processor',
  async (reason) => {
    const handler = vi.fn();
    const send = vi.fn(async () =>
      Response.json({ ok: false, reason }, { status: 409 })
    );
    expect(
      (await withWebCronFence(request(true), path, handler, env, send, T0))
        .status
    ).toBe(409);
    expect(handler).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
  }
);
it('authenticates before storage, and fails closed on gate loss or bad configuration', async () => {
  const handler = vi.fn();
  const send = vi.fn(async () => {
    throw new Error('unavailable');
  });
  expect(
    (
      await withWebCronFence(
        new Request('https://web.test'),
        path,
        handler,
        env,
        send
      )
    ).status
  ).toBe(401);
  for (const broken of [
    env,
    { ...env, CRON_CONTROL_WEB_GATE_TOKEN: '' },
    { ...env, WEB_CRON_GATE_ORIGIN: 'http://cron.test' },
  ])
    expect(
      (await withWebCronFence(request(), path, handler, broken, send)).status
    ).toBe(503);
  expect(handler).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledOnce();
});
it('never completes or retries a processor failure with an unknown write outcome', async () => {
  for (const handler of [
    async () => new Response(null, { status: 500 }),
    async () => {
      throw new Error('lost response');
    },
  ]) {
    const send = vi.fn(async () => Response.json({ ok: true }));
    expect(
      (await withWebCronFence(request(true), path, handler, env, send)).status
    ).toBeGreaterThanOrEqual(500);
    expect(send).toHaveBeenCalledOnce();
  }
});
it('does not rerun the processor when completion acknowledgement is lost', async () => {
  const handler = vi.fn(async () => Response.json({ ok: true }));
  let calls = 0;
  const send = vi.fn(async () => {
    if (++calls === 2) throw new Error('lost completion');
    return Response.json({ ok: true });
  });
  expect(
    (await withWebCronFence(request(true), path, handler, env, send)).status
  ).toBe(503);
  expect(handler).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledTimes(2);
});
it('bounds Cloudflare pagination and reminder fan-out without leaking into another invocation', async () => {
  expect(WEB_CRON_BATCH_LIMIT).toBe(25);
  await withWebCronBudget(async () => {
    for (let i = 0; i < WEB_CRON_MAX_PAGES; i++) chargeWebCronPage();
    expect(() => chargeWebCronPage()).toThrow('page budget');
    expect(() =>
      assertReminderBudget([
        { task_watchers: Array(WEB_CRON_MAX_REMINDER_RECIPIENTS + 1) },
      ])
    ).toThrow('recipient budget');
    expect(() =>
      assertReminderBudget(
        Array.from({ length: 501 }, () => ({ task_watchers: [] }))
      )
    ).toThrow('recipient budget');
    expect(() =>
      assertReminderBudget([
        { task_watchers: Array(WEB_CRON_MAX_REMINDER_RECIPIENTS) },
      ])
    ).not.toThrow();
  });
  expect(hasWebCronBudget()).toBe(false);
  await withWebCronBudget(async () => {
    expect(() => chargeWebCronPage()).not.toThrow();
  });
});

it('bounds post-email queue fallback pagination before a 21st query', async () => {
  const { fetchAllPaginatedRows } = await import(
    '../post-email-queue/queue-core'
  );
  await withWebCronBudget(async () => {
    const page = vi.fn(async () => ({
      data: Array(1000).fill('row'),
      error: null,
    }));
    await expect(fetchAllPaginatedRows(page)).rejects.toThrow('page budget');
    expect(page).toHaveBeenCalledTimes(20);
  });
});
