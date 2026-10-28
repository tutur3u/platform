import { afterEach, expect, it, vi } from 'vite-plus/test';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));
const { default: worker } = await import('./worker');
type WorkerEnv = Parameters<typeof worker.fetch>[1];
const env = {
  DEVBOX_CONTROL_INTERNAL_TOKEN: 'synthetic-internal-token-longer-than-32',
  RUNNER_WAKE: {} as WorkerEnv['RUNNER_WAKE'],
  SUPABASE_SECRET_KEY: 'synthetic-test-key',
  SUPABASE_URL: 'https://db.example.test',
};
afterEach(() => vi.unstubAllGlobals());
it.each([undefined, 'false', 'TRUE', '1'])(
  'durable stop fence %s makes zero database calls',
  async (flag) => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await worker.scheduled({} as ScheduledController, {
      ...env,
      TUTURUUU_DEVBOX_EXPIRY_SWEEP_ENABLED: flag,
    });
    expect(fetcher).not.toHaveBeenCalled();
  }
);
it('each schedule sends one bounded transaction and never follows remaining work in a loop', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(25));
  vi.stubGlobal('fetch', fetcher);
  await worker.scheduled({} as ScheduledController, {
    ...env,
    TUTURUUU_DEVBOX_EXPIRY_SWEEP_ENABLED: 'true',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    new URL(
      'https://db.example.test/rest/v1/rpc/expire_devbox_personal_grants'
    ),
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ p_limit: 25 }),
      signal: expect.any(AbortSignal),
      cache: 'no-store',
    })
  );
});
it('failed transaction is not retried; a later schedule can resume and disabling stops it', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json(0));
  vi.stubGlobal('fetch', fetcher);
  const enabled = { ...env, TUTURUUU_DEVBOX_EXPIRY_SWEEP_ENABLED: 'true' };
  await expect(
    worker.scheduled({} as ScheduledController, enabled)
  ).rejects.toThrow('503');
  expect(fetcher).toHaveBeenCalledTimes(1);
  await worker.scheduled({} as ScheduledController, enabled);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await worker.scheduled({} as ScheduledController, {
    ...enabled,
    TUTURUUU_DEVBOX_EXPIRY_SWEEP_ENABLED: 'false',
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
