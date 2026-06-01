import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInfrastructureOperator: vi.fn(),
  authorizeInfrastructureViewer: vi.fn(),
  withRequestLogDrain: vi.fn(
    async (_context: unknown, handler: () => Promise<Response> | Response) =>
      handler()
  ),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  withRequestLogDrain: mocks.withRequestLogDrain,
}));

vi.mock('../monitoring/blue-green/authorization', () => ({
  authorizeInfrastructureOperator: mocks.authorizeInfrastructureOperator,
  authorizeInfrastructureViewer: mocks.authorizeInfrastructureViewer,
}));

import { handleInfrastructureProjectRequest } from './_shared';

describe('handleInfrastructureProjectRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeInfrastructureViewer.mockResolvedValue({
      ok: true,
      user: { id: 'viewer-1' },
    });
    mocks.authorizeInfrastructureOperator.mockResolvedValue({
      ok: true,
      user: { id: 'operator-1' },
    });
  });

  it('uses view infrastructure authorization for read-only project handlers', async () => {
    const handler = vi.fn(async () => ({ projects: [] }));

    const response = await handleInfrastructureProjectRequest(
      new Request('http://localhost/api/v1/infrastructure/projects'),
      '/api/v1/infrastructure/projects',
      handler
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ projects: [] });
    expect(mocks.authorizeInfrastructureViewer).toHaveBeenCalledTimes(1);
    expect(mocks.authorizeInfrastructureOperator).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('requires operator authorization before running mutating project handlers', async () => {
    const handler = vi.fn(async () => ({ project: { id: 'project-1' } }));

    const response = await handleInfrastructureProjectRequest(
      new Request('http://localhost/api/v1/infrastructure/projects'),
      '/api/v1/infrastructure/projects',
      handler,
      { access: 'operator' }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      project: { id: 'project-1' },
    });
    expect(mocks.authorizeInfrastructureOperator).toHaveBeenCalledTimes(1);
    expect(mocks.authorizeInfrastructureViewer).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns the operator denial response before side effects', async () => {
    const handler = vi.fn(async () => ({ project: { id: 'project-1' } }));
    mocks.authorizeInfrastructureOperator.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ message: 'Forbidden' }, { status: 403 }),
    });

    const response = await handleInfrastructureProjectRequest(
      new Request('http://localhost/api/v1/infrastructure/projects'),
      '/api/v1/infrastructure/projects',
      handler,
      { access: 'operator' }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
    expect(handler).not.toHaveBeenCalled();
  });
});
