import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeInfrastructureOperatorMock,
  authorizeInfrastructureViewerMock,
  queueCronRunRequestMock,
  readCronExecutionArchiveMock,
  readCronMonitoringSnapshotMock,
  updateCronMonitoringControlMock,
} = vi.hoisted(() => ({
  authorizeInfrastructureOperatorMock: vi.fn(),
  authorizeInfrastructureViewerMock: vi.fn(),
  queueCronRunRequestMock: vi.fn(),
  readCronExecutionArchiveMock: vi.fn(),
  readCronMonitoringSnapshotMock: vi.fn(),
  updateCronMonitoringControlMock: vi.fn(),
}));

vi.mock('../blue-green/authorization', () => ({
  authorizeInfrastructureOperator: authorizeInfrastructureOperatorMock,
  authorizeInfrastructureViewer: authorizeInfrastructureViewerMock,
}));

vi.mock('../../blue-green/authorization', () => ({
  authorizeInfrastructureOperator: authorizeInfrastructureOperatorMock,
  authorizeInfrastructureViewer: authorizeInfrastructureViewerMock,
}));

vi.mock('@/lib/infrastructure/cron-monitoring', () => ({
  queueCronRunRequest: queueCronRunRequestMock,
  readCronExecutionArchive: readCronExecutionArchiveMock,
  readCronMonitoringSnapshot: readCronMonitoringSnapshotMock,
  updateCronMonitoringControl: updateCronMonitoringControlMock,
}));

import { PUT as PUTControl } from './control/route';
import { GET as GETExecutions } from './executions/route';
import { GET } from './route';
import { POST as POSTRun } from './run/route';

function authorize() {
  const authorization = {
    ok: true,
    user: {
      email: 'ops@tuturuuu.com',
      id: 'user-1',
    },
  };
  authorizeInfrastructureOperatorMock.mockResolvedValue(authorization);
  authorizeInfrastructureViewerMock.mockResolvedValue(authorization);
}

function denyOperator() {
  authorizeInfrastructureOperatorMock.mockResolvedValue({
    ok: false,
    response: Response.json({ message: 'Forbidden' }, { status: 403 }),
  });
}

describe('cron monitoring routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorize();
  });

  it('returns the cron snapshot for authorized infrastructure viewers', async () => {
    readCronMonitoringSnapshotMock.mockReturnValue({
      jobs: [],
      status: 'live',
    });

    const response = await GET(
      new Request('http://localhost/api/v1/infrastructure/monitoring/cron')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobs: [],
      status: 'live',
    });
  });

  it('returns paginated cron executions', async () => {
    readCronExecutionArchiveMock.mockReturnValue({
      items: [],
      page: 2,
      total: 0,
    });

    const response = await GETExecutions(
      new Request(
        'http://localhost/api/v1/infrastructure/monitoring/cron/executions?page=2&pageSize=5'
      )
    );

    expect(response.status).toBe(200);
    expect(readCronExecutionArchiveMock).toHaveBeenCalledWith({
      jobId: null,
      page: 2,
      pageSize: 5,
    });
  });

  it('queues a manual cron run for a known job', async () => {
    readCronMonitoringSnapshotMock.mockReturnValue({
      enabled: true,
      jobs: [{ id: 'job-1' }],
    });
    queueCronRunRequestMock.mockReturnValue({
      id: 'request-1',
      jobId: 'job-1',
      requestedAt: 1000,
      requestedBy: 'user-1',
      requestedByEmail: 'ops@tuturuuu.com',
    });

    const response = await POSTRun(
      new Request(
        'http://localhost/api/v1/infrastructure/monitoring/cron/run',
        {
          body: JSON.stringify({ jobId: 'job-1' }),
          method: 'POST',
        }
      )
    );

    expect(response.status).toBe(200);
    expect(authorizeInfrastructureOperatorMock).toHaveBeenCalledTimes(1);
    expect(authorizeInfrastructureViewerMock).not.toHaveBeenCalled();
    expect(queueCronRunRequestMock).toHaveBeenCalledWith({
      jobId: 'job-1',
      requestedBy: 'user-1',
      requestedByEmail: 'ops@tuturuuu.com',
    });
  });

  it('rejects manual cron runs without infrastructure operator access', async () => {
    denyOperator();

    const response = await POSTRun(
      new Request(
        'http://localhost/api/v1/infrastructure/monitoring/cron/run',
        {
          body: JSON.stringify({ jobId: 'job-1' }),
          method: 'POST',
        }
      )
    );

    expect(response.status).toBe(403);
    expect(authorizeInfrastructureOperatorMock).toHaveBeenCalledTimes(1);
    expect(readCronMonitoringSnapshotMock).not.toHaveBeenCalled();
    expect(queueCronRunRequestMock).not.toHaveBeenCalled();
  });

  it('updates native cron execution control', async () => {
    updateCronMonitoringControlMock.mockReturnValue({
      enabled: false,
      jobs: {},
      updatedAt: 1000,
      updatedBy: 'user-1',
      updatedByEmail: 'ops@tuturuuu.com',
    });

    const response = await PUTControl(
      new Request(
        'http://localhost/api/v1/infrastructure/monitoring/cron/control',
        {
          body: JSON.stringify({ enabled: false }),
          method: 'PUT',
        }
      )
    );

    expect(response.status).toBe(200);
    expect(authorizeInfrastructureOperatorMock).toHaveBeenCalledTimes(1);
    expect(authorizeInfrastructureViewerMock).not.toHaveBeenCalled();
    expect(updateCronMonitoringControlMock).toHaveBeenCalledWith({
      enabled: false,
      jobId: null,
      updatedBy: 'user-1',
      updatedByEmail: 'ops@tuturuuu.com',
    });
  });

  it('rejects cron control updates without infrastructure operator access', async () => {
    denyOperator();

    const response = await PUTControl(
      new Request(
        'http://localhost/api/v1/infrastructure/monitoring/cron/control',
        {
          body: JSON.stringify({ enabled: false }),
          method: 'PUT',
        }
      )
    );

    expect(response.status).toBe(403);
    expect(authorizeInfrastructureOperatorMock).toHaveBeenCalledTimes(1);
    expect(updateCronMonitoringControlMock).not.toHaveBeenCalled();
  });
});
