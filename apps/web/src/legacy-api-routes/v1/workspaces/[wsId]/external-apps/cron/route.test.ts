import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  callManagedCronRpc: vi.fn(),
  getBearerAppCoordinationToken: vi.fn(),
  getExternalAppById: vi.fn(),
  getPermissions: vi.fn(),
  listEnabledManagedCronDomains: vi.fn(),
  runExternalManagedCronJobNow: vi.fn(),
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
  listEnabledManagedCronDomains: (
    ...args: Parameters<typeof mocks.listEnabledManagedCronDomains>
  ) => mocks.listEnabledManagedCronDomains(...args),
}));

vi.mock('@/lib/managed-cron/rpc', () => ({
  callManagedCronRpc: (...args: Parameters<typeof mocks.callManagedCronRpc>) =>
    mocks.callManagedCronRpc(...args),
  ensureRpcArray: <T>(value: unknown): T[] =>
    Array.isArray(value) ? (value as T[]) : [],
}));

vi.mock('@/lib/managed-cron/service', () => ({
  runExternalManagedCronJobNow: (
    ...args: Parameters<typeof mocks.runExternalManagedCronJobNow>
  ) => mocks.runExternalManagedCronJobNow(...args),
}));

import { GET as GET_EXECUTIONS } from './executions/route';
import { GET as GET_JOB_EXECUTIONS } from './jobs/[jobKey]/executions/route';
import { PATCH as PATCH_JOB } from './jobs/[jobKey]/route';
import { POST as RUN_NOW } from './jobs/[jobKey]/run-now/route';
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

function jobContext(jobKey = 'process-queue') {
  return { params: Promise.resolve({ jobKey, wsId: workspaceId }) };
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
    vi.stubEnv('INFRA_APP_URL', 'https://infra.example.com');
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
    mocks.callManagedCronRpc.mockResolvedValue({
      configured: false,
      enabled: false,
      jobs: [],
    });
    mocks.listEnabledManagedCronDomains.mockResolvedValue([appOrigin]);
  });

  it('returns structured diagnostics when Supabase admin access is unavailable', async () => {
    mocks.callManagedCronRpc.mockRejectedValue(
      new Error('Missing Supabase key')
    );

    const response = await GET(statusRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      adminRecoveryHref:
        'https://infra.example.com/vi/internal/monitoring/cron?focus=cron-runner',
      adminRecoveryReason:
        'Managed cron Supabase admin access is unavailable. Configure Supabase service-role access for Tuturuuu, then retry.',
      code: 'MANAGED_CRON_SUPABASE_ADMIN_UNAVAILABLE',
      configured: false,
      developerDebug: {
        operation: 'status',
        reason: 'supabase_admin_unavailable',
      },
      enabled: false,
      jobs: [],
    });
    expect(body.developerDebug.requiredEnv).toContain('SUPABASE_SECRET_KEY');
    expectNoSensitiveDiagnostics(body);
    expect(mocks.serverLoggerError).toHaveBeenCalledWith(
      'External app managed cron operation failed',
      expect.objectContaining({
        code: 'MANAGED_CRON_SUPABASE_ADMIN_UNAVAILABLE',
        externalAppId: 'cybershield35',
        operation: 'status',
        userId,
        workspaceId,
      })
    );
  });

  it('returns structured diagnostics when managed-cron schema is not ready', async () => {
    mocks.callManagedCronRpc.mockRejectedValue(
      postgresError('42703', 'column "external_app_id" does not exist')
    );

    const response = await GET(statusRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      adminRecoveryHref:
        'https://infra.example.com/vi/internal/monitoring/cron?focus=cron-runner',
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
    mocks.listEnabledManagedCronDomains.mockRejectedValue(
      postgresError(
        '42P01',
        'relation "private.managed_cron_whitelisted_domains" does not exist'
      )
    );

    const response = await SETUP(setupRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      adminRecoveryHref:
        'https://infra.example.com/vi/internal/monitoring/cron?focus=cron-runner',
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
    mocks.listEnabledManagedCronDomains.mockResolvedValue([
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
    expect(body.adminRecoveryHref).toBeUndefined();
    expectNoSensitiveDiagnostics(body);
  });

  it('sets up managed cron jobs with current endpoint and header schema', async () => {
    mocks.listEnabledManagedCronDomains.mockResolvedValue([
      'cybershield35.ttr.gg',
    ]);
    mocks.callManagedCronRpc.mockResolvedValue({
      configured: true,
      enabled: true,
      jobs: [
        {
          active: true,
          failureCount: 0,
          jobKey: 'enqueue-tracked-sources',
          lastRunAt: null,
          lastStatus: null,
          name: 'Managed scheduler enqueue tracked sources',
          nextRunAt: '2026-06-29 08:00:00+00',
          schedule: '0 * * * *',
        },
        {
          active: true,
          failureCount: 0,
          jobKey: 'process-queue',
          lastRunAt: null,
          lastStatus: null,
          name: 'Managed scheduler process queue',
          nextRunAt: '2026-06-29 07:35:00+00',
          schedule: '*/5 * * * *',
        },
      ],
    });

    const response = await SETUP(setupRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      configured: true,
      enabled: true,
    });
    expect(body.jobs).toHaveLength(2);

    const setupCall = mocks.callManagedCronRpc.mock.calls.find(
      ([fn]) => fn === 'external_app_managed_cron_setup'
    );
    expect(setupCall).toBeTruthy();
    const setupArgs = setupCall?.[1] as {
      p_jobs: Array<{ endpointUrl: string; headersConfig: unknown[] }>;
    };
    expect(setupArgs.p_jobs).toHaveLength(2);

    for (const job of setupArgs.p_jobs) {
      expect(job.endpointUrl).toMatch(/^https:\/\/cybershield35\.ttr\.gg\//u);
      expect(job.headersConfig).toContainEqual({
        name: 'Authorization',
        secretName: 'EXTERNAL_APP_MANAGED_CRON_TOKEN',
      });
    }
  });

  it('logs unknown failures and returns sanitized operation diagnostics', async () => {
    mocks.callManagedCronRpc.mockRejectedValue(
      postgresError(
        'XX000',
        'password=secret SELECT * from private.runtime_failure'
      )
    );

    const response = await GET(statusRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      adminRecoveryHref:
        'https://infra.example.com/vi/internal/monitoring/cron?focus=cron-runner',
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

  it('returns scheduler freshness, timezone, execution summary, and overdue diagnostics', async () => {
    mocks.callManagedCronRpc.mockResolvedValue({
      configured: true,
      enabled: true,
      generatedAt: '2026-06-29T11:41:00.000Z',
      jobs: [
        {
          active: true,
          failureCount: 0,
          isOverdue: true,
          jobId: '33333333-3333-4333-8333-333333333333',
          jobKey: 'process-queue',
          lastExecution: {
            durationMs: 123,
            id: '44444444-4444-4444-8444-444444444444',
            jobKey: 'process-queue',
            source: 'manual',
            startedAt: '2026-06-29T11:25:00.000Z',
            status: 'success',
          },
          lastRunAt: '2026-06-29T11:25:00.000Z',
          lastStatus: 'success',
          name: 'Managed scheduler process queue',
          nextRunAt: '2026-06-29T11:30:00.000Z',
          overdueReason: 'No execution recorded after scheduled time.',
          overdueSince: '2026-06-29T11:30:00.000Z',
          schedule: '*/5 * * * *',
          scheduleTimezone: 'Asia/Ho_Chi_Minh',
        },
      ],
      serverNow: '2026-06-29T11:41:00.000Z',
    });

    const response = await GET(statusRequest(), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      configured: true,
      enabled: true,
      generatedAt: '2026-06-29T11:41:00.000Z',
      serverNow: '2026-06-29T11:41:00.000Z',
    });
    expect(body.jobs[0]).toMatchObject({
      isOverdue: true,
      overdueReason: 'No execution recorded after scheduled time.',
      scheduleTimezone: 'Asia/Ho_Chi_Minh',
    });
    expect(body.jobs[0].scheduleDescription).toContain('Asia/Ho_Chi_Minh');
    expect(body.jobs[0].lastExecution).toMatchObject({
      id: '44444444-4444-4444-8444-444444444444',
      source: 'manual',
      status: 'success',
    });
  });

  it('updates external app managed cron schedule and timezone', async () => {
    mocks.callManagedCronRpc.mockResolvedValueOnce(true);
    mocks.callManagedCronRpc.mockResolvedValueOnce({
      configured: true,
      enabled: true,
      jobs: [],
    });

    const response = await PATCH_JOB(
      new Request(
        `https://tuturuuu.com/api/v1/workspaces/${workspaceId}/external-apps/cron/jobs/process-queue`,
        {
          body: JSON.stringify({
            schedule: '0 9 * * *',
            scheduleTimezone: 'Asia/Ho_Chi_Minh',
          }),
          headers: {
            Authorization: 'Bearer app-token',
            'Content-Type': 'application/json',
          },
          method: 'PATCH',
        }
      ),
      jobContext()
    );

    expect(response.status).toBe(200);
    expect(mocks.callManagedCronRpc).toHaveBeenCalledWith(
      'external_app_managed_cron_update_job',
      expect.objectContaining({
        p_enabled: null,
        p_external_app_id: 'cybershield35',
        p_external_job_key: 'process-queue',
        p_schedule: '0 9 * * *',
        p_schedule_timezone: 'Asia/Ho_Chi_Minh',
      })
    );
    const updateArgs = mocks.callManagedCronRpc.mock.calls[0]?.[1] as {
      p_next_run_at?: string | null;
    };
    expect(updateArgs.p_next_run_at).toEqual(expect.any(String));
  });

  it('rejects invalid external app managed cron timezone edits', async () => {
    const response = await PATCH_JOB(
      new Request(
        `https://tuturuuu.com/api/v1/workspaces/${workspaceId}/external-apps/cron/jobs/process-queue`,
        {
          body: JSON.stringify({
            schedule: '0 9 * * *',
            scheduleTimezone: 'Not/A_Timezone',
          }),
          headers: {
            Authorization: 'Bearer app-token',
            'Content-Type': 'application/json',
          },
          method: 'PATCH',
        }
      ),
      jobContext()
    );

    expect(response.status).toBe(400);
    expect(mocks.callManagedCronRpc).not.toHaveBeenCalledWith(
      'external_app_managed_cron_update_job',
      expect.anything()
    );
  });

  it('returns paginated external app managed cron executions', async () => {
    mocks.callManagedCronRpc.mockResolvedValue({
      items: [
        {
          durationMs: 321,
          id: '44444444-4444-4444-8444-444444444444',
          jobId: '33333333-3333-4333-8333-333333333333',
          jobKey: 'process-queue',
          jobName: 'Managed scheduler process queue',
          source: 'manual',
          startedAt: '2026-06-29T11:40:00.000Z',
          status: 'success',
        },
      ],
      limit: 10,
      offset: 0,
      total: 1,
    });

    const response = await GET_EXECUTIONS(
      new Request(
        `https://tuturuuu.com/api/v1/workspaces/${workspaceId}/external-apps/cron/executions?page=1&pageSize=10`,
        { headers: { Authorization: 'Bearer app-token' } }
      ),
      context()
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.callManagedCronRpc).toHaveBeenCalledWith(
      'external_app_managed_cron_executions',
      expect.objectContaining({
        p_external_app_id: 'cybershield35',
        p_external_job_key: null,
        p_limit: 10,
        p_offset: 0,
        p_ws_id: workspaceId,
      })
    );
    expect(body).toMatchObject({ page: 1, total: 1 });
    expect(body.items[0]).toMatchObject({
      id: '44444444-4444-4444-8444-444444444444',
      source: 'manual',
      status: 'success',
    });
  });

  it('filters external app managed cron executions by job key', async () => {
    mocks.callManagedCronRpc.mockResolvedValue({
      items: [],
      limit: 25,
      offset: 0,
      total: 0,
    });

    const response = await GET_JOB_EXECUTIONS(
      new Request(
        `https://tuturuuu.com/api/v1/workspaces/${workspaceId}/external-apps/cron/jobs/process-queue/executions`,
        { headers: { Authorization: 'Bearer app-token' } }
      ),
      jobContext()
    );

    expect(response.status).toBe(200);
    expect(mocks.callManagedCronRpc).toHaveBeenCalledWith(
      'external_app_managed_cron_executions',
      expect.objectContaining({
        p_external_job_key: 'process-queue',
      })
    );
  });

  it('returns manual run metadata from the external app run-now route', async () => {
    mocks.runExternalManagedCronJobNow.mockResolvedValue({
      durationMs: 100,
      error: null,
      httpStatus: 200,
      jobId: '33333333-3333-4333-8333-333333333333',
      response: 'ok',
      status: 'success',
    });

    const response = await RUN_NOW(
      new Request(
        `https://tuturuuu.com/api/v1/workspaces/${workspaceId}/external-apps/cron/jobs/process-queue/run-now`,
        { headers: { Authorization: 'Bearer app-token' }, method: 'POST' }
      ),
      jobContext()
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result).toMatchObject({
      httpStatus: 200,
      status: 'success',
    });
    expect(mocks.runExternalManagedCronJobNow).toHaveBeenCalledWith(
      expect.objectContaining({
        externalAppId: 'cybershield35',
        jobKey: 'process-queue',
        wsId: workspaceId,
      })
    );
  });
});
