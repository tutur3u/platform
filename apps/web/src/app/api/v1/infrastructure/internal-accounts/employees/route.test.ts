import { beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  authorize: vi.fn(),
  journal: vi.fn(),
  guard: vi.fn(),
}));
vi.mock('@/lib/infrastructure/employee-creation-cli-guard', () => ({
  guardEmployeeCreationCli: mock.guard,
}));
vi.mock('@/lib/infrastructure/employee-creation-runtime', () => ({
  createEmployeeRuntimeJournal: mock.journal,
}));
vi.mock('@/lib/infrastructure/employee-creation-request-authorization', () => ({
  authorizeEmployeeCreationRequest: mock.authorize,
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));

import { GET, POST } from './route';

beforeEach(() => {
  vi.resetAllMocks();
  mock.authorize.mockResolvedValue({ authorized: true, actorUserId: 'actor' });
  mock.journal.mockResolvedValue(undefined);
  mock.guard.mockImplementation((request, handle) => handle(request));
});
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
        temporaryPassword: 'Synthetic-Pass-123!',
      }),
    })
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    code: 'employee_creation_unavailable',
  });
});
it('uses the CLI-admitting authorizer for both the route and its journal', async () => {
  const request = new Request('https://web.test/employees');
  await GET(request);
  expect(mock.authorize).toHaveBeenCalledWith(request);
  expect(mock.journal).toHaveBeenCalledWith(request, mock.authorize);
});
it('denies an unauthorized actor before reading the journal', async () => {
  mock.authorize.mockResolvedValue({ authorized: false, status: 403 });
  const response = await GET(new Request('https://web.test/employees'));
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ code: 'forbidden' });
});
it('sends POST (never GET) through the CLI rate-limit and audit guard', async () => {
  await GET(new Request('https://web.test/employees'));
  expect(mock.guard).not.toHaveBeenCalled();
  const request = new Request('https://web.test/employees', {
    method: 'POST',
  });
  await POST(request);
  expect(mock.guard).toHaveBeenCalledWith(request, expect.any(Function));
});
