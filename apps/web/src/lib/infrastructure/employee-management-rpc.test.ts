import { expect, it, vi } from 'vitest';
import { createEmployeeManagementReader } from './employee-management-rpc';

vi.mock('server-only', () => ({}));
const args = {
  actorUserId: '10000000-0000-4000-8000-000000000001',
  targetUserId: '10000000-0000-4000-8000-000000000002',
  email: null,
};
function reader(fetcher: typeof fetch, authorize = vi.fn(async () => true)) {
  return createEmployeeManagementReader({
    url: 'https://project.test',
    key: 'synthetic',
    fetch: fetcher,
    authorize,
  });
}
it('preserves null lookup email and sends only the fixed inspection tuple', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ id: args.targetUserId }));
  expect(await reader(fetcher).inspect(args)).toEqual({
    data: { id: args.targetUserId },
    error: null,
  });
  const [url, init] = fetcher.mock.calls[0]!;
  expect(String(url)).toBe(
    'https://project.test/rest/v1/rpc/inspect_employee_management'
  );
  expect(init).toMatchObject({
    method: 'POST',
    redirect: 'error',
    cache: 'no-store',
  });
  expect(JSON.parse(String(init?.body))).toEqual({
    p_actor_id: args.actorUserId,
    p_user_id: args.targetUserId,
    p_email: null,
  });
  expect(new Headers(init?.headers).get('Authorization')).toBe(
    'Bearer synthetic'
  );
  expect(new Headers(init?.headers).get('Accept-Profile')).toBe('private');
});
it('denies revoked authority without contacting SQL', async () => {
  const fetcher = vi.fn<typeof fetch>();
  expect(
    await reader(
      fetcher,
      vi.fn(async () => false)
    ).inspect(args)
  ).toEqual({ data: null, error: { code: '42501' } });
  expect(fetcher).not.toHaveBeenCalled();
});
it('binds the original tuple across awaited authorization', async () => {
  const tuple = { ...args };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(null));
  const authorize = vi.fn(async () => {
    tuple.targetUserId = args.actorUserId;
    return true;
  });
  await reader(fetcher, authorize).inspect(tuple);
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).p_user_id).toBe(
    args.targetUserId
  );
});
it('projects only a bounded SQL code, without diagnostic data', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json(
        { code: '42501', message: 'private-diagnostic', details: 'private' },
        { status: 403 }
      )
    );
  expect(await reader(fetcher).inspect(args)).toEqual({
    data: null,
    error: { code: '42501' },
  });
});
it.each(['not json', 'x'.repeat(262145)])(
  'rejects invalid or oversized replies without retry',
  async (body) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    await expect(reader(fetcher).inspect(args)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
);
it('cancels an oversized stream before consuming its remaining bytes', async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(262145));
      controller.enqueue(new Uint8Array(1024));
    },
    cancel,
  });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream));
  await expect(reader(fetcher).inspect(args)).rejects.toThrow();
  expect(cancel).toHaveBeenCalledTimes(1);
});
it.each([
  'http://remote.test',
  'ftp://localhost',
  'https://name:password@project.test',
  'https://project.test?key=value',
  'https://project.test#fragment',
])('rejects unsafe project origin %s', (url) => {
  expect(() =>
    createEmployeeManagementReader({
      url,
      key: 'synthetic',
      authorize: async () => true,
    })
  ).toThrow();
});
