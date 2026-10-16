import { beforeEach, expect, it, vi } from 'vitest';

const authorize = vi.hoisted(() => vi.fn());
vi.mock('@/lib/infrastructure/employee-creation-runtime', () => ({
  createEmployeeRuntimeJournal: vi.fn(async () => undefined),
}));
vi.mock('@/lib/infrastructure/employee-creation-authorization', () => ({
  authorizeEmployeeCreation: authorize,
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));

import { GET, POST } from './route';

beforeEach(() =>
  authorize.mockResolvedValue({ authorized: true, actorUserId: 'actor' })
);
it('shipped GET and POST remain unavailable without a runtime supplier', async () => {
  expect(
    await (await GET(new Request('https://web.test/employees'))).json()
  ).toEqual({ available: false });
  const response = await POST(
    new Request('https://web.test/employees', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tuturuuu-account-action': '1',
        'Idempotency-Key': '0da9bb8d-fd22-433b-97a0-d54a0cecf5b3',
      },
      body: JSON.stringify({
        email: 'staff@tuturuuu.com',
        displayName: 'Staff',
        temporaryPassword: 'temporary-pass-123',
      }),
    })
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    code: 'employee_creation_unavailable',
  });
});
