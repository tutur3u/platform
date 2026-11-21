import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeInfrastructureViewerMock, fetchMock } = vi.hoisted(() => ({
  authorizeInfrastructureViewerMock: vi.fn(),
  fetchMock: vi.fn<typeof fetch>(),
}));

vi.mock('../../monitoring/blue-green/authorization', () => ({
  authorizeInfrastructureViewer: authorizeInfrastructureViewerMock,
}));

import { GET } from './route';

const call = (project: string) =>
  GET(
    new Request(
      `http://localhost/api/v1/infrastructure/deployments/${project}`
    ),
    { params: Promise.resolve({ project }) }
  );

describe('deployment project route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('DEPLOY_COORDINATOR_ORIGIN', 'https://deploy.example');
    vi.stubEnv('DEPLOY_COORDINATOR_OPERATOR_TOKEN', 'operator-token');
    authorizeInfrastructureViewerMock.mockResolvedValue({
      ok: true,
      user: { id: 'user-1' },
    });
  });

  it('requires the viewer permission', async () => {
    authorizeInfrastructureViewerMock.mockResolvedValue({
      ok: false,
      response: Response.json({ message: 'Forbidden' }, { status: 403 }),
    });
    expect((await call('calendar')).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers unconfigured without calling out', async () => {
    vi.stubEnv('DEPLOY_COORDINATOR_ORIGIN', '');
    const response = await call('calendar');
    expect(await response.json()).toEqual({ configured: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed and unknown projects', async () => {
    expect((await call('../v1')).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(Response.json({ projects: [] }));
    expect((await call('calendar')).status).toBe(404);
  });

  it('maps an unreachable coordinator to a bad gateway', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const response = await call('calendar');
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      message: 'COORDINATOR_UNREACHABLE',
    });
  });
});
