import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleInfrastructureProjectRequest: vi.fn(),
  syncInfrastructureProject: vi.fn(),
}));

vi.mock('@/lib/infrastructure/projects', () => ({
  syncInfrastructureProject: mocks.syncInfrastructureProject,
}));

vi.mock('../../_shared', () => ({
  handleInfrastructureProjectRequest:
    mocks.handleInfrastructureProjectRequest,
}));

import { POST } from './route';

describe('POST infrastructure project sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleInfrastructureProjectRequest.mockImplementation(
      async (_request, _route, handler) =>
        Response.json(await handler())
    );
  });

  it('preserves the project response envelope and route boundary', async () => {
    const project = {
      branches: [{ name: 'main' }, { name: 'release' }],
      id: 'project-1',
      selectedBranch: 'release',
    };
    mocks.syncInfrastructureProject.mockResolvedValue(project);
    const request = new Request(
      'https://example.test/api/v1/infrastructure/projects/project-1/sync',
      { method: 'POST' }
    );

    const response = await POST(request, {
      params: Promise.resolve({ projectId: 'project-1' }),
    });

    expect(await response.json()).toEqual({ project });
    expect(mocks.syncInfrastructureProject).toHaveBeenCalledWith('project-1');
    expect(mocks.handleInfrastructureProjectRequest).toHaveBeenCalledWith(
      request,
      '/api/v1/infrastructure/projects/project-1/sync',
      expect.any(Function)
    );
  });
});
