import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeInfrastructureViewerMock,
  readBlueGreenMonitoringRequestArchiveMock,
} = vi.hoisted(() => ({
  authorizeInfrastructureViewerMock: vi.fn(),
  readBlueGreenMonitoringRequestArchiveMock: vi.fn(),
}));

vi.mock('../authorization', () => ({
  authorizeInfrastructureViewer: authorizeInfrastructureViewerMock,
}));

vi.mock('@/lib/infrastructure/blue-green-monitoring', () => ({
  readBlueGreenMonitoringRequestArchive:
    readBlueGreenMonitoringRequestArchiveMock,
}));

import { GET } from './route';

function createTestRequest(query = '') {
  return new Request(
    `http://localhost/api/v1/infrastructure/monitoring/blue-green/requests${query}`
  ) as NextRequest;
}

describe('blue-green monitoring requests route', () => {
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

  it('returns the request archive with parsed pagination params', async () => {
    authorizeInfrastructureViewerMock.mockResolvedValue({
      ok: true,
      user: {
        id: 'user-1',
      },
    });
    readBlueGreenMonitoringRequestArchiveMock.mockReturnValue({
      hasNextPage: true,
      hasPreviousPage: false,
      items: [],
      limit: 50,
      offset: 0,
      page: 1,
      pageCount: 3,
      total: 120,
      window: {
        newestAt: null,
        oldestAt: null,
      },
    });

    const response = await GET(createTestRequest('?page=1&pageSize=50'));

    expect(response.status).toBe(200);
    expect(readBlueGreenMonitoringRequestArchiveMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50,
    });
    await expect(response.json()).resolves.toMatchObject({
      page: 1,
      pageCount: 3,
      total: 120,
    });
  });
});
