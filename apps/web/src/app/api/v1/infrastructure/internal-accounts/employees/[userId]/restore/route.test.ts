import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  context,
  request,
  restorationFixture,
  target,
} from '@/lib/infrastructure/employee-restoration-test-fixture';

const mock = vi.hoisted(() => ({
  configuration: vi.fn(),
  admin: vi.fn(),
  authorize: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/common', () => ({
  checkEnvVariables: mock.configuration,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mock.admin,
}));
vi.mock('@/lib/infrastructure/employee-creation-authorization', () => ({
  authorizeEmployeeCreation: mock.authorize,
}));

import { POST as reconcile } from '../reconcile/route';
import { POST as restore } from './route';

let fixture: Awaited<ReturnType<typeof restorationFixture>>;
beforeEach(async () => {
  vi.clearAllMocks();
  fixture = await restorationFixture();
  mock.configuration.mockImplementation(fixture.deps.configuration);
  mock.authorize.mockImplementation(fixture.deps.authorize);
  mock.admin.mockResolvedValue({ auth: { admin: fixture.provider } });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await fixture.close();
});
it.each([undefined, 'false'])(
  'shipped restore and reconcile succeed without activation flag %s',
  async (flag) => {
    vi.stubEnv('EMPLOYEE_RESTORATION_RUNTIME_ENABLED', flag);
    vi.stubEnv('EMPLOYEE_CREATION_RUNTIME_ENABLED', 'false');
    const response = await restore(request(), context());
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      status: 'restored',
      account: { id: target },
    });
    const reconciled = await reconcile(
      request({
        confirmationEmail: 'fixture@tuturuuu.com',
        expectedRevision: 0,
        operationId: result.operationId,
      }),
      context()
    );
    expect(reconciled.status).toBe(200);
    expect(await reconciled.json()).toMatchObject({
      status: 'restored',
      operationId: result.operationId,
    });
    expect(fixture.provider.updateUserById).toHaveBeenCalledExactlyOnceWith(
      target,
      { ban_duration: 'none' }
    );
    expect(mock.configuration).toHaveBeenCalledWith({ useSecretKey: true });
    expect(mock.admin).toHaveBeenCalledWith({ noCookie: true });
    expect(response.headers.get('cache-control')).toContain('no-store');
  }
);
it.each([restore, reconcile])(
  'shipped POST still denies nonadmins',
  async (handler) => {
    fixture.setAuthorized(false);
    const response = await handler(request(), context());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'forbidden' });
    expect(mock.configuration).not.toHaveBeenCalled();
    expect(mock.admin).not.toHaveBeenCalled();
    expect(fixture.calls).toEqual([]);
    expect(fixture.provider.getUserById).not.toHaveBeenCalled();
    expect(fixture.provider.updateUserById).not.toHaveBeenCalled();
  }
);
it.each([restore, reconcile])(
  'shipped POST fails closed on configuration errors',
  async (handler) => {
    mock.configuration.mockImplementation(() => {
      throw Error('synthetic configuration unavailable');
    });
    const response = await handler(request(), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'employee_management_unavailable',
    });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mock.admin).not.toHaveBeenCalled();
    expect(fixture.calls).toEqual([]);
    expect(fixture.provider.getUserById).not.toHaveBeenCalled();
    expect(fixture.provider.updateUserById).not.toHaveBeenCalled();
  }
);
