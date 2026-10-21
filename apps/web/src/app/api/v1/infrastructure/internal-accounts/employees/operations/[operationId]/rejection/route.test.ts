import { expect, it, vi } from 'vitest';

const handle = vi.hoisted(() =>
  vi.fn(async () => Response.json({ status: 'fenced' }))
);
vi.mock('@/lib/infrastructure/employee-rejection-boundary', () => ({
  handleEmployeeRejection: handle,
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));

import { connection } from 'next/server';
import { GET, POST } from './route';

it('wires both authenticated recovery actions into the request-time boundary', async () => {
  const request = new Request('https://web.test/rejection');
  for (const action of [GET, POST])
    await action(request, {
      params: Promise.resolve({ operationId: 'original' }),
    });
  expect(connection).toHaveBeenCalledTimes(2);
  expect(handle).toHaveBeenCalledWith(request, 'original');
});
