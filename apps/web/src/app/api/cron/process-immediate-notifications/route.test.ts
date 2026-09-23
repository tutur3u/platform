import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ schema: () => ({ rpc: mocks.rpc }) }),
}));
vi.mock('@/app/api/notifications/send-immediate/route', () => ({
  POST: mocks.send,
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'test-secret');
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
  mocks.send.mockResolvedValue(new Response('{}'));
});
it('rejects unauthorized recovery without touching batches', async () => {
  const response = await GET(new Request('http://localhost/cron') as any);
  expect(response.status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('recovers bounded retries then uses the authorized dispatcher for pending batches', async () => {
  const request = new Request('http://localhost/cron', {
    headers: { authorization: 'Bearer test-secret' },
  });
  expect((await GET(request as any)).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith('requeue_mail_push_batches');
  expect(mocks.send).toHaveBeenCalledWith(request);
});
it('fails closed if recovery fails', async () => {
  mocks.rpc.mockResolvedValue({ error: new Error('database unavailable') });
  const response = await GET(
    new Request('http://localhost/cron', {
      headers: { authorization: 'Bearer test-secret' },
    }) as any
  );
  expect(response.status).toBe(500);
  expect(mocks.send).not.toHaveBeenCalled();
});
