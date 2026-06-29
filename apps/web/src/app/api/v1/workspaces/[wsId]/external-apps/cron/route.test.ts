import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getBearerAppCoordinationToken: vi.fn(),
  getExternalAppById: vi.fn(),
  getPermissions: vi.fn(),
  getPlatformSql: vi.fn(),
  listEnabledManagedCronDomainsWithSql: vi.fn(),
  serverLoggerError: vi.fn(),
  setLogDrainUserContext: vi.fn(),
  verifyAppCoordinationToken: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  withRequestLogDrain: vi.fn(
    (_options: unknown, handler: () => Promise<Response>) => handler()
  ),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/auth/app-coordination', () => ({
  getBearerAppCoordinationToken: (
    ...args: Parameters<typeof mocks.getBearerAppCoordinationToken>
  ) => mocks.getBearerAppCoordinationToken(...args),
  verifyAppCoordinationToken: (
    ...args: Parameters<typeof mocks.verifyAppCoordinationToken>
  ) => mocks.verifyAppCoordinationToken(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppById: (...args: Parameters<typeof mocks.getExternalAppById>) =>
    mocks.getExternalAppById(...args),
}));

vi.mock('@/lib/database/platform-sql', () => ({
  getPlatformSql: (...args: Parameters<typeof mocks.getPlatformSql>) =>
    mocks.getPlatformSql(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
  setLogDrainUserContext: (
    ...args: Parameters<typeof mocks.setLogDrainUserContext>
  ) => mocks.setLogDrainUserContext(...args),
  withRequestLogDrain: (
    ...args: Parameters<typeof mocks.withRequestLogDrain>
  ) => mocks.withRequestLogDrain(...args),
}));

vi.mock('@/lib/managed-cron/domain-repository', () => ({
  listEnabledManagedCronDomainsWithSql: (
    ...args: Parameters<typeof mocks.listEnabledManagedCronDomainsWithSql>
  ) => mocks.listEnabledManagedCronDomainsWithSql(...args),
}));

vi.mock('@/lib/managed-cron/service', () => ({
  runExternalManagedCronJobNow: vi.fn(),
}));

import { GET } from './route';
import { POST as SETUP } from './setup/route';

const workspaceId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';
const appOrigin = 'https://cybershield35.ttr.gg';
const setupToken = 'x'.repeat(48);

function context() {
  return { params: Promise.resolve({ wsId: workspaceId }) };
}

function statusRequest() {
  return new Request(
    `https://tuturuuu.com/api/v1/workspaces/${workspaceId}/external-apps/cron`,
    { headers: { Authorization: 'Bearer app-token' } }
  );
}

function setupRequest() {
  return new Request(
    `https://tuturuuu.com/api/v1/workspaces/${workspaceId}/external-apps/cron/setup`,
    {
      body: JSON.stringify({
        callbackBaseUrl: appOrigin,
        origin: appOrigin,
        token: setupToken,
      }),
      headers: {
        Authorization: 'Bearer app-token',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

function createSqlMock({
  jobs = [],
  secrets = [],
}: {
  jobs?: unknown[];
  secrets?: unknown[];
} = {}) {
  return vi.fn((strings: TemplateStringsArray | string[]) => {
    if (!('raw' in strings)) return strings;

    const query = strings.join(' ');
    if (query.includes('from public.workspace_cron_jobs')) return jobs;
    if (query.includes('from public.workspace_secrets')) return secrets;
    return [];
  });
}

function postgresError(code: string, message: string) {
  return Object.assign(new Error(message), {
    code,
    name: 'PostgresError',
  });
}

function expectNoSensitiveDiagnostics(body: unknown) {
  const serialized = JSON.stringify(body);
  expect(serialized).not.toContain(setupToken);
  expect(serialized).not.toContain('postgres://');
  expect(serialized).not.toContain('Bearer app-token');
  expect(serialized).not.toContain('password=secret');
  expect(serialized).not.toContain('SELECT *');
  expect(serialized).not.toContain('Error:');
}

describe('external app managed cron routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBearerAppCoordinationToken.mockReturnValue('app-token');
    mocks.verifyAppCoordinationToken.mockReturnValue({
      claims: {
        email: 'admin@example.com',
        scopes: ['workspace:cron:read', 'workspace:cron:write'],
        sub: userId,
        target_app: 'cybershield35',
      },
      ok: true,
    });
    mocks.createAdminClient.mockResolvedValue({});
    mocks.getExternalAppById.mockResolvedValue({
      allowedWorkspaceIds: [workspaceId],
      enabled: true,
      id: 'cybershield35',
      origins: [appOrigin],
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: () => false,
    });
    mocks.getPlatformSql.mockReturnValue(createSqlMock());
    mocks.listEnabledManagedCronDomainsWithSql.mockResolvedValue([appOrigin]);
  });

  it('returns structured diagnostics when the platform database URL is missing', async () => {
    mocks.getPlatformSql.mockImplementation(() => {
      throw new Error(
        'Missing private database connection URL. Set one of: PLATFORM_DATABASE_URL, POSTGRES_URL, DATABASE_URL, DIRECT_URL.'
      );
    });

    const response = await GET(statusRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      code: 'MANAGED_CRON_DATABASE_UNAVAILABLE',
      configured: false,
      developerDebug: {
        operation: 'status',
        reason: 'database_unavailable',
      },
      enabled: false,
      jobs: [],
    });
    expect(body.developerDebug.requiredEnv).toContain('PLATFORM_DATABASE_URL');
    expectNoSensitiveDiagnostics(body);
    expect(mocks.serverLoggerError).toHaveBeenCalledWith(
      'External app managed cron operation failed',
      expect.objectContaining({
        code: 'MANAGED_CRON_DATABASE_UNAVAILABLE',
        externalAppId: 'cybershield35',
        operation: 'status',
        userId,
        workspaceId,
      })
    );
  });

  it('returns structured diagnostics when managed-cron schema is not ready', async () => {
    mocks.getPlatformSql.mockReturnValue(
      vi.fn(() => {
        throw postgresError('42703', 'column "external_app_id" does not exist');
      })
    );

    const response = await GET(statusRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      code: 'MANAGED_CRON_SCHEMA_NOT_READY',
      configured: false,
      developerDebug: {
        operation: 'status',
        reason: 'schema_not_ready',
      },
      enabled: false,
      jobs: [],
    });
    expect(body.developerDebug.requiredMigrations).toContain(
      '20260628120000_external_app_managed_cron_jobs.sql'
    );
    expectNoSensitiveDiagnostics(body);
  });

  it('blocks setup with diagnostics when managed-cron schema is missing', async () => {
    mocks.listEnabledManagedCronDomainsWithSql.mockRejectedValue(
      postgresError(
        '42P01',
        'relation "private.managed_cron_whitelisted_domains" does not exist'
      )
    );

    const response = await SETUP(setupRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      code: 'MANAGED_CRON_SCHEMA_NOT_READY',
      configured: false,
      developerDebug: {
        operation: 'setup',
        reason: 'schema_not_ready',
      },
      enabled: false,
      jobs: [],
    });
    expect(body.code).not.toBe('CRON_APPROVAL_REQUIRED');
    expect(body.approvalHref).toBeUndefined();
    expectNoSensitiveDiagnostics(body);
  });

  it('keeps domain approval responses actionable for setup', async () => {
    mocks.listEnabledManagedCronDomainsWithSql.mockResolvedValue([
      'approved.example.com',
    ]);

    const response = await SETUP(setupRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      code: 'CRON_APPROVAL_REQUIRED',
      error: 'Managed scheduler approval required',
      missing: ['domain'],
      origin: appOrigin,
      workspaceId,
    });
    expect(mocks.serverLoggerError).not.toHaveBeenCalled();
    expectNoSensitiveDiagnostics(body);
  });

  it('logs unknown failures and returns sanitized operation diagnostics', async () => {
    mocks.getPlatformSql.mockReturnValue(
      vi.fn(() => {
        throw postgresError(
          'XX000',
          'password=secret SELECT * from private.runtime_failure'
        );
      })
    );

    const response = await GET(statusRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      code: 'MANAGED_CRON_STATUS_CHECK_FAILED',
      configured: false,
      developerDebug: {
        operation: 'status',
        reason: 'unexpected_error',
      },
      enabled: false,
      jobs: [],
    });
    expectNoSensitiveDiagnostics(body);
    expect(mocks.serverLoggerError).toHaveBeenCalledWith(
      'External app managed cron operation failed',
      expect.objectContaining({
        code: 'MANAGED_CRON_STATUS_CHECK_FAILED',
        operation: 'status',
        postgresCode: 'XX000',
        reason: 'unexpected_error',
      })
    );
  });
});
