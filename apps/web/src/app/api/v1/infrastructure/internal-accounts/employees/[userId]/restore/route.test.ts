import { afterEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@/lib/infrastructure/employee-creation-authorization', () => ({
  authorizeEmployeeCreation: vi.fn(async () => ({
    authorized: true,
    actorUserId: '10000000-0000-4000-8000-000000000001',
  })),
}));

import { POST as reconcile } from '../reconcile/route';
import { POST as restore } from './route';

afterEach(() => vi.unstubAllEnvs());
it.each([restore, reconcile])(
  'shipped POST remains unavailable with RESTORE gate absent',
  async (handler) => {
    vi.stubEnv('EMPLOYEE_RESTORATION_RUNTIME_ENABLED', undefined);
    vi.stubEnv('EMPLOYEE_CREATION_RUNTIME_ENABLED', 'true');
    const response = await handler(
      new Request('https://web.test/restore', { method: 'POST' }),
      {
        params: Promise.resolve({
          userId: '10000000-0000-4000-8000-000000000002',
        }),
      }
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'employee_management_unavailable',
    });
    expect(response.headers.get('cache-control')).toContain('no-store');
  }
);
