import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeInfrastructureViewerMock,
  readBlueGreenMonitoringWatcherLogArchiveMock,
} = vi.hoisted(() => ({
  authorizeInfrastructureViewerMock: vi.fn(),
  readBlueGreenMonitoringWatcherLogArchiveMock: vi.fn(),
}));

vi.mock('../authorization', () => ({
  authorizeInfrastructureViewer: authorizeInfrastructureViewerMock,
}));

vi.mock('@/lib/infrastructure/blue-green-monitoring', () => ({
  readBlueGreenMonitoringWatcherLogArchive:
    readBlueGreenMonitoringWatcherLogArchiveMock,
}));

import { GET } from './route';

function createTestRequest(query = '') {
  return new Request(
    `http://localhost/api/v1/infrastructure/monitoring/blue-green/watcher-logs${query}`
  ) as NextRequest;
}

describe('blue-green monitoring watcher-logs route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the authorization response when access is denied', async () => {
    authorizeInfrastructureViewerMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
      }),
    });

    const response = await GET(createTestRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
  });

  it('returns the watcher log archive with parsed pagination params', async () => {
    authorizeInfrastructureViewerMock.mockResolvedValue({
      ok: true,
      user: {
        id: 'user-1',
      },
    });
    readBlueGreenMonitoringWatcherLogArchiveMock.mockReturnValue({
      hasNextPage: false,
      hasPreviousPage: true,
      items: [],
      limit: 25,
      offset: 25,
      page: 2,
      pageCount: 2,
      total: 40,
      window: {
        newestAt: null,
        oldestAt: null,
      },
    });

    const response = await GET(createTestRequest('?page=2&pageSize=25'));

    expect(response.status).toBe(200);
    expect(readBlueGreenMonitoringWatcherLogArchiveMock).toHaveBeenCalledWith({
      page: 2,
      pageSize: 25,
    });
    await expect(response.json()).resolves.toMatchObject({
      hasPreviousPage: true,
      page: 2,
      total: 40,
    });
  });
});
