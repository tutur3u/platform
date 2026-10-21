import { expect, it, vi } from 'vitest';

const observe = vi.hoisted(() =>
  vi.fn(async () => Response.json({ status: 'pending' }))
);
vi.mock('@/lib/infrastructure/employee-creation-observation', () => ({
  observeEmployeeCreation: observe,
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));

import { connection } from 'next/server';
import * as route from './route';

it('ships only a request-time observation GET for the original operation', async () => {
  const request = new Request('https://web.test/op');
  await route.GET(request, {
    params: Promise.resolve({ operationId: 'operation' }),
  });
  expect(connection).toHaveBeenCalledOnce();
  expect(observe).toHaveBeenCalledExactlyOnceWith(request, 'operation');
  expect(Object.keys(route)).toEqual(['GET']);
});
